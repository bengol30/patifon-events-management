"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

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
        partners: "",
        goal: "",
        budget: "",
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
                createdBy: user.uid,
                createdAt: serverTimestamp(),
                responsibilities: [],
            };

            const docRef = await addDoc(collection(db, "events"), eventData);
            console.log("Event created with ID:", docRef.id);

            // Fetch default tasks from Firestore
            const defaultTasksSnapshot = await getDocs(collection(db, "default_tasks"));
            const defaultTasks = defaultTasksSnapshot.docs.map(doc => doc.data());

            // Add default tasks to the new event
            const tasksCollection = collection(db, "events", docRef.id, "tasks");
            const taskPromises = defaultTasks.map(task =>
                addDoc(tasksCollection, {
                    title: task.title,
                    priority: task.priority || "NORMAL",
                    status: "TODO",
                    assignee: "",
                    dueDate: "",
                    createdAt: serverTimestamp(),
                    createdBy: user.uid
                })
            );

            await Promise.all(taskPromises);

            router.push("/");
        } catch (err: any) {
            console.error("Error creating event:", err);
            setError("שגיאה ביצירת האירוע: " + err.message);
            setSubmitting(false);
        }
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

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">שותפים (רכזת נוספת, ארגון וכו')</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                value={formData.partners}
                                onChange={(e) => setFormData({ ...formData, partners: e.target.value })}
                                placeholder="שמות שותפים..."
                            />
                        </div>

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

                        <div className="pt-4 border-t border-gray-100">
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
