"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { ArrowRight, Calendar, Clock, User, AlertTriangle, CheckCircle, Circle, MessageCircle, Send, Handshake } from "lucide-react";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

interface Assignee {
    name: string;
    userId?: string;
    email?: string;
}

interface Task {
    id: string;
    title: string;
    description?: string;
    assignee: string;
    assigneeId?: string;
    assignees?: Assignee[];
    status: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK";
    dueDate: string;
    priority: "NORMAL" | "HIGH" | "CRITICAL";
    currentStatus?: string;
    nextStep?: string;
    eventId: string;
    eventTitle?: string;
    isVolunteerTask?: boolean;
    volunteerHours?: number | null;
    createdByName?: string;
    createdByPhone?: string;
    createdBy?: string | null;
}

interface EventTeamMember {
    name: string;
    role: string;
    email?: string;
    userId?: string;
}

interface ChatMessage {
    id: string;
    text: string;
    senderId?: string;
    senderUid?: string;
    senderName: string;
    createdAt?: any;
    timestamp?: any;
}

export default function TaskDetailPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const taskId = params?.id as string;
    const searchParams = useSearchParams();
    const viewSource = searchParams?.get("source") || "";
    const hintedEventId = searchParams?.get("eventId") || null;
    const focusSection = searchParams?.get("focus");
    const assigneeSectionRef = useRef<HTMLDivElement | null>(null);

    const [task, setTask] = useState<Task | null>(null);
    const [loadingTask, setLoadingTask] = useState(true);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [error, setError] = useState("");
    const [eventTeam, setEventTeam] = useState<EventTeamMember[]>([]);
    const [eventNeedsVolunteers, setEventNeedsVolunteers] = useState(false);
    const [attachments, setAttachments] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
