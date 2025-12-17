"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp, addDoc, collection } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { AlertTriangle, Calendar, CheckCircle, Image as ImageIcon, Loader2, MapPin, Send, Tag, Type } from "lucide-react";

interface EventData {
    title: string;
    location?: string;
    startTime?: any;
    description?: string;
    officialPostText?: string;
    officialInstagramTags?: string[];
    officialFlyerUrl?: string;
}

export default function ContentFormPage() {
    const params = useParams();
    const id = params.id as string;

    const [event, setEvent] = useState<EventData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [form, setForm] = useState({
        officialText: "",
        submitterName: "",
        submitterEmail: "",
    });
    const [tagsList, setTagsList] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");

    useEffect(() => {
        const fetchEvent = async () => {
            if (!db || !id) return;
            try {
                const snap = await getDoc(doc(db, "events", id));
                if (!snap.exists()) {
                    setError("האירוע לא נמצא");
                } else {
                    const data = snap.data() as EventData;
                    setEvent(data);
                    setForm((prev) => ({
                        ...prev,
                        officialText: data.officialPostText || "",
                    }));
                    const initialTags = (data.officialInstagramTags || [])
                        .map((t) => t?.replace(/^@+/, ""))
                        .filter(Boolean);
                    setTagsList(initialTags);
                    setTagInput("");
                }
            } catch (err) {
                console.error("Error loading event content form data", err);
                setError("שגיאה בטעינת פרטי האירוע");
            } finally {
                setLoading(false);
            }
        };
        fetchEvent();
    }, [id]);

    const eventDate = useMemo(() => {
        const raw = event?.startTime;
        if (!raw) return null;
        if ((raw as any).seconds) return new Date((raw as any).seconds * 1000);
        const dt = new Date(raw as any);
        return isNaN(dt.getTime()) ? null : dt;
    }, [event?.startTime]);

    const parseTags = (input: string) => {
        const parts = input
            .split(/[\s,]+/)
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => t.replace(/^@+/, ""));
        const unique = Array.from(new Set(parts));
        return unique;
    };

    const addTagFromInput = () => {
        const clean = tagInput.trim().replace(/^@+/, "");
        if (!clean) return;
        setTagsList((prev) => {
            const next = new Set(prev);
            next.add(clean);
            return Array.from(next);
        });
        setTagInput("");
    };

    const removeTag = (tag: string) => {
        setTagsList((prev) => prev.filter((t) => t !== tag));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db) return;
        if (!form.officialText.trim() && !file) {
            setError("יש להזין מלל רשמי או לצרף תמונה רשמית");
            return;
        }
        setError("");
        setSuccessMsg("");
        setSaving(true);
        try {
            // Add pending input as tag if user forgot to press enter (merge locally to avoid async state lag)
            const mergedTags = Array.from(new Set([...tagsList, ...parseTags(tagInput)]));
            const tags = mergedTags.map((t) => (t.startsWith("@") ? t : `@${t}`));
            let flyerUrl = event?.officialFlyerUrl || "";
            if (file && storage) {
                const path = `events/${id}/files/official-content-${Date.now()}-${file.name}`;
                const storageRef = ref(storage, path);
                await uploadBytes(storageRef, file);
                flyerUrl = await getDownloadURL(storageRef);
                const fileData = {
                    name: file.name,
                    originalName: file.name,
                    url: flyerUrl,
                    storagePath: path,
                    createdAt: serverTimestamp(),
                    createdBy: "content-form",
                    createdByName: form.submitterName || "טופס תוכן",
                };
                try {
                    await addDoc(collection(db, "events", id, "files"), fileData);
                } catch (err) {
                    console.warn("Failed to save file reference, continuing", err);
                }
            }

            const officialText = form.officialText.trim() || event?.officialPostText || "";
            const update: any = {
                officialPostText: officialText,
                officialInstagramTags: tags,
                officialContentUpdatedAt: serverTimestamp(),
                officialContentUpdatedBy: form.submitterName || form.submitterEmail || "טופס תוכן",
                officialContentUpdatedEmail: form.submitterEmail || "",
            };
            if (flyerUrl) {
                update.officialFlyerUrl = flyerUrl;
            }

            await updateDoc(doc(db, "events", id), update);
            setSubmitted(true);
            setSuccessMsg("התוכן הרשמי נשמר והועלה לאירוע בהצלחה.");
        } catch (err) {
            console.error("Failed submitting official content", err);
            setError("שגיאה בשליחת הטופס. נסו שוב.");
        } finally {
            setSaving(false);
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

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#fff7ed] via-white to-[#f4f5ff] p-6">
            <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl border border-orange-100 p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-orange-500 font-semibold">טופס תוכן רשמי</p>
                        <h1 className="text-3xl font-bold text-gray-900 mt-1">{event.title}</h1>
                        <p className="text-gray-600 mt-1 text-sm">ממלאים מלל רשמי, תיוגים ותמונה/פלייר והכול מתעדכן אוטומטית באירוע.</p>
                    </div>
                    {submitted && (
                        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-full text-sm font-medium border border-green-100">
                            <CheckCircle size={18} />
                            תודה! התוכן נשמר.
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700 mb-6">
                    {event.location && (
                        <div className="flex items-center gap-2">
                            <MapPin className="text-orange-500" size={18} />
                            <span>{event.location}</span>
                        </div>
                    )}
                    {eventDate && (
                        <div className="flex items-center gap-2">
                            <Calendar className="text-indigo-500" size={18} />
                            <span>
                                {eventDate.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "long" })} •{" "}
                                {eventDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                            <Type size={16} className="text-indigo-600" />
                            מלל רשמי
                        </label>
                        <textarea
                            required
                            rows={6}
                            value={form.officialText}
                            onChange={(e) => setForm({ ...form, officialText: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm"
                            placeholder="הדביקו כאן את המלל הרשמי לפרסום האירוע"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                            <Tag size={16} className="text-indigo-600" />
                            תיוגי אינסטגרם
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addTagFromInput();
                                    }
                                }}
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm"
                                placeholder="הקלד שם משתמש ולחץ אנטר"
                            />
                            <button
                                type="button"
                                onClick={addTagFromInput}
                                className="px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                            >
                                הוסף
                            </button>
                        </div>
                        {tagsList.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {tagsList.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-100 text-xs"
                                    >
                                        @{tag}
                                        <button
                                            type="button"
                                            onClick={() => removeTag(tag)}
                                            className="text-indigo-500 hover:text-indigo-700"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <p className="text-xs text-gray-500">לחצו אנטר אחרי כל שם משתמש, אין צורך להוסיף @.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                            <ImageIcon size={16} className="text-indigo-600" />
                            תמונה/פלייר רשמי (אופציונלי)
                        </label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full border-2 border-dashed border-indigo-300 text-indigo-700 px-4 py-3 rounded-lg hover:bg-indigo-50 font-semibold flex items-center justify-center gap-2"
                        >
                            <ImageIcon size={16} />
                            {file ? "בחר/י קובץ אחר" : "לחץ/י כדי לבחור תמונה מהמחשב"}
                        </button>
                        {file && <p className="text-xs text-gray-600">נבחר: {file.name}</p>}
                        {event.officialFlyerUrl && !file && (
                            <p className="text-xs text-gray-600">
                                פלייר נוכחי:{" "}
                                <a className="text-indigo-600 underline" href={event.officialFlyerUrl} target="_blank" rel="noreferrer">
                                    פתיחה
                                </a>
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-semibold text-gray-800 block mb-1">שם ממלא/ת (אופציונלי)</label>
                            <input
                                type="text"
                                value={form.submitterName}
                                onChange={(e) => setForm({ ...form, submitterName: e.target.value })}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm"
                                placeholder="שם שיוצג למארגן"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-gray-800 block mb-1">אימייל (אופציונלי)</label>
                            <input
                                type="email"
                                value={form.submitterEmail}
                                onChange={(e) => setForm({ ...form, submitterEmail: e.target.value })}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm"
                                placeholder="example@mail.com"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                            <AlertTriangle size={16} />
                            <span>{error}</span>
                        </div>
                    )}
                    {successMsg && (
                        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-lg">
                            <CheckCircle size={16} />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                שומר...
                            </>
                        ) : (
                            <>
                                <Send size={18} />
                                שלח/י ושמור באירוע
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
