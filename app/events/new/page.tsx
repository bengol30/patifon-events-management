"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import PartnersInput from "@/components/PartnersInput";

export default function NewEventPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [formData, setFormData] = useState({
        title: "",
        date: "",
        location: "",
        description: "",
        participantsCount: "",
        partners: [] as string[],
        goal: "",
        budget: "",
        recurrence: "NONE" as "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY",
        contactName: "",
        contactPhone: "",
    });

    // Redirect if not authenticated
    if (!authLoading && !user) {
        router.push("/login");
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

        if (!user) {
            setError("עליך להתחבר כדי ליצור אירוע");
            setSubmitting(false);
            return;
        }

        try {
            // Create event in Firestore
            const eventData = {
                title: formData.title,
                location: formData.location,
                startTime: new Date(formData.date),
                endTime: new Date(formData.date),
                description: formData.description,
                participantsCount: formData.participantsCount,
                partners: formData.partners,
                goal: formData.goal,
                budget: formData.budget,
                status: "PLANNING",
                recurrence: formData.recurrence,
                createdBy: user.uid,
                members: [user.uid], // Add creator as a member
                team: [
                    {
                        name: user.displayName || user.email?.split('@')[0] || "מנהל",
                        role: "מנהל אירוע",
                        email: user.email || "",
                        userId: user.uid,
                    }
                ],
                contactPerson: {
                    name: formData.contactName,
                    phone: formData.contactPhone,
                    email: user.email || "",
                },
                createdAt: serverTimestamp(),
                responsibilities: [],
            };

            const docRef = await addDoc(collection(db, "events"), eventData);
            console.log("Event created with ID:", docRef.id);

            router.push("/");
        } catch (err: any) {
            console.error("Error creating event:", err);
            setError("שגיאה ביצירת האירוע: " + err.message);
            setSubmitting(false);
        }
    };

    const formatGoogleDate = (date: Date) =>
        date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const handleSaveToCalendar = () => {
        if (!formData.title || !formData.date) {
            alert("מלא שם אירוע ותאריך/שעה לפני שמירה ביומן.");
            return;
        }
        const start = new Date(formData.date);
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
            formData.contactName ? `איש קשר: ${formData.contactName}` : null,
            formData.contactPhone ? `טלפון: ${formData.contactPhone}` : null,
        ].filter(Boolean).join(" | ");
        const details = encodeURIComponent(detailsStr);
        const location = encodeURIComponent(formData.location || "");
        const dates = `${formatGoogleDate(start)}/${formatGoogleDate(end)}`;

        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                    <Link href="/" className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm mb-2">
                        <ArrowRight size={16} />
                        חזרה לדשבורד
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-900">יצירת אירוע חדש</h1>
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
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך ושעה</label>
                                <input
                                    type="datetime-local"
                                    required
                                    className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                />
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
                                disabled={submitting}
                                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                {submitting ? "יוצר אירוע..." : "צור אירוע"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
