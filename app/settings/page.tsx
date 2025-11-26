"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase";
import { signOut, updateProfile, updatePassword, updateEmail, EmailAuthProvider, reauthenticateWithCredential, sendEmailVerification } from "firebase/auth";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, updateDoc } from "firebase/firestore";
import { ArrowRight, Plus, Trash2, Settings, List, RefreshCw, AlertTriangle, CheckCircle, X, Edit2, Clock, User, AlignLeft, FileText, LogOut, ShieldCheck, Copy } from "lucide-react";
import Link from "next/link";
import ImportantDocuments from "@/components/ImportantDocuments";
const ADMIN_EMAIL = "bengo0469@gmail.com";

interface DefaultTask {
    id: string;
    title: string;
    description?: string;
    priority: "NORMAL" | "HIGH" | "CRITICAL";
    daysOffset?: number; // Days relative to event start (negative = before)
    assigneeRole?: string; // e.g., "Producer", "Designer"
}

interface DocumentCategory {
    id: string;
    name: string;
    description?: string;
    createdAt: any;
}

interface Document {
    id: string;
    categoryId: string;
    title: string;
    description?: string;
    fileUrl?: string;
    fileName?: string;
    createdAt: any;
}

const PREDEFINED_TASKS = [
    {
        title: "פתיחת ספק במערכת",
        description: "יש לפתוח ספק במערכת הפיננסית לפני ביצוע תשלום",
        priority: "NORMAL",
        daysOffset: -7,
        assigneeRole: "מנהל"
    },
    {
        title: "הצעת מחיר (מעל 1500 הצעה נגדית)",
        description: "לקבל הצעות מחיר ממספר ספקים ולהשוות. מעל 1500 ₪ חובה הצעה נגדית",
        priority: "HIGH",
        daysOffset: -14,
        assigneeRole: "מפיק"
    },
    {
        title: "גרפיקה (אירוע גדול דרך בלה, קטן דרך רוני)",
        description: "הזמנת עיצוב גרפי - אירועים גדולים דרך בלה, קטנים דרך רוני",
        priority: "HIGH",
        daysOffset: -21,
        assigneeRole: "מעצב"
    },
    {
        title: "לוודא שבכל גרפיקה יש את הלוגואים הרלוונטיים ואת הלשונית צעירים",
        description: "בדיקת איכות - וידוא שכל הלוגואים של השותפים והלשונית 'צעירים' מופיעים",
        priority: "NORMAL",
        daysOffset: -14,
        assigneeRole: "מפיק"
    },
    {
        title: "הפצת האירוע (שבועיים מראש)",
        description: "פרסום האירוע בכל הערוצים: פייסבוק, אינסטגרם, וואטסאפ, ניוזלטר",
        priority: "HIGH",
        daysOffset: -14,
        assigneeRole: "רכז תקשורת"
    },
    {
        title: "פתיחת סמרט טיקט במידת הצורך דרך בלה",
        description: "אם יש צורך במערכת כרטוס - לפתוח דרך בלה",
        priority: "NORMAL",
        daysOffset: -21,
        assigneeRole: "מפיק"
    },
    {
        title: "קביעת האירוע ביומן הרלוונטי (היכל התרבות/ בית החאן)",
        description: "תיאום מקום ותאריך עם המקום הרלוונטי - חובה לעשות מוקדם!",
        priority: "CRITICAL",
        daysOffset: -30,
        assigneeRole: "מנהל"
    },
    {
        title: "לוודא שהפרסום מאושר על ידי בר לפני שמפיצים!",
        description: "אישור סופי של בר על כל החומרים השיווקיים לפני פרסום",
        priority: "CRITICAL",
        daysOffset: -15,
        assigneeRole: "מפיק"
    },
    {
        title: "אישור אלכוהול במידת הצורך (הילה/ בר)",
        description: "אם יש אלכוהול באירוע - לקבל אישור מהילה או בר",
        priority: "NORMAL",
        daysOffset: -10,
        assigneeRole: "מפיק"
    }
];

