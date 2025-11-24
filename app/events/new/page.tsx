"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function NewEventPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        date: "",
        location: "",
        description: "",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // TODO: Implement actual event creation logic (Firestore + Drive)
        console.log("Creating event:", formData);

        // Simulate delay
        setTimeout(() => {
            setLoading(false);
            router.push("/");
        }, 1000);
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

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור האירוע</label>
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
                                disabled={loading}
                                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                                {loading ? "יוצר אירוע..." : "צור אירוע"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
