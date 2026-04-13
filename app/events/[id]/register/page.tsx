"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp, runTransaction } from "firebase/firestore";
import { ArrowRight, Calendar, MapPin, Users, Send, CheckCircle, AlertTriangle } from "lucide-react";

interface FormField {
    id: string;
    label: string;
    type: "text" | "tel" | "email" | "number" | "select" | "textarea" | "checkbox";
    required: boolean;
    placeholder?: string;
    options?: string[];
}

const DEFAULT_FORM_SCHEMA: FormField[] = [
    { id: "name", label: "שם מלא", type: "text", required: true, placeholder: "לדוגמה: רוני כהן" },
    { id: "phone", label: "טלפון", type: "tel", required: true, placeholder: "050-0000000" },
    { id: "email", label: "אימייל", type: "email", required: true, placeholder: "you@example.com" },
];

interface EventData {
    title: string;
    location: string;
    startTime?: any;
    description?: string;
    participantsCount?: string;
    formSchema?: FormField[];
}

export default function EventRegistrationPage() {
    const params = useParams();
    const id = params.id as string;

    const [event, setEvent] = useState<EventData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [answers, setAnswers] = useState<Record<string, string | boolean>>({});

    const formSchema: FormField[] = (event?.formSchema && event.formSchema.length > 0)
        ? event.formSchema
        : DEFAULT_FORM_SCHEMA;

    useEffect(() => {
        const fetchEvent = async () => {
            if (!db || !id) return;
            try {
                const snap = await getDoc(doc(db, "events", id));
                if (!snap.exists()) {
                    setError("האירוע לא נמצא");
                } else {
                    setEvent(snap.data() as EventData);
                }
            } catch (err) {
                console.error("Error loading event", err);
                setError("שגיאה בטעינת פרטי האירוע");
            } finally {
                setLoading(false);
            }
        };
        fetchEvent();
    }, [id]);

    const updateEventTeamWithAttendee = async (fullName: string, email: string) => {
        const firstName = (fullName || "").trim().split(/\s+/)[0] || fullName || email;
        const trimmedEmail = email.trim();
        try {
            await runTransaction(db!, async (transaction) => {
                const eventRef = doc(db!, "events", id);
                const snap = await transaction.get(eventRef);
                if (!snap.exists()) return;
                const data = snap.data() as any;
                const currentTeam = Array.isArray(data.team) ? [...data.team] : [];
                const emailLower = trimmedEmail.toLowerCase();
                const idx = currentTeam.findIndex((m: any) => (m?.email || "").toLowerCase() === emailLower);

                if (idx >= 0) {
                    const existing = currentTeam[idx] || {};
                    const existingName = (existing.name || "").trim();
                    const shouldReplaceName = !existingName || existingName === existing.email;
                    currentTeam[idx] = {
                        ...existing,
                        name: shouldReplaceName ? firstName : existingName,
                        role: existing.role || "חבר צוות",
                        email: existing.email || trimmedEmail,
                    };
                } else {
                    currentTeam.push({ name: firstName, role: "נרשם", email: trimmedEmail });
                }

                transaction.update(eventRef, { team: currentTeam });
            });
        } catch (err) {
            console.error("Failed to sync attendee into team list", err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db) return;

        // Validate required fields
        for (const field of formSchema) {
            if (field.required && field.type !== "checkbox") {
                const val = answers[field.id];
                if (!val || String(val).trim() === "") {
                    setError(`יש למלא את שדה "${field.label}"`);
                    return;
                }
            }
        }

        try {
            const name = String(answers["name"] || "").trim();
            const phone = String(answers["phone"] || "").trim();
            const email = String(answers["email"] || "").trim();

            await addDoc(collection(db, "events", id, "registrants"), {
                ...answers,
                name,
                phone,
                email,
                createdAt: serverTimestamp(),
            });

            if (name && email) {
                await updateEventTeamWithAttendee(name, email);
            }

            setSubmitted(true);
            setAnswers({});
            setError("");
        } catch (err) {
            console.error("Error saving registration", err);
            setError("שגיאה בשליחת הטופס. נסו שוב.");
        }
    };

    const renderField = (field: FormField) => {
        const baseClass = "w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm";
        const value = answers[field.id] ?? "";

        if (field.type === "textarea") {
            return (
                <textarea
                    className={baseClass + " min-h-[80px]"}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={String(value)}
                    onChange={e => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                    rows={3}
                />
            );
        }

        if (field.type === "select" && field.options && field.options.length > 0) {
            return (
                <select
                    className={baseClass}
                    required={field.required}
                    value={String(value)}
                    onChange={e => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                >
                    <option value="">{field.placeholder || "-- בחר --"}</option>
                    {field.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            );
        }

        if (field.type === "checkbox") {
            return (
                <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        className="w-5 h-5 accent-orange-500 rounded"
                        checked={!!value}
                        onChange={e => setAnswers(prev => ({ ...prev, [field.id]: e.target.checked }))}
                    />
                    <span className="text-sm text-gray-700">{field.placeholder || field.label}</span>
                </label>
            );
        }

        return (
            <input
                type={field.type}
                required={field.required}
                placeholder={field.placeholder}
                value={String(value)}
                onChange={e => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                className={baseClass}
            />
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (error && !event) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center gap-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                    <AlertTriangle />
                </div>
                <p className="text-red-600 font-semibold">{error || "האירוע לא נמצא"}</p>
                <Link href="/" className="text-indigo-600 hover:underline">חזרה לדף הבית</Link>
            </div>
        );
    }

    const eventDate = event?.startTime?.seconds ? new Date(event.startTime.seconds * 1000) : null;

    if (submitted) {
        const submittedName = String(answers["name"] || "").trim() || null;
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#fff7ed] via-[#f0fdf4] to-[#f5f3ff] flex items-center justify-center p-6" dir="rtl">
                <div className="w-full max-w-md text-center">
                    {/* Animated Checkmark Circle */}
                    <div className="relative mx-auto mb-6 w-28 h-28">
                        <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-30"></div>
                        <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-200">
                            <CheckCircle size={56} className="text-white" strokeWidth={1.8} />
                        </div>
                    </div>

                    {/* Confetti dots */}
                    <div className="absolute top-0 left-0 right-0 h-1 pointer-events-none overflow-hidden" aria-hidden>
                        {[...Array(8)].map((_, i) => (
                            <span key={i} className="absolute top-8 rounded-full opacity-70 animate-bounce" style={{
                                width: 10 + (i % 3) * 4,
                                height: 10 + (i % 3) * 4,
                                left: `${10 + i * 10}%`,
                                backgroundColor: ['#fb923c', '#a78bfa', '#34d399', '#60a5fa', '#f472b6', '#facc15', '#4ade80', '#e879f9'][i],
                                animationDelay: `${i * 0.12}s`,
                                animationDuration: `${0.9 + (i % 3) * 0.3}s`
                            }} />
                        ))}
                    </div>

                    <h1 className="text-3xl font-black text-gray-900 mb-2">
                        {submittedName ? `תודה, ${submittedName}! 🎉` : "תודה על ההרשמה! 🎉"}
                    </h1>
                    <p className="text-gray-600 text-base leading-relaxed mb-2">
                        ההרשמה שלך התקבלה בהצלחה
                    </p>
                    {event?.title && (
                        <p className="text-sm font-semibold text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-4 py-1.5 inline-block mb-6">
                            {event.title}
                        </p>
                    )}
                    <p className="text-gray-500 text-sm mb-8">
                        נתראה באירוע 🙌
                    </p>
                    <button
                        onClick={() => {
                            setSubmitted(false);
                            setAnswers({});
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2 transition"
                    >
                        רישום נוסף
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#fff7ed] via-white to-[#f5f3ff] p-6" dir="rtl">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl border border-orange-100 p-6 md:p-8">
                    <div className="mb-6">
                        <p className="text-xs uppercase tracking-[0.2em] text-orange-500 font-semibold">טופס הרשמה</p>
                        <h1 className="text-3xl font-bold text-gray-900 mt-1">{event?.title}</h1>
                        <p className="text-gray-500 mt-1">נשמח שתירשמו כדי שניערך כראוי ונהיה מוכנים עבורכם.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        {event?.location && (
                            <div className="flex items-center gap-2 text-gray-700">
                                <MapPin className="text-orange-500" size={18} />
                                <span className="text-sm">{event.location}</span>
                            </div>
                        )}
                        {eventDate && (
                            <div className="flex items-center gap-2 text-gray-700">
                                <Calendar className="text-indigo-500" size={18} />
                                <span className="text-sm">
                                    {eventDate.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "long" })} • {eventDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                            </div>
                        )}
                        {event?.participantsCount && (
                            <div className="flex items-center gap-2 text-gray-700">
                                <Users className="text-emerald-500" size={18} />
                                <span className="text-sm">צפי משתתפים: {event.participantsCount}</span>
                            </div>
                        )}
                    </div>

                    {event?.description && (
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-xl p-4 mb-6 text-sm leading-relaxed">
                            {event.description}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {formSchema.map(field => (
                            <div key={field.id}>
                                {field.type !== "checkbox" && (
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">
                                        {field.label}
                                        {field.required && <span className="text-red-500 mr-1">*</span>}
                                    </label>
                                )}
                                {renderField(field)}
                            </div>
                        ))}

                        {error && <p className="text-sm text-red-600">{error}</p>}

                        <button
                            type="submit"
                            className="w-full patifon-gradient text-white py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition"
                        >
                            <Send size={16} />
                            שלח הרשמה
                        </button>
                        <p className="text-xs text-gray-500 text-center">פרטי ההרשמה נשמרים רק לצורך היערכות לאירוע.</p>
                    </form>
                </div>
            </div>
        </div>
    );
}
