"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, type Firestore, setDoc, increment, getDocs, where } from "firebase/firestore";
import Link from "next/link";
import { ArrowRight, Calendar, Clock, User, AlertTriangle, CheckCircle, Circle, MessageCircle, Send, Handshake, Repeat } from "lucide-react";
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
    requiredCompletions?: number | null;
    remainingCompletions?: number | null;
    createdByName?: string;
    createdByPhone?: string;
    createdBy?: string | null;
    scope?: "event" | "project" | "manual" | "general";
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
    const isVolunteerView = viewSource === "volunteer";
    const hintedEventId = searchParams?.get("eventId") || null;
    const focusSection = searchParams?.get("focus");
    const assigneeSectionRef = useRef<HTMLDivElement | null>(null);

    const [task, setTask] = useState<Task | null>(null);
    const [loadingTask, setLoadingTask] = useState(true);
    const updateTimeouts = useRef<{ [key: string]: NodeJS.Timeout }>({});
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [error, setError] = useState("");
    const [eventTeam, setEventTeam] = useState<EventTeamMember[]>([]);
    const [eventNeedsVolunteers, setEventNeedsVolunteers] = useState(false);
    const [attachments, setAttachments] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);
    const [eventCreatorName, setEventCreatorName] = useState<string>("");
    const [creatorDisplayName, setCreatorDisplayName] = useState<string>("");
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [templateSaved, setTemplateSaved] = useState(false);
    const [eventStartTime, setEventStartTime] = useState<Date | null>(null);
    const [dueMode, setDueMode] = useState<"event_day" | "offset">("event_day");
    const [dueOffsetDays, setDueOffsetDays] = useState<string>("0");
    const [dueTime, setDueTime] = useState<string>("09:00");

    // Backfill creator contact details from the user profile (registration info)
    useEffect(() => {
        const creatorId = task?.createdBy;
        if (!db || !creatorId) return;
        const fetchCreator = async (database: Firestore, id: string) => {
            try {
                const snap = await getDoc(doc(database, "users", id));
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
        fetchCreator(db, creatorId);
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

    const normalizeTaskKey = (title: string) =>
        (title || "")
            .toLowerCase()
            .replace(/[^\w\sא-ת]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    const parseOffset = (raw: string) => {
        if (raw === "" || raw === "-") return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
    };

    const MIN_SEND_INTERVAL_MS = 5000;
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const [sendingTagAlerts, setSendingTagAlerts] = useState(false);
    const tagAlertsQueueRef = useRef<Assignee[]>([]);

    const normalizePhone = (value: string) => {
        const digits = (value || "").replace(/\D/g, "");
        if (!digits) return "";
        if (digits.startsWith("972")) return digits;
        if (digits.startsWith("0")) return `972${digits.slice(1)}`;
        return digits;
    };

    const getPublicBaseUrl = (preferred?: string) => {
        const cleanPreferred = (preferred || "").trim().replace(/\/$/, "");
        if (cleanPreferred) return cleanPreferred;
        const fromEnv = (process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
        if (fromEnv) return fromEnv;
        if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
        return "";
    };

    const ensureGlobalRateLimit = async () => {
        const ref = doc(db!, "rate_limits", "whatsapp_mentions");
        while (true) {
            const snap = await getDoc(ref);
            const last = snap.exists() ? (snap.data() as any).lastSendAt?.toMillis?.() || 0 : 0;
            const now = Date.now();
            const waitMs = last ? Math.max(0, MIN_SEND_INTERVAL_MS - (now - last)) : 0;
            if (waitMs > 0) {
                await sleep(waitMs);
            }
            try {
                await setDoc(ref, { lastSendAt: serverTimestamp() }, { merge: true });
                return;
            } catch (err) {
                await sleep(200);
            }
        }
    };

    const fetchWhatsappConfig = async () => {
        try {
            const ref = doc(db!, "integrations", "whatsapp");
            const snap = await getDoc(ref);
            if (!snap.exists()) return null;
            const data = snap.data() as any;
            if (!data.rules?.notifyOnMention) return null;
            if (!data.idInstance || !data.apiTokenInstance) return null;
            return {
                idInstance: data.idInstance as string,
                apiTokenInstance: data.apiTokenInstance as string,
                baseUrl: (data.baseUrl as string) || "",
            };
        } catch (err) {
            console.warn("שגיאה בקריאת הגדרות וואטסאפ", err);
            return null;
        }
    };

    const getUserPhone = async (assignee: Assignee) => {
        if ((assignee as any).phone) return (assignee as any).phone as string;
        if ((assignee as any).phoneNormalized) return (assignee as any).phoneNormalized as string;
        if (assignee.userId) {
            try {
                const snap = await getDoc(doc(db!, "users", assignee.userId));
                if (snap.exists()) {
                    const data = snap.data() as any;
                    if (data?.phone) return data.phone;
                    if (data?.fullName) return data.phone || "";
                }
            } catch { /* ignore */ }
        }
        if (assignee.email) {
            try {
                const qUsers = query(collection(db!, "users"), where("email", "==", assignee.email.toLowerCase()));
                const res = await getDocs(qUsers);
                const data = res.docs[0]?.data() as any;
                if (data?.phone) return data.phone;
            } catch { /* ignore */ }
        }
        return "";
    };

    const dedupeAssignees = (arr: Assignee[]) => {
        const seen = new Set<string>();
        return arr.filter((a) => {
            const key = `${a.userId || ""}|${(a.email || "").toLowerCase()}|${a.name || ""}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    const sendTagAlerts = async (assignees: Assignee[] = [], targetTask: Task) => {
        if (!db) return;
        if (assignees.length) {
            tagAlertsQueueRef.current = dedupeAssignees([...tagAlertsQueueRef.current, ...assignees]);
        } else if (!tagAlertsQueueRef.current.length) {
            return;
        }
        if (sendingTagAlerts) return;
        setSendingTagAlerts(true);
        try {
            const cfg = await fetchWhatsappConfig();
            if (!cfg) {
                tagAlertsQueueRef.current = [];
                return;
            }
            const endpoint = `https://api.green-api.com/waInstance${cfg.idInstance}/SendMessage/${cfg.apiTokenInstance}`;
            const origin = getPublicBaseUrl(cfg.baseUrl);
            const isVolunteerTask = targetTask.isVolunteerTask === true || targetTask.volunteerHours != null;
            const volunteerAreaLink = origin ? `${origin}/volunteers/events` : "";
            const taskLink = origin ? `${origin}/tasks/${targetTask.id}?eventId=${targetTask.eventId}` : "";
            const eventLink = origin ? `${origin}/events/${targetTask.eventId}` : "";
            const senderName = user?.displayName || user?.email || "משתמש";
            const due = targetTask.dueDate ? new Date(targetTask.dueDate).toLocaleDateString("he-IL") : "";

            while (tagAlertsQueueRef.current.length) {
                const assignee = tagAlertsQueueRef.current.shift()!;
                await ensureGlobalRateLimit();
                const phoneRaw = await getUserPhone(assignee);
                const phone = normalizePhone(phoneRaw);
                if (!phone) continue;
                const lines = [
                    `היי ${assignee.name || ""},`,
                    `תוייגת במשימה: "${targetTask.title}".`,
                    targetTask.eventTitle ? `אירוע: ${targetTask.eventTitle}` : "",
                    due ? `דדליין: ${due}` : "",
                    targetTask.priority ? `עדיפות: ${targetTask.priority}` : "",
                    targetTask.description ? `תיאור: ${targetTask.description}` : "",
                    isVolunteerTask
                        ? (volunteerAreaLink ? `האזור האישי למשימות שלך: ${volunteerAreaLink}` : "")
                        : [
                            taskLink ? `דף המשימה: ${taskLink}` : "",
                            eventLink ? `דף האירוע: ${eventLink}` : ""
                        ].filter(Boolean).join("\n"),
                    `התוייג ע\"י: ${senderName}`,
                ].filter(Boolean);
                const message = lines.join("\n");
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chatId: `${phone}@c.us`, message }),
                });
                if (!res.ok) {
                    console.warn("שליחת וואטסאפ נכשלה", assignee, await res.text());
                }
            }
        } catch (err) {
            console.warn("שגיאה בשליחת התראות תיוג", err);
        } finally {
            setSendingTagAlerts(false);
            if (tagAlertsQueueRef.current.length) {
                sendTagAlerts([], targetTask);
            }
        }
    };
    const pad = (n: number) => n.toString().padStart(2, "0");
    const formatDateTimeLocal = (date: Date) =>
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const extractTimeString = (date?: Date | null) => {
        if (!date) return "09:00";
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };
    const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000);
    const addDays = (date: Date, days: number) => {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    };
    const computeDueDateFromMode = (mode: "event_day" | "offset", offsetDays: number, timeStr: string, base?: Date | null) => {
        const anchor = base || eventStartTime || new Date();
        const [h, m] = (timeStr || "09:00").split(":").map(v => parseInt(v, 10) || 0);
        const dt = new Date(anchor);
        dt.setHours(h, m, 0, 0);
        dt.setDate(dt.getDate() + (Number.isFinite(offsetDays) ? offsetDays : 0));
        return formatDateTimeLocal(dt);
    };
    const deriveDueState = (dueDate?: string | null, base?: Date | null) => {
        const anchor = base || eventStartTime;
        const parsed = dueDate ? new Date(dueDate) : null;
        const validParsed = parsed && !isNaN(parsed.getTime()) ? parsed : null;
        const timeStr = extractTimeString(validParsed || anchor || new Date());
        if (!anchor || !validParsed) return { mode: "event_day" as const, offset: "0", time: timeStr };
        const msPerDay = 24 * 60 * 60 * 1000;
        const diff = Math.round((validParsed.getTime() - anchor.getTime()) / msPerDay);
        return { mode: diff === 0 ? "event_day" as const : "offset" as const, offset: diff.toString(), time: timeStr };
    };
    const inferSmartDueDate = (taskData: Task, eventStart: Date | null) => {
        const fallbackBase = new Date(Date.now() + 48 * 60 * 60 * 1000); // ברירת מחדל יומיים קדימה אם אין תאריך אירוע
        const baseDate = eventStart || fallbackBase;
        const text = `${taskData.title || ""} ${taskData.description || ""}`.toLowerCase();
        const contains = (phrases: string[]) => phrases.some(p => text.includes(p));
        let candidate: Date = new Date(baseDate);

        if (contains(["פרסום", "קידום", "שיווק", "פוסט", "מודעה", "קמפיין", "ניוזלטר", "דיוור", "הזמנה", "שיתוף", "social", "marketing"])) {
            candidate = addDays(baseDate, -5);
            candidate.setHours(12, 0, 0, 0);
        } else if (contains(["מתנדב", "מתנדבים", "גיוס", "שיבוץ", "חונך"])) {
            candidate = addDays(baseDate, -3);
            candidate.setHours(11, 0, 0, 0);
        } else if (contains(["סאונד", "תאורה", "במה", "ציוד", "הקמה", "לוגיסט", "setup", "בדיקה", "חזרה", "rehearsal", "טסט", "בר", "bar", "drink"])) {
            candidate = addHours(baseDate, -6);
        } else if (contains(["תזכורת", "תזכיר", "reminder", "sms", "וואטסאפ", "whatsapp", "הודעה"])) {
            candidate = addHours(baseDate, -4);
        } else if (contains(["חשבונית", "תשלום", "קבלה", "invoice", "billing", "התחשבנות"])) {
            candidate = addDays(baseDate, 2);
            candidate.setHours(10, 0, 0, 0);
        } else if (contains(["סיכום", "סיכומים", "תודה", "פולואפ", "דוח", "דו\"ח", "report", "feedback", "משוב"])) {
            candidate = addDays(baseDate, 1);
            candidate.setHours(9, 30, 0, 0);
        } else {
            candidate = new Date(baseDate);
        }

        const now = new Date();
        if (!candidate || Number.isNaN(candidate.getTime())) {
            return formatDateTimeLocal(baseDate);
        }
        if (candidate.getTime() < now.getTime()) {
            candidate = addHours(now, 2);
        }
        return formatDateTimeLocal(candidate);
    };
    const fetchTaskFilesForLibrary = async (eventId?: string, taskId?: string): Promise<{ name?: string; url?: string; storagePath?: string; originalName?: string }[]> => {
        if (!db || !eventId || !taskId) return [];
        const paths: Array<["events" | "projects", string, "tasks", string, "files"]> = [
            ["events", eventId, "tasks", taskId, "files"],
            ["projects", eventId, "tasks", taskId, "files"],
        ];
        for (const path of paths) {
            try {
                const snap = await getDocs(collection(db, ...path));
                if (!snap.empty) {
                    return snap.docs.map(d => {
                        const data = d.data() as any;
                        return {
                            name: data.name || data.originalName || "",
                            originalName: data.originalName || data.name || "",
                            url: data.url || "",
                            storagePath: data.storagePath || "",
                        };
                    });
                }
            } catch (err) {
                console.warn("Failed loading task files for library", err);
            }
        }
        return [];
    };

    const saveTaskTemplate = async () => {
        if (!db || !task) return;
        const key = normalizeTaskKey(task.title);
        if (!key) {
            alert("שם המשימה לא תקין לשמירה במאגר המשימות החוזרות");
            return;
        }
        const filesForTemplate = await fetchTaskFilesForLibrary(task.eventId, task.id);
        const templateData = {
            title: task.title.trim(),
            description: task.description || "",
            priority: task.priority || "NORMAL",
            dueDate: task.dueDate || "",
            assignees: task.assignees || [],
            isVolunteerTask: !!task.isVolunteerTask,
            volunteerHours: task.isVolunteerTask ? (task.volunteerHours ?? null) : null,
            files: filesForTemplate,
        };
        setSavingTemplate(true);
        try {
            await Promise.all([
                setDoc(doc(db, "repeat_tasks", key), {
                    key,
                    title: task.title.trim(),
                    description: task.description || "",
                    priority: task.priority || "NORMAL",
                    template: templateData,
                    createdBy: task.createdBy || user?.uid || "",
                    createdByEmail: user?.email || "",
                    createdByName: user?.displayName || user?.email || "",
                    count: increment(1),
                    lastUsedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp(),
                }, { merge: true }),
                setDoc(doc(db, "default_tasks", key), {
                    title: task.title.trim(),
                    description: task.description || "",
                    priority: task.priority || "NORMAL",
                    template: templateData,
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp(),
                }, { merge: true })
            ]);
            setTemplateSaved(true);
            alert("המשימה נשמרה במאגר המשימות החוזרות והקבועות");
        } catch (err) {
            console.error("Failed saving task template", err);
            alert("שגיאה בשמירת המשימה למאגר");
        } finally {
            setSavingTemplate(false);
        }
    };

    // We need to find the eventId for this task since tasks are subcollections of events.
    // In a real app, we might pass eventId in query params or have a global tasks index.
    // For this implementation, we'll try to find it by querying all events (not efficient but works for small scale)
    // OR better: we update the TaskCard to pass eventId in the URL query param? 
    // Actually, let's assume we can fetch it if we know the path. 
    // Since we don't know the eventId from the URL /tasks/[id], we have a problem.
    // SOLUTION: We will use a Collection Group Query to find the task by ID.

    useEffect(() => {
        // אם הגיע מהאיזור האישי של מתנדבים, מאפשרים תצוגה גם ללא התחברות מנהל
        if (!loading && !user && !isVolunteerView) {
            router.push("/login");
        }
    }, [user, loading, router, isVolunteerView]);

    useEffect(() => {
        const fetchCreatorName = async () => {
            if (!db || !task) return;
            const creatorId = (task as any).createdBy || (task as any).ownerId;
            if (!creatorId) return;
            try {
                const snap = await getDoc(doc(db, "users", creatorId));
                if (snap.exists()) {
                    const d = snap.data() as any;
                    const name = d.fullName || d.name || d.displayName || d.email || "";
                    if (name) {
                        setCreatorDisplayName(name);
                        setEventCreatorName(name);
                    }
                }
            } catch (err) {
                console.warn("failed to load creator name", err);
            }
        };
        fetchCreatorName();
    }, [db, task]);

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
                    const taskData = taskSnap.data() as any;
                    const required = taskData.requiredCompletions != null ? Math.max(1, Number(taskData.requiredCompletions)) : 1;
                    const remainingRaw = taskData.remainingCompletions != null ? Number(taskData.remainingCompletions) : required;
                    const remaining = Math.max(0, Math.min(required, remainingRaw));
                    let status: Task["status"] = taskData.status || "TODO";
                    if (status === "DONE" && required > 1 && remaining > 0) {
                        status = "IN_PROGRESS";
                    }
                    const start = (eventData as any)?.startTime;
                    return {
                        task: {
                            id: taskSnap.id,
                            ...taskData,
                            status,
                            requiredCompletions: required,
                            remainingCompletions: remaining,
                            assignee: taskData.assignee || normalizeAssignees(taskData)[0]?.name || "",
                            assignees: normalizeAssignees(taskData),
                            createdByName: (taskData as any).createdByName || (taskData as any).createdBy || "",
                            createdByPhone: (taskData as any).createdByPhone || (taskData as any).creatorPhone || "",
                            createdBy: (taskData as any).createdBy || null,
                            eventId,
                            scope: "event"
                        } as Task,
                        eventTitle: (eventData as any).title,
                        eventStart: start,
                        eventTeam: ((eventData as any).team as EventTeamMember[]) || [],
                        eventNeedsVolunteers: !!(eventData as any).needsVolunteers,
                        creatorName:
                            (eventData as any).createdByName ||
                            (eventData as any).ownerName ||
                            (eventData as any).creatorName ||
                            (eventData as any).createdByEmail ||
                            "",
                    };
                };

                const fetchByProjectId = async (projectId: string) => {
                    if (!db) return null;
                    const taskRef = doc(db, "projects", projectId, "tasks", taskId);
                    const taskSnap = await getDoc(taskRef);
                    if (!taskSnap.exists()) return null;
                    const projectDoc = await getDoc(doc(db, "projects", projectId));
                    if (!projectDoc.exists()) return null;
                    const projectData = projectDoc.data();
                    const taskData = taskSnap.data() as any;
                    const required = taskData.requiredCompletions != null ? Math.max(1, Number(taskData.requiredCompletions)) : 1;
                    const remainingRaw = taskData.remainingCompletions != null ? Number(taskData.remainingCompletions) : required;
                    const remaining = Math.max(0, Math.min(required, remainingRaw));
                    let status: Task["status"] = taskData.status || "TODO";
                    if (status === "DONE" && required > 1 && remaining > 0) {
                        status = "IN_PROGRESS";
                    }

                    // Fetch all users for project tasks so we can tag anyone
                    let allUsers: EventTeamMember[] = [];
                    try {
                        const usersSnap = await getDocs(collection(db, "users"));
                        allUsers = usersSnap.docs.map(u => {
                            const d = u.data();
                            return {
                                userId: u.id,
                                name: d.fullName || d.name || d.displayName || d.email || "Unknown",
                                email: d.email,
                                role: "member"
                            };
                        });
                    } catch (e) {
                        console.error("Error fetching users for project task:", e);
                        // Fallback to project team members if fetching users fails
                        allUsers = ((projectData as any).teamMembers as EventTeamMember[]) || [];
                    }

                    return {
                        task: {
                            id: taskSnap.id,
                            ...taskData,
                            status,
                            requiredCompletions: required,
                            remainingCompletions: remaining,
                            assignee: taskData.assignee || normalizeAssignees(taskData)[0]?.name || "",
                            assignees: normalizeAssignees(taskData),
                            createdByName: (taskData as any).createdByName || (taskData as any).createdBy || "",
                            createdByPhone: (taskData as any).createdByPhone || (taskData as any).creatorPhone || "",
                            createdBy: (taskData as any).createdBy || null,
                            eventId: projectId,
                            scope: "project"
                        } as Task,
                        eventTitle: (projectData as any).name || (projectData as any).title || "פרויקט",
                        eventStart: (projectData as any)?.startTime || null,
                        eventTeam: allUsers,
                        eventNeedsVolunteers: false,
                        creatorName:
                            (projectData as any).ownerName ||
                            (projectData as any).createdByName ||
                            (projectData as any).ownerEmail ||
                            "",
                    };
                };

                let foundTask: Task | null = null;
                let foundEventId = "";
                let foundEventTitle = "";
                let foundEventStart: any = null;
                let foundCreatorName = "";
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
                        foundEventStart = (res as any).eventStart || null;
                        foundCreatorName = (res as any).creatorName || "";
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
                            foundEventStart = (res as any).eventStart || null;
                            foundCreatorName = (res as any).creatorName || "";
                            foundEventNeedsVolunteers = res.eventNeedsVolunteers;
                            break;
                        }
                    }
                }

                // Fallback: iterate projects (for project-level tasks)
                if (!foundTask) {
                    const { collection, getDocs } = await import("firebase/firestore");
                    const projectsRef = collection(db, "projects");
                    const projectsSnap = await getDocs(projectsRef);
                    for (const projDoc of projectsSnap.docs) {
                        const res = await fetchByProjectId(projDoc.id);
                        if (res) {
                            foundTask = res.task;
                            foundEventId = projDoc.id;
                            foundEventTitle = res.eventTitle;
                            foundEventTeam = res.eventTeam;
                            foundEventStart = (res as any).eventStart || null;
                            foundCreatorName = (res as any).creatorName || "";
                            foundEventNeedsVolunteers = res.eventNeedsVolunteers;
                            break;
                        }
                    }
                }

                if (foundTask) {
                    setTask({ ...foundTask, eventTitle: foundEventTitle });
                    setEventTeam(foundEventTeam);
                    setEventCreatorName(foundCreatorName || foundTask.createdByName || "");
                    setCreatorDisplayName(foundCreatorName || foundTask.createdByName || "");
                    setEventNeedsVolunteers(foundEventNeedsVolunteers);
                    if (foundEventStart?.seconds) {
                        setEventStartTime(new Date(foundEventStart.seconds * 1000));
                    } else if (foundEventStart) {
                        const d = new Date(foundEventStart);
                        if (!isNaN(d.getTime())) setEventStartTime(d);
                    }
                    const startDate = foundEventStart?.seconds ? new Date(foundEventStart.seconds * 1000) : (foundEventStart ? new Date(foundEventStart) : null);
                    const inferredDue = !foundTask.dueDate ? inferSmartDueDate(foundTask, startDate) : null;
                    const effectiveDue = foundTask.dueDate || inferredDue || "";
                    const meta = deriveDueState(effectiveDue, startDate);
                    setDueMode(meta.mode);
                    setDueOffsetDays(meta.offset);
                    setDueTime(meta.time);
                    if (inferredDue) {
                        setTask(prev => prev ? { ...prev, dueDate: inferredDue } : prev);
                        handleUpdateField("dueDate", inferredDue);
                    } else if (!foundTask.dueDate && effectiveDue) {
                        setTask(prev => prev ? { ...prev, dueDate: effectiveDue } : prev);
                        handleUpdateField("dueDate", effectiveDue);
                    }

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
                            const creatorName =
                                (data as any).createdByName ||
                                (data as any).ownerName ||
                                (data as any).creatorName ||
                                (data as any).createdByEmail ||
                                "";
                            setEventCreatorName(creatorName || "");
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
            const collectionName = task.scope === "project" ? "projects" : "events";
            const required = task.requiredCompletions != null ? Math.max(1, Number(task.requiredCompletions)) : 1;
            const remaining = task.remainingCompletions != null ? Math.max(0, Number(task.remainingCompletions)) : required;
            if (newStatus === "DONE" && required > 1) {
                const nextRemaining = task.isVolunteerTask ? remaining : Math.max(remaining - 1, 0);
                const nextStatus = nextRemaining > 0 ? "IN_PROGRESS" : "DONE";
                const updateData: any = { status: nextStatus };
                if (!task.isVolunteerTask) {
                    updateData.remainingCompletions = nextRemaining;
                }
                await updateDoc(doc(db, collectionName, task.eventId, "tasks", task.id), updateData);
                setTask(prev => prev ? {
                    ...prev,
                    status: nextStatus,
                    ...(task.isVolunteerTask ? {} : { remainingCompletions: nextRemaining }),
                } : prev);
                return;
            }
            await updateDoc(doc(db, collectionName, task.eventId, "tasks", task.id), { status: newStatus });
            setTask(prev => {
                if (!prev) return null;
                return { ...prev, status: newStatus as Task["status"] };
            });
        } catch (err) {
            console.error("Error updating status:", err);
        }
    };

    const handleUpdateField = async (field: string, value: string | boolean | number | null) => {
        if (!db || !task) return;
        try {
            const collectionName = task.scope === "project" ? "projects" : "events";
            const taskRef = doc(db, collectionName, task.eventId, "tasks", task.id);
            // Check if document exists before updating
            const taskSnap = await getDoc(taskRef);
            if (!taskSnap.exists()) {
                console.error(`Task document not found: ${task.id}`);
                alert("המשימה לא נמצאה במערכת. ייתכן שהיא נמחקה.");
                const redirectPath = task.scope === "project" ? `/projects/${task.eventId}` : `/events/${task.eventId}`;
                router.push(redirectPath);
                return;
            }

            await updateDoc(taskRef, {
                [field]: value
            });
            // Update local state
            setTask(prev => prev ? { ...prev, [field]: value } : prev);
        } catch (err: any) {
            console.error(`Error updating ${field}:`, err);
            // Only show alert for non-existence errors (other errors are logged but silent)
            if (err?.code === 'not-found') {
                alert("המשימה לא נמצאה במערכת. ייתכן שהיא נמחקה.");
                const redirectPath = task.scope === "project" ? `/projects/${task.eventId}` : `/events/${task.eventId}`;
                router.push(redirectPath);
            }
        }
    };

    const handleDebouncedUpdate = (field: string, value: string) => {
        if (!task) return;

        // 1. Update local state immediately for responsive UI
        setTask(prev => prev ? { ...prev, [field]: value } : prev);

        // 2. Clear existing timeout
        if (updateTimeouts.current[field]) {
            clearTimeout(updateTimeouts.current[field]);
        }

        // 3. Set new timeout for DB update
        updateTimeouts.current[field] = setTimeout(async () => {
            if (!db || !task) return;
            try {
                const collectionName = task.scope === "project" ? "projects" : "events";
                await updateDoc(doc(db, collectionName, task.eventId, "tasks", task.id), {
                    [field]: value
                });
            } catch (err) {
                console.error(`Error updating ${field}:`, err);
            }
            delete updateTimeouts.current[field];
        }, 1000); // 1 second delay
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

    const updateAssignees = async (nextAssignees: Assignee[], newlyAdded: Assignee[] = []) => {
        if (!db || !task) return;
        const cleaned = sanitizeAssigneesForWrite(nextAssignees);
        const primary = cleaned[0];
        try {
            const collectionName = task.scope === "project" ? "projects" : "events";
            await updateDoc(doc(db, collectionName, task.eventId, "tasks", task.id), {
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
            if (newlyAdded.length) {
                const nextTask: Task = {
                    ...task,
                    assignees: cleaned,
                    assignee: primary?.name || "",
                    assigneeId: primary?.userId || "",
                };
                sendTagAlerts(newlyAdded, nextTask).catch(() => { /* logged internally */ });
            }
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
        const added = exists ? [] : [{ name: member.name, userId: member.userId, email: member.email }];
        await updateAssignees(next, added);
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
            const collectionName = task.scope === "project" ? "projects" : "events";
            await addDoc(collection(db, collectionName, task.eventId, "tasks", task.id, "messages"), {
                text: newMessage,
                senderId: user.uid,
                senderUid: user.uid,
                senderName: user.displayName || user.email?.split('@')[0] || "Unknown",
                createdAt: serverTimestamp(),
                timestamp: serverTimestamp(), // legacy field
            });

            // Update task last message info
            await updateDoc(doc(db, collectionName, task.eventId, "tasks", task.id), {
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
    const whatsappMessage = encodeURIComponent(`היי ${creatorDisplayName || eventCreatorName || task.createdByName || ""}, יש לי שאלה לגבי המשימה "${task.title}"`);
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
                            חזרה לאזור האישי של המתנדב
                        </button>
                    ) : (
                        <Link
                            href={task ? (task.scope === "project" ? `/projects/${task.eventId}` : `/events/${task.eventId}`) : "/"}
                            className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition w-fit"
                        >
                            <ArrowRight size={20} />
                            {task?.scope === "project" ? "חזרה לדף הפרויקט" : "חזרה לדף האירוע"}
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
                                    onChange={(e) => handleDebouncedUpdate('description', e.target.value)}
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
                                        onChange={(e) => handleDebouncedUpdate('currentStatus', e.target.value)}
                                        placeholder="עדכן סטטוס נוכחי..."
                                    />
                                </div>
                                <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                                    <label className="block text-xs font-bold text-orange-800 mb-2">➡️ הצעד הבא</label>
                                    <textarea
                                        className="w-full bg-white p-2 rounded border border-orange-200 text-sm focus:outline-none focus:border-orange-400"
                                        rows={2}
                                        value={task.nextStep || ""}
                                        onChange={(e) => handleDebouncedUpdate('nextStep', e.target.value)}
                                        placeholder="מה הצעד הבא..."
                                    />
                                </div>
                            </div>
                            {!isVolunteerView && eventNeedsVolunteers && (
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
                            {!isVolunteerView && (
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg mb-4">
                                    <div className="flex items-center gap-2">
                                        <Repeat size={18} className="text-indigo-600" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-indigo-800">סמן כמשימה שחוזרת על עצמה</span>
                                            <span className="text-[11px] text-indigo-700">תשמר במאגר המשימות הקבועות והחוזרות</span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={saveTaskTemplate}
                                        disabled={savingTemplate}
                                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${templateSaved ? "bg-green-600 text-white border-green-600" : "bg-white text-indigo-700 border-indigo-200"} disabled:opacity-60`}
                                    >
                                        {savingTemplate ? "שומר..." : templateSaved ? "נשמר" : "הוסף למאגר"}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Chat Section */}
                        {!isVolunteerView && (
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
                        )}

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
                                    accept="*/*"
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
                        {isVolunteerView ? (
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="font-semibold text-gray-900 mb-4">פרטים נוספים</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                            נוצר ע"י
                                        </label>
                                        <div className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 flex items-center justify-between gap-2">
                                            <span>{eventCreatorName || task.createdByName || "לא צויין"}</span>
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
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                    <h3 className="font-semibold text-gray-900 mb-4">פרטים נוספים</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                                                נוצר ע"י
                                            </label>
                                            <div className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 flex items-center justify-between gap-2">
                                                <span>{eventCreatorName || task.createdByName || "לא צויין"}</span>
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
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap gap-3 text-xs">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            className="accent-indigo-600"
                                                            checked={dueMode === "event_day"}
                                                            onChange={() => {
                                                                const nextTime = dueTime || extractTimeString(eventStartTime || new Date());
                                                                const dueVal = computeDueDateFromMode("event_day", 0, nextTime);
                                                                setDueMode("event_day");
                                                                setDueOffsetDays("0");
                                                                setDueTime(nextTime);
                                                                handleUpdateField("dueDate", dueVal);
                                                            }}
                                                        />
                                                        ביום האירוע
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            className="accent-indigo-600"
                                                            checked={dueMode === "offset"}
                                                            onChange={() => {
                                                                const nextTime = dueTime || extractTimeString(eventStartTime || new Date());
                                                                setDueMode("offset");
                                                                const dueVal = computeDueDateFromMode("offset", parseOffset(dueOffsetDays) ?? 0, nextTime);
                                                                handleUpdateField("dueDate", dueVal);
                                                            }}
                                                        />
                                                        ימים ביחס לאירוע
                                                    </label>
                                                </div>
                                                {dueMode === "offset" && (
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <span>ימים מהאירוע:</span>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            className="w-24 p-2 border border-gray-200 rounded-lg text-sm"
                                                            value={dueOffsetDays}
                                                            onChange={(e) => {
                                                                const raw = e.target.value;
                                                                setDueOffsetDays(raw);
                                                                const parsed = parseOffset(raw);
                                                                if (parsed === null) return;
                                                                const nextTime = dueTime || extractTimeString(eventStartTime || new Date());
                                                                const dueVal = computeDueDateFromMode("offset", parsed, nextTime);
                                                                handleUpdateField("dueDate", dueVal);
                                                            }}
                                                        />
                                                        <span className="text-gray-500">(שלילי = לפני, חיובי = אחרי)</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span>שעה:</span>
                                                    <input
                                                        type="time"
                                                        className="p-2 border border-gray-200 rounded-lg text-sm"
                                                        value={dueTime}
                                                        onChange={(e) => {
                                                            const nextTime = e.target.value || extractTimeString(eventStartTime || new Date());
                                                            setDueTime(nextTime);
                                                            const dueVal = computeDueDateFromMode(dueMode, parseOffset(dueOffsetDays) ?? 0, nextTime);
                                                            handleUpdateField("dueDate", dueVal);
                                                        }}
                                                    />
                                                </div>
                                                <div className="text-xs text-gray-600">
                                                    {task.dueDate
                                                        ? `המשימה מתוזמנת ל-${new Date(task.dueDate).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}`
                                                        : "לא נקבע מועד למשימה"}
                                                    {!eventStartTime && (
                                                        <div className="text-red-500 mt-1">לא נמצא תאריך אירוע, חישוב המועד הוא ביחס להיום.</div>
                                                    )}
                                                </div>
                                            </div>
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
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
