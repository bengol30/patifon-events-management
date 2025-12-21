"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarPlus, Link2, Copy, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import PartnersInput from "@/components/PartnersInput";

const computeNextOccurrence = (
    baseDate: Date,
    recurrence: "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY",
    recurrenceEnd?: Date | null
) => {
    if (!(baseDate instanceof Date) || isNaN(baseDate.getTime())) return baseDate;
    if (recurrence === "NONE") return baseDate;
    const now = Date.now();
    let candidate = new Date(baseDate);
    let guard = 0;
    const addInterval = () => {
        if (recurrence === "WEEKLY") candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000);
        else if (recurrence === "BIWEEKLY") candidate = new Date(candidate.getTime() + 14 * 24 * 60 * 60 * 1000);
        else if (recurrence === "MONTHLY") {
            const next = new Date(candidate);
            next.setMonth(next.getMonth() + 1);
            candidate = next;
        }
    };
    while (candidate.getTime() < now && guard < 200) {
        addInterval();
        guard += 1;
    }
    if (recurrenceEnd && recurrenceEnd.getTime && recurrenceEnd.getTime() > 0) {
        const endTs = recurrenceEnd.getTime();
        if (candidate.getTime() > endTs) {
            if (endTs >= now) candidate = new Date(endTs);
        }
    }
    return candidate;
};

