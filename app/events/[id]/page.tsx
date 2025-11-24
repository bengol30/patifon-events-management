"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import TaskCard from "@/components/TaskCard";
import { Plus, MapPin, Calendar, ArrowRight, UserPlus, Save, Trash2, X, AlertTriangle, Users, Target, Handshake, DollarSign, FileText, CheckSquare, Square, Edit2, Share2, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp, onSnapshot, updateDoc, arrayUnion, query, orderBy, deleteDoc, writeBatch } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

interface Task {
    id: string;
    title: string;
    description?: string;
    assignee: string;
    status: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK";
    dueDate: string;
    priority: "NORMAL" | "HIGH" | "CRITICAL";
}

interface BudgetItem {
    id: string;
    item: string;
    amount: number;
    invoiceSubmitted: boolean;
}

interface EventData {
    title: string;
    location: string;
    startTime: any;
    endTime: any;
    description: string;
    status: string;
    team: { name: string; role: string; email?: string }[];
    participantsCount?: string;
    partners?: string;
    goal?: string;
    budget?: string;
}

export default function EventDetailsPage() {
    const params = useParams();
    const id = params.id as string;
    const { user } = useAuth();
    const router = useRouter();

    const [event, setEvent] = useState<EventData | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    // New Task State
    const [showNewTask, setShowNewTask] = useState(false);
    const [newTask, setNewTask] = useState({
        title: "",
        description: "",
        assignee: "",
        dueDate: "",
        priority: "NORMAL",
    });

    // Edit Task State
    const [editingTask, setEditingTask] = useState<Task | null>(null);

    // Bulk Selection State
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

    // New Team Member State
    const [showAddTeam, setShowAddTeam] = useState(false);
    const [newMember, setNewMember] = useState({
        name: "",
        role: "",
        email: "",
    });

    // New Budget Item State
    const [showAddBudget, setShowAddBudget] = useState(false);
    const [newBudgetItem, setNewBudgetItem] = useState({
        item: "",
        amount: "",
    });

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        type: 'task' | 'event' | 'budget' | 'bulk_delete' | null;
        itemId: string | null;
        title: string;
    }>({
        isOpen: false,
        type: null,
        itemId: null,
        title: ""
    });

    useEffect(() => {
        if (!id || !db) return;

        const unsubscribeEvent = onSnapshot(doc(db, "events", id), (docSnap) => {
            if (docSnap.exists()) {
                setEvent(docSnap.data() as EventData);
            } else {
                setError("האירוע לא נמצא");
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching event:", err);
            setError("שגיאה בטעינת האירוע");
            setLoading(false);
        });

        const qTasks = query(collection(db, "events", id, "tasks"), orderBy("createdAt", "desc"));
        const unsubscribeTasks = onSnapshot(qTasks, (querySnapshot) => {
            const tasksData: Task[] = [];
            querySnapshot.forEach((doc) => {
                tasksData.push({ id: doc.id, ...doc.data() } as Task);
            });
            setTasks(tasksData);
        });

        const qBudget = query(collection(db, "events", id, "budgetItems"), orderBy("createdAt", "desc"));
        const unsubscribeBudget = onSnapshot(qBudget, (querySnapshot) => {
            const budgetData: BudgetItem[] = [];
            querySnapshot.forEach((doc) => {
                budgetData.push({ id: doc.id, ...doc.data() } as BudgetItem);
            });
            setBudgetItems(budgetData);
        });

        return () => {
            unsubscribeEvent();
            unsubscribeTasks();
            unsubscribeBudget();
        };
    }, [id]);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;

        try {
            await addDoc(collection(db, "events", id, "tasks"), {
                ...newTask,
                status: "TODO",
                createdAt: serverTimestamp(),
                createdBy: user.uid,
            });
            setShowNewTask(false);
            setNewTask({ title: "", description: "", assignee: "", dueDate: "", priority: "NORMAL" });
        } catch (err) {
            console.error("Error adding task:", err);
            alert("שגיאה בהוספת משימה");
        }
    };

    const handleUpdateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !editingTask) return;

        try {
            const taskRef = doc(db, "events", id, "tasks", editingTask.id);
            await updateDoc(taskRef, {
                title: editingTask.title,
                description: editingTask.description,
                assignee: editingTask.assignee,
                dueDate: editingTask.dueDate,
                priority: editingTask.priority,
                status: editingTask.status
            });
            setEditingTask(null);
        } catch (err) {
            console.error("Error updating task:", err);
            alert("שגיאה בעדכון המשימה");
        }
    };

    const handleStatusChange = async (taskId: string, newStatus: string) => {
        if (!db) return;
        try {
            await updateDoc(doc(db, "events", id, "tasks", taskId), {
                status: newStatus
            });
        } catch (err) {
            console.error("Error updating status:", err);
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
        if (selectedTasks.size === tasks.length) {
            setSelectedTasks(new Set());
        } else {
            setSelectedTasks(new Set(tasks.map(t => t.id)));
        }
    };

    const handleAddBudgetItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;

        try {
            await addDoc(collection(db, "events", id, "budgetItems"), {
                item: newBudgetItem.item,
                amount: parseFloat(newBudgetItem.amount),
                invoiceSubmitted: false,
                createdAt: serverTimestamp(),
                createdBy: user.uid,
            });
            setShowAddBudget(false);
            setNewBudgetItem({ item: "", amount: "" });
        } catch (err) {
            console.error("Error adding budget item:", err);
            alert("שגיאה בהוספת פריט תקציב");
        }
    };

    const handleToggleInvoice = async (itemId: string, currentStatus: boolean) => {
        if (!db) return;
        try {
            await updateDoc(doc(db, "events", id, "budgetItems", itemId), {
                invoiceSubmitted: !currentStatus
            });
        } catch (err) {
            console.error("Error toggling invoice status:", err);
        }
    };

    const confirmDeleteTask = (taskId: string) => {
        setConfirmModal({
            isOpen: true,
            type: 'task',
            itemId: taskId,
            title: "האם אתה בטוח שברצונך למחוק את המשימה?"
        });
    };

    const confirmDeleteEvent = () => {
        setConfirmModal({
            isOpen: true,
            type: 'event',
            itemId: id,
            title: "האם אתה בטוח שברצונך למחוק את האירוע? פעולה זו אינה הפיכה."
        });
    };

    const confirmDeleteBudgetItem = (itemId: string) => {
        setConfirmModal({
            isOpen: true,
            type: 'budget',
            itemId: itemId,
            title: "האם אתה בטוח שברצונך למחוק את פריט התקציב?"
        });
    };

    const confirmBulkDelete = () => {
        setConfirmModal({
            isOpen: true,
            type: 'bulk_delete',
            itemId: null,
            title: `האם אתה בטוח שברצונך למחוק ${selectedTasks.size} משימות?`
        });
    };

    const executeDelete = async () => {
        if (!db) return;

        const { type, itemId } = confirmModal;
        setConfirmModal({ ...confirmModal, isOpen: false }); // Close modal immediately

        try {
            if (type === 'task' && itemId) {
                await deleteDoc(doc(db, "events", id, "tasks", itemId));
            } else if (type === 'budget' && itemId) {
                await deleteDoc(doc(db, "events", id, "budgetItems", itemId));
            } else if (type === 'event') {
                await deleteDoc(doc(db, "events", id));
                router.push("/");
            } else if (type === 'bulk_delete') {
                const batch = writeBatch(db);
                selectedTasks.forEach(taskId => {
                    batch.delete(doc(db, "events", id, "tasks", taskId));
                });
                await batch.commit();
                setSelectedTasks(new Set());
            }
        } catch (err) {
            console.error(`Error deleting ${type}:`, err);
            alert(`שגיאה במחיקה`);
        }
    };

    const handleAddTeamMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db) return;

        try {
            const memberToAdd = {
                name: newMember.name,
                role: newMember.role,
                email: newMember.email
            };

            await updateDoc(doc(db, "events", id), {
                team: arrayUnion(memberToAdd)
            });

            setShowAddTeam(false);
            setNewMember({ name: "", role: "", email: "" });
        } catch (err) {
            console.error("Error adding team member:", err);
            alert("שגיאה בהוספת איש צוות");
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
            <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col gap-4">
                <p className="text-red-500">{error || "האירוע לא נמצא"}</p>
                <Link href="/" className="text-indigo-600 hover:underline">חזרה לדשבורד</Link>
            </div>
        );
    }

    const copyInviteLink = async () => {
        try {
            const inviteLink = `${window.location.origin}/events/${id}/join`;
            await navigator.clipboard.writeText(inviteLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
            alert("לא הצלחנו להעתיק את הקישור. נסה להעתיק ידנית מהדפדפן.");
        }
    };

    const totalBudgetUsed = budgetItems.reduce((sum, item) => sum + item.amount, 0);

    return (
        <div className="min-h-screen bg-gray-50 p-6 relative">
            {/* Confirmation Modal */}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 text-red-600 mb-4">
                            <div className="bg-red-100 p-2 rounded-full">
                                <AlertTriangle size={24} />
                            </div>
                            <h3 className="text-lg font-bold">אישור מחיקה</h3>
                        </div>
                        <p className="text-gray-600 mb-6">{confirmModal.title}</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={executeDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition shadow-sm"
                            >
                                מחק
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Task Modal */}
            {editingTask && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">עריכת משימה</h3>
                            <button onClick={() => setEditingTask(null)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateTask} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">כותרת</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full p-2 border rounded-lg text-sm"
                                    value={editingTask.title}
                                    onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
                                <textarea
                                    rows={3}
                                    className="w-full p-2 border rounded-lg text-sm"
                                    value={editingTask.description || ""}
                                    onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">אחראי</label>
                                    <select
                                        className="w-full p-2 border rounded-lg text-sm"
                                        value={editingTask.assignee}
                                        onChange={e => setEditingTask({ ...editingTask, assignee: e.target.value })}
                                    >
                                        <option value="">לא משויך</option>
                                        {event.team?.map((member, idx) => (
                                            <option key={idx} value={member.name}>{member.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
                                    <input
                                        type="date"
                                        className="w-full p-2 border rounded-lg text-sm"
                                        value={editingTask.dueDate}
                                        onChange={e => setEditingTask({ ...editingTask, dueDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">עדיפות</label>
                                <select
                                    className="w-full p-2 border rounded-lg text-sm"
                                    value={editingTask.priority}
                                    onChange={e => setEditingTask({ ...editingTask, priority: e.target.value as any })}
                                >
                                    <option value="NORMAL">רגיל</option>
                                    <option value="HIGH">גבוה</option>
                                    <option value="CRITICAL">דחוף מאוד</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setEditingTask(null)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                                >
                                    ביטול
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                                >
                                    שמור שינויים
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="mb-4">
                <Link href="/" className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm w-fit">
                    <ArrowRight size={16} />
                    חזרה לדשבורד
                </Link>
            </div>

            <header className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">{event.title}</h1>
                        <div className="flex flex-wrap items-center gap-6 text-gray-500 text-sm">
                            <div className="flex items-center gap-1">
                                <MapPin size={16} />
                                <span>{event.location}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Calendar size={16} />
                                <span>
                                    {event.startTime?.seconds ? new Date(event.startTime.seconds * 1000).toLocaleDateString("he-IL") : ""}
                                    {" | "}
                                    {event.startTime?.seconds ? new Date(event.startTime.seconds * 1000).toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' }) : ""}
                                </span>
                            </div>
                            {event.participantsCount && (
                                <div className="flex items-center gap-1">
                                    <Users size={16} />
                                    <span>{event.participantsCount} משתתפים</span>
                                </div>
                            )}
                            {event.partners && (
                                <div className="flex items-center gap-1">
                                    <Handshake size={16} />
                                    <span>שותפים: {event.partners}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <button
                            onClick={copyInviteLink}
                            className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition shadow-sm font-medium ${copied
                                ? "bg-green-600 text-white hover:bg-green-700"
                                : "bg-indigo-600 text-white hover:bg-indigo-700"
                                }`}
                        >
                            {copied ? <Check size={18} /> : <Share2 size={18} />}
                            {copied ? "הקישור הועתק!" : "העתק קישור להזמנה"}
                        </button>
                        <button
                            onClick={confirmDeleteEvent}
                            className="text-red-500 hover:bg-red-50 px-3 py-1 rounded-lg text-sm flex items-center gap-1 transition"
                        >
                            <Trash2 size={16} />
                            מחק אירוע
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                    {/* ... existing content ... */}
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content - Tasks */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-semibold text-gray-800">משימות לביצוע</h2>
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-sm font-medium">
                                {tasks.filter(t => t.status !== 'DONE').length}
                            </span>
                        </div>
                        <button
                            onClick={() => setShowNewTask(!showNewTask)}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition text-sm font-medium"
                        >
                            <Plus size={18} />
                            משימה חדשה
                        </button>
                    </div>

                    {/* Bulk Actions Bar */}
                    {selectedTasks.size > 0 && (
                        <div className="bg-indigo-50 p-3 rounded-lg flex items-center justify-between border border-indigo-100 animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center gap-2 text-indigo-900 font-medium text-sm">
                                <CheckSquare size={18} />
                                <span>{selectedTasks.size} משימות נבחרו</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={confirmBulkDelete}
                                    className="text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1"
                                >
                                    <Trash2 size={16} />
                                    מחק נבחרים
                                </button>
                            </div>
                        </div>
                    )}

                    {showNewTask && (
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100 mb-4 animate-in fade-in slide-in-from-top-2">
                            <h3 className="font-medium mb-3">הוספת משימה חדשה</h3>
                            <form onSubmit={handleAddTask} className="space-y-3">
                                <input
                                    type="text"
                                    placeholder="כותרת המשימה"
                                    required
                                    className="w-full p-2 border rounded-lg text-sm"
                                    value={newTask.title}
                                    onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <select
                                        className="w-full p-2 border rounded-lg text-sm"
                                        value={newTask.assignee}
                                        onChange={e => setNewTask({ ...newTask, assignee: e.target.value })}
                                    >
                                        <option value="">בחר אחראי...</option>
                                        {event.team?.map((member, idx) => (
                                            <option key={idx} value={member.name}>{member.name}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="date"
                                        className="w-full p-2 border rounded-lg text-sm"
                                        value={newTask.dueDate}
                                        onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                                    />
                                </div>
                                <select
                                    className="w-full p-2 border rounded-lg text-sm"
                                    value={newTask.priority}
                                    onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                                >
                                    <option value="NORMAL">רגיל</option>
                                    <option value="HIGH">גבוה</option>
                                    <option value="CRITICAL">דחוף מאוד</option>
                                </select>
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowNewTask(false)}
                                        className="px-3 py-1 text-gray-500 hover:bg-gray-100 rounded-lg text-sm"
                                    >
                                        ביטול
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                                    >
                                        שמור משימה
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="space-y-3">
                        {tasks.length > 0 && (
                            <div className="flex items-center gap-2 mb-2 px-1">
                                <button
                                    onClick={handleSelectAll}
                                    className="text-gray-500 hover:text-indigo-600 text-sm flex items-center gap-1"
                                >
                                    {selectedTasks.size === tasks.length ? <CheckSquare size={16} /> : <Square size={16} />}
                                    בחר הכל
                                </button>
                            </div>
                        )}

                        {tasks.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">אין משימות עדיין. צור את המשימה הראשונה!</p>
                        ) : (
                            tasks.map((task) => (
                                <TaskCard
                                    key={task.id}
                                    id={task.id}
                                    title={task.title}
                                    description={task.description}
                                    assignee={task.assignee || "לא משויך"}
                                    status={task.status}
                                    dueDate={task.dueDate}
                                    priority={task.priority}
                                    isSelected={selectedTasks.has(task.id)}
                                    onSelect={(selected) => handleTaskSelect(task.id, selected)}
                                    onDelete={() => confirmDeleteTask(task.id)}
                                    onEdit={() => setEditingTask(task)}
                                    onStatusChange={(status) => handleStatusChange(task.id, status)}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Sidebar - Team, Budget & Files */}
                <div className="space-y-6">
                    {/* ... existing budget section ... */}

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">צוות האירוע</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={copyInviteLink}
                                    className="text-indigo-600 hover:bg-indigo-50 p-1 rounded-full transition"
                                    title="העתק קישור להזמנה"
                                >
                                    <Share2 size={18} />
                                </button>
                                <button
                                    onClick={() => setShowAddTeam(!showAddTeam)}
                                    className="text-indigo-600 hover:bg-indigo-50 p-1 rounded-full transition"
                                    title="הוסף איש צוות ידנית"
                                >
                                    <UserPlus size={18} />
                                </button>
                            </div>
                        </div>

                        {showAddTeam && (
                            <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <form onSubmit={handleAddTeamMember} className="space-y-2">
                                    <input
                                        type="text"
                                        placeholder="שם מלא"
                                        required
                                        className="w-full p-2 border rounded text-sm"
                                        value={newMember.name}
                                        onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="תפקיד"
                                        required
                                        className="w-full p-2 border rounded text-sm"
                                        value={newMember.role}
                                        onChange={e => setNewMember({ ...newMember, role: e.target.value })}
                                    />
                                    <input
                                        type="email"
                                        placeholder="אימייל (אופציונלי)"
                                        className="w-full p-2 border rounded text-sm"
                                        value={newMember.email}
                                        onChange={e => setNewMember({ ...newMember, email: e.target.value })}
                                    />
                                    <button
                                        type="submit"
                                        className="w-full bg-indigo-600 text-white py-1 rounded text-sm hover:bg-indigo-700"
                                    >
                                        הוסף
                                    </button>
                                </form>
                            </div>
                        )}

                        <div className="space-y-4">
                            {event.team && event.team.length > 0 ? (
                                event.team.map((member, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                            {member.name.substring(0, 2)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{member.name}</p>
                                            <p className="text-xs text-gray-500">{member.role}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500">עדיין אין חברי צוות</p>
                            )}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h2 className="text-lg font-semibold mb-4 text-gray-800">קבצים (Drive)</h2>
                        <div className="text-sm text-gray-500 mb-4">
                            תיקיית הדרייב תופיע כאן לאחר החיבור.
                        </div>
                        <button className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition text-sm">
                            פתח ב-Google Drive
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
