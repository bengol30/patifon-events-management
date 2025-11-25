"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { ArrowRight, Calendar, Clock, User, AlertTriangle, CheckCircle, Circle, MessageCircle, Send } from "lucide-react";

interface Task {
    id: string;
    title: string;
    description?: string;
    assignee: string;
    status: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK";
    dueDate: string;
    priority: "NORMAL" | "HIGH" | "CRITICAL";
    currentStatus?: string;
    nextStep?: string;
    eventId: string;
    eventTitle?: string;
}

interface ChatMessage {
    id: string;
    text: string;
    senderId: string;
    senderName: string;
    createdAt: any;
}

export default function TaskDetailPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const taskId = params?.id as string;

    const [task, setTask] = useState<Task | null>(null);
    const [loadingTask, setLoadingTask] = useState(true);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [error, setError] = useState("");

    // We need to find the eventId for this task since tasks are subcollections of events.
    // In a real app, we might pass eventId in query params or have a global tasks index.
    // For this implementation, we'll try to find it by querying all events (not efficient but works for small scale)
    // OR better: we update the TaskCard to pass eventId in the URL query param? 
    // Actually, let's assume we can fetch it if we know the path. 
    // Since we don't know the eventId from the URL /tasks/[id], we have a problem.
    // SOLUTION: We will use a Collection Group Query to find the task by ID.

    useEffect(() => {
        if (!loading && !user) {
            router.push("/login");
        }
    }, [user, loading, router]);

    useEffect(() => {
        const fetchTask = async () => {
            if (!db || !taskId) return;

            // Since we don't have eventId in the URL, we need to find it.
            // We'll use a client-side search for now as we did in the dashboard, 
            // but ideally we should change the route to /events/[eventId]/tasks/[taskId]
            // OR pass eventId as a query param.
            // Let's try to find it in the "myTasks" cache if we came from dashboard? No, page refresh loses state.

            // Strategy: We'll fetch all events and look for the task. 
            // Note: This is inefficient for production but works for this MVP phase.
            try {
                // We can't easily do collectionGroup query for a single doc ID without an index or knowing the parent.
                // Let's try to get the task from the URL query param if available, otherwise search.
                // Actually, let's just search all events for now.

                // Optimization: If we had a global 'tasks' collection that points to the real location, that would be best.
                // For now, let's iterate events (assuming not too many events).

                const { collection, getDocs } = await import("firebase/firestore");
                const eventsRef = collection(db, "events");
                const eventsSnap = await getDocs(eventsRef);

                let foundTask: Task | null = null;
                let foundEventId = "";
                let foundEventTitle = "";

                for (const eventDoc of eventsSnap.docs) {
                    const taskRef = doc(db, "events", eventDoc.id, "tasks", taskId);
                    const taskSnap = await getDoc(taskRef);
                    if (taskSnap.exists()) {
                        foundTask = { id: taskSnap.id, ...taskSnap.data(), eventId: eventDoc.id } as Task;
                        foundEventId = eventDoc.id;
                        foundEventTitle = eventDoc.data().title;
                        break;
                    }
                }

                if (foundTask) {
                    setTask({ ...foundTask, eventTitle: foundEventTitle });

                    // Subscribe to chat
                    const qChat = query(
                        collection(db, "events", foundEventId, "tasks", taskId, "messages"),
                        orderBy("createdAt", "asc")
                    );
                    const unsubscribeChat = onSnapshot(qChat, (snapshot) => {
                        const msgs = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        })) as ChatMessage[];
                        setMessages(msgs);
                    });

                    // Subscribe to task updates
                    const unsubscribeTask = onSnapshot(doc(db, "events", foundEventId, "tasks", taskId), (docSnap) => {
                        if (docSnap.exists()) {
                            setTask(prev => ({ ...prev!, ...docSnap.data() } as Task));
                        }
                    });

                    return () => {
                        unsubscribeChat();
                        unsubscribeTask();
                    };
                } else {
                    setError("המשימה לא נמצאה");
                }
            } catch (err) {
                console.error("Error finding task:", err);
                setError("שגיאה בטעינת המשימה");
            } finally {
                setLoadingTask(false);
            }
        };

        fetchTask();
    }, [taskId]);

    const handleUpdateStatus = async (newStatus: string) => {
        if (!db || !task) return;
        try {
            await updateDoc(doc(db, "events", task.eventId, "tasks", task.id), {
                status: newStatus
            });
        } catch (err) {
            console.error("Error updating status:", err);
        }
    };

    const handleUpdateField = async (field: string, value: string) => {
        if (!db || !task) return;
        try {
            await updateDoc(doc(db, "events", task.eventId, "tasks", task.id), {
                [field]: value
            });
        } catch (err) {
            console.error(`Error updating ${field}:`, err);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !db || !user || !task) return;

        try {
            await addDoc(collection(db, "events", task.eventId, "tasks", task.id, "messages"), {
                text: newMessage,
                senderId: user.uid,
                senderName: user.displayName || user.email?.split('@')[0] || "Unknown",
                createdAt: serverTimestamp()
            });

            // Update task last message info
            await updateDoc(doc(db, "events", task.eventId, "tasks", task.id), {
                lastMessageTime: serverTimestamp(),
                lastMessageBy: user.uid,
                [`readBy.${user.uid}`]: true
            });

            setNewMessage("");
        } catch (err) {
            console.error("Error sending message:", err);
        }
    };

    if (loadingTask) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (error || !task) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col gap-4">
                <p className="text-red-500">{error || "המשימה לא נמצאה"}</p>
                <Link href="/" className="text-indigo-600 hover:underline">חזרה לדשבורד</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6 bg-gray-50">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6">
                    <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition w-fit">
                        <ArrowRight size={20} />
                        חזרה ללוח הבקרה
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Main Task Details */}
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
                                <div className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1
                            ${task.status === 'DONE' ? 'bg-green-100 text-green-700' :
                                        task.status === 'STUCK' ? 'bg-red-100 text-red-700' :
                                            task.status === 'IN_PROGRESS' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'}`}>
                                    {task.status === 'DONE' && <CheckCircle size={16} />}
                                    {task.status === 'STUCK' && <AlertTriangle size={16} />}
                                    {task.status === 'IN_PROGRESS' && <Circle size={16} />}
                                    {task.status === 'TODO' && <Circle size={16} />}
                                    <span>
                                        {task.status === 'DONE' ? 'בוצע' :
                                            task.status === 'STUCK' ? 'תקוע' :
                                                task.status === 'IN_PROGRESS' ? 'בתהליך' : 'לביצוע'}
                                    </span>
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-500 mb-1">תיאור המשימה</label>
                                <textarea
                                    className="w-full p-3 border border-gray-200 rounded-lg text-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                                    rows={4}
                                    value={task.description || ""}
                                    onChange={(e) => handleUpdateField('description', e.target.value)}
                                    placeholder="הוסף תיאור למשימה..."
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                                    <label className="block text-xs font-bold text-yellow-800 mb-2">📍 איפה זה עומד</label>
                                    <textarea
                                        className="w-full bg-white p-2 rounded border border-yellow-200 text-sm focus:outline-none focus:border-yellow-400"
                                        rows={2}
                                        value={task.currentStatus || ""}
                                        onChange={(e) => handleUpdateField('currentStatus', e.target.value)}
                                        placeholder="עדכן סטטוס נוכחי..."
                                    />
                                </div>
                                <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                                    <label className="block text-xs font-bold text-orange-800 mb-2">➡️ הצעד הבא</label>
                                    <textarea
                                        className="w-full bg-white p-2 rounded border border-orange-200 text-sm focus:outline-none focus:border-orange-400"
                                        rows={2}
                                        value={task.nextStep || ""}
                                        onChange={(e) => handleUpdateField('nextStep', e.target.value)}
                                        placeholder="מה הצעד הבא..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Chat Section */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-[500px] flex flex-col">
                            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
                                <MessageCircle className="text-indigo-600" />
                                <h2 className="text-lg font-semibold">צ'אט ועדכונים</h2>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-2">
                                {messages.length === 0 ? (
                                    <div className="text-center text-gray-400 py-8">
                                        אין הודעות עדיין. התחל את השיחה!
                                    </div>
                                ) : (
                                    messages.map((msg) => (
                                        <div key={msg.id} className={`flex flex-col ${msg.senderId === user?.uid ? 'items-end' : 'items-start'}`}>
                                            <div className={`max-w-[80%] p-3 rounded-lg ${msg.senderId === user?.uid
                                                    ? 'bg-indigo-600 text-white rounded-tl-none'
                                                    : 'bg-gray-100 text-gray-800 rounded-tr-none'
                                                }`}>
                                                <p className="text-sm">{msg.text}</p>
                                            </div>
                                            <span className="text-xs text-gray-400 mt-1 px-1">
                                                {msg.senderName} • {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>

                            <form onSubmit={handleSendMessage} className="flex gap-2">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="כתוב הודעה..."
                                    className="flex-1 p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim()}
                                    className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                >
                                    <Send size={20} />
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Sidebar Details */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4">פרטים נוספים</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                        <Calendar size={16} />
                                        תאריך יעד
                                    </label>
                                    <input
                                        type="date"
                                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                                        value={task.dueDate}
                                        onChange={(e) => handleUpdateField('dueDate', e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                        <User size={16} />
                                        אחראי
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                                        value={task.assignee}
                                        onChange={(e) => handleUpdateField('assignee', e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                        <AlertTriangle size={16} />
                                        עדיפות
                                    </label>
                                    <select
                                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                                        value={task.priority}
                                        onChange={(e) => handleUpdateField('priority', e.target.value)}
                                    >
                                        <option value="NORMAL">רגיל</option>
                                        <option value="HIGH">גבוה</option>
                                        <option value="CRITICAL">דחוף</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                        סטטוס
                                    </label>
                                    <select
                                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                                        value={task.status}
                                        onChange={(e) => handleUpdateStatus(e.target.value)}
                                    >
                                        <option value="TODO">לביצוע</option>
                                        <option value="IN_PROGRESS">בתהליך</option>
                                        <option value="STUCK">תקוע</option>
                                        <option value="DONE">בוצע</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {task.eventTitle && (
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                <p className="text-sm text-indigo-800 mb-2">שייך לאירוע:</p>
                                <Link href={`/events/${task.eventId}`} className="font-bold text-indigo-900 hover:underline flex items-center gap-2">
                                    {task.eventTitle}
                                    <ArrowRight size={16} />
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
