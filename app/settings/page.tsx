"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from "firebase/firestore";
import { ArrowRight, Plus, Trash2, Settings, List, RefreshCw, AlertTriangle, CheckCircle, X } from "lucide-react";
import Link from "next/link";

interface DefaultTask {
    id: string;
    title: string;
    priority: "NORMAL" | "HIGH" | "CRITICAL";
}

const PREDEFINED_TASKS = [
    { title: "פתיחת ספק במערכת", priority: "NORMAL" },
    { title: "הצעת מחיר (מעל 1500 הצעה נגדית)", priority: "HIGH" },
    { title: "גרפיקה (אירוע גדול דרך בלה, קטן דרך רוני)", priority: "HIGH" },
    { title: "לוודא שבכל גרפיקה יש את הלוגואים הרלוונטיים ואת הלשונית צעירים", priority: "NORMAL" },
    { title: "הפצת האירוע (שבועיים מראש)", priority: "HIGH" },
    { title: "פתיחת סמרט טיקט במידת הצורך דרך בלה", priority: "NORMAL" },
    { title: "קביעת האירוע ביומן הרלוונטי (היכל התרבות/ בית החאן)", priority: "CRITICAL" },
    { title: "לוודא שהפרסום מאושר על ידי בר לפני שמפיצים!", priority: "CRITICAL" },
    { title: "אישור אלכוהול במידת הצורך (הילה/ בר)", priority: "NORMAL" }
];

