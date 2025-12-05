"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp, getDocs, query, where, updateDoc, arrayUnion, collectionGroup } from "firebase/firestore";
import { ArrowRight, Calendar, MapPin, Users, Send, CheckCircle, AlertTriangle, Handshake, Target, CheckSquare, Square, Clock, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

interface EventData {
    title: string;
    location: string;
    startTime?: any;
    description?: string;
    participantsCount?: string;
    needsVolunteers?: boolean;
    volunteersCount?: number | null;
}

interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    dueDate?: string;
    isVolunteerTask?: boolean;
}

export default function VolunteerRegistrationPage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();

    const [event, setEvent] = useState<EventData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        name: "",
        phone: "",
        email: "",
        password: "",
        confirmPassword: "",
    });
    const [currentVolunteerCount, setCurrentVolunteerCount] = useState(0);

    const hashPassword = async (password: string) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!db || !id) return;
            try {
                // Fetch event
                const eventSnap = await getDoc(doc(db, "events", id));
                if (!eventSnap.exists()) {
                    setError("האירוע לא נמצא");
                    setLoading(false);
                    return;
                }
                const eventData = eventSnap.data() as EventData;
                setEvent(eventData);

                // Check if event needs volunteers
                if (!eventData.needsVolunteers) {
                    setError("אירוע זה לא פתוח להרשמת מתנדבים");
                    setLoading(false);
                    return;
                }

                // Count current volunteers
                const volunteersQuery = query(collection(db, "events", id, "volunteers"));
                const volunteersSnap = await getDocs(volunteersQuery);
                setCurrentVolunteerCount(volunteersSnap.size);
            } catch (err) {
                console.error("Error loading data", err);
                setError("שגיאה בטעינת פרטי האירוע");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db) return;
        if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
            setError("יש למלא שם, טלפון ואימייל");
            return;
        }
        if (!form.password.trim() || form.password.length < 6) {
            setError("יש להזין סיסמה עם לפחות 6 תווים");
            return;
        }
        if (form.password !== form.confirmPassword) {
            setError("הסיסמאות לא תואמות");
            return;
        }

        // Check volunteer limit
        if (event?.volunteersCount && currentVolunteerCount >= event.volunteersCount) {
            setError(`הגענו למגבלת המתנדבים (${event.volunteersCount}). נסו שוב מאוחר יותר.`);
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const normalizePhone = (value: string) => value.replace(/\D/g, "");
            const normalizedPhone = normalizePhone(form.phone);

            // Try to find an existing project volunteer with the same phone
            let matchedProjectVolunteer: { id: string; projectId: string; data: any } | null = null;
            try {
                const allProjectVols = await getDocs(collectionGroup(db, "volunteers"));
                allProjectVols.forEach((docSnap) => {
                    const parent = docSnap.ref.parent.parent;
                    if (!parent || !parent.path.startsWith("projects/")) return;
                    const data = docSnap.data() as any;
                    const storedNormalized = normalizePhone(data.phone || "");
                    if (storedNormalized && storedNormalized === normalizedPhone && !matchedProjectVolunteer) {
                        matchedProjectVolunteer = { id: docSnap.id, projectId: parent.id, data };
                    }
                });
            } catch (lookupErr) {
                console.warn("Project volunteer lookup failed", lookupErr);
            }

            // Check again for limit (race condition protection)
            const volunteersQuery = query(collection(db, "events", id, "volunteers"));
            const volunteersSnap = await getDocs(volunteersQuery);
            if (event?.volunteersCount && volunteersSnap.size >= event.volunteersCount) {
                setError(`הגענו למגבלת המתנדבים (${event.volunteersCount}). נסו שוב מאוחר יותר.`);
                setSubmitting(false);
                return;
            }

            // Add volunteer
            const passwordHash = await hashPassword(form.password.trim());
            const existing: any = matchedProjectVolunteer ? (matchedProjectVolunteer as { data: any }).data : null;
            const mergedName = existing?.name || `${existing?.firstName || ""} ${existing?.lastName || ""}`.trim() || form.name.trim();
            const mergedEmail = existing?.email || form.email.trim();
            const mergedPasswordHash = existing?.passwordHash || passwordHash;

            await addDoc(collection(db, "events", id, "volunteers"), {
                name: mergedName,
                phone: form.phone.trim(),
                phoneNormalized: normalizedPhone,
                email: mergedEmail,
                selectedTasks: [],
                passwordHash: mergedPasswordHash,
                passwordSetAt: serverTimestamp(),
                createdAt: serverTimestamp(),
                mergedFromProject: matchedProjectVolunteer
                    ? {
                        projectId: (matchedProjectVolunteer as any).projectId,
                        volunteerId: (matchedProjectVolunteer as any).id,
                        sourceEmail: existing?.email || null,
                    }
                    : null,
            });

            // Backfill normalization and link on the project volunteer record
            if (matchedProjectVolunteer) {
                const projectVolunteerRef = doc(db, "projects", (matchedProjectVolunteer as any).projectId, "volunteers", (matchedProjectVolunteer as any).id);
                await updateDoc(projectVolunteerRef, {
                    phoneNormalized: normalizedPhone,
                    relatedEvents: arrayUnion({
                        eventId: id,
                        eventTitle: event?.title || "",
                        linkedAt: serverTimestamp(),
                    }),
                });
            }

            setSubmitted(true);
            setTimeout(() => {
                router.push("/volunteers/events");
            }, 800);
            setForm({ name: "", phone: "", email: "", password: "", confirmPassword: "" });
        } catch (err) {
            console.error("Error saving volunteer registration", err);
            setError("שגיאה בשליחת הטופס. נסו שוב.");
        } finally {
            setSubmitting(false);
        }
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
                <p className="text-red-600 font-semibold">{error}</p>
                <Link href="/" className="text-indigo-600 hover:underline">חזרה לדף הבית</Link>
            </div>
        );
    }

    if (!event || !event.needsVolunteers) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center gap-4">
                <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
                    <AlertTriangle />
                </div>
                <p className="text-yellow-600 font-semibold">אירוע זה לא פתוח להרשמת מתנדבים</p>
                <Link href="/" className="text-indigo-600 hover:underline">חזרה לדף הבית</Link>
            </div>
        );
    }

    const eventDate = event.startTime?.seconds ? new Date(event.startTime.seconds * 1000) : null;
    const isAtLimit = event.volunteersCount ? currentVolunteerCount >= event.volunteersCount : false;
    const remainingSlots = event.volunteersCount ? Math.max(0, event.volunteersCount - currentVolunteerCount) : null;

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#fff7ed] via-white to-[#f5f3ff] p-6">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-end mb-4">
                    <Link
                        href="/volunteers/events"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-semibold transition"
                    >
                        לאזור האישי של המתנדב
                        <ExternalLink size={16} />
                    </Link>
                </div>
                <div className="bg-white rounded-2xl shadow-xl border border-orange-100 p-6 md:p-8">
                    <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between mb-6">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-indigo-500 font-semibold flex items-center gap-2">
                                <Handshake size={14} />
                                הרשמה למתנדבים
                            </p>
                            <h1 className="text-3xl font-bold text-gray-900 mt-1">{event.title}</h1>
                            <p className="text-gray-500 mt-1">נשמח שתתנדבו ותעזרו לנו להפוך את האירוע להצלחה!</p>
                        </div>
                        {submitted && (
                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-full text-sm font-medium border border-green-100">
                                <CheckCircle size={18} />
                                תודה, נרשמת כמתנדב!
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="flex items-center gap-2 text-gray-700">
                            <MapPin className="text-orange-500" size={18} />
                            <span className="text-sm">{event.location || "מיקום יתעדכן בקרוב"}</span>
                        </div>
                        {eventDate && (
                            <div className="flex items-center gap-2 text-gray-700">
                                <Calendar className="text-indigo-500" size={18} />
                                <span className="text-sm">
                                    {eventDate.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "long" })} • {eventDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                            </div>
                        )}
                        {event.volunteersCount && (
                            <div className="flex items-center gap-2 text-gray-700">
                                <Users className="text-emerald-500" size={18} />
                                <span className="text-sm">
                                    {isAtLimit ? (
                                        <span className="text-red-600">הגענו למגבלה ({event.volunteersCount} מתנדבים)</span>
                                    ) : (
                                        <span>מקומות פנויים: {remainingSlots} מתוך {event.volunteersCount}</span>
                                    )}
                                </span>
                            </div>
                        )}
                    </div>

                    {event.description && (
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-xl p-4 mb-6 text-sm leading-relaxed">
                            {event.description}
                        </div>
                    )}


                    {submitted ? (
                        <div className="space-y-6">
                            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                                <CheckCircle className="mx-auto mb-3 text-green-600" size={48} />
                                <h2 className="text-xl font-bold text-green-900 mb-2">תודה שנרשמת כמתנדב!</h2>
                                <p className="text-green-700 mb-4">עוד רגע נעביר אותך לאזור האישי כדי לבחור ולשריין משימות ולנהל סטטוסים.</p>
                                <Link href="/volunteers/events" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold">
                                    עבור לאזור האישי
                                    <ExternalLink size={16} />
                                </Link>
                            </div>
                        </div>
                    ) : isAtLimit ? (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-center">
                            <AlertTriangle className="mx-auto mb-2" size={24} />
                            <p className="font-semibold">הגענו למגבלת המתנדבים</p>
                            <p className="text-sm mt-1">כל המקומות למתנדבים תפוסים. נסו שוב מאוחר יותר.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <h2 className="text-lg font-bold text-gray-900">פרטים אישיים</h2>
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        ההרשמה יוצרת עבורך חשבון מתנדב עם סיסמה. אחרי השלמת הרשמה נעביר אותך לאזור האישי שלך,
                                        שם תוכל לראות את כל המשימות הזמינות למתנדבים, לבחור ולשריין אותן, ולעקוב/לעדכן סטטוס. סימון ביצוע יעדכן גם בדף ניהול המשימות של האירוע.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">שם מלא</label>
                                    <input
                                        type="text"
                                        required
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                                        placeholder="לדוגמה: רוני כהן"
                                        disabled={submitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">טלפון</label>
                                    <input
                                        type="tel"
                                        required
                                        value={form.phone}
                                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                                        placeholder="050-0000000"
                                        disabled={submitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">אימייל</label>
                                    <input
                                        type="email"
                                        required
                                        value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                                        placeholder="you@example.com"
                                        disabled={submitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">סיסמה</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                                        placeholder="לפחות 6 תווים"
                                        disabled={submitting}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-800 mb-1">אימות סיסמה</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={form.confirmPassword}
                                        onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                                        placeholder="הקלד שוב לאימות"
                                        disabled={submitting}
                                    />
                                </div>

                                {error && <p className="text-sm text-red-600">{error}</p>}
                            </form>

                            <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg p-3 text-sm">
                                את בחירת המשימות תעשו מיד אחרי ההרשמה באזור האישי, שם תוכלו לשריין משימות פתוחות ולסמן סטטוסים.
                            </div>
                        </div>
                    )}

                    {/* Submit Button at Bottom */}
                    {!submitted && !isAtLimit && (
                        <div className="mt-6 pt-6 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    const form = document.querySelector('form');
                                    if (form) {
                                        form.requestSubmit();
                                    }
                                }}
                                disabled={submitting || isAtLimit}
                                className="w-full bg-indigo-600 text-white py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                        שולח...
                                    </>
                                ) : (
                                    <>
                                        <Send size={16} />
                                        שלח הרשמה ועבור לאזור האישי
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-gray-500 text-center mt-2">פרטי ההרשמה נשמרים רק לצורך היערכות לאירוע.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
