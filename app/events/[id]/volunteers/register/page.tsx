"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp, getDocs, query, where, updateDoc, arrayUnion } from "firebase/firestore";
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
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        name: "",
        phone: "",
        email: "",
    });
    const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
    const [currentVolunteerCount, setCurrentVolunteerCount] = useState(0);

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

                // Fetch tasks - only volunteer tasks
                const tasksQuery = query(collection(db, "events", id, "tasks"));
                const tasksSnap = await getDocs(tasksQuery);
                const tasksData: Task[] = [];
                tasksSnap.forEach((doc) => {
                    const taskData = { id: doc.id, ...doc.data() } as Task;
                    // Only include tasks marked as volunteer tasks
                    if (taskData.isVolunteerTask) {
                        tasksData.push(taskData);
                    }
                });
                setTasks(tasksData);

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

    const handleTaskToggle = (taskId: string) => {
        setSelectedTasks((prev) =>
            prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db) return;
        if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
            setError("יש למלא שם, טלפון ואימייל");
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
            // Check again for limit (race condition protection)
            const volunteersQuery = query(collection(db, "events", id, "volunteers"));
            const volunteersSnap = await getDocs(volunteersQuery);
            if (event?.volunteersCount && volunteersSnap.size >= event.volunteersCount) {
                setError(`הגענו למגבלת המתנדבים (${event.volunteersCount}). נסו שוב מאוחר יותר.`);
                setSubmitting(false);
                return;
            }

            // Add volunteer
            await addDoc(collection(db, "events", id, "volunteers"), {
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email.trim(),
                selectedTasks: selectedTasks,
                createdAt: serverTimestamp(),
            });

            // Update tasks with volunteer assignments
            for (const taskId of selectedTasks) {
                const taskRef = doc(db, "events", id, "tasks", taskId);
                const taskSnap = await getDoc(taskRef);
                if (taskSnap.exists()) {
                    const taskData = taskSnap.data();
                    const currentAssignees = taskData.assignees || [];
                    const newAssignee = {
                        name: form.name.trim(),
                        email: form.email.trim(),
                    };
                    // Check if volunteer already assigned
                    const emailLower = form.email.trim().toLowerCase();
                    const existingIdx = currentAssignees.findIndex(
                        (a: any) => (a.email || "").toLowerCase() === emailLower
                    );
                    if (existingIdx < 0) {
                        await updateDoc(taskRef, {
                            assignees: arrayUnion(newAssignee)
                        });
                    }
                }
            }

            setSubmitted(true);
            setForm({ name: "", phone: "", email: "" });
            setSelectedTasks([]);
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
                                <p className="text-green-700 mb-4">ההרשמה בוצעה בהצלחה. להלן המשימות של האירוע:</p>
                            </div>

                            {tasks.length > 0 ? (
                                <div className="space-y-4">
                                    <h3 className="text-lg font-bold text-gray-900">משימות האירוע</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {tasks.map((task) => {
                                            const taskDate = task.dueDate ? new Date(task.dueDate) : null;
                                            return (
                                                <div
                                                    key={task.id}
                                                    className={`border rounded-lg p-4 ${
                                                        selectedTasks.includes(task.id)
                                                            ? "border-indigo-500 bg-indigo-50"
                                                            : "border-gray-200 bg-white"
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="mt-0.5">
                                                            {selectedTasks.includes(task.id) ? (
                                                                <CheckSquare className="text-indigo-600" size={18} />
                                                            ) : (
                                                                <Square className="text-gray-400" size={18} />
                                                            )}
                                                        </div>
                                                        <div className="flex-1">
                                                            <h4 className="font-semibold text-sm text-gray-900 mb-1">{task.title}</h4>
                                                            {task.description && (
                                                                <p className="text-xs text-gray-600 mb-2">{task.description}</p>
                                                            )}
                                                            {taskDate && (
                                                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
                                                                    <Clock size={12} />
                                                                    <span>דד ליין: {taskDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <span className={`text-xs px-2 py-0.5 rounded ${
                                                                    task.priority === "CRITICAL" ? "bg-red-100 text-red-700" :
                                                                    task.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                                                                    "bg-gray-100 text-gray-700"
                                                                }`}>
                                                                    {task.priority === "CRITICAL" ? "קריטי" :
                                                                     task.priority === "HIGH" ? "גבוה" : "רגיל"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500 text-sm">
                                    אין משימות זמינות כרגע לאירוע זה
                                </div>
                            )}

                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
                                <h3 className="text-lg font-bold text-indigo-900 mb-2">רוצה להתנדב בעוד אירועים?</h3>
                                <p className="text-indigo-800 text-sm mb-4">
                                    תוכל להרשם לעוד אירועים ולבחור משימות שונות. כל האירועים והמשימות הפתוחות ממתינים לך!
                                </p>
                                <button
                                    onClick={() => router.push("/volunteers/events")}
                                    className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 transition"
                                >
                                    <ExternalLink size={16} />
                                    צפה בכל האירועים והמשימות הפתוחות
                                </button>
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
                                <h2 className="text-lg font-bold text-gray-900 mb-4">פרטים אישיים</h2>
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

                                {error && <p className="text-sm text-red-600">{error}</p>}
                            </form>

                            <div className="space-y-4">
                                <h2 className="text-lg font-bold text-gray-900 mb-4">בחירת משימות</h2>
                                <p className="text-sm text-gray-600 mb-4">
                                    בחרו את המשימות שתרצו לקחת עליכם אחריות. ניתן לבחור מספר משימות.
                                </p>
                                {tasks.length === 0 ? (
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500 text-sm">
                                        אין משימות זמינות כרגע
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                        {tasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className={`border rounded-lg p-3 cursor-pointer transition ${
                                                    selectedTasks.includes(task.id)
                                                        ? "border-indigo-500 bg-indigo-50"
                                                        : "border-gray-200 hover:border-gray-300"
                                                }`}
                                                onClick={() => handleTaskToggle(task.id)}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-0.5">
                                                        {selectedTasks.includes(task.id) ? (
                                                            <CheckSquare className="text-indigo-600" size={18} />
                                                        ) : (
                                                            <Square className="text-gray-400" size={18} />
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <h3 className="font-semibold text-sm text-gray-900">{task.title}</h3>
                                                        {task.description && (
                                                            <p className="text-xs text-gray-600 mt-1">{task.description}</p>
                                                        )}
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                                                task.priority === "CRITICAL" ? "bg-red-100 text-red-700" :
                                                                task.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                                                                "bg-gray-100 text-gray-700"
                                                            }`}>
                                                                {task.priority === "CRITICAL" ? "קריטי" :
                                                                 task.priority === "HIGH" ? "גבוה" : "רגיל"}
                                                            </span>
                                                            <span className="text-xs text-gray-500">
                                                                {task.status === "DONE" ? "הושלם" :
                                                                 task.status === "IN_PROGRESS" ? "בביצוע" :
                                                                 task.status === "STUCK" ? "תקוע" : "לעשות"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {selectedTasks.length > 0 && (
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800">
                                        בחרת {selectedTasks.length} משימה{selectedTasks.length > 1 ? "ות" : ""}
                                    </div>
                                )}
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
                                        שלח הרשמה
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

