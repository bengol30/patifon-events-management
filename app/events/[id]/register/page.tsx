"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp, runTransaction } from "firebase/firestore";
import { ArrowRight, Calendar, MapPin, Users, Send, CheckCircle, AlertTriangle } from "lucide-react";

interface EventData {
    title: string;
    location: string;
    startTime?: any;
    description?: string;
    participantsCount?: string;
}

export default function EventRegistrationPage() {
    const params = useParams();
    const id = params.id as string;

    const [event, setEvent] = useState<EventData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [form, setForm] = useState({
        name: "",
        phone: "",
        email: "",
    });

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
                    currentTeam.push({
                        name: firstName,
                        role: "נרשם",
                        email: trimmedEmail,
                    });
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
        if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
            setError("יש למלא שם, טלפון ואימייל");
            return;
        }

        try {
            await addDoc(collection(db, "events", id, "attendees"), {
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email.trim(),
                createdAt: serverTimestamp(),
            });
            await updateEventTeamWithAttendee(form.name, form.email);
            setSubmitted(true);
            setForm({ name: "", phone: "", email: "" });
            setError("");
        } catch (err) {
            console.error("Error saving registration", err);
            setError("שגיאה בשליחת הטופס. נסו שוב.");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (error || !event) {
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

    const eventDate = event.startTime?.seconds ? new Date(event.startTime.seconds * 1000) : null;

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#fff7ed] via-white to-[#f5f3ff] p-6">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl border border-orange-100 p-6 md:p-8">
                    <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between mb-6">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-orange-500 font-semibold">טופס הרשמה</p>
                            <h1 className="text-3xl font-bold text-gray-900 mt-1">{event.title}</h1>
                            <p className="text-gray-500 mt-1">נשמח שתירשמו כדי שניערך כראוי ונהיה מוכנים עבורכם.</p>
                        </div>
                        {submitted && (
                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-full text-sm font-medium border border-green-100">
                                <CheckCircle size={18} />
                                תודה, נרשמת!
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
                        {event.participantsCount && (
                            <div className="flex items-center gap-2 text-gray-700">
                                <Users className="text-emerald-500" size={18} />
                                <span className="text-sm">צפי משתתפים: {event.participantsCount}</span>
                            </div>
                        )}
                    </div>

                    {event.description && (
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-xl p-4 mb-6 text-sm leading-relaxed">
                            {event.description}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-800 mb-1">שם מלא</label>
                                <input
                                    type="text"
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm"
                                    placeholder="לדוגמה: רוני כהן"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-800 mb-1">טלפון</label>
                                <input
                                    type="tel"
                                    required
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm"
                                    placeholder="050-0000000"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-800 mb-1">אימייל</label>
                                <input
                                    type="email"
                                    required
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm"
                                    placeholder="you@example.com"
                                />
                            </div>

                            {error && <p className="text-sm text-red-600">{error}</p>}

                            <button
                                type="submit"
                                className="w-full patifon-gradient text-white py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition"
                            >
                                <Send size={16} />
                                שלח הרשמה
                            </button>
                            <p className="text-xs text-gray-500">פרטי ההרשמה נשמרים רק לצורך היערכות לאירוע.</p>
                        </form>

                    </div>
                </div>
            </div>
        </div>
    );
}
