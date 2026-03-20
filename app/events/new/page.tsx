"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarPlus, Link2, Copy, Check, Loader2, MapPin, Users, Repeat, Phone, UserRound, FileText, Target, Wallet, Sparkles, CalendarRange, ShieldCheck, HeartHandshake } from "lucide-react";
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

    const filledDatesCount = eventDates.filter((date) => date.trim()).length;
    const isRecurring = formData.recurrence !== "NONE";

    const inputClassName = "w-full rounded-2xl border border-[#d8c7b4] bg-white/90 px-4 py-3 text-[15px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--patifon-orange)] focus:ring-4 focus:ring-orange-100";
    const sectionClassName = "rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-[0_16px_40px_rgba(74,26,44,0.08)] backdrop-blur sm:p-6";
    const sectionHeaderClassName = "mb-4 flex items-start justify-between gap-3";

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,213,110,0.45),_transparent_32%),linear-gradient(180deg,#f7ead8_0%,#f3e1cd_42%,#f6ecdf_100%)] px-4 py-5 sm:px-6 sm:py-8">
            {submitted ? (
                <div className="min-h-[70vh] flex items-center justify-center">
                    <div className="w-full max-w-md rounded-[32px] border border-white/80 bg-white/90 p-8 text-center shadow-[0_24px_60px_rgba(74,26,44,0.12)] backdrop-blur">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                            <Check size={32} />
                        </div>
                        <h2 className="mb-2 text-2xl font-black text-slate-900">האירוע נוצר בהצלחה!</h2>
                        <p className="mb-6 text-sm leading-7 text-slate-600">
                            הפרטים נשלחו והאירוע נוסף למערכת.
                            <br />
                            תודה רבה!
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="patifon-action-secondary w-full"
                        >
                            שלח אירוע נוסף
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
                    <div className="overflow-hidden rounded-[32px] border border-[rgba(74,26,44,0.08)] bg-[linear-gradient(135deg,rgba(74,26,44,0.96),rgba(193,39,45,0.92),rgba(241,143,58,0.88))] text-white shadow-[0_24px_60px_rgba(74,26,44,0.18)]">
                        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
                            <div className="max-w-2xl">
                                {!isSharedForm && (
                                    <Link href="/" className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/90 transition hover:bg-white/15">
                                        <ArrowRight size={16} />
                                        חזרה לדשבורד
                                    </Link>
                                )}
                                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-white/90">
                                    <Sparkles size={14} />
                                    טופס פתיחת אירוע
                                </div>
                                <h1 className="text-3xl font-black leading-tight sm:text-4xl">יצירת אירוע חדש</h1>
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/85 sm:text-[15px]">
                                    בנינו כאן זרימה נקייה ומהירה יותר: קודם מגדירים את עיקרי האירוע, אחר כך את ההפעלה, ואז משלימים את פרטי התוכן והצוות — בלי לאבד שום יכולת קיימת.
                                </p>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {projectId && (
                                        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/12 px-3 py-1.5 text-xs font-semibold">
                                            <ShieldCheck size={14} />
                                            משויך לפרויקט: {projectName || projectId}
                                        </div>
                                    )}
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/12 px-3 py-1.5 text-xs font-semibold">
                                        <CalendarRange size={14} />
                                        {filledDatesCount || 0} תאריכים הוגדרו
                                    </div>
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/12 px-3 py-1.5 text-xs font-semibold">
                                        <Repeat size={14} />
                                        {isRecurring ? "אירוע חוזר" : "אירוע חד-פעמי"}
                                    </div>
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/12 px-3 py-1.5 text-xs font-semibold">
                                        <HeartHandshake size={14} />
                                        {formData.needsVolunteers ? `צריך ${formData.volunteersCount || "?"} מתנדבים` : "ללא מתנדבים כרגע"}
                                    </div>
                                </div>
                            </div>

                            {!isSharedForm && (
                                <div className="w-full max-w-sm rounded-[24px] border border-white/15 bg-white/10 p-4 backdrop-blur">
                                    <p className="text-sm font-bold text-white">רוצה שמישהו ימלא במקומך?</p>
                                    <p className="mt-1 text-xs leading-6 text-white/80">הקישור פותח את אותו טופס בדיוק ויוצר את האירוע תחת החשבון שלך.</p>
                                    <div className="mt-4 flex flex-col gap-2">
                                        <button
                                            type="button"
                                            onClick={handleCopyShareLink}
                                            disabled={shareLinkCopying}
                                            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white px-4 py-3 text-sm font-bold text-[var(--patifon-burgundy)] transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {shareLinkCopying ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                                            {shareLinkCopying ? "יוצר קישור..." : "העתק קישור לטופס שיתוף"}
                                            {!shareLinkCopying && <Copy size={14} className="text-[var(--patifon-orange)]" />}
                                        </button>
                                        {shareLinkCopied && (
                                            <div className="flex items-center justify-end gap-1 text-xs text-emerald-200">
                                                <Check size={14} />
                                                הקישור הועתק
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {generatedLink && (
                        <div className="rounded-[24px] border border-[#e6d8ca] bg-white/90 p-4 shadow-sm">
                            <p className="mb-2 text-xs font-semibold text-slate-500">הקישור שלך מוכן (העתק ידנית אם לא הועתק):</p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                    type="text"
                                    readOnly
                                    value={generatedLink}
                                    className={`${inputClassName} text-sm ltr:text-left`}
                                    onClick={(e) => e.currentTarget.select()}
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(generatedLink);
                                        setShareLinkCopied(true);
                                        setTimeout(() => setShareLinkCopied(false), 2000);
                                    }}
                                    className="patifon-action-secondary shrink-0"
                                    title="העתק שוב"
                                >
                                    <Copy size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {(creatorLookupLoading || creatorOverride || (creatorToken && !creatorOverride && !creatorLookupLoading) || error) && (
                        <div className="space-y-3">
                            {creatorLookupLoading && (
                                <div className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white/90 px-4 py-3 text-xs text-gray-700 shadow-sm">
                                    <Loader2 size={14} className="animate-spin" />
                                    טוען פרטי בעל הקישור...
                                </div>
                            )}
                            {creatorOverride && (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm">
                                    <div className="flex items-start gap-2">
                                        <Check size={16} className="mt-0.5 shrink-0" />
                                        <span>האירוע ייפתח עבור {creatorOverride.name || "מנהל"} ({creatorOverride.email || "ללא אימייל"}), ורק הוא יראה אותו עד שתוסיפו אנשי צוות.</span>
                                    </div>
                                </div>
                            )}
                            {creatorToken && !creatorOverride && !creatorLookupLoading && (
                                <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">
                                    קישור השיתוף לא נמצא. בקש/י קישור חדש מהמנהל ששיתף אותך.
                                </div>
                            )}
                            {error && <p className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-600 shadow-sm">{error}</p>}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                        <div className="space-y-5">
                            <section className={sectionClassName}>
                                <div className={sectionHeaderClassName}>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--patifon-orange-dark)]">בסיס האירוע</p>
                                        <h2 className="mt-1 text-xl font-black text-slate-900">הפרטים שחייבים כדי להתחיל</h2>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">שם, איש קשר ופרטי גישה בסיסיים. זה מה שהצוות רואה ראשון.</p>
                                    </div>
                                    <div className="rounded-2xl bg-[var(--patifon-cream)] p-3 text-[var(--patifon-burgundy)]">
                                        <FileText size={18} />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="mb-1.5 block text-sm font-semibold text-slate-700">שם האירוע</label>
                                        <input type="text" required className={inputClassName} value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="לדוגמה: פסטיבל אביב 2025" />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><UserRound size={15} className="text-[var(--patifon-orange-dark)]" /> איש קשר</label>
                                            <input type="text" className={inputClassName} value={formData.contactName || ""} onChange={(e) => setFormData({ ...formData, contactName: e.target.value })} placeholder="שם איש קשר" />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Phone size={15} className="text-[var(--patifon-orange-dark)]" /> טלפון איש קשר</label>
                                            <input type="tel" className={inputClassName} value={formData.contactPhone || ""} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} placeholder="05x-xxxxxxx" />
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className={sectionClassName}>
                                <div className={sectionHeaderClassName}>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--patifon-orange-dark)]">לוגיסטיקה והפעלה</p>
                                        <h2 className="mt-1 text-xl font-black text-slate-900">מתי, איפה ואיך האירוע קורה</h2>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">ארגון נוח יותר של תאריכים, מיקום, חזרתיות ומתנדבים — במיוחד בנייד.</p>
                                    </div>
                                    <div className="rounded-2xl bg-[var(--patifon-cream)] p-3 text-[var(--patifon-burgundy)]">
                                        <CalendarRange size={18} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                    <div className="rounded-2xl border border-[#ede1d4] bg-[#fffaf5] p-4">
                                        <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><CalendarRange size={15} className="text-[var(--patifon-orange-dark)]" /> תאריכים ושעות</label>
                                        <div className="space-y-3">
                                            {eventDates.map((d, idx) => (
                                                <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                    <input
                                                        type="datetime-local"
                                                        required={idx === 0}
                                                        className={inputClassName}
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
                                                            className="min-h-[46px] rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 sm:shrink-0"
                                                        >
                                                            מחק
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            <button type="button" onClick={() => setEventDates(prev => [...prev, ""])} className="patifon-action-secondary w-full sm:w-auto">
                                                הוסף תאריך נוסף
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><MapPin size={15} className="text-[var(--patifon-orange-dark)]" /> מיקום</label>
                                            <input type="text" required className={inputClassName} value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="לדוגמה: פארק הזהב" />
                                        </div>
                                        <div>
                                            <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Repeat size={15} className="text-[var(--patifon-orange-dark)]" /> תדירות חוזרת</label>
                                            <select className={inputClassName} value={formData.recurrence} onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" })}>
                                                <option value="NONE">חד פעמי</option>
                                                <option value="WEEKLY">כל שבוע</option>
                                                <option value="BIWEEKLY">כל שבועיים</option>
                                                <option value="MONTHLY">כל חודש</option>
                                            </select>
                                            {formData.recurrence !== "NONE" && (
                                                <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/80 p-4">
                                                    <label className="mb-1.5 block text-xs font-semibold text-slate-700">עד איזה תאריך האירוע יחזור?</label>
                                                    <input type="date" className={inputClassName} value={formData.recurrenceEndDate} onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })} placeholder="בחר תאריך סיום חזרתיות" />
                                                    <p className="mt-2 text-xs leading-5 text-slate-500">אופציונלי: אם נבחר תאריך, המערכת תחשב את המופע הבא ותשמור על ההתנהגות הקיימת.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-2xl border border-[#ede1d4] bg-[#fffaf5] p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><HeartHandshake size={15} className="text-[var(--patifon-orange-dark)]" /> מתנדבים לערב</label>
                                            <p className="mt-1 text-xs leading-5 text-slate-500">לא שינינו את הלוגיקה — רק הפכנו אותה לברורה יותר. סימון התיבה פותח את שדה הכמות.</p>
                                        </div>
                                        <label htmlFor="needsVolunteers" className="inline-flex min-h-[46px] cursor-pointer items-center gap-3 rounded-2xl border border-[#d8c7b4] bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
                                            <input id="needsVolunteers" type="checkbox" className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" checked={formData.needsVolunteers} onChange={(e) => setFormData({ ...formData, needsVolunteers: e.target.checked })} />
                                            צריך מתנדבים לערב הזה?
                                        </label>
                                    </div>
                                    {formData.needsVolunteers && (
                                        <div className="mt-4 max-w-sm">
                                            <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Users size={15} className="text-[var(--patifon-orange-dark)]" /> כמה מתנדבים?</label>
                                            <input type="number" min={0} className={inputClassName} value={formData.volunteersCount} onChange={(e) => setFormData({ ...formData, volunteersCount: e.target.value })} placeholder="מספר המתנדבים הדרוש" required={formData.needsVolunteers} />
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className={sectionClassName}>
                                <div className={sectionHeaderClassName}>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--patifon-orange-dark)]">תוכן, יעדים ושותפים</p>
                                        <h2 className="mt-1 text-xl font-black text-slate-900">המידע שנותן הקשר תפעולי</h2>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">אותם שדות בדיוק — רק עם היררכיה חזקה יותר וקריאות טובה יותר.</p>
                                    </div>
                                    <div className="rounded-2xl bg-[var(--patifon-cream)] p-3 text-[var(--patifon-burgundy)]">
                                        <Target size={18} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Users size={15} className="text-[var(--patifon-orange-dark)]" /> כמות משתתפים רצויה</label>
                                        <input type="number" className={inputClassName} value={formData.participantsCount} onChange={(e) => setFormData({ ...formData, participantsCount: e.target.value })} placeholder="0" />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Wallet size={15} className="text-[var(--patifon-orange-dark)]" /> תקציב משוער (₪)</label>
                                        <input type="number" className={inputClassName} value={formData.budget} onChange={(e) => setFormData({ ...formData, budget: e.target.value })} placeholder="0" />
                                    </div>
                                </div>

                                <div className="mt-4 rounded-2xl border border-[#ede1d4] bg-[#fffaf5] p-4">
                                    <PartnersInput
                                        label="שותפים (רכזת נוספת, ארגון וכו')"
                                        value={formData.partners}
                                        onChange={(partners) => setFormData({ ...formData, partners })}
                                        placeholder="הוסף שותף ולחץ אנטר"
                                    />
                                </div>

                                <div className="mt-4 grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Target size={15} className="text-[var(--patifon-orange-dark)]" /> מטרת האירוע</label>
                                        <textarea rows={4} className={inputClassName} value={formData.goal} onChange={(e) => setFormData({ ...formData, goal: e.target.value })} placeholder="על איזה צורך עונה האירוע? עם איזה תחושות המשתתפים יצאו?" />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700"><FileText size={15} className="text-[var(--patifon-orange-dark)]" /> תיאור כללי</label>
                                        <textarea rows={5} className={inputClassName} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="פרטים נוספים על האירוע..." />
                                    </div>
                                </div>
                            </section>
                        </div>

                        <aside className="space-y-4 lg:sticky lg:top-4">
                            <div className="rounded-[28px] border border-[rgba(74,26,44,0.08)] bg-white/90 p-5 shadow-[0_18px_45px_rgba(74,26,44,0.10)] backdrop-blur">
                                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--patifon-orange-dark)]">סיכום מהיר</p>
                                <h3 className="mt-2 text-xl font-black text-slate-900">לפני שליחה</h3>
                                <div className="mt-4 space-y-3 text-sm text-slate-700">
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#fff8f0] px-4 py-3">
                                        <span>שם האירוע</span>
                                        <span className="max-w-[55%] truncate font-semibold text-slate-900">{formData.title || "טרם הוזן"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#fff8f0] px-4 py-3">
                                        <span>תאריכים</span>
                                        <span className="font-semibold text-slate-900">{filledDatesCount || 0}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#fff8f0] px-4 py-3">
                                        <span>מיקום</span>
                                        <span className="max-w-[55%] truncate font-semibold text-slate-900">{formData.location || "לא הוגדר"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#fff8f0] px-4 py-3">
                                        <span>מתנדבים</span>
                                        <span className="font-semibold text-slate-900">{formData.needsVolunteers ? (formData.volunteersCount || "כן") : "לא"}</span>
                                    </div>
                                </div>

                                <div className="mt-5 space-y-3 border-t border-[#efe2d3] pt-5">
                                    <button type="button" onClick={handleSaveToCalendar} className="patifon-action-secondary flex w-full items-center justify-center gap-2">
                                        <CalendarPlus size={18} />
                                        שמור ביומן
                                    </button>
                                    <button type="submit" disabled={submitting || creatorLookupLoading} className="patifon-action-primary w-full disabled:cursor-not-allowed disabled:opacity-50">
                                        {submitting ? "יוצר אירוע..." : creatorLookupLoading ? "טוען קישור..." : "צור אירוע"}
                                    </button>
                                    <p className="text-xs leading-5 text-slate-500">השליחה שומרת את כל אותן יכולות קיימות: תאריכים מרובים, חזרתיות, שיוך לפרויקט, מתנדבים ויצירה דרך קישור שיתוף.</p>
                                </div>
                            </div>
                        </aside>
                    </form>
                </div>
            )}
        </div>
    );
}