export default function SettingsPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [activeTab, setActiveTab] = useState("defaultTasks");
    const [defaultTasks, setDefaultTasks] = useState<DefaultTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [profileName, setProfileName] = useState("");
    const [profileEmail, setProfileEmail] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);

    // UI State
    const [showSeedModal, setShowSeedModal] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; taskId: string | null }>({ isOpen: false, taskId: null });
    const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
    const [deleteAllModal, setDeleteAllModal] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Selection State
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

    // Edit/Add Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Partial<DefaultTask>>({
        title: "",
        description: "",
        priority: "NORMAL",
        daysOffset: 0,
        assigneeRole: ""
    });

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

    useEffect(() => {
        if (user) {
            setProfileName(user.displayName || "");
            setProfileEmail(user.email || "");
        }
    }, [user]);

    // Auto-hide message after 3 seconds
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    const handleOpenAddModal = () => {
        setEditingTask({
            title: "",
            description: "",
            priority: "NORMAL",
            daysOffset: 0,
            assigneeRole: ""
        });
        setIsEditModalOpen(true);
    };

    const handleOpenEditModal = (task: DefaultTask) => {
        setEditingTask({ ...task });
        setIsEditModalOpen(true);
    };

    const handleSaveTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;

        try {
            const taskData = {
                title: editingTask.title,
                description: editingTask.description || "",
                priority: editingTask.priority,
                daysOffset: Number(editingTask.daysOffset) || 0,
                assigneeRole: editingTask.assigneeRole || "",
                updatedAt: serverTimestamp()
            };

            if (editingTask.id) {
                // Update existing task
                await updateDoc(doc(db, "default_tasks", editingTask.id), taskData);
                setMessage({ text: "המשימה עודכנה בהצלחה", type: "success" });
            } else {
                // Create new task
                await addDoc(collection(db, "default_tasks"), {
                    ...taskData,
                    createdAt: serverTimestamp(),
                    createdBy: user.uid
                });
                setMessage({ text: "המשימה נוספה בהצלחה", type: "success" });
            }
            setIsEditModalOpen(false);
        } catch (err) {
            console.error("Error saving default task:", err);
            setMessage({ text: "שגיאה בשמירת המשימה", type: "error" });
        }
    };

    const handleSeedTasks = () => {
        setShowSeedModal(true);
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth || !user) return;
        setSavingProfile(true);
        try {
            const updates: Promise<void>[] = [];
            const trimmedName = profileName.trim();
            const trimmedEmail = profileEmail.trim();

            if (trimmedName && trimmedName !== (user.displayName || "")) {
                updates.push(updateProfile(user, { displayName: trimmedName }));
            }
            if (trimmedEmail && trimmedEmail !== (user.email || "")) {
                updates.push(updateEmail(user, trimmedEmail));
            }

            if (updates.length === 0) {
                setMessage({ text: "אין שינויים לשמור", type: "success" });
            } else {
                await Promise.all(updates);
                setMessage({ text: "הפרופיל עודכן", type: "success" });
            }
        } catch (err: any) {
            console.error("Error updating profile:", err);
            const msg = err?.code === "auth/requires-recent-login"
                ? "צריך להתחבר מחדש כדי לעדכן אימייל/שם משתמש."
                : "שגיאה בעדכון הפרופיל";
            setMessage({ text: msg, type: "error" });
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth || !user) return;
        if (!currentPassword || !newPassword || !confirmPassword) {
            setMessage({ text: "מלא את כל השדות לסיסמה", type: "error" });
            return;
        }
        if (newPassword !== confirmPassword) {
            setMessage({ text: "הסיסמאות לא תואמות", type: "error" });
            return;
        }
        const hasPasswordProvider = user.providerData.some(p => p.providerId === "password");
        if (!hasPasswordProvider) {
            setMessage({ text: "שינוי סיסמה זמין רק לחשבון אימייל/סיסמה", type: "error" });
            return;
        }

        setSavingPassword(true);
        try {
            const credential = EmailAuthProvider.credential(user.email || "", currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            setMessage({ text: "הסיסמה עודכנה בהצלחה", type: "success" });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err: any) {
            console.error("Error updating password:", err);
            const msg = err?.code === "auth/wrong-password"
                ? "סיסמה נוכחית שגויה"
                : err?.code === "auth/weak-password"
                    ? "סיסמה חלשה מדי (לפחות 6 תווים)"
                    : err?.code === "auth/requires-recent-login"
                        ? "צריך להתחבר מחדש כדי להחליף סיסמה"
                        : "שגיאה בעדכון הסיסמה";
            setMessage({ text: msg, type: "error" });
        } finally {
            setSavingPassword(false);
        }
    };

    const handleSendVerification = async () => {
        if (!user) return;
        try {
            await sendEmailVerification(user);
            setMessage({ text: "מייל אימות נשלח", type: "success" });
        } catch (err) {
            console.error("Error sending verification:", err);
            setMessage({ text: "שגיאה בשליחת מייל אימות", type: "error" });
        }
    };

    const handleCopyUid = async () => {
        if (!user?.uid) return;
        try {
            await navigator.clipboard.writeText(user.uid);
            setMessage({ text: "UID הועתק", type: "success" });
        } catch (err) {
            console.error("Error copying UID:", err);
            setMessage({ text: "לא הצלחנו להעתיק", type: "error" });
        }
    };

    const handleLogout = async () => {
        if (!auth) return;
        try {
            await signOut(auth);
            router.push("/login");
        } catch (err) {
            console.error("Error signing out:", err);
            setMessage({ text: "שגיאה בהתנתקות, נסה שוב", type: "error" });
        }
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
                    description: task.description || "",
                    priority: task.priority,
                    daysOffset: task.daysOffset || 0,
                    assigneeRole: task.assigneeRole || "",
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

    const handleTaskSelect = (taskId: string, isSelected: boolean) => {
        const newSelected = new Set(selectedTasks);
        if (isSelected) {
            newSelected.add(taskId);
        } else {
            newSelected.delete(taskId);
        }
        setSelectedTasks(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedTasks.size === defaultTasks.length) {
            setSelectedTasks(new Set());
        } else {
            setSelectedTasks(new Set(defaultTasks.map(t => t.id)));
        }
    };

    const handleBulkDelete = () => {
        if (selectedTasks.size === 0) return;
        setBulkDeleteModal(true);
    };

    const executeBulkDelete = async () => {
        if (!db || selectedTasks.size === 0) return;
        setBulkDeleteModal(false);

        try {
            const batch = writeBatch(db);
            selectedTasks.forEach(taskId => {
                batch.delete(doc(db, "default_tasks", taskId));
            });
            await batch.commit();
            setSelectedTasks(new Set());
            setMessage({ text: `${selectedTasks.size} משימות נמחקו בהצלחה`, type: "success" });
        } catch (err) {
            console.error("Error bulk deleting tasks:", err);
            setMessage({ text: "שגיאה במחיקת משימות", type: "error" });
        }
    };

    const handleDeleteAll = () => {
        setDeleteAllModal(true);
    };

    const executeDeleteAll = async () => {
        if (!db) return;
        setDeleteAllModal(false);

        try {
            const batch = writeBatch(db);
            defaultTasks.forEach(task => {
                batch.delete(doc(db, "default_tasks", task.id));
            });
            await batch.commit();
            setSelectedTasks(new Set());
            setMessage({ text: "כל המשימות נמחקו בהצלחה", type: "success" });
        } catch (err) {
            console.error("Error deleting all tasks:", err);
            setMessage({ text: "שגיאה במחיקת כל המשימות", type: "error" });
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

            {/* Bulk Delete Confirmation Modal */}
            {bulkDeleteModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3 text-red-600">
                                <div className="bg-red-100 p-2 rounded-full">
                                    <Trash2 size={24} />
                                </div>
                                <h3 className="text-lg font-bold">מחיקת משימות מרובות</h3>
                            </div>
                            <button onClick={() => setBulkDeleteModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-gray-600 mb-6">
                            האם אתה בטוח שברצונך למחוק {selectedTasks.size} משימות נבחרות?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setBulkDeleteModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={executeBulkDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition shadow-sm"
                            >
                                מחק הכל
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete All Confirmation Modal */}
            {deleteAllModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3 text-red-600">
                                <div className="bg-red-100 p-2 rounded-full">
                                    <Trash2 size={24} />
                                </div>
                                <h3 className="text-lg font-bold">מחיקת כל המשימות</h3>
                            </div>
                            <button onClick={() => setDeleteAllModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-gray-600 mb-6">
                            האם אתה בטוח שברצונך למחוק את כל {defaultTasks.length} המשימות הקבועות?
                            <br />
                            <span className="text-red-600 font-semibold">פעולה זו אינה ניתנת לביטול!</span>
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteAllModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={executeDeleteAll}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition shadow-sm"
                            >
                                כן, מחק הכל
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Task Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-6">
                            <h3 className="text-xl font-bold text-gray-900">
                                {editingTask.id ? "עריכת משימה" : "הוספת משימה חדשה"}
                            </h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveTask} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">כותרת המשימה</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingTask.title}
                                    onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                                    placeholder="לדוגמה: הזמנת ציוד"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור (אופציונלי)</label>
                                <textarea
                                    rows={3}
                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={editingTask.description}
                                    onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
                                    placeholder="פרטים נוספים על המשימה..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">עדיפות</label>
                                    <select
                                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={editingTask.priority}
                                        onChange={e => setEditingTask({ ...editingTask, priority: e.target.value as any })}
                                    >
                                        <option value="NORMAL">רגיל</option>
                                        <option value="HIGH">גבוה</option>
                                        <option value="CRITICAL">דחוף</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד אחראי</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={editingTask.assigneeRole}
                                        onChange={e => setEditingTask({ ...editingTask, assigneeRole: e.target.value })}
                                        placeholder="לדוגמה: מפיק"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תזמון (ימים ביחס לאירוע)</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={editingTask.daysOffset}
                                        onChange={e => setEditingTask({ ...editingTask, daysOffset: parseInt(e.target.value) })}
                                    />
                                    <span className="text-sm text-gray-500 whitespace-nowrap">
                                        {editingTask.daysOffset === 0 ? "ביום האירוע" :
                                            (editingTask.daysOffset || 0) < 0 ? "ימים לפני האירוע" : "ימים אחרי האירוע"}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">השתמש במספר שלילי לימים לפני האירוע (למשל -7 לשבוע לפני)</p>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                                >
                                    ביטול
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition shadow-sm"
                                >
                                    {editingTask.id ? "שמור שינויים" : "צור משימה"}
                                </button>
                            </div>
                        </form>
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
                    <div className="flex items-center gap-2">
                        {user?.email === ADMIN_EMAIL && (
                            <Link
                                href="/admin"
                                className="flex items-center gap-2 text-sm font-semibold text-indigo-700 border border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50 px-3 py-2 rounded-lg transition"
                            >
                                <ShieldCheck size={16} />
                                אזור בקרה
                            </Link>
                        )}
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-2 rounded-lg transition"
                        >
                            <LogOut size={16} />
                            התנתק
                        </button>
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
                            <button
                                onClick={() => setActiveTab("documents")}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "documents"
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "text-gray-600 hover:bg-gray-50"
                                    }`}
                            >
                                <FileText size={18} />
                                מסמכים חשובים
                            </button>
                            <button
                                onClick={() => setActiveTab("account")}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "account"
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "text-gray-600 hover:bg-gray-50"
                                    }`}
                            >
                                <ShieldCheck size={18} />
                                חשבון ואבטחה
                            </button>
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="md:col-span-3">
                        {activeTab === "defaultTasks" && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                <div className="mb-6 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900 mb-2">משימות קבועות</h2>
                                        <p className="text-gray-500 text-sm">
                                            משימות אלו יתווספו אוטומטית לכל אירוע חדש שייווצר במערכת.
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSeedTasks}
                                            className="text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 border border-indigo-200"
                                            title="טען רשימת משימות מומלצת"
                                        >
                                            <RefreshCw size={16} />
                                            <span className="hidden sm:inline">טען מומלצות</span>
                                        </button>
                                        <button
                                            onClick={handleOpenAddModal}
                                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 text-sm font-medium shadow-sm"
                                        >
                                            <Plus size={16} />
                                            משימה חדשה
                                        </button>
                                    </div>
                                </div>

                                {/* Bulk Actions Bar */}
                                {selectedTasks.size > 0 && (
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-medium text-indigo-900">
                                                {selectedTasks.size} משימות נבחרו
                                            </span>
                                            <button
                                                onClick={() => setSelectedTasks(new Set())}
                                                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                                            >
                                                בטל בחירה
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleBulkDelete}
                                            className="bg-red-600 text-white px-4 py-1.5 rounded-lg hover:bg-red-700 transition flex items-center gap-2 text-sm font-medium"
                                        >
                                            <Trash2 size={16} />
                                            מחק נבחרים
                                        </button>
                                    </div>
                                )}

                                {/* Tasks List */}
                                <div className="space-y-3">
                                    {defaultTasks.length === 0 ? (
                                        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                                            <List className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                            <p className="text-gray-500 font-medium">אין משימות קבועות מוגדרות.</p>
                                            <p className="text-gray-400 text-sm mt-1">הוסף משימה חדשה או טען משימות מומלצות כדי להתחיל.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Select All Row */}
                                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTasks.size === defaultTasks.length && defaultTasks.length > 0}
                                                    onChange={handleSelectAll}
                                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                />
                                                <span className="text-sm font-medium text-gray-700">בחר הכל</span>
                                                {defaultTasks.length > 0 && (
                                                    <button
                                                        onClick={handleDeleteAll}
                                                        className="mr-auto text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                                                    >
                                                        <Trash2 size={14} />
                                                        מחק הכל
                                                    </button>
                                                )}
                                            </div>

                                            {defaultTasks.map((task) => (
                                                <div key={task.id} className="flex items-center gap-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition group bg-white shadow-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTasks.has(task.id)}
                                                        onChange={(e) => handleTaskSelect(task.id, e.target.checked)}
                                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    />
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-1">
                                                            <span className={`w-2.5 h-2.5 rounded-full ${task.priority === 'CRITICAL' ? 'bg-red-500' :
                                                                task.priority === 'HIGH' ? 'bg-orange-500' :
                                                                    'bg-gray-300'
                                                                }`} title={`עדיפות: ${task.priority === 'CRITICAL' ? 'דחוף' : task.priority === 'HIGH' ? 'גבוה' : 'רגיל'}`} />
                                                            <span className="font-semibold text-gray-800">{task.title}</span>
                                                            {task.assigneeRole && (
                                                                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                    <User size={12} />
                                                                    {task.assigneeRole}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-4 text-sm text-gray-500 pr-6">
                                                            {task.daysOffset !== undefined && task.daysOffset !== 0 && (
                                                                <span className="flex items-center gap-1">
                                                                    <Clock size={14} />
                                                                    {task.daysOffset < 0 ? `${Math.abs(task.daysOffset)} ימים לפני` : `${task.daysOffset} ימים אחרי`}
                                                                </span>
                                                            )}
                                                            {task.description && (
                                                                <span className="flex items-center gap-1 truncate max-w-[200px]" title={task.description}>
                                                                    <AlignLeft size={14} />
                                                                    {task.description}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleOpenEditModal(task)}
                                                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                                            title="ערוך"
                                                        >
                                                            <Edit2 size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTask(task.id)}
                                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                            title="מחק"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === "documents" && (
                            <ImportantDocuments />
                        )}

                        {activeTab === "account" && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <h2 className="text-xl font-bold text-gray-900 mb-2">פרטי חשבון</h2>
                                    <p className="text-gray-500 text-sm mb-4">עדכן שם משתמש/אימייל וראה מידע טכני על החשבון.</p>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <label className="text-sm text-gray-600">שם משתמש</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                value={profileName}
                                                onChange={e => setProfileName(e.target.value)}
                                                placeholder="איך נציג את שמך במערכת"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-sm text-gray-600">אימייל</label>
                                            <input
                                                type="email"
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                value={profileEmail}
                                                onChange={e => setProfileEmail(e.target.value)}
                                                placeholder="example@email.com"
                                            />
                                            <div className="flex items-center gap-2 text-xs mt-1">
                                                <span className={`px-2 py-0.5 rounded-full ${user?.emailVerified ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
                                                    {user?.emailVerified ? "מאומת" : "לא מאומת"}
                                                </span>
                                                {!user?.emailVerified && (
                                                    <button
                                                        type="button"
                                                        onClick={handleSendVerification}
                                                        className="text-indigo-600 hover:text-indigo-800 underline"
                                                    >
                                                        שלח מייל אימות
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                                        <span className="flex items-center gap-1">
                                            <ShieldCheck size={14} />
                                            UID: {user?.uid || "-"}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleCopyUid}
                                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
                                        >
                                            <Copy size={14} />
                                            העתק UID
                                        </button>
                                        <span className="flex items-center gap-1">
                                            <User size={14} />
                                            ספקי התחברות: {user?.providerData.map(p => p.providerId).join(", ") || "-"}
                                        </span>
                                    </div>

                                    <div className="flex justify-end mt-6">
                                        <button
                                            onClick={handleSaveProfile}
                                            disabled={savingProfile}
                                            className={`px-4 py-2 rounded-lg text-sm font-semibold shadow-sm ${savingProfile ? "bg-gray-200 text-gray-500" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
                                        >
                                            {savingProfile ? "שומר..." : "שמור פרופיל"}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <h2 className="text-xl font-bold text-gray-900 mb-2">שינוי סיסמה</h2>
                                    <p className="text-gray-500 text-sm mb-4">החלף סיסמה לחשבון אימייל/סיסמה.</p>
                                    <form onSubmit={handleChangePassword} className="space-y-4">
                                        <div className="grid gap-4 sm:grid-cols-3">
                                            <div className="space-y-1">
                                                <label className="text-sm text-gray-600">סיסמה נוכחית</label>
                                                <input
                                                    type="password"
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={currentPassword}
                                                    onChange={e => setCurrentPassword(e.target.value)}
                                                    autoComplete="current-password"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm text-gray-600">סיסמה חדשה</label>
                                                <input
                                                    type="password"
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={newPassword}
                                                    onChange={e => setNewPassword(e.target.value)}
                                                    autoComplete="new-password"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm text-gray-600">אימות סיסמה</label>
                                                <input
                                                    type="password"
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={confirmPassword}
                                                    onChange={e => setConfirmPassword(e.target.value)}
                                                    autoComplete="new-password"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-500">
                                            <span>מומלץ לבחור סיסמה באורך 12+ תווים עם אותיות, מספרים וסימנים.</span>
                                            <span>זמין רק לחשבונות אימייל/סיסמה.</span>
                                        </div>
                                        <div className="flex justify-end">
                                            <button
                                                type="submit"
                                                disabled={savingPassword}
                                                className={`px-4 py-2 rounded-lg text-sm font-semibold shadow-sm ${savingPassword ? "bg-gray-200 text-gray-500" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
                                            >
                                                {savingPassword ? "מעדכן..." : "עדכן סיסמה"}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
