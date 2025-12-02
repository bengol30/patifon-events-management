"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, query, where, updateDoc, arrayUnion, arrayRemove, onSnapshot, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { Calendar, MapPin, Users, Handshake, Clock, Target, AlertCircle, ArrowRight, CheckSquare, Square, UserCheck, Lock, Circle, CheckCircle2 } from "lucide-react";

interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    dueDate?: string;
    isVolunteerTask?: boolean;
    assignees?: { name?: string; email?: string }[];
    volunteerHours?: number | null;
}
interface CompletedLog {
    id: string;
    eventId?: string;
    eventTitle?: string;
    taskId?: string;
    taskTitle?: string;
    volunteerHours?: number | null;
    completedAt?: any;
}

interface EventData {
    id: string;
    title: string;
    location: string;
    startTime?: any;
    description?: string;
    needsVolunteers?: boolean;
    volunteersCount?: number | null;
    tasks?: Task[];
}

export default function VolunteerEventsPage() {
    const [events, setEvents] = useState<EventData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [authEventId, setAuthEventId] = useState<string | null>(null);
    const [authEmail, setAuthEmail] = useState("");
    const [authPassword, setAuthPassword] = useState("");
    const [authError, setAuthError] = useState("");
    const [authing, setAuthing] = useState(false);
    const [sessionMap, setSessionMap] = useState<Record<string, { volunteerId: string; name: string; email: string }>>({});
    const [selectedTasksByEvent, setSelectedTasksByEvent] = useState<Record<string, Set<string>>>(() => ({}));
    const [authModalVisible, setAuthModalVisible] = useState(false);
    const [isAuthed, setIsAuthed] = useState(false);
    const [matchedEventIds, setMatchedEventIds] = useState<Set<string>>(new Set());
    const [saveStatus, setSaveStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
    const [tasksByEvent, setTasksByEvent] = useState<Record<string, Task[]>>({});
    const [completedLogs, setCompletedLogs] = useState<CompletedLog[]>([]);

    const currentEmail = useMemo(() => {
        const first = Object.values(sessionMap)[0];
        return (first?.email || authEmail || "").trim().toLowerCase();
    }, [sessionMap, authEmail]);
    const sessionIdentity = useMemo(() => {
        const first = Object.values(sessionMap)[0];
        const emailRaw = (first?.email || authEmail || "").trim();
        const email = emailRaw.toLowerCase();
        const name = first?.name || (emailRaw ? emailRaw.split("@")[0] : "מתנדב/ת");
        return { email, name };
    }, [sessionMap, authEmail]);

    // helper to read selected tasks per event
    const getSelectedForEvent = useMemo(() => {
        return (eventId: string): Set<string> => selectedTasksByEvent[eventId] || new Set<string>();
    }, [selectedTasksByEvent]);

    const myTasks = useMemo(() => {
        if (!currentEmail || !isAuthed) return [] as { eventId: string; eventTitle?: string; task: Task }[];
        const res: { eventId: string; eventTitle?: string; task: Task }[] = [];
        events.forEach(ev => {
            const tasks = tasksByEvent[ev.id] || [];
            tasks.forEach(t => {
                const selected = getSelectedForEvent(ev.id).has(t.id);
                const assigned = (t.assignees || []).some(a => (a.email || "").toLowerCase() === currentEmail);
                if (selected || assigned) {
                    res.push({ eventId: ev.id, eventTitle: ev.title, task: t });
                }
            });
        });
        return res;
    }, [currentEmail, events, getSelectedForEvent, tasksByEvent, isAuthed]);

    const completedTasks = useMemo(() => {
        if (!currentEmail || !isAuthed) return [] as { eventId?: string; eventTitle?: string; task: Task }[];
        return completedLogs.map((log) => ({
            eventId: log.eventId,
            eventTitle: log.eventTitle,
            task: {
                id: log.taskId || "",
                title: log.taskTitle || "משימה",
                status: "DONE",
                priority: "NORMAL",
                assignee: "",
                dueDate: "",
                volunteerHours: log.volunteerHours ?? null,
            } as Task,
        }));
    }, [currentEmail, isAuthed, completedLogs]);

    const totalCompletedHours = useMemo(() => {
        return completedTasks.reduce((sum, item) => {
            const hrs = Number(item.task.volunteerHours);
            return sum + (Number.isFinite(hrs) && hrs > 0 ? hrs : 0);
        }, 0);
    }, [completedTasks]);

    useEffect(() => {
        if (!db) return;
        setLoading(true);
        const taskUnsubs = new Map<string, () => void>();
        const eventsQuery = collection(db, "events");

        const unsubEvents = onSnapshot(eventsQuery, (eventsSnap) => {
            const eventsData: EventData[] = [];
            const seen = new Set<string>();

            eventsSnap.forEach((eventDoc) => {
                const eventData = eventDoc.data() as EventData;
                const evId = eventDoc.id;
                seen.add(evId);
                eventsData.push({
                    ...eventData,
                    id: evId,
                });

                // attach task listener if not exists
                if (!taskUnsubs.has(evId)) {
                    const tasksQuery = query(
                        collection(db, "events", evId, "tasks"),
                        where("isVolunteerTask", "==", true)
                    );
                    const unsubTask = onSnapshot(tasksQuery, (tasksSnap) => {
                        const tasks: Task[] = [];
                        tasksSnap.forEach((taskDoc) => {
                            const taskData = { id: taskDoc.id, ...taskDoc.data() } as Task;
                            tasks.push(taskData);
                        });
                        setTasksByEvent((prev) => ({ ...prev, [evId]: tasks }));
                    });
                    taskUnsubs.set(evId, unsubTask);
                }
            });

            // cleanup removed events
            Array.from(taskUnsubs.keys()).forEach((evId) => {
                if (!seen.has(evId)) {
                    const unsub = taskUnsubs.get(evId);
                    unsub && unsub();
                    taskUnsubs.delete(evId);
                    setTasksByEvent((prev) => {
                        const { [evId]: _, ...rest } = prev;
                        return rest;
                    });
                }
            });

            setEvents(eventsData);
            setLoading(false);
        }, (err) => {
            console.error("Error loading events", err);
            setError("שגיאה בטעינת האירועים");
            setLoading(false);
        });

        return () => {
            unsubEvents();
            taskUnsubs.forEach((unsub) => unsub());
        };
    }, [db]);

    // Listen to completed logs for current volunteer
    useEffect(() => {
        if (!db || !sessionIdentity.email) return;
        const qLogs = query(collection(db, "volunteer_completions"), where("email", "==", sessionIdentity.email));
        const unsub = onSnapshot(qLogs, (snap) => {
            const arr: CompletedLog[] = [];
            snap.forEach((d) => arr.push({ id: d.id, ...d.data() } as CompletedLog));
            setCompletedLogs(arr);
        });
        return () => unsub();
    }, [db, sessionIdentity.email]);

    const hashPassword = async (password: string) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    };

    const openAuth = (eventId?: string) => {
        if (eventId) setAuthEventId(eventId);
        setAuthEmail("");
        setAuthPassword("");
        setAuthError("");
        setAuthModalVisible(true);
    };

    const handleAuth = async () => {
        if (!db) return;
        if (!authEmail.trim() || !authPassword.trim()) {
            setAuthError("יש להזין אימייל וסיסמה");
            return;
        }
        try {
            setAuthing(true);
            setAuthError("");
            const emailLower = authEmail.trim().toLowerCase();
            const matched: Record<string, { volunteerId: string; name: string; email: string }> = {};

            // Try to find volunteer across events (case-insensitive)
            for (const ev of events) {
                try {
                    const volunteersSnap = await getDocs(
                        query(collection(db, "events", ev.id, "volunteers"), where("email", "==", authEmail.trim()))
                    );
                    if (!volunteersSnap.empty) {
                        const docSnap = volunteersSnap.docs[0];
                        const data = docSnap.data() as any;
                        const storedHash = data.passwordHash;
                        const computed = await hashPassword(authPassword.trim());
                        if (storedHash && storedHash === computed) {
                            const name = data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "מתנדב/ת";
                            matched[ev.id] = { volunteerId: docSnap.id, name, email: authEmail.trim() };
                            continue;
                        }
                    }
                    // fallback scan for case-insensitive match
                    const volunteersSnapAll = await getDocs(collection(db, "events", ev.id, "volunteers"));
                    for (const volDoc of volunteersSnapAll.docs) {
                        const data = volDoc.data() as any;
                        const emailVal = (data.email || "").toLowerCase();
                        if (emailVal !== emailLower) continue;
                        const storedHash = data.passwordHash;
                        const computed = await hashPassword(authPassword.trim());
                        if (storedHash && storedHash === computed) {
                            const name = data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "מתנדב/ת";
                            matched[ev.id] = { volunteerId: volDoc.id, name, email: authEmail.trim() };
                            break;
                        }
                    }
                } catch (lookupErr) {
                    console.warn("Login lookup failed", lookupErr);
                }
            }

            const matchedIds = Object.keys(matched);
            if (matchedIds.length === 0) {
                setAuthError("לא נמצא חשבון מתנדב עם הפרטים שהוזנו. ודא/י שנרשמת לאירוע הזה.");
                return;
            }

            setSessionMap(matched);
            setMatchedEventIds(new Set(matchedIds));
            setIsAuthed(true);
            setSelectedTasksByEvent(() => {
                const next: Record<string, Set<string>> = {};
                events.forEach((ev) => {
                    if (!matched[ev.id]) return;
                    const selected = new Set<string>();
                    ev.tasks?.forEach((t) => {
                        const assignees = t.assignees || [];
                        if (assignees.some((a) => (a.email || "").toLowerCase() === emailLower)) {
                            selected.add(t.id);
                        }
                    });
                    next[ev.id] = selected;
                });
                return next;
            });

            setAuthEventId(null);
            setAuthModalVisible(false);
        } catch (err) {
            console.error("Volunteer auth failed", err);
            setAuthError("שגיאה באימות. נסו שוב.");
        } finally {
            setAuthing(false);
        }
    };

    const toggleTask = (eventId: string, taskId: string) => {
        setSelectedTasksByEvent((prev) => {
            const current = new Set(prev[eventId] || []);
            if (current.has(taskId)) current.delete(taskId);
            else current.add(taskId);
            return { ...prev, [eventId]: current };
        });
    };

    const saveSelection = async (eventId: string) => {
        if (!db) return;
        if (!isAuthed) return;
        const availableIds = new Set((tasksByEvent[eventId] || []).map((t) => t.id));
        const selected = Array.from(getSelectedForEvent(eventId)).filter((id) => availableIds.has(id));
        // Drop selections for tasks that no longer exist (e.g., נמחקו)
        setSelectedTasksByEvent((prev) => ({ ...prev, [eventId]: new Set(selected) }));
        try {
            if (!isAuthed) {
                openAuth(eventId);
                return;
            }
            setSaveStatus((prev) => ({ ...prev, [eventId]: "saving" }));
            for (const taskId of selected) {
                const taskRef = doc(db, "events", eventId, "tasks", taskId);
                try {
                    await updateDoc(taskRef, {
                        assignees: arrayUnion({ name: sessionIdentity.name, email: sessionIdentity.email }),
                    });
                } catch (err: any) {
                    // Skip missing tasks without failing the whole save
                    console.warn("Skipping task that no longer exists", taskId, err);
                    continue;
                }
            }
            // reflect locally so התצוגה מסונכרנת עם דף הניהול
            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === eventId
                        ? {
                            ...ev,
                            tasks: (ev.tasks || []).map((t) =>
                                selected.includes(t.id)
                                    ? {
                                        ...t,
                                        assignees: [
                                            ...(t.assignees || []),
                                            { name: sessionIdentity.name, email: sessionIdentity.email },
                                        ],
                                    }
                                    : t
                            ),
                        }
                        : ev
                )
            );
            setSaveStatus((prev) => ({ ...prev, [eventId]: "saved" }));
        } catch (err) {
            console.error("Error saving volunteer tasks", err);
            setSaveStatus((prev) => ({ ...prev, [eventId]: "error" }));
            return;
        }
    };

    const removeTaskSelection = async (eventId: string, taskId: string) => {
        if (!db) return;
        if (!isAuthed) return;
        const assignee = { name: sessionIdentity.name, email: sessionIdentity.email };
        try {
            setSaveStatus((prev) => ({ ...prev, [eventId]: "saving" }));
            const taskRef = doc(db, "events", eventId, "tasks", taskId);
            await updateDoc(taskRef, {
                assignees: arrayRemove(assignee),
            });
            // remove from local selection and events state
            setSelectedTasksByEvent((prev) => {
                const next = { ...prev };
                const set = new Set(next[eventId] || []);
                set.delete(taskId);
                next[eventId] = set;
                return next;
            });
            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === eventId
                        ? {
                            ...ev,
                            tasks: (ev.tasks || []).map((t) =>
                                t.id === taskId
                                    ? {
                                        ...t,
                                        assignees: (t.assignees || []).filter(
                                            (a) => (a.email || "").toLowerCase() !== sessionIdentity.email.toLowerCase()
                                        ),
                                    }
                                    : t
                            ),
                        }
                        : ev
                )
            );
            setSaveStatus((prev) => ({ ...prev, [eventId]: "saved" }));
        } catch (err) {
            console.error("Error removing volunteer task", err);
            setSaveStatus((prev) => ({ ...prev, [eventId]: "error" }));
        }
    };

    const toggleTaskDone = async (eventId: string, taskId: string, currentStatus: string) => {
        if (!db) return;
        if (!isAuthed) return;
        const nextStatus = currentStatus === "DONE" ? "TODO" : "DONE";
        try {
            setSaveStatus((prev) => ({ ...prev, [eventId]: "saving" }));
            const taskRef = doc(db, "events", eventId, "tasks", taskId);
            await updateDoc(taskRef, { status: nextStatus });
            if (nextStatus === "DONE") {
                // log completion for volunteer history
                try {
                    const task = (tasksByEvent[eventId] || []).find((t) => t.id === taskId);
                    const ev = events.find((e) => e.id === eventId);
                    await addDoc(collection(db, "volunteer_completions"), {
                        email: sessionIdentity.email,
                        name: sessionIdentity.name,
                        eventId,
                        eventTitle: ev?.title || "",
                        taskId,
                        taskTitle: task?.title || "משימה",
                        volunteerHours: task?.volunteerHours ?? null,
                        completedAt: serverTimestamp(),
                    });
                } catch (logErr) {
                    console.warn("Failed logging completion", logErr);
                }
            } else {
                // remove completion log for this task/email
                try {
                    const logsSnap = await getDocs(
                        query(
                            collection(db, "volunteer_completions"),
                            where("email", "==", sessionIdentity.email),
                            where("taskId", "==", taskId)
                        )
                    );
                    for (const d of logsSnap.docs) {
                        await deleteDoc(d.ref);
                    }
                } catch (logErr) {
                    console.warn("Failed removing completion log", logErr);
                }
            }
            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === eventId
                        ? {
                            ...ev,
                            tasks: (ev.tasks || []).map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)),
                        }
                        : ev
                )
            );
            setSaveStatus((prev) => ({ ...prev, [eventId]: "saved" }));
        } catch (err) {
            console.error("Error updating task status", err);
            setSaveStatus((prev) => ({ ...prev, [eventId]: "error" }));
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center gap-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                    <AlertCircle />
                </div>
                <p className="text-red-600 font-semibold">{error}</p>
                <Link href="/" className="text-indigo-600 hover:underline">חזרה לדף הבית</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#fff7ed] via-white to-[#f5f3ff] p-6">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl border border-orange-100 p-6 md:p-8 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-indigo-100 rounded-full">
                            <Handshake className="text-indigo-600" size={24} />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <h1 className="text-3xl font-bold text-gray-900">אירועים ומשימות פתוחות למתנדבים</h1>
                            <p className="text-gray-600">אחרי הרשמה תוכלו לבחור ולשריין משימות, ולעקוב אחרי מה שבחרתם באזור האישי.</p>
                        </div>
                        <button
                            onClick={() => { /* snapshot מבצע רענון אוטומטי; כפתור דמה למניעת ReferenceError */ }}
                            className="px-3 py-2 text-sm rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            disabled={loading}
                        >
                            {loading ? "מרענן..." : "משימות מתעדכנות אוטומטית"}
                        </button>
                    </div>
                    
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                        <h2 className="font-semibold text-indigo-900 mb-2">איך זה עובד?</h2>
                        <ul className="text-sm text-indigo-800 space-y-1 list-disc list-inside">
                            <li>נרשמים פעם אחת לאירוע (דרך טופס ההרשמה)</li>
                            <li>מתחברים כאן עם אימייל+סיסמה שבחרתם, בוחרים משימות למתנדבים ומשריינים אותן</li>
                            <li>כל משימה כוללת תיאור ותאריך יעד (דד ליין)</li>
                            <li>ניתן לבחור מספר משימות ולעדכן סטטוס באזור האישי</li>
                        </ul>
                    </div>
                </div>

                {!isAuthed ? (
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">התחברות לאזור האישי</h3>
                        <p className="text-sm text-gray-600 mb-4">הזן אימייל וסיסמה שבחרת בהרשמת מתנדב כדי לראות ולנהל את המשימות שלך.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                                <input
                                    type="email"
                                    value={authEmail}
                                    onChange={(e) => setAuthEmail(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="you@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
                                <input
                                    type="password"
                                    value={authPassword}
                                    onChange={(e) => setAuthPassword(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="******"
                                />
                            </div>
                        </div>
                                {authError && <p className="text-sm text-red-600 mt-2">{authError}</p>}
                            <div className="flex items-center gap-3 mt-4">
                                <button
                                    onClick={() => handleAuth()}
                                    disabled={authing}
                                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-semibold disabled:opacity-70"
                            >
                                {authing ? "מתחבר..." : "כניסה לאזור האישי"}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">אם לא נרשמת לאירוע עדיין, יש להשלים הרשמה באירוע הרלוונטי ואז להתחבר כאן.</p>
                    </div>
                ) : matchedEventIds.size === 0 ? (
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center">
                        <AlertCircle className="mx-auto mb-4 text-gray-400" size={48} />
                        <h2 className="text-xl font-bold text-gray-900 mb-2">לא נמצאו אירועים לחשבון זה</h2>
                        <p className="text-gray-600">וודא/י שהשתמשת באימייל ובסיסמה של ההרשמה לאירוע.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {completedTasks.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-3">סיכום שעות מתנדב</h3>
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-sm text-gray-700">משימות שהושלמו: {completedTasks.length}</span>
                                    <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                                        סה\"כ שעות: {totalCompletedHours}
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-auto pr-1">
                                    {completedTasks.map(({ eventId, eventTitle, task }) => {
                                        return (
                                            <div key={`${eventId}-${task.id}`} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="font-semibold text-sm text-gray-900 truncate">{task.title}</p>
                                                    <span className="text-[11px] text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">הושלם</span>
                                                </div>
                                                <p className="text-xs text-gray-600 truncate">אירוע: {eventTitle || eventId}</p>
                                                {task.volunteerHours != null && (
                                                    <p className="text-xs text-gray-700 mt-1">שעות: {task.volunteerHours}</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {myTasks.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                                <h3 className="text-lg font-bold text-gray-900 mb-3">המשימות שלי</h3>
                                <p className="text-sm text-gray-600 mb-4">משימות שסימנת או הוקצתה אליך באירועים שלך.</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {myTasks.map(({ eventId, eventTitle, task }) => {
                                        const taskDate = task.dueDate ? new Date(task.dueDate) : null;
                                        return (
                                            <div key={`${eventId}-${task.id}`} className="border border-gray-200 rounded-lg p-4 bg-white">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="font-semibold text-sm text-gray-900 truncate">{task.title}</h4>
                                                    <span className="text-[11px] text-gray-600">{eventTitle || "אירוע"}</span>
                                                </div>
                                                {task.description && <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>}
                                                {taskDate && (
                                                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                                                        <Clock size={12} />
                                                        <span>דד ליין: {taskDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                                                    </div>
                                                )}
                                                {task.volunteerHours != null && (
                                                    <p className="text-xs text-gray-600 mb-1">משך משוער: {task.volunteerHours} שעות</p>
                                                )}
                                                <div className="flex items-center justify-between mt-2">
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={() => toggleTaskDone(eventId, task.id, task.status)}
                                                            className="flex items-center gap-1 text-sm font-semibold"
                                                        >
                                                            {task.status === "DONE" ? (
                                                                <CheckCircle2 className="text-emerald-600" size={18} />
                                                            ) : (
                                                                <Circle className="text-gray-400" size={18} />
                                                            )}
                                                            <span className="text-xs text-gray-700">
                                                                {task.status === "DONE" ? "הושלם" : "סמן כהושלם"}
                                                            </span>
                                                        </button>
                                                        <button
                                                            onClick={() => removeTaskSelection(eventId, task.id)}
                                                            className="text-xs text-red-600 hover:text-red-700 font-semibold"
                                                        >
                                                            שחרר משימה
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {events.map((event) => {
                            const eventTasks = tasksByEvent[event.id] || [];
                            const eventDate = event.startTime?.seconds ? new Date(event.startTime.seconds * 1000) : null;
                            const currentEmailLower = sessionIdentity.email;
                            const eventTasksAvailable = eventTasks.filter((t) => {
                                const assignedTo = (t.assignees || []).map((a) => (a.email || "").toLowerCase());
                                // If assigned to someone else (not me), hide from available list
                                return !assignedTo.length || assignedTo.includes(currentEmailLower);
                            });
                            const hasTasks = eventTasksAvailable.length > 0;
                            
                            if (!hasTasks) return null;
                            return (
                                <div key={event.id} className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                                    {/* Event Header */}
                                    <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white">
                                        <h2 className="text-2xl font-bold mb-3">{event.title}</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                            {event.location && (
                                                <div className="flex items-center gap-2">
                                                    <MapPin size={16} />
                                                    <span>{event.location}</span>
                                                </div>
                                            )}
                                            {eventDate && (
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={16} />
                                                    <span>
                                                        {eventDate.toLocaleDateString("he-IL", { 
                                                            weekday: "long", 
                                                            day: "2-digit", 
                                                            month: "long",
                                                            year: "numeric"
                                                        })} • {eventDate.toLocaleTimeString("he-IL", { 
                                                            hour: "2-digit", 
                                                            minute: "2-digit" 
                                                        })}
                                                    </span>
                                                </div>
                                            )}
                                            {event.volunteersCount && (
                                                <div className="flex items-center gap-2">
                                                    <Users size={16} />
                                                    <span>מקומות למתנדבים: {event.volunteersCount}</span>
                                                </div>
                                            )}
                                        </div>
                                        {event.description && (
                                            <p className="text-sm text-indigo-100 mt-3 leading-relaxed">{event.description}</p>
                                        )}
                                    </div>

                                    {/* Tasks Section */}
                                    <div className="p-6 space-y-4">
                                        {hasTasks ? (
                                            <>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <Target size={20} className="text-indigo-600" />
                                                        <h3 className="text-lg font-bold text-gray-900">משימות זמינות</h3>
                                                    </div>
                                                    {isAuthed ? (
                                                        <div className="flex items-center gap-2 text-sm text-gray-700">
                                                            <UserCheck size={16} className="text-emerald-600" />
                                                            <span>מחובר/ת</span>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => openAuth()}
                                                            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                        >
                                                            <Lock size={14} />
                                                            התחבר/י לבחור משימות
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
                                                    {eventTasksAvailable.map((task) => {
                                                        const taskDate = task.dueDate ? new Date(task.dueDate) : null;
                                                        const selectedSet = getSelectedForEvent(event.id);
                                                        const isSelected = selectedSet.has(task.id);
                                                        const alreadyAssigned = task.assignees?.some((a) => (a.email || "").toLowerCase() === sessionIdentity.email);
                                                        return (
                                                            <div
                                                                key={task.id}
                                                                className={`border rounded-lg p-4 transition ${isSelected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-200"}`}
                                                            >
                                                                <div className="flex items-start gap-2">
                                                                    <button
                                                                        disabled={!isAuthed}
                                                                        onClick={() => isAuthed && toggleTask(event.id, task.id)}
                                                                        className={`mt-0.5 ${isAuthed ? "cursor-pointer" : "cursor-not-allowed"}`}
                                                                    >
                                                                        {isSelected ? <CheckSquare className="text-indigo-600" size={18} /> : <Square className="text-gray-400" size={18} />}
                                                                    </button>
                                                                    <div className="flex-1 min-w-0">
                                                                        <h4 className="font-semibold text-sm text-gray-900 mb-1">{task.title}</h4>
                                                                        {task.description && (
                                                                            <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
                                                                        )}
                                                                        {taskDate && (
                                                                            <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                                                                                <Clock size={12} />
                                                                                <span>דד ליין: {taskDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                                                                            </div>
                                                                        )}
                                                                        {task.volunteerHours != null && task.volunteerHours !== undefined && (
                                                                            <div className="text-xs text-gray-600 mb-1">
                                                                                משך משוער: {task.volunteerHours} שעות
                                                                            </div>
                                                                        )}
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`text-xs px-2 py-0.5 rounded ${task.priority === "CRITICAL" ? "bg-red-100 text-red-700" : task.priority === "HIGH" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                                                                                {task.priority === "CRITICAL" ? "קריטי" : task.priority === "HIGH" ? "גבוה" : "רגיל"}
                                                                            </span>
                                                                            {alreadyAssigned && <span className="text-xs text-emerald-600">כבר מסומן עבורך</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-sm text-gray-600">
                                                        {!isAuthed && "התחבר/י כדי לבחור ולשמור משימות"}
                                                        {isAuthed && `נבחרו ${getSelectedForEvent(event.id).size} משימות`}
                                                    </div>
                                                        <div className="flex items-center gap-3">
                                                            {saveStatus[event.id] === "saved" && (
                                                                <span className="text-xs text-emerald-600">נשמר בהצלחה</span>
                                                            )}
                                                            {saveStatus[event.id] === "error" && (
                                                                <span className="text-xs text-red-600">שגיאה בשמירה</span>
                                                            )}
                                                            <button
                                                                onClick={() => saveSelection(event.id)}
                                                                disabled={!isAuthed || saveStatus[event.id] === "saving"}
                                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
                                                            >
                                                                {saveStatus[event.id] === "saving" ? "שומר..." : "שמור שריון משימות"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500 text-sm mb-6">
                                                    אין משימות זמינות כרגע לאירוע זה
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {authModalVisible && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Lock size={18} className="text-indigo-600" />
                            התחברות מתנדב
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">אימייל מתנדב</label>
                                <input
                                    type="email"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={authEmail}
                                    onChange={(e) => setAuthEmail(e.target.value)}
                                    placeholder="you@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
                                <input
                                    type="password"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={authPassword}
                                    onChange={(e) => setAuthPassword(e.target.value)}
                                    placeholder="******"
                                />
                            </div>
                            {authError && <p className="text-sm text-red-600">{authError}</p>}
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                                    onClick={() => setAuthModalVisible(false)}
                                    disabled={authing}
                                >
                                    ביטול
                                </button>
                                <button
                                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-70"
                                    onClick={handleAuth}
                                    disabled={authing}
                                >
                                    {authing ? "מתחבר..." : "התחברות"}
                                </button>
                            </div>
                            <p className="text-xs text-gray-500">
                                אין חשבון באירוע? יש לבצע הרשמה באירוע הרלוונטי ואז להתחבר כאן כדי לבחור משימות.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