const [uploadFiles, setUploadFiles] = useState<File[]>([]);

    // Backfill creator contact details from the user profile (registration info)
    useEffect(() => {
        const creatorId = task?.createdBy;
        const dbInstance = db;
        if (!dbInstance || !creatorId) return;
        const fetchCreator = async () => {
            try {
                const snap = await getDoc(doc(dbInstance, "users", creatorId));
                if (snap.exists()) {
                    const data = snap.data() as any;
                    setTask(prev => prev ? {
                        ...prev,
                        createdByPhone: data.phone || prev.createdByPhone || "",
                        createdByName: prev.createdByName || data.fullName || data.name || data.email || prev.createdBy || ""
                    } : prev);
                }
            } catch (err) {
                console.error("Error loading creator contact:", err);
            }
        };
        fetchCreator();
    }, [db, task?.createdBy]);

    const normalizeAssignees = (data: any): Assignee[] => {
        if (!data) return [];
        const raw = data.assignees || (data.assignee ? [{ name: data.assignee, userId: data.assigneeId, email: data.assigneeEmail }] : []);
        return (raw || []).map((a: any) => ({
            name: (a?.name || "").toString(),
            ...(a?.userId ? { userId: a.userId } : {}),
            ...(a?.email ? { email: a.email } : {}),
        }));
    };

    const getAssigneeKey = (assignee?: { email?: string; userId?: string; name?: string } | null) => {
        if (!assignee) return "";
        if (assignee.email && assignee.email.trim()) return assignee.email.trim().toLowerCase();
        if (assignee.userId) return String(assignee.userId);
        if (assignee.name) return assignee.name.trim().toLowerCase();
        return "";
    };

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
                const fetchByEventId = async (eventId: string) => {
                    if (!db) return null;
                    const taskRef = doc(db, "events", eventId, "tasks", taskId);
                    const taskSnap = await getDoc(taskRef);
                    if (!taskSnap.exists()) return null;
                    const eventDoc = await getDoc(doc(db, "events", eventId));
                    if (!eventDoc.exists()) return null;
                    const eventData = eventDoc.data();
                    const taskData = taskSnap.data();
                    return {
                        task: {
                            id: taskSnap.id,
                            ...taskData,
                            assignee: taskData.assignee || normalizeAssignees(taskData)[0]?.name || "",
                            assignees: normalizeAssignees(taskData),
                            createdByName: (taskData as any).createdByName || (taskData as any).createdBy || "",
                            createdByPhone: (taskData as any).createdByPhone || (taskData as any).creatorPhone || "",
                            createdBy: (taskData as any).createdBy || null,
                            eventId
                        } as Task,
                        eventTitle: (eventData as any).title,
                        eventTeam: ((eventData as any).team as EventTeamMember[]) || [],
                        eventNeedsVolunteers: !!(eventData as any).needsVolunteers,
                    };
                };

                let foundTask: Task | null = null;
                let foundEventId = "";
                let foundEventTitle = "";
                let foundEventTeam: EventTeamMember[] = [];
                let foundEventNeedsVolunteers = false;

                // Try hinted eventId first (passed from card)
                if (hintedEventId) {
                    const res = await fetchByEventId(hintedEventId);
                    if (res) {
                        foundTask = res.task;
                        foundEventId = hintedEventId;
                        foundEventTitle = res.eventTitle;
                        foundEventTeam = res.eventTeam;
                        foundEventNeedsVolunteers = res.eventNeedsVolunteers;
                    }
                }

                // Fallback: iterate events (legacy behavior)
                if (!foundTask) {
                    if (!db) return;
                    const { collection, getDocs } = await import("firebase/firestore");
                    const eventsRef = collection(db, "events");
                    const eventsSnap = await getDocs(eventsRef);

                    for (const eventDoc of eventsSnap.docs) {
                        const res = await fetchByEventId(eventDoc.id);
                        if (res) {
                            foundTask = res.task;
                            foundEventId = eventDoc.id;
                            foundEventTitle = res.eventTitle;
                            foundEventTeam = res.eventTeam;
                            foundEventNeedsVolunteers = res.eventNeedsVolunteers;
                            break;
                        }
                    }
                }

                if (foundTask) {
                    setTask({ ...foundTask, eventTitle: foundEventTitle });
                    setEventTeam(foundEventTeam);
                    setEventNeedsVolunteers(foundEventNeedsVolunteers);

                    // Subscribe to chat
                    if (!db) return;
                    const qChat = query(
                        collection(db, "events", foundEventId, "tasks", taskId, "messages"),
                        orderBy("createdAt", "asc")
                    );
                    const unsubscribeChat = onSnapshot(qChat, (snapshot) => {
                        const msgs = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data(),
                            createdAt: doc.data().createdAt || doc.data().timestamp,
                            senderId: doc.data().senderId || doc.data().senderUid,
                            senderUid: doc.data().senderUid || doc.data().senderId,
                        })) as ChatMessage[];
                        // Backfill legacy messages to createdAt for consistent ordering
                        snapshot.docs.forEach(d => {
                            const data = d.data();
                            if (!data.createdAt && data.timestamp) {
                                updateDoc(d.ref, { createdAt: data.timestamp }).catch(() => { /* ignore */ });
                            }
                        });
                        setMessages(msgs);
                    });

                    // Subscribe to task updates
                    if (!db) return;
                    const unsubscribeTask = onSnapshot(doc(db, "events", foundEventId, "tasks", taskId), (docSnap) => {
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            setTask(prev => ({
                                ...prev!,
                                ...data,
                                assignee: data.assignee || normalizeAssignees(data)[0]?.name || "",
                                assignees: normalizeAssignees(data),
                                createdByName: (data as any).createdByName || (data as any).createdBy || prev?.createdByName || "",
                                createdByPhone: (data as any).createdByPhone || (data as any).creatorPhone || prev?.createdByPhone || "",
                                createdBy: (data as any).createdBy || prev?.createdBy || null,
                            } as Task));
                        }
                    });

                    // Subscribe to event updates for team changes
                    if (!db) return;
                    const unsubscribeEvent = onSnapshot(doc(db, "events", foundEventId), (docSnap) => {
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            setEventTeam((data.team as EventTeamMember[]) || []);
                            setEventNeedsVolunteers(!!data.needsVolunteers);
                        }
                    });

                    if (!db) return;
                    const unsubFiles = onSnapshot(
                        collection(db, "events", foundEventId, "tasks", taskId, "files"),
                        (snap) => {
                            const files = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                            setAttachments(files);
                        }
                    );

                    return () => {
                        unsubscribeChat();
                        unsubscribeTask();
                        unsubscribeEvent();
                        unsubFiles();
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
    }, [taskId, hintedEventId]);

    useEffect(() => {
        if (focusSection === "assignees" && assigneeSectionRef.current) {
            assigneeSectionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [focusSection, task]);

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

    const handleUpdateField = async (field: string, value: string | boolean | number | null) => {
        if (!db || !task) return;
        try {
            await updateDoc(doc(db, "events", task.eventId, "tasks", task.id), {
                [field]: value
            });
            // Update local state
            setTask(prev => prev ? { ...prev, [field]: value } : prev);
        } catch (err) {
            console.error(`Error updating ${field}:`, err);
        }
    };

    const sanitizeAssigneesForWrite = (arr: Assignee[] = []) => {
        const seen = new Set<string>();
        return (arr || [])
            .map(a => ({
                name: (a.name || "").trim(),
                ...(a.userId ? { userId: a.userId } : {}),
                ...(a.email ? { email: a.email.trim().toLowerCase() } : {}),
            }))
            .filter(a => {
                const key = getAssigneeKey(a);
                if (!key || !a.name) return false;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    };

    const updateAssignees = async (nextAssignees: Assignee[]) => {
        if (!db || !task) return;
        const cleaned = sanitizeAssigneesForWrite(nextAssignees);
        const primary = cleaned[0];
        try {
            await updateDoc(doc(db, "events", task.eventId, "tasks", task.id), {
                assignees: cleaned,
                assignee: primary?.name || "",
                assigneeId: primary?.userId || null,
            });
            setTask(prev => prev ? {
                ...prev,
                assignees: cleaned,
                assignee: primary?.name || "",
                assigneeId: primary?.userId || "",
            } : prev);
        } catch (err) {
            console.error("Error updating assignees:", err);
        }
    };

    const handleToggleAssignee = async (member: EventTeamMember) => {
        if (!task) return;
        const memberKey = getAssigneeKey(member);
        const exists = task.assignees?.some(a => getAssigneeKey(a) === memberKey);
        const next = exists
            ? (task.assignees || []).filter(a => getAssigneeKey(a) !== memberKey)
            : ([...(task.assignees || []), { name: member.name, userId: member.userId, email: member.email }]);
        await updateAssignees(next);
    };

    const handleUploadFiles = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!task || !storage || !db || uploadFiles.length === 0) return;
        setUploading(true);
        try {
            const uploads = uploadFiles.map(async (file) => {
                const path = `events/${task.eventId}/tasks/${task.id}/${Date.now()}-${file.name}`;
                const storageRef = ref(storage!, path);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                const fileData = {
                    name: file.name,
                    url,
                    storagePath: path,
                    taskId: task.id,
                    taskTitle: task.title,
                    createdAt: serverTimestamp(),
                };
                await Promise.all([
                    addDoc(collection(db!, "events", task.eventId, "tasks", task.id, "files"), fileData),
                    addDoc(collection(db!, "events", task.eventId, "files"), fileData),
                ]);
            });
            await Promise.all(uploads);
            setUploadFiles([]);
        } catch (err) {
            console.error("Error uploading files:", err);
            alert("שגיאה בהעלאת הקבצים");
        } finally {
            setUploading(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !db || !user || !task) return;

        try {
            await addDoc(collection(db, "events", task.eventId, "tasks", task.id, "messages"), {
                text: newMessage,
                senderId: user.uid,
                senderUid: user.uid,
                senderName: user.displayName || user.email?.split('@')[0] || "Unknown",
                createdAt: serverTimestamp(),
                timestamp: serverTimestamp(), // legacy field
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
                <Link href="/" className="text-indigo-600 hover:underline">חזרה לאירוע</Link>
            </div>
        );
    }

    const rawCreatorPhoneDigits = (task.createdByPhone || "").replace(/[^\d]/g, "");
    const normalizeForWhatsapp = (digits: string) => {
        if (!digits) return "";
        // If user stored local format (e.g., 05x...), add Israel country code
        if (digits.startsWith("0")) {
            const trimmed = digits.replace(/^0+/, "");
            return trimmed ? `972${trimmed}` : "";
        }
        return digits;
    };
    const creatorPhoneDigits = normalizeForWhatsapp(rawCreatorPhoneDigits);
    const whatsappMessage = encodeURIComponent(`היי ${task.createdByName || ""}, יש לי שאלה לגבי המשימה "${task.title}"`);
    const whatsappLink = creatorPhoneDigits && creatorPhoneDigits.length >= 8 ? `https://wa.me/${creatorPhoneDigits}?text=${whatsappMessage}` : null;

    return (
        <div className="min-h-screen p-6 bg-gray-50">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6">
                    {viewSource === "volunteer" ? (
                        <button
                            type="button"
                            onClick={() => {
                                if (typeof window !== "undefined" && window.history.length > 1) {
                                    router.back();
                                } else {
                                    router.push("/volunteers/events");
                                }
                            }}
                            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition w-fit"
                        >
                            <ArrowRight size={20} />
                            חזרה למשימות
                        </button>
                    ) : (
                        <Link
                            href={task ? `/events/${task.eventId}` : "/"}
                            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition w-fit"
                        >
                            <ArrowRight size={20} />
                            חזרה לדף האירוע
                        </Link>
                    )}
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
                            {eventNeedsVolunteers && (
                                <div className="flex flex-col gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg mb-4">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="isVolunteerTask"
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            checked={task.isVolunteerTask || false}
                                            onChange={(e) => {
                                                handleUpdateField('isVolunteerTask', e.target.checked);
                                                if (!e.target.checked) {
                                                    handleUpdateField('volunteerHours', null);
                                                }
                                            }}
                                        />
                                        <label htmlFor="isVolunteerTask" className="text-sm font-medium text-gray-700 flex items-center gap-2 cursor-pointer">
                                            <Handshake size={16} className="text-indigo-600" />
                                            משימה למתנדב
                                        </label>
                                        <p className="text-xs text-gray-500">משימות שסומנו כ"משימה למתנדב" יופיעו בדף ההרשמה למתנדבים</p>
                                    </div>
                                    {task.isVolunteerTask && (
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm font-medium text-gray-700">שעות משוערות</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500"
                                                value={task.volunteerHours ?? ""}
                                                onChange={(e) => handleUpdateField('volunteerHours', e.target.value ? parseFloat(e.target.value) : null)}
                                                placeholder="לדוגמה 2"
                                            />
                                            <span className="text-xs text-gray-500">שעות עבודה</span>
                                        </div>
                                    )}
                                </div>
                            )}
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
                                                {msg.senderName} • {(msg.createdAt?.seconds || msg.timestamp?.seconds)
                                                    ? new Date((msg.createdAt?.seconds || msg.timestamp?.seconds) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : '...'}
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

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-3">קבצים מצורפים</h3>
                            {attachments.length === 0 ? (
                                <p className="text-sm text-gray-500 mb-3">אין קבצים למשימה זו עדיין.</p>
                            ) : (
                                <ul className="space-y-2 mb-3">
                                    {attachments.map((file) => (
                                        <li key={file.id} className="flex items-center justify-between text-sm">
                                            <a href={file.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all">
                                                {file.name}
                                            </a>
                                            <span className="text-xs text-gray-400">
                                                {file.createdAt?.seconds
                                                    ? new Date(file.createdAt.seconds * 1000).toLocaleDateString("he-IL")
                                                    : ""}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <form onSubmit={handleUploadFiles} className="space-y-2">
                                <input
                                    type="file"
                                    multiple
                                    onChange={(e) => setUploadFiles(e.target.files ? Array.from(e.target.files) : [])}
                                    className="text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={uploading || uploadFiles.length === 0}
                                    className={`w-full text-sm font-semibold rounded-lg px-3 py-2 ${uploading || uploadFiles.length === 0 ? "bg-gray-200 text-gray-500" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
                                >
                                    {uploading ? "מעלה..." : "העלה קבצים"}
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
                                        נוצר ע"י
                                    </label>
                                    <div className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 flex items-center justify-between gap-2">
                                        <span>{task.createdByName || "לא צויין"}</span>
                                        {whatsappLink ? (
                                            <a
                                                href={whatsappLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                                                title="שליחת הודעת וואטסאפ ליוצר המשימה"
                                            >
                                                <MessageCircle size={14} />
                                                וואטסאפ
                                            </a>
                                        ) : (
                                            <span className="text-xs text-gray-400">אין מספר וואטסאפ שמור</span>
                                        )}
                                    </div>
                                </div>

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

                                <div ref={assigneeSectionRef}>
                                    <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                        <User size={16} />
                                        אחראים
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {eventTeam.map((member, idx) => {
                                            const memberKey = getAssigneeKey(member);
                                            const checked = task.assignees?.some(a => getAssigneeKey(a) === memberKey);
                                            return (
                                                <label
                                                    key={`${member.name}-${idx}`}
                                                    className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs border transition cursor-pointer select-none ${checked ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-50 text-gray-700 border-gray-200"}`}
                                                    style={{ minWidth: '120px' }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="accent-white w-4 h-4"
                                                        checked={checked}
                                                        onChange={() => handleToggleAssignee(member)}
                                                    />
                                                    {member.name}
                                                </label>
                                            );
                                        })}
                                        {!eventTeam.length && (
                                            <p className="text-xs text-gray-500">עדיין לא הוגדר צוות לאירוע זה.</p>
                                        )}
                                    </div>
                                    {(!task.assignees || task.assignees.length === 0) && (
                                        <p className="text-xs text-gray-500 mt-1">אין אחראים משויכים למשימה זו.</p>
                                    )}
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
