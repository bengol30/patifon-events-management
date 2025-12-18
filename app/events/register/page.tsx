"use client";

import { useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, getDoc, doc, limit } from "firebase/firestore";

const getStartDate = (val: any): Date | null => {
    if (!val) return null;
    const d = val?.seconds ? new Date(val.seconds * 1000) : new Date(val);
    return isNaN(d.getTime()) ? null : d;
};

interface EventItem {
    id: string;
    title: string;
    description?: string;
    officialPostText?: string;
    location?: string;
    startTime?: any;
    heroImage?: string;
    image?: string;
    coverImage?: string;
}

interface GalleryImage {
    id: string;
    name?: string;
    url?: string;
    storagePath?: string;
}

const isHeic = (name?: string) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.endsWith(".heic") || lower.endsWith(".heif");
};

const formatDateForCal = (d: Date) => {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};

const triggerCalendarInvite = (ev: EventItem) => {
    const start = getStartDate(ev.startTime);
    if (!start) return;
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // default 2h duration
    const title = encodeURIComponent(ev.title || "אירוע");
    const description = encodeURIComponent(ev.officialPostText || ev.description || "");
    const location = encodeURIComponent(ev.location || "");
    const dates = `${formatDateForCal(start)}/${formatDateForCal(end)}`;

    // Open Google Calendar template
    const gcalUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}` +
        (description ? `&details=${description}` : "") +
        (location ? `&location=${location}` : "");
    if (typeof window !== "undefined") {
        window.open(gcalUrl, "_blank", "noopener,noreferrer");
    }

    // Also trigger ICS download for Outlook/Apple/others
    const icsLines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        `SUMMARY:${ev.title || "אירוע"}`,
        description ? `DESCRIPTION:${ev.officialPostText || ev.description || ""}` : "",
        location ? `LOCATION:${ev.location}` : "",
        `DTSTART:${formatDateForCal(start)}`,
        `DTEND:${formatDateForCal(end)}`,
        "END:VEVENT",
        "END:VCALENDAR",
    ].filter(Boolean);
    const blob = new Blob([icsLines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${ev.title || "event"}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export default function EventsLanding() {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [formState, setFormState] = useState<Record<string, { name: string; phone: string; email: string; submitting: boolean; success: boolean }>>({});
    const [activeEventId, setActiveEventId] = useState<string | null>(null);
    const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);

    useEffect(() => {
        const loadEvents = async () => {
            try {
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const cfgSnap = await getDoc(doc(db!, "settings", "public_register_events"));
                const allowed = cfgSnap.exists() ? ((cfgSnap.data() as any).allowedEventIds || []) : [];
                const allowedSet = new Set<string>(allowed);

                const q = query(collection(db!, "events"), orderBy("startTime", "asc"));
                const snap = await getDocs(q);
                const list: EventItem[] = [];
                snap.forEach(doc => {
                    const data = doc.data() as any;
                    const start = getStartDate(data.startTime);
                    if (!start) return;
                    const startMs = start.getTime();
                    if (startMs < startOfToday.getTime()) return; // hide past
                    if (allowedSet.size > 0 && !allowedSet.has(doc.id)) return;
                    list.push({
                        id: doc.id,
                        title: data.title || "אירוע ללא שם",
                        description: data.description || data.goal || "",
                        officialPostText: data.officialPostText || "",
                        location: data.location || "",
                        startTime: data.startTime,
                        heroImage: data.officialFlyerUrl || data.previewImage || data.coverImage || data.image || "",
                        image: data.officialFlyerUrl || data.image || "",
                        coverImage: data.officialFlyerUrl || data.coverImage || "",
                    });
                });
                setEvents(list);
            } catch (err) {
                console.error("Failed loading events for landing", err);
            } finally {
                setLoading(false);
            }
        };
        loadEvents();
    }, []);

    useEffect(() => {
        const loadGallery = async () => {
            if (!db) return;
            try {
                const snap = await getDocs(query(collection(db, "register_gallery"), orderBy("createdAt", "desc"), limit(50)));
                const items: GalleryImage[] = snap.docs
                    .map(d => ({ id: d.id, ...(d.data() as any) }))
                    .filter(img => Boolean(img.url));
                // Shuffle once to display random order
                const shuffled = [...items];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                setGalleryImages(shuffled);
            } catch (err) {
                console.error("Error loading register gallery", err);
            }
        };
        loadGallery();
    }, [db]);

    const formatDate = (val: any) => {
        if (!val) return "";
        const d = val?.seconds ? new Date(val.seconds * 1000) : new Date(val);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleString("he-IL", { dateStyle: "long", timeStyle: "short" });
    };

    const galleryDisplay = useMemo(() => galleryImages.slice(0, 3), [galleryImages]);

    const handleSubmit = async (eventObj: EventItem) => {
        const eventId = eventObj.id;
        const state = formState[eventId] || { name: "", phone: "", email: "", submitting: false, success: false };
        if (!state.name.trim() || !state.phone.trim() || !state.email.trim()) {
            alert("שם, טלפון ואימייל הם שדות חובה");
            return;
        }
        setFormState(prev => ({ ...prev, [eventId]: { ...state, submitting: true } }));
        try {
            await addDoc(collection(db!, "events", eventId, "registrants"), {
                name: state.name.trim(),
                phone: state.phone.trim(),
                email: state.email.trim(),
                createdAt: serverTimestamp(),
            });
            setFormState(prev => ({ ...prev, [eventId]: { name: "", phone: "", email: "", submitting: false, success: true } }));
            triggerCalendarInvite(eventObj);
        } catch (err) {
            console.error("Failed to register", err);
            alert("לא הצלחנו לרשום, נסה שוב");
            setFormState(prev => ({ ...prev, [eventId]: { ...state, submitting: false } }));
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-indigo-50 text-gray-900">
            <header className="max-w-5xl mx-auto px-4 py-10 text-center">
                <h1 className="mt-4 text-4xl font-bold text-indigo-900">אנחנו פטיפון מוזיקה</h1>
                <p className="mt-3 text-lg text-gray-700 leading-relaxed">
                    כמה צעירים שהחליטו לעשות מוזיקה בעיר הכי צפונית במדינה.
                    <br />
                    רציניו להזמין אתכם לאירועים שלנו.
                </p>
            </header>

            <main className="max-w-5xl mx-auto px-4 pb-12">
                {activeEventId && (() => {
                    const ev = events.find(e => e.id === activeEventId);
                    if (!ev) return null;
                    const state = formState[ev.id] || { name: "", phone: "", email: "", submitting: false, success: false };
                    return (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-lg font-bold text-indigo-900">הרשמה לאירוע</h3>
                                    <button
                                        type="button"
                                        onClick={() => setActiveEventId(null)}
                                        className="text-sm text-gray-500 hover:text-gray-800"
                                    >
                                        סגור
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <h4 className="text-xl font-bold text-gray-900">{ev.title}</h4>
                                        <div className="flex flex-wrap gap-2 text-xs text-gray-700 mt-2">
                                            {ev.location && <span className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">📍 {ev.location}</span>}
                                            {formatDate(ev.startTime) && <span className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">⏰ {formatDate(ev.startTime)}</span>}
                                        </div>
                                    </div>
                                    {state.success && (
                                        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                                            נרשמתם בהצלחה! פתחנו לכם חלון לשמירת האירוע ביומן והורדנו קובץ .ics למקרה הצורך.
                                        </div>
                                    )}
                                    <form
                                        className="space-y-2"
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            handleSubmit(ev);
                                        }}
                                    >
                                        <input
                                            type="text"
                                            required
                                            placeholder="שם מלא*"
                                            value={state.name}
                                            onChange={(e) => setFormState(prev => ({ ...prev, [ev.id]: { ...state, name: e.target.value } }))}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <input
                                            type="tel"
                                            required
                                            placeholder="טלפון*"
                                            value={state.phone}
                                            onChange={(e) => setFormState(prev => ({ ...prev, [ev.id]: { ...state, phone: e.target.value } }))}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <input
                                            type="email"
                                            required
                                            placeholder="אימייל*"
                                            value={state.email}
                                            onChange={(e) => setFormState(prev => ({ ...prev, [ev.id]: { ...state, email: e.target.value } }))}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <button
                                            type="submit"
                                            disabled={state.submitting}
                                            className="w-full py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-60"
                                        >
                                            {state.submitting ? "שולח..." : "הרשמה לאירוע"}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    );
                })()}
                {loading ? (
                    <div className="text-center text-gray-500 py-10">טוען אירועים...</div>
                ) : events.length === 0 ? (
                    <div className="text-center text-gray-500 py-10">אין אירועים זמינים כרגע.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {events.map((ev) => {
                            const description = ev.officialPostText?.trim() || "פרטים נוספים יפורסמו בהמשך.";
                            const cardImage = ev.heroImage || ev.coverImage || ev.image || "";
                            return (
                                <div key={ev.id} className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden flex flex-col">
                                    {cardImage ? (
                                        <div className="relative h-56 bg-white">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={cardImage} alt={ev.title} className="w-full h-full object-contain bg-gray-50" />
                                            <div className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-white/90 text-xs font-semibold text-gray-800 flex items-center gap-2 shadow-sm border border-gray-100">
                                                <span>📅</span>
                                                <span>{formatDate(ev.startTime) || "תאריך יתעדכן"}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-2 bg-gradient-to-r from-amber-200 via-white to-indigo-200"></div>
                                    )}
                                    <div className="p-4 flex flex-col gap-2 flex-1">
                                        <h3 className="text-xl font-bold text-indigo-900">{ev.title}</h3>
                                        <div className="flex flex-wrap gap-2 text-xs text-gray-700">
                                            {ev.location && <span className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">📍 {ev.location}</span>}
                                            {formatDate(ev.startTime) && <span className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">⏰ {formatDate(ev.startTime)}</span>}
                                        </div>
                                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                                            {description}
                                        </p>
                                        <div className="mt-auto pt-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormState(prev => {
                                                        const current = prev[ev.id] || { name: "", phone: "", email: "", submitting: false, success: false };
                                                        return { ...prev, [ev.id]: { ...current, success: false } };
                                                    });
                                                    setActiveEventId(ev.id);
                                                }}
                                                className="w-full py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition"
                                            >
                                                הרשמה לאירוע
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {galleryDisplay.length > 0 && (
                    <div className="mt-10">
                        <h2 className="text-2xl font-bold text-indigo-900 text-center mb-4">מהאווירה שלנו</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {galleryDisplay.map((img, idx) => (
                                <div
                                    key={img.id}
                                    className="relative overflow-hidden rounded-2xl shadow-lg border border-indigo-100 bg-white group"
                                    style={{ animation: `fadeIn 0.6s ease ${idx * 0.1}s both` }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
                                    {isHeic(img.name) ? (
                                        <div className="w-full h-48 sm:h-56 bg-gradient-to-br from-indigo-50 to-amber-50 flex flex-col items-center justify-center text-indigo-800 px-4">
                                            <div className="text-sm font-semibold truncate w-full text-center">פורמט HEIC</div>
                                            <div className="text-xs text-indigo-700/80 text-center">מומלץ להעלות JPG/PNG כדי להציג לציבור.</div>
                                            <div className="text-[10px] text-gray-600 truncate max-w-xs mt-1">{img.name}</div>
                                        </div>
                                    ) : (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                            src={img.url || ""}
                                            alt={img.name || "תמונה"}
                                            className="w-full h-48 sm:h-56 object-cover transition duration-500 group-hover:scale-105"
                                        />
                                    )}
                                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full bg-white/85 text-[11px] font-semibold text-indigo-900 shadow">
                                        {img.name || "תמונה"}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