export default function NewEventPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = searchParams?.get("projectId") || "";
    const projectName = searchParams?.get("projectName") || "";
    const creatorToken = searchParams?.get("creatorToken") || "";
    const isSharedForm = !!creatorToken;
    const { user, loading: authLoading } = useAuth();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [creatorOverride, setCreatorOverride] = useState<{ id: string; email: string; name: string } | null>(null);
    const [creatorLookupLoading, setCreatorLookupLoading] = useState(false);
    const [shareLinkCopying, setShareLinkCopying] = useState(false);
    const [shareLinkCopied, setShareLinkCopied] = useState(false);
    const [generatedLink, setGeneratedLink] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        location: "",
        description: "",
        participantsCount: "",
        partners: [] as string[],
        goal: "",
        budget: "",
        recurrence: "NONE" as "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY",
        recurrenceEndDate: "",
        contactName: "",
        contactPhone: "",
        needsVolunteers: false,
        volunteersCount: "",
    });
    const [eventDates, setEventDates] = useState<string[]>([""]);

    useEffect(() => {
        const fetchCreatorFromToken = async () => {
            if (!db || !creatorToken) {
                setCreatorOverride(null);
                return;
            }
            setCreatorLookupLoading(true);
            try {
                const snap = await getDoc(doc(db, "event_creation_links", creatorToken));
                if (snap.exists()) {
                    const data = snap.data() as any;
                    const ownerId = data.ownerId || data.userId;
                    if (!ownerId) {
                        setCreatorOverride(null);
                        setError("קישור השיתוף חסר פרטי יוצר. בקש/י קישור חדש ממי ששיתף אותך.");
                        return;
                    }
                    setCreatorOverride({
                        id: ownerId,
                        email: data.ownerEmail || "",
                        name: data.ownerName || data.ownerEmail || "מנהל",
                    });
                    setError("");
                } else {
                    setCreatorOverride(null);
                    setError("קישור השיתוף הזה לא תקף. בקש/י קישור חדש ממי ששיתף אותך.");
                }
            } catch (err) {
                console.error("Error loading creator token", err);
                setCreatorOverride(null);
                setError("שגיאה בטעינת קישור השיתוף. נסו שוב או בקשו קישור חדש.");
            } finally {
                setCreatorLookupLoading(false);
            }
        };
        fetchCreatorFromToken();
    }, [creatorToken, db]);

    // Redirect if not authenticated AND not using a share link
    if (!authLoading && !user && !creatorToken) {
        const redirectParams = new URLSearchParams();
        if (projectId) redirectParams.set("projectId", projectId);
        if (projectName) redirectParams.set("projectName", projectName);
        const redirectTarget = redirectParams.toString() ? `/events/new?${redirectParams.toString()}` : "/events/new";
        router.push(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
        return null;
    }

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        if (!db) {
            setError("Firebase is not configured");
            setSubmitting(false);
            return;
        }

        // Allow submission if user is logged in OR if using a valid share token
        if (!user && !creatorToken) {
            setError("עליך להתחבר כדי ליצור אירוע");
            setSubmitting(false);
            return;
        }

        if (creatorToken && !creatorOverride) {
            setError("קישור השיתוף לא תקף. בקש/י קישור חדש מהמנהל ששיתף אותך.");
            setSubmitting(false);
            return;
        }

        if (creatorLookupLoading) {
            setError("טוען את פרטי בעל הקישור, רגע...");
            setSubmitting(false);
            return;
        }

        try {
            const dateValues = eventDates.map(d => d.trim()).filter(Boolean);
            if (dateValues.length === 0) {
                setError("יש לבחור לפחות תאריך אחד לאירוע");
                setSubmitting(false);
                return;
            }
            const dateObjects = dateValues.map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
            if (dateObjects.length === 0) {
                setError("תאריך/ים לא תקינים");
                setSubmitting(false);
                return;
            }
            let recurrenceEnd: Date | null = null;
            if (formData.recurrence !== "NONE" && formData.recurrenceEndDate) {
                const parsed = new Date(formData.recurrenceEndDate);
                if (isNaN(parsed.getTime())) {
                    setError("תאריך סיום חזרתיות לא תקין");
                    setSubmitting(false);
                    return;
                }
                recurrenceEnd = parsed;
            }
            // Adjust start date to הבא על פי החזרתיות
            if (dateObjects[0]) {
                dateObjects[0] = computeNextOccurrence(dateObjects[0], formData.recurrence, recurrenceEnd);
            }
            const volunteersCountNum = formData.volunteersCount ? parseInt(formData.volunteersCount, 10) : null;

            // Determine creator (owner of the event)
            const creator = creatorOverride || (user ? {
                id: user.uid,
                email: user.email || "",
                name: user.displayName || user.email?.split("@")[0] || "מנהל",
            } : null);

            if (!creator) {
                setError("שגיאה בזיהוי יוצר האירוע");
                setSubmitting(false);
                return;
            }

            // Determine submitter (who actually filled the form)
            const submitter = user ? {
                id: user.uid,
                email: user.email || "",
                name: user.displayName || user.email?.split("@")[0] || "",
            } : {
                id: "guest",
                email: formData.contactName || "guest", // Use contact name as identifier for guest
                name: formData.contactName || "אורח",
            };

            // Create event in Firestore
            const eventData = {
                title: formData.title,
                location: formData.location,
                startTime: dateObjects[0],
                endTime: dateObjects[0],
                dates: dateObjects,
                description: formData.description,
                participantsCount: formData.participantsCount,
                partners: formData.partners,
                goal: formData.goal,
                budget: formData.budget,
                status: "PLANNING",
                recurrence: formData.recurrence,
                recurrenceEndDate: recurrenceEnd,
                needsVolunteers: formData.needsVolunteers,
                volunteersCount: formData.needsVolunteers && Number.isFinite(volunteersCountNum) ? volunteersCountNum : null,
                createdBy: creator.id,
                createdByEmail: creator.email,
                members: [creator.id],
                team: [
                    {
                        name: creator.name,
                        role: "מנהל אירוע",
                        email: creator.email,
                        userId: creator.id,
                    }
                ],
                contactPerson: {
                    name: formData.contactName,
                    phone: formData.contactPhone,
                    email: creator.email, // Contact person email defaults to creator's email for notifications
                },
                projectId: projectId || null,
                projectName: projectName || null,
                createdAt: serverTimestamp(),
                responsibilities: [],
            };
            if (creatorToken) {
                (eventData as any).createdViaLinkToken = creatorToken;
            }
            if (submitter.id === "guest" || (user && creator.id !== user.uid)) {
                (eventData as any).createdByProxy = submitter;
            }

            const docRef = await addDoc(collection(db, "events"), eventData);
            console.log("Event created with ID:", docRef.id);

            if (user) {
                router.push("/");
            } else {
                setSubmitted(true);
            }
        } catch (err: any) {
            console.error("Error creating event:", err);
            setError("שגיאה ביצירת האירוע: " + err.message);
            setSubmitting(false);
        }
    };

    const formatGoogleDate = (date: Date) =>
        date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const handleSaveToCalendar = () => {
        const firstDate = eventDates.find(d => d.trim());
        if (!formData.title || !firstDate) {
            alert("מלא שם אירוע ותאריך/שעה לפני שמירה ביומן.");
            return;
        }
        const start = new Date(firstDate);
        if (isNaN(start.getTime())) {
            alert("תאריך/שעה לא תקינים");
            return;
        }
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // ברירת מחדל: שעתיים

        const text = encodeURIComponent(formData.title);
        const detailsStr = [
            formData.goal ? `מטרה: ${formData.goal}` : null,
            formData.description ? `תיאור: ${formData.description}` : null,
            formData.location ? `מיקום: ${formData.location}` : null,
            formData.participantsCount ? `משתתפים משוערים: ${formData.participantsCount}` : null,
            formData.budget ? `תקציב משוער: ${formData.budget}` : null,
            formData.partners?.length ? `שותפים: ${formData.partners.join(", ")}` : null,
            formData.recurrence && formData.recurrence !== "NONE" ? `תדירות: ${formData.recurrence}` : null,
            formData.recurrence !== "NONE" && formData.recurrenceEndDate ? `עד תאריך: ${formData.recurrenceEndDate}` : null,
            formData.needsVolunteers ? `מתנדבים: ${formData.volunteersCount || "צריך מתנדבים"}` : null,
            formData.contactName ? `איש קשר: ${formData.contactName}` : null,
            formData.contactPhone ? `טלפון: ${formData.contactPhone}` : null,
        ].filter(Boolean).join(" | ");
        const details = encodeURIComponent(detailsStr);
        const location = encodeURIComponent(formData.location || "");
        const dates = `${formatGoogleDate(start)}/${formatGoogleDate(end)}`;

        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const handleCopyShareLink = async () => {
        if (!user) {
            setError("התחבר כדי ליצור קישור שיתוף לטופס.");
            return;
        }
        if (!db) {
            setError("Firebase is not configured");
            return;
        }
        setShareLinkCopying(true);
        setError("");
        setGeneratedLink("");
        try {
            const linkDoc = await addDoc(collection(db, "event_creation_links"), {
                ownerId: user.uid,
                ownerEmail: user.email || "",
                ownerName: user.displayName || user.email?.split("@")[0] || "מנהל",
                createdAt: serverTimestamp(),
            });
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const params = new URLSearchParams();
            params.set("creatorToken", linkDoc.id);
            if (projectId) params.set("projectId", projectId);
            if (projectName) params.set("projectName", projectName);
            const shareUrl = origin ? `${origin}/events/new?${params.toString()}` : `/events/new?${params.toString()}`;

            setGeneratedLink(shareUrl);

            // Try native share first (works better on mobile)
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'יצירת אירוע חדש',
                        text: 'קישור ליצירת אירוע חדש במערכת',
                        url: shareUrl
                    });
                    return; // Share successful
                } catch (shareErr) {
                    console.log("Share failed or cancelled, trying copy", shareErr);
                }
            }

            // Fallback to clipboard
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                setShareLinkCopied(true);
                setError("");
                setTimeout(() => setShareLinkCopied(false), 2000);
            } else {
                setError("הקישור נוצר! העתק אותו ידנית מהשדה למטה.");
            }
        } catch (err: any) {
            console.error("Error creating share link", err);
            // If we have a generated link but copy failed, don't show a scary error
            if (generatedLink) {
                setError("הקישור נוצר! לא הצלחנו להעתיק אוטומטית, אנא העתק ידנית.");
            } else {
                setError("לא הצלחנו ליצור קישור שיתוף: " + (err?.message || ""));
            }
        } finally {
            setShareLinkCopying(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            {submitted ? (
                <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">האירוע נוצר בהצלחה!</h2>
                        <p className="text-gray-600 mb-6">
                            הפרטים נשלחו והאירוע נוסף למערכת.
                            <br />
                            תודה רבה!
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                            שלח אירוע נוסף
                        </button>
                    </div>
                </div>
            ) : (
                <div className="max-w-2xl mx-auto">
                    <div className="mb-6">
                        {isSharedForm ? (
                            <div className="flex flex-col gap-2">
                                <h1 className="text-3xl font-bold text-gray-900">יצירת אירוע חדש</h1>
                                {projectId && (
                                    <div className="mt-1 inline-flex items-center gap-2 text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100 px-3 py-1 rounded-full">
                                        משויך לפרויקט: {projectName || projectId}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div>
                                    <Link href="/" className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm mb-2">
                                        <ArrowRight size={16} />
                                        חזרה לדשבורד
                                    </Link>
                                    <h1 className="text-3xl font-bold text-gray-900">יצירת אירוע חדש</h1>
                                    {projectId && (
                                        <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100 px-3 py-1 rounded-full">
                                            משויך לפרויקט: {projectName || projectId}
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={handleCopyShareLink}
                                        disabled={shareLinkCopying}
                                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-indigo-700 bg-white hover:bg-indigo-50 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {shareLinkCopying ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                                        {shareLinkCopying ? "יוצר קישור..." : "העתק קישור לטופס שיתוף"}
                                        {!shareLinkCopying && <Copy size={14} className="text-indigo-500" />}
                                    </button>
                                    <p className="text-xs text-gray-600 text-right">הקישור יפתח טופס זה ויצור אירוע בשמי.</p>
                                    {shareLinkCopied && (
                                        <div className="flex items-center gap-1 text-xs text-emerald-600 justify-end">
                                            <Check size={14} />
                                            הקישור הועתק
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {generatedLink && (
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg animate-in fade-in slide-in-from-top-2">
                                <p className="text-xs text-gray-500 mb-1 font-medium">הקישור שלך מוכן (העתק ידנית אם לא הועתק):</p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={generatedLink}
                                        className="w-full text-sm p-2 border rounded bg-white text-gray-700 select-all focus:ring-2 focus:ring-indigo-500 outline-none"
                                        onClick={(e) => e.currentTarget.select()}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(generatedLink);
                                            setShareLinkCopied(true);
                                            setTimeout(() => setShareLinkCopied(false), 2000);
                                        }}
                                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-100 bg-white"
                                        title="העתק שוב"
                                    >
                                        <Copy size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                        {creatorLookupLoading && (
                            <div className="mt-3 inline-flex items-center gap-2 text-xs text-gray-700 bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg">
                                <Loader2 size={14} className="animate-spin" />
                                טוען פרטי בעל הקישור...
                            </div>
                        )}
                        {creatorOverride && (
                            <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-2 rounded-full">
                                <Check size={14} />
                                האירוע יפתח עבור {creatorOverride.name || "מנהל"} ({creatorOverride.email || "ללא אימייל"}), ורק הוא יראה אותו עד שתוסיפו אנשי צוות.
                            </div>
                        )}
                        {creatorToken && !creatorOverride && !creatorLookupLoading && (
                            <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                קישור השיתוף לא נמצא. בקש/י קישור חדש מהמנהל ששיתף אותך.
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">שם האירוע</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="לדוגמה: פסטיבל אביב 2025"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">איש קשר</label>
                                        <input
                                            type="text"
                                            className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                            value={formData.contactName || ""}
                                            onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                                            placeholder="שם איש קשר"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">טלפון איש קשר</label>
                                        <input
                                            type="tel"
                                            className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                            value={formData.contactPhone || ""}
                                            onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                                            placeholder="05x-xxxxxxx"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">תאריכים ושעות</label>
                                    {eventDates.map((d, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <input
                                                type="datetime-local"
                                                required={idx === 0}
                                                className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                                value={d}
                                                onChange={(e) => {
                                                    const copy = [...eventDates];
                                                    copy[idx] = e.target.value;
                                                    setEventDates(copy);
                                                }}
                                            />
                                            {eventDates.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEventDates(prev => prev.filter((_, i) => i !== idx))}
                                                    className="text-red-500 text-sm px-2 py-1 rounded-lg hover:bg-red-50 border border-red-200"
                                                >
                                                    מחק
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setEventDates(prev => [...prev, ""])}
                                        className="text-sm px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                    >
                                        הוסף תאריך נוסף
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">מיקום</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        placeholder="לדוגמה: פארק הזהב"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">מתנדבים לערב</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            id="needsVolunteers"
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            checked={formData.needsVolunteers}
                                            onChange={(e) => setFormData({ ...formData, needsVolunteers: e.target.checked })}
                                        />
                                        <label htmlFor="needsVolunteers" className="text-gray-800 text-sm">
                                            צריך מתנדבים לערב הזה?
                                        </label>
                                    </div>
                                    {formData.needsVolunteers && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">כמה מתנדבים?</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                                value={formData.volunteersCount}
                                                onChange={(e) => setFormData({ ...formData, volunteersCount: e.target.value })}
                                                placeholder="מספר המתנדבים הדרוש"
                                                required={formData.needsVolunteers}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">תדירות חוזרת</label>
                                    <select
                                        className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                        value={formData.recurrence}
                                        onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as any })}
                                    >
                                        <option value="NONE">חד פעמי</option>
                                        <option value="WEEKLY">כל שבוע</option>
                                        <option value="BIWEEKLY">כל שבועיים</option>
                                        <option value="MONTHLY">כל חודש</option>
                                    </select>
                                    {formData.recurrence !== "NONE" && (
                                        <div className="mt-2 space-y-1">
                                            <label className="block text-xs font-medium text-gray-600">עד איזה תאריך האירוע יחזור?</label>
                                            <input
                                                type="date"
                                                className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                                value={formData.recurrenceEndDate}
                                                onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                                                placeholder="בחר תאריך סיום חזרתיות"
                                            />
                                            <p className="text-xs text-gray-500">אופציונלי: בחר תאריך אחרון שבו האירוע יתקיים.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">כמות משתתפים רצויה</label>
                                    <input
                                        type="number"
                                        className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                        value={formData.participantsCount}
                                        onChange={(e) => setFormData({ ...formData, participantsCount: e.target.value })}
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">תקציב משוער (₪)</label>
                                    <input
                                        type="number"
                                        className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                        value={formData.budget}
                                        onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <PartnersInput
                                label="שותפים (רכזת נוספת, ארגון וכו')"
                                value={formData.partners}
                                onChange={(partners) => setFormData({ ...formData, partners })}
                                placeholder="הוסף שותף ולחץ אנטר"
                            />

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">מטרת האירוע</label>
                                <textarea
                                    rows={3}
                                    className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                    value={formData.goal}
                                    onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                                    placeholder="על איזה צורך עונה האירוע? עם איזה תחושות המשתתפים יצאו?"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור כללי</label>
                                <textarea
                                    rows={4}
                                    className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="פרטים נוספים על האירוע..."
                                />
                            </div>

                            <div className="pt-4 border-t border-gray-100 flex flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={handleSaveToCalendar}
                                    className="w-full border-2 border-indigo-200 text-indigo-700 py-2 px-4 rounded-lg hover:bg-indigo-50 transition font-semibold flex items-center justify-center gap-2"
                                >
                                    <CalendarPlus size={18} />
                                    שמור ביומן
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || creatorLookupLoading}
                                    className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                >
                                    {submitting ? "יוצר אירוע..." : creatorLookupLoading ? "טוען קישור..." : "צור אירוע"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
