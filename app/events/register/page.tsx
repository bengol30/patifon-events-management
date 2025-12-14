"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, getDoc, doc, limit } from "firebase/firestore";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS = 14;

const getStartDate = (val: any): Date | null => {
    if (!val) return null;
    const d = val?.seconds ? new Date(val.seconds * 1000) : new Date(val);
    return isNaN(d.getTime()) ? null : d;
};

interface EventItem {
    id: string;
    title: string;
    description?: string;
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

export default function EventsLanding() {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [formState, setFormState] = useState<Record<string, { name: string; phone: string; email: string; submitting: boolean; success: boolean }>>({});
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const detailsRef = useRef<HTMLDivElement | null>(null);
    const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
    const { rangeStart, rangeEnd, calendarCells, rangeLabel } = useMemo(() => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start.getTime() + RANGE_DAYS * DAY_MS - 1);
        const days = Array.from({ length: RANGE_DAYS }, (_, i) => new Date(start.getTime() + i * DAY_MS));
        const leadingEmpty = Array.from({ length: start.getDay() }, () => null);
        const cells = [...leadingEmpty, ...days];
        while (cells.length % 7 !== 0) cells.push(null);
        const formatter = new Intl.DateTimeFormat("he-IL", { month: "short", day: "numeric" });
        const label = `${formatter.format(days[0])} - ${formatter.format(days[days.length - 1])}`;
        return { rangeStart: start, rangeEnd: end, calendarCells: cells, rangeLabel: label };
    }, []);

    useEffect(() => {
        const loadEvents = async () => {
            try {
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
                    if (startMs < rangeStart.getTime()) return; // hide past
                    if (allowedSet.size > 0 && !allowedSet.has(doc.id)) return;
                    list.push({
                        id: doc.id,
                        title: data.title || "אירוע ללא שם",
                        description: data.description || data.goal || "",
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
    }, [rangeEnd, rangeStart]);

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

    const formatGoogleDate = (date: Date) =>
        date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const buildCalendarLink = (ev: EventItem) => {
        if (!ev.startTime) return "";
        const start = ev.startTime?.seconds ? new Date(ev.startTime.seconds * 1000) : new Date(ev.startTime);
        if (isNaN(start.getTime())) return "";
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        const dates = `${formatGoogleDate(start)}/${formatGoogleDate(end)}`;
        const params = new URLSearchParams({
            action: "TEMPLATE",
            text: ev.title || "אירוע",
            dates,
            details: ev.description || "מחכים לראותכם!",
            location: ev.location || "",
        });
        return `https://calendar.google.com/calendar/render?${params.toString()}`;
    };

    const formatDayKey = (val: any) => {
        const d = val?.seconds ? new Date(val.seconds * 1000) : new Date(val);
        if (isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = `${d.getMonth() + 1}`.padStart(2, "0");
        const day = `${d.getDate()}`.padStart(2, "0");
        return `${y}-${m}-${day}`;
    };

    const eventsInRange = useMemo(
        () =>
            events.filter(ev => {
                const start = getStartDate(ev.startTime);
                if (!start) return false;
                const ms = start.getTime();
                return ms >= rangeStart.getTime() && ms <= rangeEnd.getTime();
            }),
        [events, rangeEnd, rangeStart],
    );

    const eventByDay = useMemo(
        () =>
            eventsInRange.reduce<Record<string, EventItem[]>>((acc, ev) => {
                const key = formatDayKey(ev.startTime);
                if (!key) return acc;
                acc[key] = acc[key] || [];
                acc[key].push(ev);
                return acc;
            }, {}),
        [eventsInRange],
    );

    const galleryDisplay = useMemo(() => galleryImages.slice(0, 3), [galleryImages]);

    const handleSubmit = async (eventId: string) => {
        const ev = events.find(e => e.id === eventId);
        const state = formState[eventId] || { name: "", phone: "", email: "", submitting: false, success: false };
        if (!state.name.trim() || !state.phone.trim()) {
            alert("שם וטלפון הם שדות חובה");
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
            const calLink = ev ? buildCalendarLink(ev) : "";
            if (calLink) {
                window.open(calLink, "_blank");
            }
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
                <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-4 mb-8">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-bold text-indigo-900">יומן אירועים</h2>
                        <div className="flex items-center gap-2 text-sm">
                            <div className="px-3 py-1 rounded border border-gray-200 bg-gray-50 font-semibold text-gray-800">
                                {rangeLabel}
                            </div>
                            <span className="text-xs text-gray-500">מציג שבועיים קדימה מהיום</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-7 text-xs font-semibold text-gray-500 mb-2">
                        {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((d) => (
                            <div key={d} className="text-center py-1">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-sm">
                        {calendarCells.map((cell, idx) => {
                            if (cell === null) return <div key={`empty-${idx}`} />;
                            const cellDate = cell as Date;
                            const key = formatDayKey(cellDate);
                            const dayEvents = eventByDay[key] || [];
                            const isToday = cellDate.getTime() === rangeStart.getTime();
                            return (
                                <div
                                    key={key}
                                    className={`border rounded-lg p-2 min-h-[70px] flex flex-col gap-1 ${dayEvents.length ? "border-indigo-200 bg-indigo-50" : "border-gray-200 bg-white"} ${isToday ? "ring-2 ring-indigo-400" : ""}`}
                                >
                                    <div className="text-right font-semibold text-gray-800">{cellDate.getDate()}</div>
                                    {dayEvents.slice(0, 2).map(ev => (
                                        <button
                                            key={ev.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedEventId(ev.id);
                                                setTimeout(() => {
                                                    detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                                }, 0);
                                            }}
                                            className="text-[11px] text-indigo-800 truncate text-left hover:underline"
                                        >
                                            • {ev.title}
                                        </button>
                                    ))}
                                    {dayEvents.length > 2 && (
                                        <div className="text-[10px] text-indigo-600">+{dayEvents.length - 2} נוספים</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div ref={detailsRef}>
                {selectedEventId && (() => {
                    const ev = events.find(e => e.id === selectedEventId);
                    if (!ev) return null;
                    const state = formState[ev.id] || { name: "", phone: "", email: "", submitting: false, success: false };
                    const cardImage = ev.heroImage || ev.coverImage || ev.image || "";
                    return (
                        <div className="mb-8 bg-white rounded-2xl shadow-lg border border-indigo-100 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                                <h3 className="text-lg font-semibold text-indigo-900">פרטי האירוע</h3>
                                <button onClick={() => setSelectedEventId(null)} className="text-sm text-gray-500 hover:text-gray-800">סגור</button>
                            </div>
                            <div className="flex flex-col md:flex-row">
                                {cardImage && (
                                    <div className="md:w-1/2 bg-gray-50 flex items-center justify-center p-4">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={cardImage} alt={ev.title} className="w-full h-full object-contain max-h-[280px]" />
                                    </div>
                                )}
                                    <div className="p-4 flex-1 space-y-2">
                                        <h4 className="text-2xl font-bold text-indigo-900">{ev.title}</h4>
                                        <div className="flex flex-wrap gap-2 text-sm text-gray-700">
                                            {ev.location && <span className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">📍 {ev.location}</span>}
                                            {formatDate(ev.startTime) && <span className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200">⏰ {formatDate(ev.startTime)}</span>}
                                        </div>
                                        <p className="text-sm text-gray-700">{ev.description || "פרטים נוספים יפורסמו בהמשך."}</p>
                                        <div className="pt-2">
                                            <div className="text-xs font-semibold text-gray-500 mb-1">השאירו פרטים ונחזור אליכם</div>
                                            <div className="space-y-2 max-w-md">
                                                <input
                                                    type="text"
                                                placeholder="שם מלא*"
                                                value={state.name}
                                                onChange={(e) => setFormState(prev => ({ ...prev, [ev.id]: { ...state, name: e.target.value } }))}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <input
                                                type="tel"
                                                placeholder="טלפון*"
                                                value={state.phone}
                                                onChange={(e) => setFormState(prev => ({ ...prev, [ev.id]: { ...state, phone: e.target.value } }))}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <input
                                                type="email"
                                                placeholder="אימייל (לא חובה)"
                                                value={state.email}
                                                onChange={(e) => setFormState(prev => ({ ...prev, [ev.id]: { ...state, email: e.target.value } }))}
                                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleSubmit(ev.id)}
                                                disabled={state.submitting}
                                                className="w-full py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-60"
                                            >
                                                {state.submitting ? "שולח..." : state.success ? "נרשמתם!" : "הרשמה לאירוע"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}
                </div>

                {loading ? (
                    <div className="text-center text-gray-500 py-10">טוען אירועים...</div>
                ) : events.length === 0 ? (
                    <div className="text-center text-gray-500 py-10">אין אירועים זמינים כרגע.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {events.map((ev) => {
                            const state = formState[ev.id] || { name: "", phone: "", email: "", submitting: false, success: false };
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
                                        <p className="text-sm text-gray-700 leading-relaxed">
                                            {ev.description ? ev.description : "פרטים נוספים יפורסמו בהמשך."}
                                        </p>
                                        <div className="mt-auto pt-2">
                                            <div className="text-xs font-semibold text-gray-500 mb-1">השאירו פרטים ונחזור אליכם</div>
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    placeholder="שם מלא*"
                                                    value={state.name}
                                                    onChange={(e) => setFormState(prev => ({ ...prev, [ev.id]: { ...state, name: e.target.value } }))}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                                <input
                                                    type="tel"
                                                    placeholder="טלפון*"
                                                    value={state.phone}
                                                    onChange={(e) => setFormState(prev => ({ ...prev, [ev.id]: { ...state, phone: e.target.value } }))}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                                <input
                                                    type="email"
                                                    placeholder="אימייל (לא חובה)"
                                                    value={state.email}
                                                    onChange={(e) => setFormState(prev => ({ ...prev, [ev.id]: { ...state, email: e.target.value } }))}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleSubmit(ev.id)}
                                                    disabled={state.submitting}
                                                    className="w-full py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-60"
                                                >
                                                    {state.submitting ? "שולח..." : state.success ? "נרשמתם!" : "הרשמה לאירוע"}
                                                </button>
                                            </div>
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