export default function SettingsPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [activeTab, setActiveTab] = useState("defaultTasks");
    const [defaultTasks, setDefaultTasks] = useState<DefaultTask[]>([]);
    const [newTask, setNewTask] = useState({ title: "", priority: "NORMAL" });
    const [loading, setLoading] = useState(true);

    // UI State
    const [showSeedModal, setShowSeedModal] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; taskId: string | null }>({ isOpen: false, taskId: null });
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/login");
            return;
        }

        if (!db || !user) return;

        // Fetch default tasks
        const q = query(collection(db, "default_tasks"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tasks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as DefaultTask[];
            setDefaultTasks(tasks);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, authLoading, router]);

    // Auto-hide message after 3 seconds
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;

        try {
            await addDoc(collection(db, "default_tasks"), {
                title: newTask.title,
                priority: newTask.priority,
                createdAt: serverTimestamp(),
                createdBy: user.uid
            });
            setNewTask({ title: "", priority: "NORMAL" });
            setMessage({ text: "המשימה נוספה בהצלחה", type: "success" });
        } catch (err) {
            console.error("Error adding default task:", err);
            setMessage({ text: "שגיאה בהוספת משימה", type: "error" });
        }
    };

    const handleSeedTasks = () => {
        setShowSeedModal(true);
    };

    const executeSeedTasks = async () => {
        if (!db || !user) return;
        setShowSeedModal(false);

        try {
            const batch = writeBatch(db);
            const collectionRef = collection(db, "default_tasks");

            PREDEFINED_TASKS.forEach(task => {
                const docRef = doc(collectionRef);
                batch.set(docRef, {
                    title: task.title,
                    priority: task.priority,
                    createdAt: serverTimestamp(),
                    createdBy: user.uid
                });
            });

            await batch.commit();
            setMessage({ text: "המשימות המומלצות נוספו בהצלחה!", type: "success" });
        } catch (err) {
            console.error("Error seeding tasks:", err);
            setMessage({ text: "שגיאה בהוספת המשימות", type: "error" });
        }
    };

    const handleDeleteTask = (taskId: string) => {
        setDeleteModal({ isOpen: true, taskId });
    };

    const executeDeleteTask = async () => {
        if (!db || !deleteModal.taskId) return;

        const taskId = deleteModal.taskId;
        setDeleteModal({ isOpen: false, taskId: null });

        try {
            await deleteDoc(doc(db, "default_tasks", taskId));
            setMessage({ text: "המשימה נמחקה", type: "success" });
        } catch (err) {
            console.error("Error deleting default task:", err);
            setMessage({ text: "שגיאה במחיקת משימה", type: "error" });
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6 relative">
            {/* Message Toast */}
            {message && (
                <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                    {message.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                    <span>{message.text}</span>
                </div>
            )}

            {/* Seed Confirmation Modal */}
            {showSeedModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3 text-indigo-600">
                                <div className="bg-indigo-100 p-2 rounded-full">
                                    <RefreshCw size={24} />
                                </div>
                                <h3 className="text-lg font-bold">טעינת משימות מומלצות</h3>
                            </div>
                            <button onClick={() => setShowSeedModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-gray-600 mb-6">
                            פעולה זו תוסיף {PREDEFINED_TASKS.length} משימות מוגדרות מראש לרשימה הקיימת שלך.
                            <br />
                            האם להמשיך?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowSeedModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={executeSeedTasks}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition shadow-sm"
                            >
                                כן, הוסף משימות
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3 text-red-600">
                                <div className="bg-red-100 p-2 rounded-full">
                                    <Trash2 size={24} />
                                </div>
                                <h3 className="text-lg font-bold">מחיקת משימה</h3>
                            </div>
                            <button onClick={() => setDeleteModal({ isOpen: false, taskId: null })} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-gray-600 mb-6">
                            האם אתה בטוח שברצונך למחוק משימה זו מרשימת המשימות הקבועות?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteModal({ isOpen: false, taskId: null })}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={executeDeleteTask}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition shadow-sm"
                            >
                                מחק
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-4xl mx-auto">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <Link href="/" className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm mb-2">
                            <ArrowRight size={16} />
                            חזרה לדשבורד
                        </Link>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                            <Settings className="text-gray-400" />
                            הגדרות מערכת
                        </h1>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Sidebar */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 h-fit">
                        <nav className="space-y-1">
                            <button
                                onClick={() => setActiveTab("defaultTasks")}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "defaultTasks"
                                        ? "bg-indigo-50 text-indigo-700"
                                        : "text-gray-600 hover:bg-gray-50"
                                    }`}
                            >
                                <List size={18} />
                                משימות קבועות
                            </button>
                            {/* Future tabs can be added here */}
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="md:col-span-3">
                        {activeTab === "defaultTasks" && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                <div className="mb-6 flex justify-between items-start">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 mb-2">משימות קבועות</h2>
                                        <p className="text-gray-500 text-sm">
                                            משימות אלו יתווספו אוטומטית לכל אירוע חדש שייווצר במערכת.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleSeedTasks}
                                        className="text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-2 border border-indigo-200"
                                        title="טען רשימת משימות מומלצת"
                                    >
                                        <RefreshCw size={16} />
                                        טען משימות מומלצות
                                    </button>
                                </div>

                                {/* Add New Task Form */}
                                <form onSubmit={handleAddTask} className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                                    <h3 className="text-sm font-semibold text-gray-700 mb-3">הוספת משימה חדשה</h3>
                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            placeholder="כותרת המשימה"
                                            required
                                            className="flex-1 p-2 border rounded-lg text-sm"
                                            value={newTask.title}
                                            onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                                        />
                                        <select
                                            className="p-2 border rounded-lg text-sm w-32"
                                            value={newTask.priority}
                                            onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                                        >
                                            <option value="NORMAL">רגיל</option>
                                            <option value="HIGH">גבוה</option>
                                            <option value="CRITICAL">דחוף</option>
                                        </select>
                                        <button
                                            type="submit"
                                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 text-sm font-medium"
                                        >
                                            <Plus size={16} />
                                            הוסף
                                        </button>
                                    </div>
                                </form>

                                {/* Tasks List */}
                                <div className="space-y-2">
                                    {defaultTasks.length === 0 ? (
                                        <p className="text-center text-gray-500 py-8">אין משימות קבועות מוגדרות.</p>
                                    ) : (
                                        defaultTasks.map((task) => (
                                            <div key={task.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition group">
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-2 h-2 rounded-full ${task.priority === 'CRITICAL' ? 'bg-red-500' :
                                                            task.priority === 'HIGH' ? 'bg-orange-500' :
                                                                'bg-gray-300'
                                                        }`} />
                                                    <span className="font-medium text-gray-700">{task.title}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteTask(task.id)}
                                                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1"
                                                    title="מחק"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
