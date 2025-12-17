"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import TaskCard from "@/components/TaskCard";
import { Plus, MapPin, Calendar, ArrowRight, UserPlus, Save, Trash2, X, AlertTriangle, Users, Target, Handshake, DollarSign, FileText, CheckSquare, Square, Edit2, Share2, Check, Sparkles, MessageCircle, User, Clock, List, Paperclip, ChevronDown, Copy, Repeat, PauseCircle } from "lucide-react";
import { useEffect, useState, useRef, useMemo } from "react";
import { db, storage } from "@/lib/firebase";
import { DEFAULT_INSTAGRAM_TAGS } from "@/lib/instagram";
import { doc, getDoc, collection, addDoc, serverTimestamp, onSnapshot, updateDoc, arrayUnion, query, orderBy, deleteDoc, writeBatch, getDocs, increment, setDoc, where, collectionGroup } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import TaskChat from "@/components/TaskChat";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import PartnersInput from "@/components/PartnersInput";

const computeNextOccurrence = (
    baseDate: Date,
    recurrence: "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY",
    recurrenceEnd?: Date | null
) => {
    if (!(baseDate instanceof Date) || isNaN(baseDate.getTime())) return baseDate;
    if (recurrence === "NONE") return baseDate;
    const now = Date.now();
    let candidate = new Date(baseDate);
    let guard = 0;
    const addInterval = () => {
        if (recurrence === "WEEKLY") candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000);
        else if (recurrence === "BIWEEKLY") candidate = new Date(candidate.getTime() + 14 * 24 * 60 * 60 * 1000);
        else if (recurrence === "MONTHLY") {
            const next = new Date(candidate);
            next.setMonth(next.getMonth() + 1);
            candidate = next;
        }
    };
    while (candidate.getTime() < now && guard < 200) {
        addInterval();
        guard += 1;
    }
    if (recurrenceEnd && recurrenceEnd.getTime && recurrenceEnd.getTime() > 0) {
        const endTs = recurrenceEnd.getTime();
        if (candidate.getTime() > endTs) {
            if (endTs >= now) candidate = new Date(endTs);
        }
    }
    return candidate;
};

interface Assignee {
    name: string;
    userId?: string;
    email?: string;
    phone?: string;
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
    lastMessageTime?: any;
    lastMessageBy?: string;
    readBy?: { [key: string]: any };
    previewImage?: string;
    isVolunteerTask?: boolean;
    volunteerHours?: number | null;
    createdByName?: string;
    scope?: "event" | "project";
    specialType?: string;
    eventTitle?: string;
    eventId?: string;
    requiredCompletions?: number | null;
    remainingCompletions?: number | null;
}

interface BudgetItem {
    id: string;
    item: string;
    amount: number;
    invoiceSubmitted: boolean;
}

interface CustomSection {
    id?: string;
    title: string;
    content: string;
}

interface InfoBlock {
    id: string;
    label: string;
    value: string;
}

interface ImportantDoc {
    id: string;
    title: string;
    fileUrl?: string;
    fileName?: string;
}

interface EventFileThumb {
    id: string;
    name: string;
    url?: string;
    taskTitle?: string;
}

interface EventVolunteer {
    id: string;
    name?: string;
    phone?: string;
    email?: string;
    createdAt?: any;
}

const dedupeById = <T extends { id?: string }>(arr: T[]): T[] => {
    const seen = new Set<string>();
    return arr.filter(item => {
        const key = item.id || "";
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

interface JoinRequest {
    id: string;
    eventId: string;
    requesterId: string;
    requesterName?: string;
    requesterEmail?: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
}

interface EventData {
    title: string;
    location: string;
    startTime: any;
    endTime: any;
    dates?: any[];
    description: string;
    status: string;
    team: { name: string; role: string; email?: string; userId?: string }[];
    members?: string[];
    createdBy?: string;
    createdByEmail?: string;
    creatorName?: string;
    participantsCount?: string;
    partners?: string | string[];
    goal?: string;
    budget?: string;
    durationHours?: number;
    recurrence?: "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
    recurrenceEndDate?: any;
    needsVolunteers?: boolean;
    volunteersCount?: number | null;
    volunteerTasksPaused?: boolean;
    teamTasksPaused?: boolean;
    contactPerson?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    projectId?: string | null;
    projectName?: string | null;
    customSections?: CustomSection[];
    infoBlocks?: InfoBlock[];
    officialInstagramTags?: string[];
}

interface ProjectOption {
    id: string;
    name: string;
}

export default function EventDetailsPage() {
    const params = useParams();
    const id = params.id as string;
    const { user } = useAuth();
    const router = useRouter();

    const [event, setEvent] = useState<EventData | null>(null);
    const isOwner = !!(event?.createdBy && user?.uid === event.createdBy);
    const canManageTeam = isOwner
        || !event?.createdBy
        || !!event?.team?.some(m =>
            (m.userId && m.userId === user?.uid) ||
            (m.email && user?.email && m.email.toLowerCase() === user.email.toLowerCase())
        );
    const [tasks, setTasks] = useState<Task[]>([]);
    const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const [copiedRegister, setCopiedRegister] = useState(false);
    const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>("");
    const [linkingProject, setLinkingProject] = useState(false);
    const isProjectLinker = (user?.email || "").toLowerCase() === "bengo0469@gmail.com";

    // Suggestions State
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [libraryTasks, setLibraryTasks] = useState<{ id: string; title: string; description?: string; priority?: "NORMAL" | "HIGH" | "CRITICAL"; template?: any }[]>([]);
    const [loadingLibraryTasks, setLoadingLibraryTasks] = useState(false);
    const [libraryForm, setLibraryForm] = useState<{ id?: string; title: string; description: string; priority: "NORMAL" | "HIGH" | "CRITICAL" }>({
        id: "",
        title: "",
        description: "",
        priority: "NORMAL"
    });
    const [savingLibraryTask, setSavingLibraryTask] = useState(false);
    const [deletingLibraryTaskId, setDeletingLibraryTaskId] = useState<string | null>(null);

    // New Task State
    const [showNewTask, setShowNewTask] = useState(false);
    const [newTask, setNewTask] = useState({
        title: "",
        description: "",
        assignee: "",
        assigneeId: "",
        assignees: [] as Assignee[],
        dueDate: "",
        priority: "NORMAL",
        isVolunteerTask: false,
        volunteerHours: null as number | null,
        requiredCompletions: 1,
    });
    const [saveNewTaskToLibrary, setSaveNewTaskToLibrary] = useState(false);
    const newTaskFileInputRef = useRef<HTMLInputElement | null>(null);
    const [newTaskFiles, setNewTaskFiles] = useState<File[]>([]);
    const normalizeTaskKey = (title: string) =>
        (title || "")
            .toLowerCase()
            .replace(/[^\w\sא-ת]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    const loadTaskFilesForLibrary = async (taskId: string): Promise<{ name?: string; url?: string; storagePath?: string; originalName?: string }[]> => {
        if (!db) return [];
        try {
            const snap = await getDocs(collection(db, "events", id, "tasks", taskId, "files"));
            return snap.docs.map(d => {
                const data = d.data() as any;
                return {
                    name: data.name || data.originalName || "",
                    originalName: data.originalName || data.name || "",
                    url: data.url || "",
                    storagePath: data.storagePath || "",
                };
            });
        } catch (err) {
            console.warn("Failed loading task files for library", err);
            return [];
        }
    };
    const saveTaskToRepeatLibrary = async (task: {
        title: string;
        description?: string;
        priority?: string;
        dueDate?: string;
        assignees?: Assignee[];
        isVolunteerTask?: boolean;
        volunteerHours?: number | null;
        files?: { name?: string; url?: string; storagePath?: string; originalName?: string }[];
    }) => {
        if (!db || !task.title) {
            alert("צריך שם משימה כדי להוסיף למאגר המשימות החוזרות");
            return;
        }
        const key = normalizeTaskKey(task.title);
        if (!key) {
            alert("שם המשימה לא תקין לשמירה במאגר");
            return;
        }
        try {
            const templateData = {
                title: task.title.trim(),
                description: task.description || "",
                priority: task.priority || "NORMAL",
                dueDate: task.dueDate || "",
                assignees: task.assignees || [],
                isVolunteerTask: !!task.isVolunteerTask,
                volunteerHours: task.isVolunteerTask ? (task.volunteerHours ?? null) : null,
                files: task.files || [],
            };
            await setDoc(doc(db, "repeat_tasks", key), {
                key,
                title: task.title.trim(),
                description: task.description || "",
                priority: task.priority || "NORMAL",
                template: templateData,
                files: task.files || [],
                createdBy: user?.uid || "",
                createdByEmail: user?.email || "",
                createdByName: user?.displayName || user?.email || "",
                count: increment(1),
                lastUsedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
            }, { merge: true });
            await setDoc(doc(db, "default_tasks", key), {
                title: task.title.trim(),
                description: task.description || "",
                priority: (task.priority as any) || "NORMAL",
                template: templateData,
                files: task.files || [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }, { merge: true });
            alert("המשימה נשמרה במאגר המשימות החוזרות");
        } catch (err) {
            console.error("Failed saving task to repeat library", err);
            alert("שגיאה בשמירת המשימה למאגר");
        }
    };

    // Edit Task State
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [editingStatusTask, setEditingStatusTask] = useState<Task | null>(null);
    const [editingDateTask, setEditingDateTask] = useState<Task | null>(null);
    const [saveEditTaskToLibrary, setSaveEditTaskToLibrary] = useState(false);
    const [taggingTask, setTaggingTask] = useState<Task | null>(null);
    const [tagSelection, setTagSelection] = useState<Assignee[]>([]);
    const [tagSearch, setTagSearch] = useState("");
    const [newTaskSearch, setNewTaskSearch] = useState("");
    const [editTaskSearch, setEditTaskSearch] = useState("");
    const [sendingTagAlerts, setSendingTagAlerts] = useState(false);
    const tagAlertsQueueRef = useRef<Assignee[]>([]);
    const [newTaskDueMode, setNewTaskDueMode] = useState<"event_day" | "offset">("event_day");
    const [newTaskOffsetDays, setNewTaskOffsetDays] = useState<string>("0");
    const [newTaskTime, setNewTaskTime] = useState<string>("");
    const [editTaskDueMode, setEditTaskDueMode] = useState<"event_day" | "offset">("event_day");
    const [editTaskOffsetDays, setEditTaskOffsetDays] = useState<string>("0");
    const [editTaskTime, setEditTaskTime] = useState<string>("");

    const getAssigneeKey = (assignee?: Assignee | null) => {
        if (!assignee) return "";
        if (assignee.email && assignee.email.trim()) return assignee.email.trim().toLowerCase();
        if (assignee.userId) return String(assignee.userId);
        if (assignee.name) return assignee.name.trim().toLowerCase();
        return "";
    };

    const openWhatsApp = (phone?: string) => {
        if (!phone) return;
        const digits = phone.replace(/\D/g, "");
        if (!digits) return;
        let normalized = digits;
        if (normalized.startsWith("972")) {
            // already includes country code
        } else if (normalized.startsWith("0")) {
            normalized = "972" + normalized.slice(1);
        } else if (normalized.length === 9) {
            normalized = "972" + normalized;
        }
        window.open(`https://wa.me/${normalized}`, "_blank", "noopener,noreferrer");
    };

    const sanitizeAssigneesForWrite = (arr: Assignee[] = []) => {
        const seen = new Set<string>();
        return (arr || [])
            .map(a => ({
                name: (a.name || "").trim(),
                ...(a.userId ? { userId: a.userId } : {}),
                ...(a.email ? { email: a.email.trim().toLowerCase() } : {}),
                ...(a.phone ? { phone: a.phone } : {}),
            }))
            .filter(a => {
                const key = getAssigneeKey(a);
                if (!key || !a.name) return false;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    };

    const toPartnerArray = (raw: any): string[] => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map(p => (p || "").toString().trim()).filter(Boolean);
        if (typeof raw === "string") {
            return raw.split(/[,\n]/).map(p => p.trim()).filter(Boolean);
        }
        return [];
    };

    const normalizePhone = (value: string) => {
        const digits = (value || "").replace(/\D/g, "");
        if (!digits) return "";
        if (digits.startsWith("972")) return digits;
        if (digits.startsWith("0")) return `972${digits.slice(1)}`;
        return digits;
    };

    const buildVolunteerKey = (vol?: { email?: string; id?: string; userId?: string; name?: string }) => {
        const email = (vol?.email || "").toString().trim().toLowerCase();
        if (email) return email;
        const uid = (vol?.userId || vol?.id || "").toString().trim().toLowerCase();
        if (uid) return uid;
        return (vol?.name || "").toString().trim().toLowerCase();
    };

    const getPublicBaseUrl = (preferred?: string) => {
        const cleanPreferred = (preferred || "").trim().replace(/\/$/, "");
        if (cleanPreferred) return cleanPreferred;
        const fromEnv = (process.env.NEXT_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
        if (fromEnv) return fromEnv;
        if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
        return "";
    };

    const getEventStartDate = () => {
        if (!event?.startTime) return null;
        const raw = event.startTime as any;
        if (raw?.seconds) return new Date(raw.seconds * 1000);
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    };

    const pad = (n: number) => n.toString().padStart(2, "0");
    const formatDateTimeLocal = (date: Date) =>
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const extractTimeString = (date?: Date | null) => {
        if (!date) return "09:00";
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    const computeDueDateFromMode = (mode: "event_day" | "offset", offsetDays: number, timeStr: string) => {
        const base = getEventStartDate() || new Date();
        const [h, m] = (timeStr || "09:00").split(":").map(v => parseInt(v, 10) || 0);
        const dt = new Date(base);
        dt.setHours(h, m, 0, 0);
        dt.setDate(dt.getDate() + (Number.isFinite(offsetDays) ? offsetDays : 0));
        return formatDateTimeLocal(dt);
    };
    const parseOffset = (raw: string) => {
        if (raw === "" || raw === "-") return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
    };

    const syncNewTaskDueDate = (mode: "event_day" | "offset", offsetRaw: string, timeStr: string) => {
        setNewTaskDueMode(mode);
        setNewTaskOffsetDays(offsetRaw);
        setNewTaskTime(timeStr);
        const offsetParsed = parseOffset(offsetRaw);
        if (offsetParsed === null) return;
        const normalized = computeDueDateFromMode(mode, offsetParsed, timeStr);
        setNewTask(prev => ({ ...prev, dueDate: normalized }));
    };

    const syncEditTaskDueDate = (mode: "event_day" | "offset", offsetRaw: string, timeStr: string) => {
        setEditTaskDueMode(mode);
        setEditTaskOffsetDays(offsetRaw);
        setEditTaskTime(timeStr);
        const offsetParsed = parseOffset(offsetRaw);
        if (offsetParsed === null) return;
        const normalized = computeDueDateFromMode(mode, offsetParsed, timeStr);
        setEditingTask(prev => (prev ? { ...prev, dueDate: normalized } : prev));
    };

    const deriveEditDueState = (dueDate?: string | null) => {
        const base = getEventStartDate();
        const parsed = dueDate ? new Date(dueDate) : null;
        const validParsed = parsed && !isNaN(parsed.getTime()) ? parsed : null;
        const baseTime = extractTimeString(base || validParsed || new Date());
        if (!base || !validParsed) {
            return { mode: "event_day" as const, offset: "0", time: baseTime };
        }
        const msPerDay = 24 * 60 * 60 * 1000;
        const diff = Math.round((validParsed.getTime() - base.getTime()) / msPerDay);
        const timeStr = extractTimeString(validParsed);
        return { mode: diff === 0 ? "event_day" as const : "offset" as const, offset: diff.toString(), time: timeStr };
    };

    const inferSmartDueDate = (task: Task, eventStart: Date | null) => {
        const fallbackBase = new Date(Date.now() + 48 * 60 * 60 * 1000); // יומיים קדימה כברירת מחדל
        const baseDate = eventStart || fallbackBase;
        const text = `${task.title || ""} ${task.description || ""}`.toLowerCase();
        const contains = (phrases: string[]) => phrases.some(p => text.includes(p));
        const addHours = (base: Date, h: number) => new Date(base.getTime() + h * 60 * 60 * 1000);
        const addDays = (base: Date, d: number) => {
            const dt = new Date(base);
            dt.setDate(dt.getDate() + d);
            return dt;
        };

        // ברירת מחדל: ביום האירוע בשעה המקורית של האירוע (או 10:00 אם אין שעה)
        let candidate: Date | null = baseDate ? new Date(baseDate) : null;
        if (!candidate) {
            candidate = new Date();
            candidate.setHours(10, 0, 0, 0);
        } else if (!eventStart) {
            candidate.setHours(10, 0, 0, 0);
        }

        // שיווק/פרסום – בין 3 ל-10 ימים לפני האירוע (נבחר אמצע טווח: 5 ימים לפני)
        if (contains(["פרסום", "קידום", "שיווק", "פוסט", "מודעה", "קמפיין", "ניוזלטר", "דיוור", "הזמנה", "שיתוף", "social", "marketing"])) {
            candidate = addDays(candidate, -5);
            candidate.setHours(12, 0, 0, 0);
        }
        // גיוס/שיבוץ/מתנדבים – כמה ימים לפני כדי לאפשר תיאום
        else if (contains(["מתנדב", "מתנדבים", "גיוס", "שיבוץ", "חונך"])) {
            candidate = addDays(candidate, -3);
            candidate.setHours(11, 0, 0, 0);
        }
        // לוגיסטיקה/סאונד/תאורה/בר/במה/הקמה – ביום האירוע או ערב קודם
        else if (contains(["סאונד", "תאורה", "במה", "ציוד", "הקמה", "לוגיסט", "setup", "בדיקה", "חזרה", "rehearsal", "טסט", "בר", "bar", "drink"])) {
            candidate = addHours(candidate, -6); // שש שעות לפני האירוע כברירת מחדל
        }
        // תזכורות למשתתפים/קהל – כמה שעות לפני
        else if (contains(["תזכורת", "תזכיר", "reminder", "sms", "וואטסאפ", "whatsapp", "הודעה"])) {
            candidate = addHours(candidate, -4);
        }
        // כספים/חשבוניות/תשלומים – אחרי האירוע
        else if (contains(["חשבונית", "תשלום", "קבלה", "invoice", "billing", "התחשבנות"])) {
            candidate = addDays(candidate, 2);
            candidate.setHours(10, 0, 0, 0);
        }
        // סיכומים/פולואפ/דוחות – יום אחרי
        else if (contains(["סיכום", "סיכומים", "תודה", "פולואפ", "דוח", "דו\"ח", "report", "feedback", "משוב"])) {
            candidate = addDays(candidate, 1);
            candidate.setHours(9, 30, 0, 0);
        }
        // שאר המשימות – ברירת מחדל ביום האירוע
        else {
            candidate = new Date(candidate);
        }

        // הגנות
        if (!candidate || Number.isNaN(candidate.getTime())) {
            return formatDateTimeLocal(baseDate);
        }
        const now = new Date();
        if (candidate.getTime() < now.getTime()) {
            candidate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        }
        return formatDateTimeLocal(candidate);
    };

    const MIN_SEND_INTERVAL_MS = 5000;
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
        if (assignee.phone) return assignee.phone;
        if ((assignee as any).phoneNormalized) return (assignee as any).phoneNormalized;
        // 1) userId
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
        // 2) email
        if (assignee.email) {
            try {
                // Volunteers registered to this event
                if (id) {
                    const volByEmail = query(
                        collection(db!, "events", id, "volunteers"),
                        where("email", "==", assignee.email.toLowerCase())
                    );
                    const volRes = await getDocs(volByEmail);
                    const volData = volRes.docs[0]?.data() as any;
                    if (volData?.phone || volData?.phoneNormalized) return volData.phone || volData.phoneNormalized;
                }
                const q = query(collection(db!, "users"), where("email", "==", assignee.email.toLowerCase()));
                const res = await getDocs(q);
                const data = res.docs[0]?.data() as any;
                if (data?.phone) return data.phone;
            } catch { /* ignore */ }
            try {
                const cg = query(collectionGroup(db!, "volunteers"), where("email", "==", assignee.email.toLowerCase()));
                const cgRes = await getDocs(cg);
                const cgData = cgRes.docs[0]?.data() as any;
                if (cgData?.phoneNormalized || cgData?.phone) return cgData.phoneNormalized || cgData.phone;
            } catch { /* ignore */ }
            try {
                const general = query(collection(db!, "general_volunteers"), where("email", "==", assignee.email.toLowerCase()));
                const generalRes = await getDocs(general);
                const gData = generalRes.docs[0]?.data() as any;
                if (gData?.phoneNormalized || gData?.phone) return gData.phoneNormalized || gData.phone;
            } catch { /* ignore */ }
        }
        return "";
    };

    const normalizePhoneNumber = (raw?: string) => {
        if (!raw) return "";
        const digits = raw.replace(/\D/g, "");
        if (!digits) return "";
        if (digits.startsWith("0")) return `972${digits.replace(/^0+/, "")}`;
        return digits;
    };

    const formatPhoneForDisplay = (raw?: string) => {
        if (!raw) return "";
        const digits = raw.replace(/\D/g, "");
        if (!digits) return "";
        if (digits.startsWith("972")) {
            const local = digits.slice(3);
            return local ? `0${local}` : digits;
        }
        if (!digits.startsWith("0") && digits.length === 9) return `0${digits}`;
        return digits;
    };

    const toggleVolunteerSelection = (key: string) => {
        setVolunteerSelections(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const selectAllVolunteers = () => {
        const next = new Set<string>();
        combinedVolunteers.forEach(v => {
            const key = (v.email || v.id || v.name || "").toLowerCase();
            if (key) next.add(key);
        });
        setVolunteerSelections(next);
    };

    const clearVolunteerSelection = () => setVolunteerSelections(new Set());

    const dedupeAssignees = (arr: Assignee[]) => {
        const seen = new Set<string>();
        return arr.filter((a) => {
            const key = `${a.userId || ""}|${(a.email || "").toLowerCase()}|${a.name || ""}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    const sendTagAlerts = async (assignees: Assignee[] = [], task: Task) => {
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
            const taskLink = origin ? `${origin}/tasks/${task.id}?eventId=${id}` : "";
            const eventLink = origin ? `${origin}/events/${id}` : "";
            const senderName = user?.displayName || user?.email || "משתמש";
            const due = task.dueDate ? new Date(task.dueDate).toLocaleDateString("he-IL") : "";
            while (tagAlertsQueueRef.current.length) {
                const assignee = tagAlertsQueueRef.current.shift()!;
                await ensureGlobalRateLimit();
                const phoneRaw = await getUserPhone(assignee);
                const phone = normalizePhone(phoneRaw);
                if (!phone) continue;
                const lines = [
                    `היי ${assignee.name || ""},`,
                    `קיבלת משימה חדשה מ${senderName}.`,
                    `תוייגת במשימה: "${task.title}".`,
                    event?.title ? `אירוע: ${event.title}` : "",
                    due ? `דדליין: ${due}` : "",
                    task.priority ? `עדיפות: ${task.priority}` : "",
                    task.description ? `תיאור: ${task.description}` : "",
                    taskLink ? `דף המשימה: ${taskLink}` : "",
                    eventLink ? `דף האירוע: ${eventLink}` : "",
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
                sendTagAlerts([], task);
            }
        }
    };


    // New Team Member State
    const [showAddTeam, setShowAddTeam] = useState(false);
    const [newMember, setNewMember] = useState({
        name: "",
        role: "",
        email: "",
    });
    const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
    const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
    const [collaborators, setCollaborators] = useState<{ id: string; fullName?: string; email?: string; role?: string }[]>([]);
    const [allUsers, setAllUsers] = useState<{ id: string; fullName?: string; email?: string; role?: string }[]>([]);
    const [collaboratorsView, setCollaboratorsView] = useState<"past" | "all">("past");
    const [showCollaboratorsPicker, setShowCollaboratorsPicker] = useState(false);
    const eventStartRef = useRef<Date | null>(null);

    const hydrateTeamNames = async (teamArr: { name: string; role: string; email?: string; userId?: string }[]) => {
        if (!db) return teamArr;
        const updated = await Promise.all(teamArr.map(async (m) => {
            if (!m.userId) return m;
            try {
                const userSnap = await getDoc(doc(db!, "users", m.userId));
                if (userSnap.exists()) {
                    const profile = userSnap.data() as any;
                    return { ...m, name: profile.fullName || profile.displayName || m.name };
                }
            } catch (err) {
                console.error("Failed to hydrate team member name", err);
            }
            return m;
        }));
        return updated;
    };

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

    // Chat State
    const [chatTask, setChatTask] = useState<Task | null>(null);

    // Event edit state
    const [isEditEventOpen, setIsEditEventOpen] = useState(false);
    const generateId = () =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);

    const [eventForm, setEventForm] = useState({
        title: "",
        location: "",
        description: "",
        participantsCount: "",
        partners: [] as string[],
        goal: "",
        budget: "",
        startTime: "",
        durationHours: "",
        status: "",
        recurrence: "NONE" as "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY",
        recurrenceEndDate: "",
        needsVolunteers: false,
        volunteersCount: "",
        contactName: "",
        contactPhone: "",
        contactEmail: "",
        customSections: [] as CustomSection[],
    });

    const [editingInfoBlockId, setEditingInfoBlockId] = useState<string | null>(null);
    const [infoBlockDraft, setInfoBlockDraft] = useState<InfoBlock | null>(null);
    const [showAdvancedActions, setShowAdvancedActions] = useState(false);
    const [showPostModal, setShowPostModal] = useState(false);
    const [postContent, setPostContent] = useState("");
    const [flyerLink, setFlyerLink] = useState("");
    const [showContentModal, setShowContentModal] = useState(false);
    const [officialPostText, setOfficialPostText] = useState("");
    const [officialInstaTagsList, setOfficialInstaTagsList] = useState<string[]>(DEFAULT_INSTAGRAM_TAGS);
    const [instaTagInput, setInstaTagInput] = useState("");
    const [officialFlyerUrl, setOfficialFlyerUrl] = useState("");
    const [officialFlyerFile, setOfficialFlyerFile] = useState<File | null>(null);
    const [officialFlyerUploading, setOfficialFlyerUploading] = useState(false);
    const contentFlyerInputRef = useRef<HTMLInputElement | null>(null);
    const [showFlyerPicker, setShowFlyerPicker] = useState(false);
    const [showVolunteerModal, setShowVolunteerModal] = useState(false);
    const [volunteerCountInput, setVolunteerCountInput] = useState("");
    const [showEventFileModal, setShowEventFileModal] = useState(false);
    const [eventFile, setEventFile] = useState<File | null>(null);
    const [eventFileName, setEventFileName] = useState("");
    const [eventFileUploading, setEventFileUploading] = useState(false);
    const eventFileInputRef = useRef<HTMLInputElement | null>(null);
    const [importantDocs, setImportantDocs] = useState<ImportantDoc[]>([]);
    const [eventFiles, setEventFiles] = useState<EventFileThumb[]>([]);
    const [copiedVolunteersLink, setCopiedVolunteersLink] = useState(false);
    const [copiedContentFormLink, setCopiedContentFormLink] = useState(false);
    const [baseUrl, setBaseUrl] = useState("");
    const [volunteers, setVolunteers] = useState<EventVolunteer[]>([]);
    const [loadingVolunteers, setLoadingVolunteers] = useState(true);
    const [volunteerBusyId, setVolunteerBusyId] = useState<string | null>(null);
    const [showVolunteerMessage, setShowVolunteerMessage] = useState(false);
    const [volunteerSelections, setVolunteerSelections] = useState<Set<string>>(new Set());
    const [sendingVolunteerMsg, setSendingVolunteerMsg] = useState(false);
    const volunteerMessageRef = useRef<string>("");
    const [showControlCenter, setShowControlCenter] = useState(false);
    const [controlSaving, setControlSaving] = useState(false);
    const [volunteerSharePaused, setVolunteerSharePaused] = useState(false);
    const [teamSharePaused, setTeamSharePaused] = useState(false);
    const [volunteerPhoneCache, setVolunteerPhoneCache] = useState<Map<string, string>>(new Map());
    const volunteerPhoneMap = useMemo(() => {
        const map = new Map<string, string>();
        // cached phones from lookups
        volunteerPhoneCache.forEach((val, key) => {
            if (key && val) map.set(key, val);
        });
        volunteers.forEach(v => {
            const key = buildVolunteerKey({ email: v.email, id: v.id, name: v.name, userId: (v as any).userId });
            const phone = (v as any).phoneNormalized || v.phone;
            if (key && phone) map.set(key, phone);
        });
        return map;
    }, [volunteers, volunteerPhoneCache]);
    const combinedVolunteers = useMemo(() => {
        const map = new Map<string, { id?: string; name?: string; email?: string; phone?: string }>();
        volunteers.forEach(v => {
            const key = buildVolunteerKey({ email: v.email, id: v.id, name: v.name, userId: (v as any).userId });
            if (!key) return;
            const normalized = (v as any).phoneNormalized ? normalizePhone((v as any).phoneNormalized) : "";
            map.set(key, {
                id: v.id,
                name: v.name || v.email,
                email: v.email,
                phone: normalized || v.phone || (v as any).phoneNormalized || volunteerPhoneMap.get(key),
            });
        });
        tasks
            .filter(t => t.isVolunteerTask || t.volunteerHours != null)
            .forEach(t => {
                (t.assignees || []).forEach(a => {
                    const key = buildVolunteerKey({ email: a.email, id: a.userId, name: a.name, userId: a.userId });
                    if (!key) return;
                    const phoneFromEvent = volunteerPhoneMap.get(key);
                    if (!map.has(key)) {
                        map.set(key, { id: a.userId, name: a.name || a.email, email: a.email, phone: a.phone || phoneFromEvent });
                    } else if (!map.get(key)?.phone && (a.phone || phoneFromEvent)) {
                        const existing = map.get(key)!;
                        map.set(key, { ...existing, phone: a.phone || phoneFromEvent });
                    }
                });
            });
        return Array.from(map.values());
    }, [tasks, volunteers, volunteerPhoneMap]);

    useEffect(() => {
        const next = new Set<string>();
        combinedVolunteers.forEach(v => {
            const key = buildVolunteerKey({ email: v.email, id: v.id, name: v.name });
            if (key) next.add(key);
        });
        setVolunteerSelections(next);
    }, [combinedVolunteers, volunteers]);
    const [creatorName, setCreatorName] = useState("");
    const [showSpecialModal, setShowSpecialModal] = useState(false);
    const [creatingSpecialTask, setCreatingSpecialTask] = useState(false);
    const handleShareWhatsApp = (title: string, url?: string) => {
        if (!url) {
            alert("אין קישור לקובץ לשיתוף");
            return;
        }
        const text = encodeURIComponent(`${title ? title + " - " : ""}${url}`);
        window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    };
    useEffect(() => {
        if (taggingTask) {
            setTagSelection(taggingTask.assignees || []);
        }
    }, [taggingTask]);

    useEffect(() => {
        const fillMissingPhones = async () => {
            if (!db) return;
            const missing = combinedVolunteers.filter(v => {
                const key = buildVolunteerKey({ email: v.email, id: v.id, name: v.name });
                return key && !v.phone && !volunteerPhoneMap.get(key);
            });
            if (!missing.length) return;
            const updates = new Map<string, string>();
            for (const v of missing) {
                const key = buildVolunteerKey({ email: v.email, id: v.id, name: v.name });
                if (!key) continue;
                const phone = await getUserPhone({ name: v.name || "", email: v.email || "", userId: v.id });
                const normalized = normalizePhone(phone || "");
                if (normalized) updates.set(key, normalized);
            }
            if (updates.size) {
                setVolunteerPhoneCache(prev => {
                    const next = new Map(prev);
                    updates.forEach((val, key) => next.set(key, val));
                    return next;
                });
            }
        };
        fillMissingPhones();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [combinedVolunteers, db]);

    useEffect(() => {
        const hydrateFromGeneralVolunteers = async () => {
            if (!db) return;
            const missingEmails = combinedVolunteers
                .map(v => (v.email || "").toLowerCase())
                .filter(email => email && !volunteerPhoneMap.get(email));
            if (!missingEmails.length) return;
            const updates = new Map<string, string>();
            for (const email of missingEmails) {
                try {
                    const q = query(collection(db, "general_volunteers"), where("email", "==", email));
                    const res = await getDocs(q);
                    const data = res.docs[0]?.data() as any;
                    const phone = data?.phoneNormalized || data?.phone;
                    const normalized = normalizePhone(phone || "");
                    if (normalized) updates.set(email, normalized);
                } catch (err) {
                    console.warn("hydrateFromGeneralVolunteers lookup failed", err);
                }
            }
            if (updates.size) {
                setVolunteerPhoneCache(prev => {
                    const next = new Map(prev);
                    updates.forEach((val, key) => next.set(key, val));
                    return next;
                });
            }
        };
        hydrateFromGeneralVolunteers();
    }, [combinedVolunteers, db, volunteerPhoneMap]);

    // Load recurring/default tasks library for modal
    useEffect(() => {
        if (!db) return;
        setLoadingLibraryTasks(true);
        const q = query(collection(db, "default_tasks"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            setLibraryTasks(data as any);
            setLoadingLibraryTasks(false);
        }, (err) => {
            console.error("Failed loading library tasks", err);
            setLoadingLibraryTasks(false);
        });
        return () => unsub();
    }, [db]);

    const handleAddCustomSection = () => {
        setEventForm(prev => ({
            ...prev,
            customSections: [...(prev.customSections || []), { title: "", content: "" }]
        }));
    };

    const handleUpdateCustomSection = (index: number, field: "title" | "content", value: string) => {
        setEventForm(prev => {
            const sections = [...(prev.customSections || [])];
            sections[index] = { ...sections[index], [field]: value };
            return { ...prev, customSections: sections };
        });
    };

    const handleRemoveCustomSection = (index: number) => {
        setEventForm(prev => {
            const sections = [...(prev.customSections || [])];
            sections.splice(index, 1);
            return { ...prev, customSections: sections };
        });
    };

    const handleStartInfoBlockEdit = (block: InfoBlock) => {
        setEditingInfoBlockId(block.id);
        setInfoBlockDraft({ ...block });
    };

    const handleInfoBlockDraftChange = (field: "label" | "value", value: string) => {
        setInfoBlockDraft(prev => (prev ? { ...prev, [field]: value } : prev));
    };

    const handleCancelInfoBlockEdit = () => {
        setEditingInfoBlockId(null);
        setInfoBlockDraft(null);
    };

    const handleSaveInfoBlock = async () => {
        if (!db || !event || !infoBlockDraft || !editingInfoBlockId) return;
        const label = (infoBlockDraft.label || "").trim();
        const value = (infoBlockDraft.value || "").trim();
        if (!label || !value) {
            alert("לא ניתן לשמור סעיף ללא כותרת ותוכן.");
            return;
        }

        try {
            const updatedBlocks = (event.infoBlocks || []).map(block =>
                block.id === editingInfoBlockId ? { ...block, label, value } : block
            );
            await updateDoc(doc(db, "events", id), { infoBlocks: updatedBlocks });
            setEditingInfoBlockId(null);
            setInfoBlockDraft(null);
        } catch (err) {
            console.error("Error updating info block:", err);
            alert("שגיאה בעדכון הסעיף");
        }
    };

    const handleSendVolunteerBroadcast = async () => {
        if (!db) return;
        const cfg = await fetchWhatsappConfig();
        if (!cfg) {
            alert("לא הוגדר אינטגרציית וואטסאפ לשליחה");
            return;
        }
        const list = combinedVolunteers.filter(v => {
            const key = buildVolunteerKey({ email: v.email, id: v.id, name: v.name });
            return key && volunteerSelections.has(key);
        });
        if (!list.length) {
            alert("בחר לפחות מתנדב אחד לשליחה");
            return;
        }
        const volunteerMessage = volunteerMessageRef.current || "";
        if (!volunteerMessage.trim()) {
            alert("כתוב הודעה לפני שליחה");
            return;
        }
        setSendingVolunteerMsg(true);
        try {
            const endpoint = `https://api.green-api.com/waInstance${cfg.idInstance}/SendMessage/${cfg.apiTokenInstance}`;
            const origin = getPublicBaseUrl(cfg.baseUrl);
            const link = origin ? `${origin}/events/${id}` : "";
            const sent: string[] = [];
            const skippedNoPhone: string[] = [];
            const failed: string[] = [];
            for (const v of list) {
                const key = buildVolunteerKey({ email: v.email, id: v.id, name: v.name });
                const phoneRaw =
                    v.phone ||
                    volunteerPhoneMap.get(key) ||
                    (await getUserPhone({ name: v.name, email: v.email, userId: v.id } as any));
                const phone = normalizePhoneNumber(phoneRaw);
                if (!phone) {
                    skippedNoPhone.push(v.name || v.email || "מתנדב");
                    continue;
                }
                const lines = [
                    `היי ${v.name || "מתנדב/ת"},`,
                    volunteerMessage.trim(),
                    event?.title ? `אירוע: ${event.title}` : "",
                    link ? `דף האירוע: ${link}` : "",
                ].filter(Boolean);
                const message = lines.join("\n");
                await ensureGlobalRateLimit();
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chatId: `${phone}@c.us`, message }),
                }).catch(err => {
                    console.warn("send wa failed", err);
                    return null;
                });
                if (res && res.ok) {
                    sent.push(v.name || v.email || phone);
                } else {
                    failed.push(v.name || v.email || phone);
                }
            }
            const parts = [];
            if (sent.length) parts.push(`נשלחו ${sent.length} הודעות`);
            if (failed.length) parts.push(`נכשלו ${failed.length} (בדוק קונפיגורציה/חיבור)`);
            if (skippedNoPhone.length) parts.push(`דילגנו על ${skippedNoPhone.length} ללא מספר`);
            alert(parts.join(" | "));
        } catch (err) {
            console.error("שגיאה בשליחת הודעה למתנדבים", err);
            alert("לא הצלחנו לשלוח הודעות למתנדבים");
        } finally {
            setSendingVolunteerMsg(false);
        }
    };

    const handleDeleteInfoBlock = async (blockId: string) => {
        if (!db || !event) return;
        const shouldDelete = confirm("למחוק את הסעיף הזה?");
        if (!shouldDelete) return;

        try {
            const updatedBlocks = (event.infoBlocks || []).filter(block => block.id !== blockId);
            await updateDoc(doc(db, "events", id), { infoBlocks: updatedBlocks });
            if (editingInfoBlockId === blockId) {
                setEditingInfoBlockId(null);
                setInfoBlockDraft(null);
            }
        } catch (err) {
            console.error("Error deleting info block:", err);
            alert("שגיאה במחיקת הסעיף");
        }
    };

    const handleToggleAssigneeSelection = (assignee: Assignee, target: "new" | "edit" | "tag") => {
        const assigneeKey = getAssigneeKey(assignee);
        if (!assigneeKey) return;

        if (target === "new") {
            setNewTask(prev => {
                const exists = prev.assignees.some(a => getAssigneeKey(a) === assigneeKey);
                const next = exists
                    ? prev.assignees.filter(a => getAssigneeKey(a) !== assigneeKey)
                    : [...prev.assignees, assignee];
                return { ...prev, assignees: next, assignee: next[0]?.name || "", assigneeId: next[0]?.userId || "" };
            });
            return;
        }

        if (target === "edit" && editingTask) {
            const exists = editingTask.assignees?.some(a => getAssigneeKey(a) === assigneeKey);
            const next = exists
                ? (editingTask.assignees || []).filter(a => getAssigneeKey(a) !== assigneeKey)
                : ([...(editingTask.assignees || []), assignee]);
            setEditingTask({ ...editingTask, assignees: next, assignee: next[0]?.name || "", assigneeId: next[0]?.userId || "" });
            return;
        }

        if (target === "tag") {
            setTagSelection(prev => {
                const exists = prev.some(a => getAssigneeKey(a) === assigneeKey);
                return exists ? prev.filter(a => getAssigneeKey(a) !== assigneeKey) : [...prev, assignee];
            });
        }
    };

    const handleSaveTagging = async () => {
        if (!db || !taggingTask) return;
        const cleanAssignees = sanitizeAssigneesForWrite(tagSelection);
        const primary = cleanAssignees[0];
        try {
            await updateDoc(doc(db, "events", id, "tasks", taggingTask.id), {
                assignees: cleanAssignees,
                assignee: primary?.name || "",
                assigneeId: primary?.userId || null,
            });
            sendTagAlerts(cleanAssignees, taggingTask).catch(() => { /* already logged */ });
            setTaggingTask(null);
            setTagSelection([]);
        } catch (err) {
            console.error("Error updating assignees:", err);
            alert("שגיאה בעדכון המוקצים");
        }
    };

    const handleLinkProject = async () => {
        if (!isProjectLinker) {
            alert("רק החשבון המורשה יכול לשייך אירועים לפרויקטים.");
            return;
        }
        if (!db || !selectedProject) return;
        const chosen = projectOptions.find(p => p.id === selectedProject);
        setLinkingProject(true);
        try {
            await updateDoc(doc(db, "events", id), {
                projectId: selectedProject,
                projectName: chosen?.name || "",
                updatedAt: serverTimestamp(),
            });
            setEvent(prev => prev ? { ...prev, projectId: selectedProject, projectName: chosen?.name || "" } : prev);
        } catch (err) {
            console.error("Failed to link project", err);
            alert("לא הצלחנו לשייך את האירוע לפרויקט");
        } finally {
            setLinkingProject(false);
        }
    };

    useEffect(() => {
        if (!db) return;
        const firestore = db;
        const loadProjects = async () => {
            try {
                const snap = await getDocs(collection(firestore, "projects"));
                const opts: ProjectOption[] = [];
                snap.forEach((d) => {
                    const data = d.data() as any;
                    opts.push({ id: d.id, name: data.name || "פרויקט" });
                });
                setProjectOptions(opts);
            } catch (err) {
                console.error("Failed loading projects", err);
            }
        };
        loadProjects();
    }, [db]);

    useEffect(() => {
        if (!id || !db) return;

        const unsubscribeEvent = onSnapshot(doc(db!, "events", id), async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as EventData;
                const enrichedTeam = await hydrateTeamNames(data.team || []);
                const rawStart = (data as any).startTime;
                if (rawStart?.seconds) {
                    eventStartRef.current = new Date(rawStart.seconds * 1000);
                } else if (rawStart) {
                    const d = new Date(rawStart);
                    if (!isNaN(d.getTime())) eventStartRef.current = d;
                }
                setEvent({ ...data, team: enrichedTeam });
                setOfficialPostText((data as any).officialPostText || "");
                const tags = Array.isArray((data as any).officialInstagramTags)
                    ? (data as any).officialInstagramTags
                    : (Array.isArray((data as any).instagramTags) ? (data as any).instagramTags : []);
                const cleanedTags = (tags || []).map((t: string) => t?.replace(/^@+/, "")).filter(Boolean);
                setOfficialInstaTagsList(cleanedTags.length ? cleanedTags : DEFAULT_INSTAGRAM_TAGS);
                setOfficialFlyerUrl((data as any).officialFlyerUrl || "");
                setSelectedProject((data as any).projectId || "");
                // fetch creator name (prefers user profile by UID/email)
                const creatorUid = (data as any).createdBy;
                const creatorEmail = (data as any).createdByEmail;
                try {
                    let name = "";
                    if (creatorUid) {
                        const userDoc = await getDoc(doc(db!, "users", creatorUid));
                        if (userDoc.exists()) {
                            const u = userDoc.data() as any;
                            name = u.fullName || u.name || u.displayName || u.email || "";
                        }
                    }
                    if (!name && creatorEmail) {
                        const matchByEmail = await getDocs(query(collection(db!, "users"), where("email", "==", creatorEmail)));
                        const found = matchByEmail.docs[0];
                        if (found?.exists()) {
                            const u = found.data() as any;
                            name = u.fullName || u.name || u.displayName || u.email || "";
                        }
                    }
                    setCreatorName(name || "");
                } catch (creatorErr) {
                    console.warn("Failed loading creator name", creatorErr);
                }
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
            const updates: { taskId: string; dueDate: string }[] = [];
            const fixes: { taskId: string; data: Record<string, any> }[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data() as any;
                const required = data.requiredCompletions != null ? Math.max(1, Number(data.requiredCompletions)) : 1;
                const remainingRaw = data.remainingCompletions != null ? Number(data.remainingCompletions) : required;
                const remaining = Math.max(0, Math.min(required, remainingRaw));
                let status: Task["status"] = data.status || "TODO";
                const fix: Record<string, any> = {};
                if (remaining !== remainingRaw && data.remainingCompletions != null) {
                    fix.remainingCompletions = remaining;
                }
                if (status === "DONE" && required > 1 && remaining > 0) {
                    status = "IN_PROGRESS";
                    fix.status = "IN_PROGRESS";
                }
                if (Object.keys(fix).length) {
                    fixes.push({ taskId: doc.id, data: fix });
                }
                let taskRecord: Task = {
                    id: doc.id,
                    ...data,
                    status,
                    requiredCompletions: required,
                    remainingCompletions: remaining,
                    assignee: data.assignee || (data.assignees && data.assignees[0]?.name) || "",
                    assignees: data.assignees || (data.assignee ? [{ name: data.assignee, userId: data.assigneeId }] : []),
                    previewImage: data.previewImage || "",
                } as Task;
                if (!taskRecord.dueDate) {
                    const inferred = inferSmartDueDate(taskRecord, eventStartRef.current);
                    if (inferred) {
                        taskRecord = { ...taskRecord, dueDate: inferred };
                        updates.push({ taskId: doc.id, dueDate: inferred });
                    }
                }
                tasksData.push(taskRecord);
            });
            setTasks(dedupeById(tasksData));
            updates.forEach(async (u) => {
                try {
                    await updateDoc(doc(db!, "events", id, "tasks", u.taskId), { dueDate: u.dueDate });
                } catch (err) {
                    console.warn("Failed to auto-assign due date", u, err);
                }
            });
            fixes.forEach(async (fix) => {
                try {
                    await updateDoc(doc(db!, "events", id, "tasks", fix.taskId), fix.data);
                } catch (err) {
                    console.warn("Failed to normalize task status", fix, err);
                }
            });
        });

        const qBudget = query(collection(db, "events", id, "budgetItems"), orderBy("createdAt", "desc"));
        const unsubscribeBudget = onSnapshot(qBudget, (querySnapshot) => {
            const budgetData: BudgetItem[] = [];
            querySnapshot.forEach((doc) => {
                budgetData.push({ id: doc.id, ...doc.data() } as BudgetItem);
            });
            setBudgetItems(budgetData);
        });

        const qImportant = query(collection(db, "important_documents"), orderBy("createdAt", "desc"));
        const unsubscribeImportant = onSnapshot(qImportant, (querySnapshot) => {
            const docsData: ImportantDoc[] = [];
            querySnapshot.forEach((doc) => {
                docsData.push({ id: doc.id, ...doc.data() } as ImportantDoc);
            });
            setImportantDocs(docsData);
        });

        const qJoinReq = query(collection(db, "join_requests"), where("eventId", "==", id));
        const unsubscribeJoinReq = onSnapshot(qJoinReq, (querySnapshot) => {
            const reqs: JoinRequest[] = [];
            querySnapshot.forEach((doc) => {
                reqs.push({ id: doc.id, ...doc.data() } as JoinRequest);
            });
            setJoinRequests(reqs);
        });

        const qEventFiles = query(collection(db, "events", id, "files"), orderBy("createdAt", "desc"));
        const unsubscribeEventFiles = onSnapshot(qEventFiles, (querySnapshot) => {
            const filesData: EventFileThumb[] = [];
            querySnapshot.forEach((doc) => {
                filesData.push({ id: doc.id, ...doc.data() } as EventFileThumb);
            });
            setEventFiles(dedupeById(filesData));
        });

        const qVolunteers = query(collection(db, "events", id, "volunteers"), orderBy("createdAt", "desc"));
        const unsubscribeVolunteers = onSnapshot(qVolunteers, (querySnapshot) => {
            const vols: EventVolunteer[] = [];
            const phoneUpdates = new Map<string, string>();
            querySnapshot.forEach((doc) => {
                const data = doc.data() as any;
                const key = buildVolunteerKey({ email: data.email, id: doc.id, name: data.name, userId: (data as any).userId });
                const phone = data.phoneNormalized || data.phone;
                const normalizedPhone = phone ? normalizePhone(phone) : "";
                if (key && phone) phoneUpdates.set(key, normalizePhone(phone));
                vols.push({ id: doc.id, ...data, phoneNormalized: normalizedPhone } as EventVolunteer);
            });
            setVolunteers(dedupeById(vols));
            if (phoneUpdates.size) {
                setVolunteerPhoneCache(prev => {
                    const next = new Map(prev);
                    phoneUpdates.forEach((val, key) => next.set(key, val));
                    return next;
                });
            }
            setLoadingVolunteers(false);
        });

        return () => {
            unsubscribeEvent();
            unsubscribeTasks();
            unsubscribeBudget();
            unsubscribeImportant();
            unsubscribeJoinReq();
            unsubscribeEventFiles();
            unsubscribeVolunteers();
        };
    }, [id, db]);

    const [dateModalMode, setDateModalMode] = useState<"event_day" | "offset">("event_day");
    const [dateModalOffset, setDateModalOffset] = useState<string>("0");
    const [dateModalTime, setDateModalTime] = useState<string>("09:00");

    useEffect(() => {
        const base = getEventStartDate();
        const defaultTime = extractTimeString(base || null);
        if (!newTaskTime) setNewTaskTime(defaultTime);
        if (!newTask.dueDate && base) {
            syncNewTaskDueDate(newTaskDueMode, newTaskOffsetDays, defaultTime);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event?.startTime]);

    useEffect(() => {
        if (!editingDateTask) return;
        const meta = deriveEditDueState(editingDateTask.dueDate);
        setDateModalMode(meta.mode);
        setDateModalOffset(meta.offset);
        setDateModalTime(meta.time);
        if (!editingDateTask.dueDate) {
            setEditingDateTask({ ...editingDateTask, dueDate: computeDueDateFromMode(meta.mode, parseOffset(meta.offset) ?? 0, meta.time) });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingDateTask?.id]);

    useEffect(() => {
        if (!editingDateTask) return;
        const parsed = parseOffset(dateModalOffset);
        if (parsed === null) return;
        const nextDue = computeDueDateFromMode(dateModalMode, parsed, dateModalTime || extractTimeString(getEventStartDate() || new Date()));
        if (nextDue && nextDue !== editingDateTask.dueDate) {
            setEditingDateTask({ ...editingDateTask, dueDate: nextDue });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateModalMode, dateModalOffset, dateModalTime]);

    // Load collaborators + all users
    useEffect(() => {
        const fetchCollaborators = async () => {
            if (!db || !user) return;
            try {
                const userIds = new Set<string>();
                const emails = new Set<string>();
                try {
                    const myEvents = await getDocs(
                        query(
                            collection(db, "events"),
                            where("members", "array-contains", user.uid)
                        )
                    );
                    myEvents.forEach(evDoc => {
                        const data = evDoc.data() as any;
                        if (data.createdBy) userIds.add(String(data.createdBy));
                        if (data.createdByEmail) emails.add((data.createdByEmail as string).toLowerCase());
                        const teamArr = data.team as { userId?: string; email?: string }[] | undefined;
                        (teamArr || []).forEach(m => {
                            if (m.userId) userIds.add(String(m.userId));
                            if (m.email) emails.add(m.email.toLowerCase());
                        });
                    });
                } catch (err) {
                    console.error("Failed loading related events", err);
                }

                const userDocs = await getDocs(collection(db, "users"));
                const pastUsers: { id: string; fullName?: string; email?: string; role?: string }[] = [];
                const allUsersArr: { id: string; fullName?: string; email?: string; role?: string }[] = [];
                userDocs.forEach(u => {
                    const data = u.data() as any;
                    const entry = {
                        id: u.id,
                        fullName: data.fullName || data.displayName || data.email,
                        email: data.email,
                        role: data.role
                    };
                    allUsersArr.push(entry);
                    if (userIds.has(u.id) || (data.email && emails.has((data.email as string).toLowerCase()))) {
                        pastUsers.push(entry);
                    }
                });
                setCollaborators(pastUsers);
                setAllUsers(allUsersArr);
            } catch (err) {
                console.error("Failed loading collaborators", err);
                // fallback: הצג ריק אם קרה כשל
                setAllUsers([]);
                setCollaborators([]);
            }
        };
        fetchCollaborators();
    }, [db, user]);

    useEffect(() => {
        setVolunteerSharePaused(!!event?.volunteerTasksPaused);
        setTeamSharePaused(!!event?.teamTasksPaused);
    }, [event?.volunteerTasksPaused, event?.teamTasksPaused]);

    useEffect(() => {
        if (!event) return;

        const toInputValue = (value: any) => {
            if (!value) return "";
            const date = value.seconds ? new Date(value.seconds * 1000) : new Date(value);
            const offset = date.getTimezoneOffset();
            return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
        };

        setEventForm({
            title: event.title || "",
            location: event.location || "",
            description: event.description || "",
            participantsCount: event.participantsCount || "",
            partners: toPartnerArray(event.partners),
            goal: event.goal || "",
            budget: event.budget || "",
            startTime: toInputValue(event.startTime),
            durationHours: event.durationHours ? String(event.durationHours) : "",
            status: event.status || "",
            recurrence: (event.recurrence as any) || "NONE",
            recurrenceEndDate: event.recurrenceEndDate ? toInputValue(event.recurrenceEndDate) : "",
            needsVolunteers: !!event.needsVolunteers,
            volunteersCount: event.volunteersCount != null ? String(event.volunteersCount) : "",
            contactName: event.contactPerson?.name || "",
            contactPhone: event.contactPerson?.phone || "",
            contactEmail: event.contactPerson?.email || "",
            customSections: event.customSections || [],
        });
    }, [event]);

    useEffect(() => {
        setBaseUrl(getPublicBaseUrl());
    }, []);

    const uploadTaskFiles = async (taskId: string, taskTitle: string, files: File[]) => {
        if (!storage || !db || files.length === 0) return [];

        let previewImage: string | null = null;
        const uploadPromises = files.map(async (file) => {
            const path = `events/${id}/tasks/${taskId}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage!, path);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            if (!previewImage && file.type?.startsWith("image/")) {
                previewImage = url;
            }
            const fileData = {
                name: file.name,
                url,
                storagePath: path,
                taskId,
                taskTitle,
                createdAt: serverTimestamp(),
                createdBy: user?.uid || null,
                createdByName: user?.displayName || user?.email || "משתמש",
            };
            await Promise.all([
                addDoc(collection(db!, "events", id, "tasks", taskId, "files"), fileData),
                addDoc(collection(db!, "events", id, "files"), fileData),
            ]);
            return fileData;
        });
        const uploaded = await Promise.all(uploadPromises);
        if (previewImage) {
            try {
                await updateDoc(doc(db!, "events", id, "tasks", taskId), { previewImage });
            } catch (err) {
                console.error("Failed to set preview image on task", err);
            }
        }
        return uploaded.filter(Boolean);
    };

    const handleUploadEventFile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!storage || !db || !eventFile || !user) return;
        if (!eventFileName.trim()) {
            alert("תן שם לקובץ לפני העלאה");
            return;
        }
        setEventFileUploading(true);
        try {
            const path = `events/${id}/files/${Date.now()}-${eventFile.name}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, eventFile);
            const url = await getDownloadURL(storageRef);
            const fileData = {
                name: eventFileName.trim(),
                originalName: eventFile.name,
                url,
                storagePath: path,
                createdAt: serverTimestamp(),
                createdBy: user.uid,
                createdByName: user.displayName || user.email || "משתמש",
            };
            await addDoc(collection(db, "events", id, "files"), fileData);
            setShowEventFileModal(false);
            setEventFile(null);
            setEventFileName("");
        } catch (err) {
            console.error("Error uploading event file:", err);
            alert("שגיאה בהעלאת הקובץ");
        } finally {
            setEventFileUploading(false);
        }
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;

        try {
            const required = Math.max(1, Number(newTask.requiredCompletions) || 1);
            if (newTask.isVolunteerTask) {
                const hours = newTask.volunteerHours;
                if (hours == null || Number(hours) <= 0 || Number.isNaN(Number(hours))) {
                    alert("יש למלא שעות משוערות למשימת מתנדב");
                    return;
                }
            }
            const cleanAssignees = sanitizeAssigneesForWrite(newTask.assignees);
            const offsetParsed = parseOffset(newTaskOffsetDays);
            const eventStart = eventStartRef.current || getEventStartDate();
            const inferredDue = newTask.dueDate ? "" : inferSmartDueDate(newTask as Task, eventStart);
            const dueDateValue = newTask.dueDate
                ? newTask.dueDate
                : inferredDue || computeDueDateFromMode(newTaskDueMode, offsetParsed ?? 0, newTaskTime || extractTimeString(eventStart || new Date()));
            const primary = cleanAssignees[0];
            const docRef = await addDoc(collection(db, "events", id, "tasks"), {
                ...newTask,
                filesCount: newTaskFiles.length || 0,
                assignees: cleanAssignees,
                assignee: primary?.name || newTask.assignee,
                assigneeId: primary?.userId || newTask.assigneeId || null,
                status: "TODO",
                isVolunteerTask: newTask.isVolunteerTask || false,
                volunteerHours: newTask.isVolunteerTask
                    ? (newTask.volunteerHours != null ? Number(newTask.volunteerHours) : null)
                    : null,
                requiredCompletions: required,
                remainingCompletions: required,
                dueDate: dueDateValue,
                createdAt: serverTimestamp(),
                createdBy: user.uid,
                createdByEmail: user.email || "",
                createdByName: user.displayName || user.email || "משתמש",
            });
            let uploadedFiles: { name?: string; url?: string; storagePath?: string; originalName?: string }[] = [];
            if (newTaskFiles.length) {
                uploadedFiles = await uploadTaskFiles(docRef.id, newTask.title, newTaskFiles);
            }
            if (saveNewTaskToLibrary) {
                await saveTaskToRepeatLibrary({
                    title: newTask.title,
                    description: newTask.description,
                    priority: newTask.priority,
                    dueDate: dueDateValue,
                    assignees: cleanAssignees,
                    isVolunteerTask: newTask.isVolunteerTask,
                    volunteerHours: newTask.volunteerHours,
                    files: uploadedFiles,
                });
            }
            sendTagAlerts(cleanAssignees, {
                ...newTask,
                id: docRef.id,
                title: newTask.title,
                description: newTask.description,
                priority: newTask.priority,
                dueDate: dueDateValue,
            } as Task).catch(() => { /* כבר טופל בלוג */ });
            setShowNewTask(false);
            setNewTask({ title: "", description: "", assignee: "", assigneeId: "", assignees: [], dueDate: "", priority: "NORMAL", isVolunteerTask: false, volunteerHours: null, requiredCompletions: 1 });
            setNewTaskDueMode("event_day");
            setNewTaskOffsetDays("0");
            setNewTaskTime(extractTimeString(getEventStartDate() || new Date()));
            setNewTaskFiles([]);
            setSaveNewTaskToLibrary(false);
        } catch (err) {
            console.error("Error adding task:", err);
            alert("שגיאה בהוספת משימה");
        }
    };

    const startEditingTask = (task: Task) => {
        const meta = deriveEditDueState(task.dueDate);
        const ensuredDue = task.dueDate || computeDueDateFromMode(meta.mode, parseOffset(meta.offset) ?? 0, meta.time);
        const required = task.requiredCompletions != null ? Number(task.requiredCompletions) : 1;
        const remaining = task.remainingCompletions != null ? Number(task.remainingCompletions) : required;
        setEditTaskDueMode(meta.mode);
        setEditTaskOffsetDays(meta.offset);
        setEditTaskTime(meta.time);
        setEditingTask({ ...task, dueDate: ensuredDue, requiredCompletions: required, remainingCompletions: remaining });
        setEditTaskSearch("");
        setSaveEditTaskToLibrary(false);
    };

    const handleUpdateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !editingTask || !user) return;

        try {
            if (editingTask.isVolunteerTask) {
                const hours = editingTask.volunteerHours;
                if (hours == null || Number(hours) <= 0 || Number.isNaN(Number(hours))) {
                    alert("יש למלא שעות משוערות למשימת מתנדב");
                    return;
                }
            }
            const required = Math.max(1, Number(editingTask.requiredCompletions) || 1);
            const remainingRaw = editingTask.remainingCompletions;
            const remaining = remainingRaw == null ? required : Math.max(0, Math.min(required, Number(remainingRaw)));
            const taskRef = doc(db, "events", id, "tasks", editingTask.id);
            const cleanAssignees = sanitizeAssigneesForWrite(editingTask.assignees || []);
            const offsetParsed = parseOffset(editTaskOffsetDays);
            const dueDateValue = editingTask.dueDate || computeDueDateFromMode(editTaskDueMode, offsetParsed ?? 0, editTaskTime || extractTimeString(getEventStartDate() || new Date()));
            const updateData: any = {
                title: editingTask.title,
                description: editingTask.description || "",
                assignee: cleanAssignees[0]?.name || editingTask.assignee || "",
                assigneeId: cleanAssignees[0]?.userId || editingTask.assigneeId || null,
                assignees: cleanAssignees,
                dueDate: dueDateValue,
                priority: editingTask.priority,
                status: editingTask.status,
                currentStatus: editingTask.currentStatus || "",
                nextStep: editingTask.nextStep || "",
                isVolunteerTask: editingTask.isVolunteerTask || false,
                volunteerHours: editingTask.isVolunteerTask
                    ? (editingTask.volunteerHours != null ? Number(editingTask.volunteerHours) : null)
                    : null,
                createdByEmail: (editingTask as any).createdByEmail || user?.email || "",
                createdByName: editingTask.createdByName || user?.displayName || user?.email || "משתמש",
                requiredCompletions: required,
                remainingCompletions: remaining,
            };
            await updateDoc(taskRef, updateData);
            if (saveEditTaskToLibrary) {
                const filesForLibrary = await loadTaskFilesForLibrary(editingTask.id);
                await saveTaskToRepeatLibrary({
                    title: editingTask.title,
                    description: editingTask.description,
                    priority: editingTask.priority,
                    dueDate: editingTask.dueDate,
                    assignees: cleanAssignees,
                    isVolunteerTask: editingTask.isVolunteerTask,
                    volunteerHours: editingTask.volunteerHours,
                    files: filesForLibrary,
                });
            }
            setEditingTask(null);
            setSaveEditTaskToLibrary(false);
        } catch (err) {
            console.error("Error updating task:", err);
            alert("שגיאה בעדכון המשימה");
        }
    };

    const sendSpecialDoneMessage = async (task: Task) => {
        const cfg = await fetchWhatsappConfig();
        if (!cfg) return;
        const endpoint = `https://api.green-api.com/waInstance${cfg.idInstance}/SendMessage/${cfg.apiTokenInstance}`;
        const origin = getPublicBaseUrl(cfg.baseUrl);
        const taskLink = origin ? `${origin}/tasks/${task.id}?eventId=${id}` : "";
        const eventLink = origin ? `${origin}/events/${id}` : "";
        const senderName = user?.displayName || user?.email || "מתנדב";

        const getCreatorPhone = async () => {
            if ((task as any).createdByPhone) return (task as any).createdByPhone as string;
            if ((task as any).createdBy) {
                try {
                    const snap = await getDoc(doc(db!, "users", (task as any).createdBy));
                    if (snap.exists()) {
                        const data = snap.data() as any;
                        if (data?.phone) return data.phone as string;
                    }
                } catch { /* ignore */ }
            }
            if (event?.contactPerson?.phone) return event.contactPerson.phone;
            return "";
        };

        const phone = normalizePhone(await getCreatorPhone());
        if (!phone) return;

        const lines = [
            "בקשת אישור משימה מיוחדת:",
            `משימה: ${task.title}`,
            event?.title ? `אירוע: ${event.title}` : "",
            `המתנדב אישר ששלח צילומי מסך.`,
            `מתנדב: ${senderName}`,
            taskLink ? `דף המשימה: ${taskLink}` : "",
            eventLink ? `דף האירוע: ${eventLink}` : "",
        ].filter(Boolean);
        const message = lines.join("\n");
        await ensureGlobalRateLimit();
        await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId: `${phone}@c.us`, message }),
        }).catch(err => console.warn("שליחת וואטסאפ לאישור משימה נכשלה", err));
    };

    const handleStatusChange = async (task: Task, newStatus: string) => {
        if (!db) return;
        const isSpecialMarketing = (task as any).specialType === "marketing_distribution" || task.title.includes("שיווק והפצה בקבוצות");
        if (newStatus === "DONE" && isSpecialMarketing) {
            const ok = window.confirm("האם שלחת צילומי מסך ליוצר המשימה כהוכחה לביצוע?");
            if (!ok) return;
            sendSpecialDoneMessage(task).catch(() => { /* logged inside */ });
        }
        const required = task.requiredCompletions != null ? Math.max(1, Number(task.requiredCompletions)) : 1;
        const remaining = task.remainingCompletions != null ? Math.max(0, Number(task.remainingCompletions)) : required;
        if (newStatus === "DONE" && required > 1) {
            const nextRemaining = task.isVolunteerTask ? remaining : Math.max(remaining - 1, 0);
            const nextStatus = nextRemaining > 0 ? "IN_PROGRESS" : "DONE";
            try {
                const updateData: any = { status: nextStatus };
                if (!task.isVolunteerTask) {
                    updateData.remainingCompletions = nextRemaining;
                }
                await updateDoc(doc(db, "events", id, "tasks", task.id), updateData);
                if (!task.isVolunteerTask && nextRemaining > 0) {
                    alert(`סימנת ביצוע. נותרו עוד ${nextRemaining} מתוך ${required}.`);
                }
            } catch (err) {
                console.error("Error updating status with completions:", err);
            }
            return;
        }
        try {
            await updateDoc(doc(db, "events", id, "tasks", task.id), {
                status: newStatus
            });
        } catch (err) {
            console.error("Error updating status:", err);
        }
    };

    const handleUpdateCompletions = async (task: Task) => {
        if (!db) return;
        const currentRequired = task.requiredCompletions != null ? Number(task.requiredCompletions) : 1;
        const input = typeof window !== "undefined" ? window.prompt("כמה פעמים צריך לבצע את המשימה?", String(currentRequired > 0 ? currentRequired : 1)) : null;
        if (input == null) return;
        const parsed = parseInt(input, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
            alert("יש להזין מספר גדול מאפס");
            return;
        }
        const newRequired = parsed;
        const newRemaining = newRequired;
        try {
            await updateDoc(doc(db, "events", id, "tasks", task.id), {
                requiredCompletions: newRequired,
                remainingCompletions: newRemaining,
                status: task.status === "DONE" && newRemaining > 0 ? "IN_PROGRESS" : task.status,
            });
        } catch (err) {
            console.error("Error updating completions", err);
            alert("שגיאה בעדכון מספר החזרות");
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

    const handleSaveEventDetails = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !event) return;

        try {
            const startBase = eventForm.startTime
                ? new Date(eventForm.startTime)
                : (event.startTime?.seconds ? new Date(event.startTime.seconds * 1000) : new Date(event.startTime));
            const duration = eventForm.durationHours ? parseFloat(eventForm.durationHours) : undefined;

            let startDateForDuration: Date | null = startBase ? new Date(startBase) : null;

            let recurrenceEnd: Date | null = null;
            if (eventForm.recurrence !== "NONE" && eventForm.recurrenceEndDate) {
                const parsed = new Date(eventForm.recurrenceEndDate);
                if (!isNaN(parsed.getTime())) {
                    recurrenceEnd = parsed;
                }
            }
            const normalizedStart = computeNextOccurrence(
                startDateForDuration || new Date(),
                eventForm.recurrence || "NONE",
                recurrenceEnd
            );
            startDateForDuration = normalizedStart;
            const calculatedEnd = duration && startDateForDuration && !isNaN(duration)
                ? new Date(startDateForDuration.getTime() + duration * 60 * 60 * 1000)
                : event.endTime;
            const volunteersCountNum = eventForm.volunteersCount ? parseInt(eventForm.volunteersCount, 10) : null;

            await updateDoc(doc(db, "events", id), {
                title: eventForm.title,
                location: eventForm.location,
                description: eventForm.description,
                participantsCount: eventForm.participantsCount,
                partners: eventForm.partners,
                goal: eventForm.goal,
                budget: eventForm.budget,
                status: eventForm.status || event.status,
                recurrence: eventForm.recurrence || "NONE",
                recurrenceEndDate: recurrenceEnd,
                needsVolunteers: eventForm.needsVolunteers,
                volunteersCount: eventForm.needsVolunteers && Number.isFinite(volunteersCountNum) ? volunteersCountNum : null,
                startTime: normalizedStart,
                endTime: calculatedEnd,
                durationHours: duration && !isNaN(duration) ? duration : null,
                contactPerson: {
                    name: eventForm.contactName,
                    phone: eventForm.contactPhone,
                    email: eventForm.contactEmail,
                },
                customSections: (eventForm.customSections || []).map(section => ({
                    title: section.title,
                    content: section.content,
                })),
            });
            setIsEditEventOpen(false);
        } catch (err) {
            console.error("Error updating event details:", err);
            alert("שגיאה בעדכון פרטי האירוע");
        }
    };

    const buildRegisterLink = () => {
        const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
        if (!origin) return "";
        return `${origin}/events/${id}/register`;
    };

    const buildVolunteerLink = () => {
        const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
        if (!origin) return "";
        return `${origin}/events/${id}/volunteers`;
    };

    const buildPostContent = () => {
        const startDate = event?.startTime?.seconds ? new Date(event.startTime.seconds * 1000) : null;
        const dateText = startDate ? startDate.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
        const timeText = startDate ? startDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "";
        const flyerText = flyerLink ? `פלייר: ${flyerLink}` : "";
        const register = buildRegisterLink();

        const title = event?.title || "האירוע שלנו";
        const promise = event?.goal || eventForm.goal || event?.description || eventForm.description || "חוויה מרגשת, תוכן מעולה ואנשים טובים.";
        const placeLine = event?.location ? `📍 מקום: ${event.location}` : "";
        const dateLine = dateText ? `📅 תאריך: ${dateText}` : "";
        const timeLine = timeText ? `⏰ שעה: ${timeText}` : "";
        const cta = register ? `להרשמה: ${register}` : "";

        const variants = [
            () => [
                `אנחנו מזמינים אתכם ל"${title}"`,
                "אירוע מיוחד ויוצא דופן לקהל הרחב",
                "אז מה מחכה לכם?",
                promise,
                dateLine,
                timeLine,
                placeLine,
                "מחכים לכם שם באנרגיות טובות!",
                cta,
                flyerText
            ],
            () => [
                `בואו ל"${title}" - ערב שלא תרצו לפספס`,
                promise,
                "תפסו מקום ותרשמו עכשיו:",
                cta,
                dateLine,
                timeLine,
                placeLine,
                flyerText
            ],
            () => [
                `״${title}״ בדרך ואתם רשומים ברשימת המוזמנים שלנו`,
                promise,
                "בואו עם חברים, חיוך וסקרנות.",
                dateLine,
                timeLine,
                placeLine,
                cta,
                flyerText
            ]
        ];

        const pick = variants[Math.floor(Math.random() * variants.length)];
        return pick().filter(Boolean).join("\n");
    };

    const handleOpenPostModal = () => {
        setPostContent(buildPostContent());
        setShowPostModal(true);
    };

    const handleOpenContentModal = () => {
        setOfficialPostText(prev => prev || buildPostContent());
        setShowContentModal(true);
    };

    const addInstagramTag = (raw: string) => {
        const clean = (raw || "").trim().replace(/^@+/, "");
        if (!clean) return;
        setOfficialInstaTagsList(prev => {
            if (prev.includes(clean)) return prev;
            return [...prev, clean];
        });
        setInstaTagInput("");
    };

    const removeInstagramTag = (tag: string) => {
        setOfficialInstaTagsList(prev => prev.filter(t => t !== tag));
    };

    const handleCopyPost = async () => {
        try {
            await navigator.clipboard.writeText(postContent);
            alert("המלל הועתק");
        } catch (err) {
            console.error("copy failed", err);
            alert("לא הצלחנו להעתיק, נסה ידנית");
        }
    };

    const handleRefreshPost = () => {
        setPostContent(buildPostContent());
    };

    const handleUploadOfficialFlyer = async () => {
        if (!db || !storage || !officialFlyerFile) {
            alert("בחר קובץ פלייר קודם");
            return;
        }
        setOfficialFlyerUploading(true);
        try {
            const path = `events/${id}/files/flyer-${Date.now()}-${officialFlyerFile.name}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, officialFlyerFile);
            const url = await getDownloadURL(storageRef);
            const fileData = {
                name: officialFlyerFile.name,
                originalName: officialFlyerFile.name,
                url,
                storagePath: path,
                createdAt: serverTimestamp(),
                createdBy: user?.uid || "system",
                createdByName: user?.displayName || user?.email || "משתמש",
            };
            const fileDoc = await addDoc(collection(db, "events", id, "files"), fileData);
            setOfficialFlyerUrl(url);
            setEventFiles(prev => [{ id: fileDoc.id, name: fileData.name, url }, ...prev]);
            setOfficialFlyerFile(null);
            // Persist on the event so שיישמר גם אחרי יציאה
            try {
                await updateDoc(doc(db, "events", id), {
                    officialFlyerUrl: url,
                    updatedAt: serverTimestamp(),
                });
                setEvent(prev => prev ? { ...prev, officialFlyerUrl: url } : prev);
            } catch (eventErr) {
                console.warn("שגיאה בעדכון האירוע עם הפלייר", eventErr);
            }
        } catch (err) {
            console.error("שגיאה בהעלאת הפלייר", err);
            alert("לא הצלחנו להעלות את הפלייר");
        } finally {
            setOfficialFlyerUploading(false);
        }
    };

    const handleSaveContentAndMedia = async () => {
        if (!db) return;
        const tags = officialInstaTagsList
            .map(t => t.trim())
            .filter(Boolean)
            .map(t => t.startsWith("@") ? t : `@${t}`);
        try {
            await updateDoc(doc(db, "events", id), {
                officialPostText,
                officialInstagramTags: tags,
                officialFlyerUrl,
            });
            setEvent(prev => prev ? { ...prev, officialPostText, officialInstagramTags: tags, officialFlyerUrl } : prev);
            setShowContentModal(false);
            alert("תוכן ומדיה נשמרו");
        } catch (err) {
            console.error("שגיאה בשמירת תוכן/מדיה", err);
            alert("לא הצלחנו לשמור את התוכן");
        }
    };

    const buildMarketingTaskDescription = () => {
        const officialText = officialPostText || buildPostContent();
        const lines = [
            "הנחיות שיווק והפצה בקבוצות:",
            "1. קח/י את המלל הרשמי והפלייר המצורף.",
            "2. פרסם/י ב-5 קבוצות וואטסאפ שונות עם 30+ משתתפים כל אחת.",
            "3. צלם/י מסך מכל פרסום והעלה/י כהוכחה לביצוע.",
            "",
            "מלל רשמי:",
            officialText,
            officialFlyerUrl ? `קישור פלייר: ${officialFlyerUrl}` : "",
        ].filter(Boolean);
        return lines.join("\n");
    };

    const buildStoryTaskDescription = () => {
        const tagsList = (event?.officialInstagramTags || officialInstaTagsList || []).map(t => t.trim()).filter(Boolean);
        const tagLine = tagsList.length ? `יש לתייג את האנשים הבאים: ${tagsList.join(" ")}` : "יש לתייג את כל מי שמופיע בתוכן ומדיה.";
        const lines = [
            "הנחיות סטורי:",
            "1. השתמש/י בפלייר הרשמי המצורף והעלה/י סטורי.",
            tagLine,
            "2. הוסף/י מוזיקה בסטורי (שיר שקשור לאירוע).",
            "3. לאחר העלאה שלח/י צילום מסך ליוצר המשימה.",
        ].filter(Boolean);
        return lines.join("\n");
    };

    const handleCreateSpecialMarketingTask = async () => {
        if (!db || !id) return;
        setCreatingSpecialTask(true);
        try {
            const taskPayload: Partial<Task> = {
                title: "שיווק והפצה בקבוצות",
                description: buildMarketingTaskDescription(),
                priority: "HIGH",
                status: "TODO",
                assignee: "",
                assigneeId: "",
                assignees: [],
                isVolunteerTask: true,
                volunteerHours: 1,
                specialType: "marketing_distribution" as any,
                eventTitle: event?.title || "",
                eventId: id,
                previewImage: officialFlyerUrl || "",
                requiredCompletions: 1,
                remainingCompletions: 1,
            };
            const start = getEventStartDate();
            const due = inferSmartDueDate(taskPayload as Task, start);
            const docRef = await addDoc(collection(db, "events", id, "tasks"), {
                ...taskPayload,
                dueDate: due,
                filesCount: officialFlyerUrl ? 1 : 0,
                createdAt: serverTimestamp(),
                createdBy: user?.uid || null,
                createdByName: user?.displayName || user?.email || "",
            });
            if (officialFlyerUrl) {
                try {
                    await addDoc(collection(db, "events", id, "tasks", docRef.id, "files"), {
                        name: "פלייר האירוע",
                        originalName: "official-flyer",
                        url: officialFlyerUrl,
                        storagePath: "",
                        createdAt: serverTimestamp(),
                        createdBy: user?.uid || null,
                        createdByName: user?.displayName || user?.email || "משתמש",
                    });
                } catch (fileErr) {
                    console.warn("שגיאה בשמירת הפלייר על המשימה", fileErr);
                }
            }
            // optimistic: no need to push to state as snapshot updates, but add quick local feedback
            alert("המשימה נוצרה ונוספה למשימות האירוע");
            setShowSpecialModal(false);
        } catch (err) {
            console.error("שגיאה ביצירת משימה מיוחדת", err);
            alert("לא הצלחנו ליצור את המשימה המיוחדת");
        } finally {
            setCreatingSpecialTask(false);
        }
    };

    const handleCreateSpecialStoryTask = async () => {
        if (!db || !id) return;
        setCreatingSpecialTask(true);
        try {
            const taskPayload: Partial<Task> = {
                title: "להעלות סטורי ולתייג",
                description: buildStoryTaskDescription(),
                priority: "HIGH",
                status: "TODO",
                assignee: "",
                assigneeId: "",
                assignees: [],
                isVolunteerTask: true,
                volunteerHours: 0.5,
                specialType: "story_tag" as any,
                eventTitle: event?.title || "",
                eventId: id,
                previewImage: officialFlyerUrl || "",
                requiredCompletions: 1,
                remainingCompletions: 1,
            };
            const start = getEventStartDate();
            const due = inferSmartDueDate(taskPayload as Task, start);
            const docRef = await addDoc(collection(db, "events", id, "tasks"), {
                ...taskPayload,
                dueDate: due,
                filesCount: officialFlyerUrl ? 1 : 0,
                createdAt: serverTimestamp(),
                createdBy: user?.uid || null,
                createdByName: user?.displayName || user?.email || "",
            });
            if (officialFlyerUrl) {
                try {
                    await addDoc(collection(db, "events", id, "tasks", docRef.id, "files"), {
                        name: "פלייר האירוע",
                        originalName: "official-flyer",
                        url: officialFlyerUrl,
                        storagePath: "",
                        createdAt: serverTimestamp(),
                        createdBy: user?.uid || null,
                        createdByName: user?.displayName || user?.email || "משתמש",
                    });
                } catch (fileErr) {
                    console.warn("שגיאה בשמירת הפלייר על משימת סטורי", fileErr);
                }
            }
            alert("משימת סטורי נוצרה ונוספה למשימות האירוע");
            setShowSpecialModal(false);
        } catch (err) {
            console.error("שגיאה ביצירת משימת סטורי", err);
            alert("לא הצלחנו ליצור את משימת הסטורי");
        } finally {
            setCreatingSpecialTask(false);
        }
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
                // מחיקה של קבצי האירוע ושל קבצי המשימות כדי לא לצבור עלויות אחסון
                const storagePaths = new Set<string>();
                const collectPath = (path?: string | null) => {
                    if (path) storagePaths.add(path);
                };

                // קבצי האירוע (מאגר מרכזי)
                try {
                    const filesSnap = await getDocs(collection(db, "events", id, "files"));
                    const deletions = filesSnap.docs.map(async (d) => {
                        const data = d.data() as any;
                        collectPath(data.storagePath);
                        try { await deleteDoc(d.ref); } catch (err) { console.error("Failed deleting file doc", err); }
                    });
                    await Promise.all(deletions);
                } catch (err) {
                    console.error("Error cleaning event files:", err);
                }

                // קבצי משימות (בתוך כל משימה)
                try {
                    const tasksSnap = await getDocs(collection(db, "events", id, "tasks"));
                    for (const taskDoc of tasksSnap.docs) {
                        try {
                            const taskFilesSnap = await getDocs(collection(db, "events", id, "tasks", taskDoc.id, "files"));
                            const deleteTaskFiles = taskFilesSnap.docs.map(async (fd) => {
                                const data = fd.data() as any;
                                collectPath(data.storagePath);
                                try { await deleteDoc(fd.ref); } catch (err) { console.error("Failed deleting task file doc", err); }
                            });
                            await Promise.all(deleteTaskFiles);
                        } catch (err) {
                            console.error("Error cleaning task files:", err);
                        }
                        try { await deleteDoc(taskDoc.ref); } catch (err) { console.error("Failed deleting task doc", err); }
                    }
                } catch (err) {
                    console.error("Error cleaning tasks:", err);
                }

                // מחיקת קבצים מ-Storage
                if (storage && storagePaths.size > 0) {
                    const storageDeletes = Array.from(storagePaths).map(path =>
                        deleteObject(ref(storage!, path)).catch(err => console.error("Failed deleting storage file", err))
                    );
                    await Promise.all(storageDeletes);
                }

                await deleteDoc(doc(db, "events", id));
                router.push("/");
            }
        } catch (err) {
            console.error(`Error deleting ${type}:`, err);
            alert(`שגיאה במחיקה`);
        }
    };

    const handleAddTeamMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canManageTeam) {
            alert("אין לך הרשאה להוסיף שותפים לצוות.");
            return;
        }
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

    const handleRemoveTeamMember = async (index: number) => {
        if (!canManageTeam) {
            alert("אין לך הרשאה להסיר שותפים.");
            return;
        }
        if (!db || !event?.team || !event.team[index]) return;
        const member = event.team[index];

        const updatedTeam = event.team.filter((_, i) => i !== index);
        const updates: any = { team: updatedTeam };
        if (member.userId) {
            updates.members = (event.members || []).filter(m => m !== member.userId);
        }

        try {
            await updateDoc(doc(db, "events", id), updates);
            setEvent(prev => prev ? { ...prev, ...updates } : prev);
            setConfirmRemoveIdx(null);
        } catch (err) {
            console.error("Error removing team member:", err);
            alert("שגיאה בהסרת איש צוות");
        }
    };

    const handleDeleteVolunteer = async (volunteerId: string) => {
        if (!db || !event) return;
        if (!confirm("למחוק את המתנדב מהרשימה?")) return;
        setVolunteerBusyId(volunteerId);
        try {
            await deleteDoc(doc(db, "events", id, "volunteers", volunteerId));
            setVolunteers(prev => prev.filter(v => v.id !== volunteerId));
        } catch (err) {
            console.error("Failed to delete volunteer", err);
            alert("שגיאה במחיקת מתנדב");
        } finally {
            setVolunteerBusyId(null);
        }
    };

    const handleApproveJoinRequest = async (req: JoinRequest) => {
        if (!canManageTeam || !db || !event) return;
        try {
            await Promise.all([
                updateDoc(doc(db, "events", id), {
                    members: arrayUnion(req.requesterId),
                    team: arrayUnion({
                        name: req.requesterName || req.requesterEmail?.split("@")[0] || "חבר צוות",
                        role: "חבר צוות",
                        email: req.requesterEmail || "",
                        userId: req.requesterId
                    })
                }),
                updateDoc(doc(db, "join_requests", req.id), {
                    status: "APPROVED",
                    respondedAt: serverTimestamp()
                })
            ]);
        } catch (err) {
            console.error("Error approving join request:", err);
            alert("שגיאה באישור הבקשה");
        }
    };

    const handleRejectJoinRequest = async (req: JoinRequest) => {
        if (!canManageTeam || !db) return;
        try {
            await updateDoc(doc(db, "join_requests", req.id), {
                status: "REJECTED",
                respondedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error rejecting join request:", err);
            alert("שגיאה בדחיית הבקשה");
        }
    };

    const handleAddCollaboratorToTeam = async (collab: { id: string; fullName?: string; email?: string; role?: string }) => {
        if (!canManageTeam || !db) return;
        if (event?.team?.some(m => m.userId === collab.id || (m.email && collab.email && m.email.toLowerCase() === collab.email.toLowerCase()))) {
            alert("המשתמש כבר בצוות");
            return;
        }
        try {
            await updateDoc(doc(db, "events", id), {
                members: collab.id ? arrayUnion(collab.id) : arrayUnion(),
                team: arrayUnion({
                    name: collab.fullName || collab.email || "איש צוות",
                    role: collab.role || "חבר צוות",
                    email: collab.email || "",
                    userId: collab.id || undefined,
                })
            });
            setShowCollaboratorsPicker(false);
        } catch (err) {
            console.error("Error adding collaborator to team", err);
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
            const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
            const inviteLink = origin ? `${origin}/events/${id}/join` : "";
            if (!inviteLink) {
                alert("לא הצלחנו ליצור קישור הזמנה");
                return;
            }
            await navigator.clipboard.writeText(inviteLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
            alert("לא הצלחנו להעתיק את הקישור. נסה להעתיק ידנית מהדפדפן.");
        }
    };

    const copyRegisterLink = async () => {
        try {
            const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
            const registerLink = origin ? `${origin}/events/${id}/register` : "";
            if (!registerLink) {
                alert("לא הצלחנו ליצור קישור הרשמה");
                return;
            }
            await navigator.clipboard.writeText(registerLink);
            setCopiedRegister(true);
            setTimeout(() => setCopiedRegister(false), 2000);
        } catch (err) {
            console.error("Failed to copy register link:", err);
            alert("לא הצלחנו להעתיק את הקישור לטופס ההרשמה.");
        }
    };

    const copyVolunteerLink = async () => {
        try {
            const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
            const volunteerLink = origin ? `${origin}/events/${id}/volunteers/register` : "";
            if (!volunteerLink) {
                alert("לא הצלחנו ליצור קישור מתנדבים");
                return;
            }
            await navigator.clipboard.writeText(volunteerLink);
            setCopiedVolunteersLink(true);
            setTimeout(() => setCopiedVolunteersLink(false), 2000);
        } catch (err) {
            console.error("Failed to copy volunteer link:", err);
            alert("לא הצלחנו להעתיק את הקישור להרשמת מתנדבים.");
        }
    };

    const copyContentFormLink = async () => {
        try {
            const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
            const link = origin ? `${origin}/events/${id}/content-form` : "";
            if (!link) {
                alert("לא הצלחנו ליצור קישור לטופס התוכן");
                return;
            }
            await navigator.clipboard.writeText(link);
            setCopiedContentFormLink(true);
            setTimeout(() => setCopiedContentFormLink(false), 2000);
        } catch (err) {
            console.error("Failed to copy content form link:", err);
            alert("לא הצלחנו להעתיק את הקישור לטופס התוכן.");
        }
    };

    const updateVolunteerCount = async () => {
        if (!db || !canManageTeam) return;
        try {
            const count = volunteerCountInput.trim() ? parseInt(volunteerCountInput, 10) : null;
            if (volunteerCountInput.trim() && (!Number.isFinite(count) || count! < 0)) {
                alert("יש להזין מספר תקין של מתנדבים");
                return;
            }
            const eventRef = doc(db, "events", id);
            await updateDoc(eventRef, {
                volunteersCount: count
            });
            setShowVolunteerModal(false);
        } catch (err) {
            console.error("Error updating volunteer count:", err);
            alert("שגיאה בעדכון כמות המתנדבים");
        }
    };

    const handleSaveControlCenter = async () => {
        if (!canManageTeam || !db) {
            alert("אין לך הרשאה לשנות את מצב האירוע.");
            return;
        }
        setControlSaving(true);
        try {
            await updateDoc(doc(db, "events", id), {
                volunteerTasksPaused: volunteerSharePaused,
                teamTasksPaused: teamSharePaused,
                updatedAt: serverTimestamp(),
            });
            setEvent(prev => prev ? { ...prev, volunteerTasksPaused: volunteerSharePaused, teamTasksPaused: teamSharePaused } : prev);
            setShowControlCenter(false);
        } catch (err) {
            console.error("Failed to update control center", err);
            alert("שגיאה בשמירת מרכז הבקרה");
        } finally {
            setControlSaving(false);
        }
    };

    const normalizePhoneForWhatsApp = (phone: string) => {
        const digits = (phone || "").replace(/\D/g, "");
        if (!digits) return "";
        if (digits.startsWith("00")) return digits.slice(2);
        if (digits.startsWith("+")) return digits.slice(1);
        if (digits.startsWith("972")) return digits;
        if (digits.startsWith("0")) return `972${digits.slice(1)}`;
        return digits;
    };

    const handleOpenWhatsApp = (phone?: string) => {
        const normalized = normalizePhoneForWhatsApp(phone || "");
        if (!normalized) {
            alert("לא נמצא מספר טלפון תקין לאיש הקשר");
            return;
        }
        window.open(`https://wa.me/${normalized}`, "_blank");
    };

    const formatGoogleDate = (date: Date) =>
        date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const handleAddEventToCalendar = () => {
        if (!event) return;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const collectTeamEmails = () => {
            const set = new Set<string>();
            (event.team || []).forEach((m) => {
                const raw = (m.email || "").toLowerCase();
                const parts = raw.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean);
                parts.forEach((p) => {
                    if (emailRegex.test(p)) set.add(p);
                });
            });
            return Array.from(set);
        };
        const parseDate = (value: any) => {
            if (!value) return null;
            if (value?.seconds) return new Date(value.seconds * 1000);
            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        };
        const start = parseDate(event.startTime);
        const endCandidate = parseDate((event as any).endTime);
        const origin = getPublicBaseUrl();
        if (!start) {
            alert("אין תאריך התחלה תקין לאירוע. עדכן/י תאריך לפני הוספה ליומן.");
            return;
        }
        const end = endCandidate || new Date(start.getTime() + 2 * 60 * 60 * 1000);
        const text = encodeURIComponent(event.title || "אירוע");
        const whenStr = start.toLocaleString("he-IL", { dateStyle: "full", timeStyle: "short" });
        const endStr = end ? end.toLocaleString("he-IL", { dateStyle: "full", timeStyle: "short" }) : "";
        const detailsLines = [
            `שם האירוע: ${event.title || "אירוע"}`,
            `מתי: ${whenStr}${endStr ? ` עד ${endStr}` : ""}`,
            event.location ? `איפה: ${event.location}` : "",
            event.description ? `תיאור: ${event.description}` : "",
            event.contactPerson?.name ? `איש קשר: ${event.contactPerson.name}` : "",
            event.contactPerson?.phone ? `טלפון: ${event.contactPerson.phone}` : "",
            (event.partners as any)?.length ? `שותפים: ${(event.partners as any).join(", ")}` : "",
            event.needsVolunteers ? `התנדבות: ${event.volunteersCount ? `נדרשים ${event.volunteersCount}` : "נדרשים מתנדבים"}` : "",
            origin ? `דף האירוע: ${origin}/events/${id}` : "",
        ].filter(Boolean);
        const details = encodeURIComponent(detailsLines.join("\n"));
        const location = encodeURIComponent(event.location || "");
        const dates = `${formatGoogleDate(start)}/${formatGoogleDate(end)}`;
        const teamEmails = collectTeamEmails();
        const addParam = teamEmails.length ? `&add=${encodeURIComponent(teamEmails.join(","))}` : "";
        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}${addParam}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    const handleLibraryEditStart = (t?: { id?: string; title?: string; description?: string; priority?: any }) => {
        if (t?.id) {
            setLibraryForm({
                id: t.id,
                title: t.title || "",
                description: t.description || "",
                priority: (t.priority as any) || "NORMAL",
            });
        } else {
            setLibraryForm({ id: "", title: "", description: "", priority: "NORMAL" });
        }
    };

    const handleSaveLibraryTask = async () => {
        if (!db) return;
        const title = libraryForm.title.trim();
        if (!title) {
            alert("יש למלא שם משימה");
            return;
        }
        const payload: any = {
            title,
            description: libraryForm.description.trim(),
            priority: libraryForm.priority || "NORMAL",
            template: {
                title,
                description: libraryForm.description.trim(),
                priority: libraryForm.priority || "NORMAL",
            },
            updatedAt: serverTimestamp(),
        };
        setSavingLibraryTask(true);
        try {
            if (libraryForm.id) {
                await setDoc(doc(db, "default_tasks", libraryForm.id), payload, { merge: true });
            } else {
                await addDoc(collection(db, "default_tasks"), { ...payload, createdAt: serverTimestamp() });
            }
            setLibraryForm({ id: "", title: "", description: "", priority: "NORMAL" });
        } catch (err) {
            console.error("Failed saving library task", err);
            alert("שגיאה בשמירת המשימה למאגר");
        } finally {
            setSavingLibraryTask(false);
        }
    };

    const handleDeleteLibraryTask = async (task: { id: string; title?: string }) => {
        if (!db || !task.id) return;
        const ok = typeof window !== "undefined" ? window.confirm("למחוק את המשימה מהמאגר?") : true;
        if (!ok) return;
        setDeletingLibraryTaskId(task.id);
        try {
            await deleteDoc(doc(db, "default_tasks", task.id));
            const key = normalizeTaskKey(task.title || "");
            if (key) {
                await deleteDoc(doc(db, "repeat_tasks", key)).catch(() => { });
            }
            if (libraryForm.id === task.id) {
                setLibraryForm({ id: "", title: "", description: "", priority: "NORMAL" });
            }
        } catch (err) {
            console.error("Failed deleting library task", err);
            alert("שגיאה במחיקת המשימה מהמאגר");
        } finally {
            setDeletingLibraryTaskId(null);
        }
    };

    const handleAddLibraryTaskToEvent = async (t: any) => {
        if (!db || !user || !id) return;
        const template = t.template || t;
        const assignees = sanitizeAssigneesForWrite(template.assignees || []);
        const primary = assignees[0];
        const filesFromTemplate: { name?: string; url?: string; storagePath?: string; originalName?: string }[] = Array.isArray(template.files)
            ? template.files.filter((f: any) => f && f.url)
            : [];
        let required = template.requiredCompletions != null ? Math.max(1, Number(template.requiredCompletions)) : 1;
        if (typeof window !== "undefined") {
            const input = window.prompt("כמה פעמים צריך לבצע את המשימה?", String(required));
            if (input != null) {
                const parsed = parseInt(input, 10);
                if (!Number.isFinite(parsed) || parsed < 1) {
                    alert("יש להזין מספר גדול מאפס");
                    return;
                }
                required = parsed;
            }
        }
        try {
            const docRef = await addDoc(collection(db, "events", id, "tasks"), {
                title: template.title || t.title,
                description: template.description || t.description || "",
                assignee: primary?.name || "",
                assigneeId: primary?.userId || null,
                assignees,
                dueDate: template.dueDate || "",
                priority: (template.priority as any) || "NORMAL",
                status: "TODO",
                isVolunteerTask: !!template.isVolunteerTask,
                volunteerHours: template.isVolunteerTask ? (template.volunteerHours ?? null) : null,
                filesCount: filesFromTemplate.length || 0,
                requiredCompletions: required,
                remainingCompletions: required,
                createdAt: serverTimestamp(),
                createdBy: user.uid,
                createdByEmail: user.email || "",
                createdByName: user.displayName || user.email || "משתמש",
            });

            // Attach existing media references from the template
            if (filesFromTemplate.length) {
                let previewImage: string | null = null;
                const fileWrites = filesFromTemplate.map((file: any) => {
                    const fileData = {
                        name: file.name || file.originalName || "",
                        originalName: file.originalName || file.name || "",
                        url: file.url || "",
                        storagePath: file.storagePath || "",
                        taskId: docRef.id,
                        taskTitle: template.title || t.title,
                        createdAt: serverTimestamp(),
                        createdBy: user.uid,
                        createdByName: user.displayName || user.email || "משתמש",
                    };
                    if (!previewImage && (file.url || "").match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
                        previewImage = file.url;
                    }
                    return Promise.all([
                        addDoc(collection(db!, "events", id, "tasks", docRef.id, "files"), fileData),
                        addDoc(collection(db!, "events", id, "files"), fileData),
                    ]);
                });
                await Promise.all(fileWrites);
                if (previewImage) {
                    await updateDoc(doc(db, "events", id, "tasks", docRef.id), { previewImage });
                }
            }

            if (assignees.length) {
                sendTagAlerts(assignees, {
                    id: docRef.id,
                    title: template.title,
                    description: template.description,
                    priority: template.priority || "NORMAL",
                    dueDate: template.dueDate || "",
                } as Task).catch(() => { });
            }
            alert("המשימה נוספה לאירוע");
        } catch (err) {
            console.error("Failed adding library task", err);
            alert("שגיאה בהוספת המשימה מהמאגר");
        }
    };

    const totalBudgetUsed = budgetItems.reduce((sum, item) => sum + item.amount, 0);
    const partnersLabel = Array.isArray(event.partners) ? event.partners.join(", ") : (event.partners || "");
    const specialTasks = tasks.filter((task) => {
        const type = (task as any).specialType || "";
        return (
            type === "marketing_distribution"
            || type === "story_tag"
            || task.title.includes("שיווק והפצה בקבוצות")
            || task.title.includes("להעלות סטורי")
        );
    });

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

            {/* Event Edit Modal */}
            {isEditEventOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">עריכת פרטי האירוע</h3>
                            <button onClick={() => setIsEditEventOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveEventDetails} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">שם האירוע</label>
                                    <input
                                        type="text"
                                        value={eventForm.title}
                                        onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">מיקום</label>
                                    <input
                                        type="text"
                                        value={eventForm.location}
                                        onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">תאריך ושעת האירוע</label>
                                    <input
                                        type="datetime-local"
                                        value={eventForm.startTime}
                                        onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">משך האירוע (בשעות)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={eventForm.durationHours}
                                        onChange={(e) => setEventForm({ ...eventForm, durationHours: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        placeholder="לדוגמה: 3.5"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">תדירות חוזרת</label>
                                    <select
                                        className="w-full p-2 border rounded-lg text-sm"
                                        value={eventForm.recurrence}
                                        onChange={(e) => setEventForm({ ...eventForm, recurrence: e.target.value as any })}
                                    >
                                        <option value="NONE">חד פעמי</option>
                                        <option value="WEEKLY">כל שבוע</option>
                                        <option value="BIWEEKLY">כל שבועיים</option>
                                        <option value="MONTHLY">כל חודש</option>
                                    </select>
                                    {eventForm.recurrence !== "NONE" && (
                                        <div className="mt-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">תאריך סיום החזרתיות</label>
                                            <input
                                                type="date"
                                                value={eventForm.recurrenceEndDate || ""}
                                                onChange={(e) => setEventForm({ ...eventForm, recurrenceEndDate: e.target.value })}
                                                className="w-full p-2 border rounded-lg text-sm"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">מספר משתתפים</label>
                                    <input
                                        type="text"
                                        value={eventForm.participantsCount}
                                        onChange={(e) => setEventForm({ ...eventForm, participantsCount: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                    />
                                </div>
                                <div>
                                    <PartnersInput
                                        label="שותפים"
                                        value={eventForm.partners}
                                        onChange={(partners) => setEventForm({ ...eventForm, partners })}
                                        placeholder="הוסף שותף ולחץ אנטר"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">מתנדבים לערב</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            id="needsVolunteers"
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            checked={!!eventForm.needsVolunteers}
                                            onChange={(e) => setEventForm({ ...eventForm, needsVolunteers: e.target.checked })}
                                        />
                                        <label htmlFor="needsVolunteers" className="text-gray-800 text-sm">
                                            צריך מתנדבים לערב הזה?
                                        </label>
                                    </div>
                                    {eventForm.needsVolunteers && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">כמה מתנדבים?</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="w-full p-2 border rounded-lg text-sm"
                                                value={eventForm.volunteersCount ?? ""}
                                                onChange={(e) => setEventForm({ ...eventForm, volunteersCount: e.target.value })}
                                                placeholder="מספר המתנדבים הדרוש"
                                                required={eventForm.needsVolunteers}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">מטרה</label>
                                    <textarea
                                        rows={2}
                                        value={eventForm.goal}
                                        onChange={(e) => setEventForm({ ...eventForm, goal: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">תקציב</label>
                                    <input
                                        type="text"
                                        value={eventForm.budget}
                                        onChange={(e) => setEventForm({ ...eventForm, budget: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
                                <textarea
                                    rows={3}
                                    value={eventForm.description}
                                    onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                                    className="w-full p-2 border rounded-lg text-sm"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">איש קשר - שם</label>
                                    <input
                                        type="text"
                                        value={eventForm.contactName}
                                        onChange={(e) => setEventForm({ ...eventForm, contactName: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        placeholder="לדוגמה: רוני כהן"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                                    <input
                                        type="tel"
                                        value={eventForm.contactPhone}
                                        onChange={(e) => setEventForm({ ...eventForm, contactPhone: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        placeholder="050-0000000"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                                    <input
                                        type="email"
                                        value={eventForm.contactEmail}
                                        onChange={(e) => setEventForm({ ...eventForm, contactEmail: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        placeholder="contact@patifon.co.il"
                                    />
                                </div>
                            </div>
                            <div className="pt-2 border-t border-gray-100">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">סעיפים נוספים</p>
                                        <p className="text-xs text-gray-500">הוסף מידע נוסף שרלוונטי לצוות (קווים מנחים, דרישות מיוחדות ועוד)</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddCustomSection}
                                        className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                                    >
                                        <Plus size={16} />
                                        הוסף סעיף
                                    </button>
                                </div>
                                {eventForm.customSections && eventForm.customSections.length > 0 ? (
                                    <div className="space-y-3">
                                        {eventForm.customSections.map((section, index) => (
                                            <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-xs font-semibold text-gray-500">סעיף {index + 1}</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveCustomSection(index)}
                                                        className="text-gray-400 hover:text-red-500"
                                                        title="הסר סעיף"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={section.title}
                                                    onChange={(e) => handleUpdateCustomSection(index, "title", e.target.value)}
                                                    className="w-full p-2 border rounded-lg text-sm mb-2"
                                                    placeholder="כותרת הסעיף"
                                                />
                                                <textarea
                                                    rows={3}
                                                    value={section.content}
                                                    onChange={(e) => handleUpdateCustomSection(index, "content", e.target.value)}
                                                    className="w-full p-2 border rounded-lg text-sm"
                                                    placeholder="תוכן או הוראות רלוונטיות..."
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">עדיין לא הוספת סעיפים מותאמים.</p>
                                )}
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsEditEventOpen(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                                >
                                    ביטול
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                                >
                                    שמור
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Task Chat Modal */}
            {chatTask && (
                <TaskChat
                    eventId={id}
                    taskId={chatTask.id}
                    taskTitle={chatTask.title}
                    onClose={() => setChatTask(null)}
                />
            )}

            {/* Assignee Tagging Modal */}
            {taggingTask && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">תיוג אחראים למשימה</h3>
                            <button onClick={() => { setTaggingTask(null); setTagSelection([]); setTagSearch(""); }} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">בחרו את אנשי הצוות למשימה "{taggingTask.title}". ניתן לבחור יותר מאחד.</p>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-sm font-medium text-gray-700">תיוג/הקצאה</label>
                            <span className="text-xs text-gray-500">{tagSelection.length} נבחרו</span>
                        </div>
                        <div className="mb-3">
                            <input
                                type="text"
                                value={tagSearch}
                                onChange={(e) => setTagSearch(e.target.value)}
                                placeholder="חיפוש לפי שם"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {event.team
                                ?.filter(member => (member.name || "").toLowerCase().includes(tagSearch.trim().toLowerCase()))
                                .map((member, idx) => {
                                    const memberKey = getAssigneeKey({ name: member.name, userId: member.userId, email: member.email });
                                    const checked = tagSelection.some(a => getAssigneeKey(a) === memberKey);
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleToggleAssigneeSelection({ name: member.name, userId: member.userId, email: member.email }, "tag")}
                                            className={`px-3 py-1 rounded-full text-sm border transition ${checked ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-50 text-gray-700 border-gray-200"}`}
                                        >
                                            {member.name}
                                        </button>
                                    );
                                })}
                            {((!event.team || event.team.length === 0) || (event.team && event.team.filter(member => (member.name || "").toLowerCase().includes(tagSearch.trim().toLowerCase())).length === 0)) && (
                                <span className="text-sm text-gray-500">אין חברי צוות זמינים</span>
                            )}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => { setTaggingTask(null); setTagSelection([]); setTagSearch(""); }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                ביטול
                            </button>
                            <button
                                onClick={handleSaveTagging}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                            >
                                שמור
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
                            <button onClick={() => { setEditingTask(null); setEditTaskSearch(""); setSaveEditTaskToLibrary(false); }} className="text-gray-400 hover:text-gray-600">
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">כמה פעמים צריך לבצע?</label>
                                    <input
                                        type="number"
                                        min={1}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        value={editingTask.requiredCompletions ?? 1}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            const req = Number.isFinite(val) && val > 0 ? val : 1;
                                            setEditingTask(prev => prev ? ({ ...prev, requiredCompletions: req } as Task) : null);
                                        }}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">ברירת מחדל: פעם אחת. ניתן להגדיר מספר חזרות.</p>
                                    <p className="text-xs text-indigo-600 mt-1">
                                        נותרו: {Math.max(editingTask.remainingCompletions ?? editingTask.requiredCompletions ?? 1, 0)}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-gray-700">תיוג/הקצאה</label>
                                        <span className="text-xs text-gray-500">{editingTask.assignees?.length || 0} נבחרו</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={editTaskSearch}
                                        onChange={(e) => setEditTaskSearch(e.target.value)}
                                        placeholder="חיפוש לפי שם"
                                        className="w-full p-2 border rounded-lg text-xs mb-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        {event.team
                                            ?.filter(member => (member.name || "").toLowerCase().includes(editTaskSearch.trim().toLowerCase()))
                                            .map((member, idx) => {
                                                const memberKey = getAssigneeKey({ name: member.name, userId: member.userId, email: member.email });
                                                const checked = editingTask.assignees?.some(a => getAssigneeKey(a) === memberKey);
                                                return (
                                                    <label
                                                        key={idx}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs border transition cursor-pointer select-none ${checked ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-50 text-gray-700 border-gray-200"}`}
                                                        style={{ minWidth: '120px' }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="accent-white w-4 h-4"
                                                            checked={checked}
                                                            onChange={() => handleToggleAssigneeSelection({ name: member.name, userId: member.userId, email: member.email }, "edit")}
                                                        />
                                                        {member.name}
                                                    </label>
                                                );
                                            })}
                                        {((!event.team || event.team.length === 0) || (event.team && event.team.filter(member => (member.name || "").toLowerCase().includes(editTaskSearch.trim().toLowerCase())).length === 0)) && (
                                            <span className="text-xs text-gray-500">אין חברי צוות מוגדרים</span>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">מועד המשימה</label>
                                    <div className="flex flex-wrap gap-3 text-xs">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                className="accent-indigo-600"
                                                checked={editTaskDueMode === "event_day"}
                                                onChange={() => syncEditTaskDueDate("event_day", "0", editTaskTime || extractTimeString(getEventStartDate() || new Date()))}
                                            />
                                            ביום האירוע
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                className="accent-indigo-600"
                                                checked={editTaskDueMode === "offset"}
                                                onChange={() => syncEditTaskDueDate("offset", editTaskOffsetDays, editTaskTime || extractTimeString(getEventStartDate() || new Date()))}
                                            />
                                            ימים ביחס לאירוע
                                        </label>
                                    </div>
                                    {editTaskDueMode === "offset" && (
                                        <div className="flex items-center gap-2 text-xs">
                                            <span>ימים מהאירוע:</span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                className="w-24 p-2 border rounded-lg text-sm"
                                                value={editTaskOffsetDays}
                                                onChange={(e) => {
                                                    const raw = e.target.value;
                                                    setEditTaskOffsetDays(raw);
                                                    const parsed = parseOffset(raw);
                                                    if (parsed === null) return;
                                                    syncEditTaskDueDate("offset", raw, editTaskTime || extractTimeString(getEventStartDate() || new Date()));
                                                }}
                                            />
                                            <span className="text-gray-500">(שלילי = לפני, חיובי = אחרי)</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 text-xs">
                                        <span>שעה:</span>
                                        <input
                                            type="time"
                                            className="p-2 border rounded-lg text-sm"
                                            value={editTaskTime}
                                            onChange={(e) => syncEditTaskDueDate(editTaskDueMode, editTaskOffsetDays, e.target.value || extractTimeString(getEventStartDate() || new Date()))}
                                        />
                                    </div>
                                    <div className="text-xs text-gray-600">
                                        {editingTask.dueDate
                                            ? `המשימה מתוזמנת ל-${new Date(editingTask.dueDate).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}`
                                            : "לא נקבע מועד למשימה"}
                                        {!getEventStartDate() && (
                                            <div className="text-red-500 mt-1">לא נמצא תאריך לאירוע, המועד מחושב ביחס להיום.</div>
                                        )}
                                    </div>
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
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">איפה זה עומד</label>
                                <textarea
                                    className="w-full p-2 border rounded-lg text-sm"
                                    rows={2}
                                    placeholder="תאר את המצב הנוכחי של המשימה..."
                                    value={editingTask.currentStatus || ""}
                                    onChange={e => setEditingTask({ ...editingTask, currentStatus: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">הצעד הבא</label>
                                <textarea
                                    className="w-full p-2 border rounded-lg text-sm"
                                    rows={2}
                                    placeholder="מה הצעד הבא שצריך לעשות..."
                                    value={editingTask.nextStep || ""}
                                    onChange={e => setEditingTask({ ...editingTask, nextStep: e.target.value })}
                                />
                            </div>
                            {event.needsVolunteers && (
                                <div className="flex flex-col gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="isVolunteerTask"
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            checked={editingTask.isVolunteerTask || false}
                                            onChange={e => setEditingTask({ ...editingTask, isVolunteerTask: e.target.checked })}
                                        />
                                        <label htmlFor="isVolunteerTask" className="text-sm font-medium text-gray-700 flex items-center gap-2 cursor-pointer">
                                            <Handshake size={16} className="text-indigo-600" />
                                            משימה למתנדב
                                        </label>
                                        <p className="text-xs text-gray-500">משימות שסומנו כ"משימה למתנדב" יופיעו בדף ההרשמה למתנדבים</p>
                                    </div>
                                    {editingTask.isVolunteerTask && (
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm font-medium text-gray-700">שעות משוערות</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500"
                                                value={editingTask.volunteerHours ?? ""}
                                                onChange={(e) => setEditingTask({ ...editingTask, volunteerHours: e.target.value ? parseFloat(e.target.value) : null })}
                                                placeholder="לדוגמה 2"
                                            />
                                            <span className="text-xs text-gray-500">שעות עבודה</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50">
                                <Repeat size={16} className="text-indigo-600" />
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-indigo-800">שמור במאגר המשימות החוזרות</span>
                                    <span className="text-[11px] text-indigo-700">כדי להוסיף לאזור ההגדרות</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSaveEditTaskToLibrary(prev => !prev)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${saveEditTaskToLibrary ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-indigo-700 border-indigo-200"}`}
                                >
                                    {saveEditTaskToLibrary ? "נשמר" : "הוסף"}
                                </button>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setEditingTask(null); setSaveEditTaskToLibrary(false); }}
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
                <Link href="/" className="flex items-center gap-1 text-sm w-fit hover:opacity-70 transition" style={{ color: 'var(--patifon-burgundy)' }}>
                    <ArrowRight size={16} />
                    חזרה לדשבורד
                </Link>
            </div>

            <header className="mb-8 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: '3px solid var(--patifon-orange)' }}>
                <div className="flex flex-col gap-4 mb-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-3 w-full">
                            <h1 className="text-3xl font-bold leading-tight" style={{ color: 'var(--patifon-burgundy)' }}>{event.title}</h1>
                            <p className="text-sm font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>
                                יוצר האירוע: {creatorName || event.creatorName || event.createdByEmail || event.createdBy || "לא ידוע"}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style={{ color: 'var(--patifon-orange)' }}>
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
                                {event.dates && event.dates.length > 1 && (
                                    <div className="flex items-center gap-2 flex-wrap text-xs text-indigo-800">
                                        {event.dates.map((d, idx) => {
                                            const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d);
                                            const label = !isNaN(dt.getTime()) ? dt.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "";
                                            return (
                                                <span key={idx} className="px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-full">
                                                    {label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                {event.durationHours && (
                                    <div className="flex items-center gap-1">
                                        <Clock size={16} />
                                        <span>משך משוער: {event.durationHours} שעות</span>
                                    </div>
                                )}
                                {event.participantsCount && (
                                    <div className="flex items-center gap-1">
                                        <Users size={16} />
                                        <span>{event.participantsCount} משתתפים</span>
                                    </div>
                                )}
                                {event.needsVolunteers && (
                                    <div className="flex items-center gap-1">
                                        <Users size={16} />
                                        <span>
                                            {event.volunteersCount != null
                                                ? `צריך ${event.volunteersCount} מתנדבים לערב`
                                                : "צריך מתנדבים לערב הזה"}
                                        </span>
                                    </div>
                                )}
                                {partnersLabel && (
                                    <div className="flex items-center gap-1">
                                        <Handshake size={16} />
                                        <span>שותפים: {partnersLabel}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                {event.projectId ? (
                                    <span className="inline-flex items-center gap-2 text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100 px-3 py-1 rounded-full">
                                        פרויקט משויך: {event.projectName || event.projectId}
                                    </span>
                                ) : (
                                    <span className="text-xs text-gray-600">אין פרויקט משויך</span>
                                )}
                                {isProjectLinker && projectOptions.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <select
                                            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            value={selectedProject}
                                            onChange={(e) => setSelectedProject(e.target.value)}
                                        >
                                            <option value="">בחר פרויקט</option>
                                            {projectOptions.map((p) => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleLinkProject}
                                            disabled={!selectedProject || linkingProject}
                                            className="text-sm px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-60"
                                        >
                                            {linkingProject ? "מקשר..." : "שייך לפרויקט"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-start gap-4 shrink-0">
                        <div className="flex md:flex-col gap-2 md:gap-3">
                            <button
                                onClick={copyInviteLink}
                                className={`w-11 h-11 rounded-full transition vinyl-shadow text-white flex items-center justify-center ${copied ? "bg-green-600 hover:bg-green-700" : "patifon-gradient hover:opacity-90"}`}
                                title={copied ? "הקישור הועתק!" : "שיתוף דף ניהול האירוע"}
                            >
                                {copied ? <Check size={20} /> : <Share2 size={20} />}
                            </button>
                            <button
                                onClick={handleAddEventToCalendar}
                                className="w-11 h-11 rounded-full border border-green-200 text-green-700 hover:bg-green-50 transition flex items-center justify-center"
                                title="הוסף ליומן והזמן את הצוות"
                            >
                                <Calendar size={18} />
                            </button>
                            <button
                                onClick={() => setIsEditEventOpen(true)}
                                className="w-11 h-11 rounded-full border border-indigo-100 text-indigo-700 hover:bg-indigo-50 transition flex items-center justify-center"
                                title="ערוך פרטי אירוע"
                            >
                                <Edit2 size={18} />
                            </button>
                            {isOwner && (
                                <button
                                    onClick={confirmDeleteEvent}
                                    className="w-11 h-11 rounded-full transition hover:bg-red-100 flex items-center justify-center"
                                    style={{ color: 'var(--patifon-red)', background: '#fee', border: '1px solid var(--patifon-red)' }}
                                    title="מחק אירוע"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100 md:w-auto md:self-start md:items-start">
                            <div className="space-y-3 w-full md:w-auto md:min-w-[14rem] md:max-w-[18rem]">
                                {event.contactPerson?.name ? (
                                    <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-gray-100 shadow-sm w-full">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="p-2 rounded-full" style={{ background: 'var(--patifon-cream)', color: 'var(--patifon-burgundy)' }}>
                                                <User size={20} />
                                            </div>
                                            <div className="text-sm min-w-0">
                                                <p className="font-semibold text-gray-900 truncate">איש קשר: {event.contactPerson.name}</p>
                                                <div className="text-gray-600 flex flex-col gap-0.5">
                                                    {event.contactPerson.phone && <span className="flex items-center gap-1 truncate">טלפון: {event.contactPerson.phone}</span>}
                                                    {event.contactPerson.email && <span className="truncate">אימייל: {event.contactPerson.email}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        {event.contactPerson.phone && (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenWhatsApp(event.contactPerson?.phone)}
                                                className="p-2 rounded-full border border-green-200 text-green-700 hover:bg-green-50 transition shrink-0"
                                                title="שליחת הודעת וואטסאפ"
                                            >
                                                <MessageCircle size={18} />
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 bg-white">
                                        לא הוגדר איש קשר לאירוע.
                                    </div>
                                )}
                            </div>
                            <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm w-full md:w-auto md:min-w-[14rem] md:max-w-[18rem]">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowAdvancedActions(!showAdvancedActions)}
                                        className="flex-1 flex items-center justify-between text-sm font-semibold text-gray-800 px-2 py-1 rounded-md hover:bg-gray-50"
                                    >
                                        <span>פעולות מתקדמות</span>
                                        <ChevronDown
                                            size={18}
                                            className={`transition-transform ${showAdvancedActions ? "rotate-180" : ""}`}
                                        />
                                    </button>
                                    <button
                                        onClick={() => router.push(`/events/${id}/files`)}
                                        className="px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-1 border-2"
                                        style={{ borderColor: 'var(--patifon-burgundy)', color: 'var(--patifon-burgundy)' }}
                                        title="מעבר למאגר הקבצים של האירוע"
                                    >
                                        <Paperclip size={14} />
                                        קבצים מצורפים
                                    </button>
                                    <button
                                        onClick={handleOpenContentModal}
                                        className="px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-1 border-2"
                                        style={{ borderColor: 'var(--patifon-orange)', color: 'var(--patifon-orange)' }}
                                        title="תוכן ומדיה - פלייר, מלל ותיוגים"
                                    >
                                        <Sparkles size={14} />
                                        תוכן ומדיה
                                    </button>
                                    {event.needsVolunteers && (
                                        <button
                                            onClick={() => {
                                                setVolunteerCountInput(event.volunteersCount ? String(event.volunteersCount) : "");
                                                setShowVolunteerModal(true);
                                            }}
                                            className="px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-1 border-2"
                                            style={{ borderColor: 'var(--patifon-burgundy)', color: 'var(--patifon-burgundy)' }}
                                            title="הזמנת מתנדבים לאירוע"
                                        >
                                            <Handshake size={14} />
                                            הזמנת מתנדבים
                                        </button>
                                    )}
                                </div>
                                {showAdvancedActions && (
                                    <div className="flex flex-wrap items-center gap-2 mt-3">
                                        <button
                                            onClick={() => router.push(`/events/${id}/registrants`)}
                                            className="px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold text-white text-center flex items-center gap-1"
                                            style={{ background: 'var(--patifon-burgundy)' }}
                                        >
                                            <Users size={16} />
                                            נרשמים
                                        </button>
                                        <button
                                            onClick={copyRegisterLink}
                                            className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center justify-center gap-1 border-2 ${copiedRegister ? "bg-green-600 text-white border-green-600" : ""}`}
                                            style={!copiedRegister ? { borderColor: 'var(--patifon-burgundy)', color: 'var(--patifon-burgundy)' } : undefined}
                                            title="העתק קישור לטופס רישום"
                                        >
                                            {copiedRegister ? <Check size={14} /> : <List size={14} />}
                                            {copiedRegister ? "קישור הועתק" : "העתק קישור הרשמה"}
                                        </button>
                                        <button
                                            onClick={handleOpenPostModal}
                                            className="px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-1 border-2"
                                            style={{ borderColor: 'var(--patifon-orange)', color: 'var(--patifon-orange)' }}
                                        >
                                            <Sparkles size={14} />
                                            מלל לפוסט
                                        </button>
                                        <button
                                            onClick={() => router.push(`/events/${id}/files`)}
                                            className="px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold flex items-center gap-1 border-2"
                                            style={{ borderColor: 'var(--patifon-burgundy)', color: 'var(--patifon-burgundy)' }}
                                            title="מעבר למאגר הקבצים של האירוע"
                                        >
                                            <Paperclip size={14} />
                                            קבצים מצורפים לאירוע
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {(event.infoBlocks?.length || event.customSections?.length) && (
                <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText size={18} className="text-indigo-600" />
                        מידע נוסף על האירוע
                    </h3>
                    {event.infoBlocks && event.infoBlocks.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            {event.infoBlocks.map((block) => {
                                const isEditing = editingInfoBlockId === block.id;
                                return (
                                    <div
                                        key={block.id}
                                        className={`p-4 border border-gray-100 rounded-lg bg-gray-50 relative ${!isEditing ? "cursor-pointer group" : ""}`}
                                        onClick={() => !isEditing && handleStartInfoBlockEdit(block)}
                                    >
                                        {!isEditing ? (
                                            <>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="text-xs font-semibold text-gray-500 mb-1">{block.label}</p>
                                                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{block.value}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteInfoBlock(block.id);
                                                        }}
                                                        className="text-gray-400 hover:text-red-500 transition"
                                                        title="מחק סעיף"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-indigo-600 mt-2 opacity-0 group-hover:opacity-100 transition">
                                                    לחצו כדי לערוך את הסעיף
                                                </p>
                                            </>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="flex items-start justify-between">
                                                    <p className="text-xs font-semibold text-gray-500">עריכת סעיף</p>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteInfoBlock(block.id)}
                                                        className="text-gray-400 hover:text-red-500 transition"
                                                        title="מחק סעיף"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={infoBlockDraft?.label || ""}
                                                    onChange={(e) => handleInfoBlockDraftChange("label", e.target.value)}
                                                    className="w-full p-2 border rounded-lg text-sm"
                                                    placeholder="כותרת הסעיף"
                                                    autoFocus
                                                />
                                                <textarea
                                                    rows={2}
                                                    value={infoBlockDraft?.value || ""}
                                                    onChange={(e) => handleInfoBlockDraftChange("value", e.target.value)}
                                                    className="w-full p-2 border rounded-lg text-sm"
                                                    placeholder="תוכן הסעיף"
                                                />
                                                <div className="flex justify-end gap-2 pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={handleCancelInfoBlockEdit}
                                                        className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
                                                    >
                                                        ביטול
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleSaveInfoBlock}
                                                        className="px-3 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                                                    >
                                                        שמור
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {event.customSections && event.customSections.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {event.customSections.map((section, idx) => (
                                <div key={idx} className="p-4 border border-gray-100 rounded-lg bg-gray-50">
                                    <h4 className="text-sm font-semibold text-gray-800 mb-2">{section.title || `סעיף ${idx + 1}`}</h4>
                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{section.content}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Recurring Tasks Modal */}
                {showSuggestions && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-lg max-w-3xl w-full p-6 animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                                        <Repeat size={22} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900">משימות חוזרות</h3>
                                        <p className="text-sm text-gray-500">כל המשימות הקבועות מהמאגר</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowSuggestions(false)} className="text-gray-400 hover:text-gray-600">
                                    <X size={22} />
                                </button>
                            </div>

                            <div className="mb-4 p-3 border border-indigo-100 rounded-lg bg-indigo-50">
                                <h4 className="text-sm font-semibold text-indigo-800 mb-2">{libraryForm.id ? "עריכת משימה קבועה" : "הוסף משימה קבועה"}</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                    <input
                                        type="text"
                                        className="w-full border rounded-lg px-3 py-2 text-sm"
                                        placeholder="שם המשימה"
                                        value={libraryForm.title}
                                        onChange={(e) => setLibraryForm(prev => ({ ...prev, title: e.target.value }))}
                                    />
                                    <select
                                        className="w-full border rounded-lg px-3 py-2 text-sm"
                                        value={libraryForm.priority}
                                        onChange={(e) => setLibraryForm(prev => ({ ...prev, priority: e.target.value as any }))}
                                    >
                                        <option value="NORMAL">רגיל</option>
                                        <option value="HIGH">גבוה</option>
                                        <option value="CRITICAL">דחוף</option>
                                    </select>
                                </div>
                                <textarea
                                    className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
                                    rows={2}
                                    placeholder="תיאור קצר"
                                    value={libraryForm.description}
                                    onChange={(e) => setLibraryForm(prev => ({ ...prev, description: e.target.value }))}
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSaveLibraryTask}
                                        disabled={savingLibraryTask}
                                        className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
                                    >
                                        {savingLibraryTask ? "שומר..." : libraryForm.id ? "שמור במאגר" : "הוסף למאגר"}
                                    </button>
                                    {libraryForm.id && (
                                        <button
                                            type="button"
                                            onClick={() => handleLibraryEditStart()}
                                            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
                                        >
                                            בטל עריכה
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3">
                                {loadingLibraryTasks ? (
                                    <div className="text-center text-gray-500 py-6">טוען משימות...</div>
                                ) : libraryTasks.length === 0 ? (
                                    <div className="text-center text-gray-500 py-6">אין משימות במאגר עדיין.</div>
                                ) : (
                                    libraryTasks.map((t) => {
                                        const priorityLabel = t.priority === "CRITICAL" ? "דחוף" : t.priority === "HIGH" ? "גבוה" : "רגיל";
                                        const priorityColor = t.priority === "CRITICAL" ? "bg-red-100 text-red-700" : t.priority === "HIGH" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700";
                                        return (
                                            <div key={t.id} className="p-4 border border-gray-100 rounded-lg bg-white flex flex-col gap-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-semibold text-gray-900">{t.title}</h4>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full ${priorityColor}`}>{priorityLabel}</span>
                                                        </div>
                                                        {t.description ? (
                                                            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{t.description}</p>
                                                        ) : null}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleAddLibraryTaskToEvent(t)}
                                                            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                        >
                                                            הוסף לאירוע
                                                        </button>
                                                        <button
                                                            onClick={() => handleLibraryEditStart(t)}
                                                            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                        >
                                                            ערוך
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteLibraryTask(t)}
                                                            disabled={deletingLibraryTaskId === t.id}
                                                            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                                                        >
                                                            {deletingLibraryTaskId === t.id ? "מוחק..." : "מחק"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content - Tasks */}
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>משימות לביצוע</h2>
                            <span className="px-2 py-0.5 rounded-full text-sm font-medium" style={{ background: 'var(--patifon-yellow)', color: 'var(--patifon-burgundy)' }}>
                                {tasks.filter(t => t.status !== 'DONE').length}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setShowSuggestions(true);
                                    handleLibraryEditStart();
                                }}
                                className="bg-white px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:opacity-80 transition text-xs md:text-sm font-medium vinyl-shadow"
                                style={{ border: '2px solid var(--patifon-orange)', color: 'var(--patifon-orange)' }}
                            >
                                <Repeat size={16} />
                                משימות חוזרות
                            </button>
                            <button
                                onClick={() => setShowSpecialModal(true)}
                                className="bg-white px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:opacity-80 transition text-xs md:text-sm font-medium vinyl-shadow"
                                style={{ border: '2px solid var(--patifon-burgundy)', color: 'var(--patifon-burgundy)' }}
                            >
                                <Sparkles size={16} />
                                משימות מיוחדות
                            </button>
                            <button
                                onClick={() => {
                                    const next = !showNewTask;
                                    setShowNewTask(next);
                                    if (!next) setSaveNewTaskToLibrary(false);
                                }}
                                className="patifon-gradient text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition text-sm font-medium vinyl-shadow"
                            >
                                <Plus size={18} />
                                משימה חדשה
                            </button>
                        </div>
                    </div>

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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-xs font-semibold text-gray-600">תיוג/הקצאה</p>
                                            <span className="text-xs text-gray-500">{newTask.assignees.length} נבחרו</span>
                                        </div>
                                        <input
                                            type="text"
                                            value={newTaskSearch}
                                            onChange={(e) => setNewTaskSearch(e.target.value)}
                                            placeholder="חיפוש לפי שם"
                                            className="w-full p-2 border rounded-lg text-xs mb-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                        />
                                        <div className="flex flex-wrap gap-2">
                                            {event.team
                                                ?.filter(member => (member.name || "").toLowerCase().includes(newTaskSearch.trim().toLowerCase()))
                                                .map((member, idx) => {
                                                    const memberKey = getAssigneeKey({ name: member.name, userId: member.userId, email: member.email });
                                                    const checked = newTask.assignees.some(a => getAssigneeKey(a) === memberKey);
                                                    return (
                                                        <label
                                                            key={idx}
                                                            className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs border transition cursor-pointer select-none ${checked ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-50 text-gray-700 border-gray-200"}`}
                                                            style={{ minWidth: '120px' }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="accent-white w-4 h-4"
                                                                checked={checked}
                                                                onChange={() => handleToggleAssigneeSelection({ name: member.name, userId: member.userId, email: member.email }, "new")}
                                                            />
                                                            {member.name}
                                                        </label>
                                                    );
                                                })}
                                            {((!event.team || event.team.length === 0) || (event.team && event.team.filter(member => (member.name || "").toLowerCase().includes(newTaskSearch.trim().toLowerCase())).length === 0)) && (
                                                <span className="text-xs text-gray-500">אין חברי צוות מוגדרים</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-gray-600">מועד המשימה</p>
                                        <div className="flex flex-wrap gap-3 text-xs">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    className="accent-indigo-600"
                                                    checked={newTaskDueMode === "event_day"}
                                                    onChange={() => syncNewTaskDueDate("event_day", "0", newTaskTime || extractTimeString(getEventStartDate() || new Date()))}
                                                />
                                                ביום האירוע
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    className="accent-indigo-600"
                                                    checked={newTaskDueMode === "offset"}
                                                    onChange={() => syncNewTaskDueDate("offset", newTaskOffsetDays, newTaskTime || extractTimeString(getEventStartDate() || new Date()))}
                                                />
                                                ימים ביחס לאירוע
                                            </label>
                                        </div>
                                        {newTaskDueMode === "offset" && (
                                            <div className="flex items-center gap-2 text-xs">
                                                <span>ימים מהאירוע:</span>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    className="w-24 p-2 border rounded-lg text-sm"
                                                    value={newTaskOffsetDays}
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        setNewTaskOffsetDays(raw);
                                                        const parsed = parseOffset(raw);
                                                        if (parsed === null) return;
                                                        syncNewTaskDueDate("offset", raw, newTaskTime || extractTimeString(getEventStartDate() || new Date()));
                                                    }}
                                                />
                                                <span className="text-gray-500">(שלילי = לפני, חיובי = אחרי)</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 text-xs">
                                            <span>שעה:</span>
                                            <input
                                                type="time"
                                                className="p-2 border rounded-lg text-sm"
                                                value={newTaskTime}
                                                onChange={(e) => syncNewTaskDueDate(newTaskDueMode, newTaskOffsetDays, e.target.value || extractTimeString(getEventStartDate() || new Date()))}
                                            />
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            {newTask.dueDate
                                                ? `המשימה מתוזמנת ל-${new Date(newTask.dueDate).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`
                                                : "טרם נבחר מועד למשימה"}
                                            {!getEventStartDate() && (
                                                <div className="text-red-500 mt-1">לא נמצא תאריך לאירוע, המועד מחושב ביחס להיום.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">תיאור המשימה</label>
                                    <textarea
                                        rows={3}
                                        className="w-full p-2 border rounded-lg text-sm"
                                        placeholder="מה צריך לעשות? ציינו פרטים חשובים, קישורים או בקשות מיוחדות."
                                        value={newTask.description}
                                        onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">כמה פעמים צריך לבצע?</label>
                                        <input
                                            type="number"
                                            min={1}
                                            className="w-full p-2 border rounded-lg text-sm"
                                            value={newTask.requiredCompletions ?? 1}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                setNewTask(prev => ({ ...prev, requiredCompletions: Number.isFinite(val) && val > 0 ? val : 1 }));
                                            }}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">ברירת מחדל: פעם אחת. ניתן להגדיר מספר חזרות.</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-gray-700 mb-1">דחיפות</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { key: "NORMAL", label: "רגיל", color: "border-gray-200 text-gray-700", bg: "bg-gray-50" },
                                            { key: "HIGH", label: "גבוה", color: "border-amber-300 text-amber-800", bg: "bg-amber-50" },
                                            { key: "CRITICAL", label: "דחוף", color: "border-red-300 text-red-800", bg: "bg-red-50" },
                                        ].map(opt => (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                onClick={() => setNewTask({ ...newTask, priority: opt.key })}
                                                className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold hover:opacity-90 transition ${newTask.priority === opt.key ? `${opt.bg} ${opt.color}` : "border-gray-200 text-gray-600 bg-white"}`}
                                            >
                                                <span>{opt.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                        <Paperclip size={16} />
                                        צרף קבצים למשימה (אופציונלי)
                                    </label>
                                    <input
                                        id="new-task-files"
                                        ref={newTaskFileInputRef}
                                        type="file"
                                        multiple
                                        className="sr-only"
                                        onChange={(e) => {
                                            const files = e.target.files ? Array.from(e.target.files) : [];
                                            setNewTaskFiles(files);
                                        }}
                                    />
                                    <label
                                        htmlFor="new-task-files"
                                        className="w-full border-2 border-indigo-200 text-indigo-700 py-2 rounded-lg hover:bg-indigo-50 transition text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        <Paperclip size={16} />
                                        {newTaskFiles.length ? "בחר/החלף קבצים" : "בחר קבצים להעלאה"}
                                    </label>
                                    <p className="text-xs text-gray-500">
                                        {newTaskFiles.length > 0 ? `${newTaskFiles.length} קבצים יועלו אחרי שמירה` : "ניתן לצרף מסמכים, תמונות או חוזים"}
                                    </p>
                                </div>
                                {event.needsVolunteers && (
                                    <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                                        <input
                                            type="checkbox"
                                            id="newTaskIsVolunteerTask"
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            checked={newTask.isVolunteerTask || false}
                                            onChange={e => setNewTask({ ...newTask, isVolunteerTask: e.target.checked })}
                                        />
                                        <label htmlFor="newTaskIsVolunteerTask" className="text-sm font-medium text-gray-700 flex items-center gap-2 cursor-pointer">
                                            <Handshake size={16} className="text-indigo-600" />
                                            משימה למתנדב
                                        </label>
                                        <p className="text-xs text-gray-500">משימות שסומנו כ"משימה למתנדב" יופיעו בדף ההרשמה למתנדבים</p>
                                        {newTask.isVolunteerTask && (
                                            <div className="flex items-center gap-2">
                                                <label className="text-sm font-medium text-gray-700">שעות משוערות</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.5"
                                                    className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500"
                                                    value={newTask.volunteerHours ?? ""}
                                                    onChange={(e) => setNewTask({ ...newTask, volunteerHours: e.target.value ? parseFloat(e.target.value) : null })}
                                                    placeholder="לדוגמה 2"
                                                />
                                                <span className="text-xs text-gray-500">שעות עבודה</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 w-full sm:w-auto">
                                        <Repeat size={16} className="text-indigo-600" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-semibold text-indigo-800">סמן כמשימה שחוזרת על עצמה</span>
                                            <span className="text-[11px] text-indigo-700">תתווסף למאגר המשימות החשובות</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSaveNewTaskToLibrary(prev => !prev)}
                                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${saveNewTaskToLibrary ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-indigo-700 border-indigo-200"}`}
                                        >
                                            {saveNewTaskToLibrary ? "נשמר" : "הוסף"}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setShowNewTask(false); setSaveNewTaskToLibrary(false); }}
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

                    <div className="space-y-4">
                        {tasks.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">אין משימות עדיין. צור את המשימה הראשונה!</p>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                        משימות צוות
                                        <span className="text-xs text-gray-500">({tasks.filter(t => !t.isVolunteerTask).length})</span>
                                    </h3>
                                    <div className="space-y-3">
                                        {tasks.filter(t => !t.isVolunteerTask).map((task) => {
                                            const hasUnread = task.lastMessageTime && (!task.readBy || !task.readBy[user?.uid || '']) && task.lastMessageBy !== user?.uid;
                                            return (
                                                <TaskCard
                                                    key={task.id}
                                                    id={task.id}
                                                    title={task.title}
                                                    description={task.description}
                                                    currentStatus={task.currentStatus}
                                                    nextStep={task.nextStep}
                                                    assignee={task.assignee || "לא משויך"}
                                                    assignees={task.assignees}
                                                    status={task.status}
                                                    dueDate={task.dueDate}
                                                    priority={task.priority}
                                                    eventId={id}
                                                    eventTitle={event?.title}
                                                    scope={task.scope}
                                                    specialType={(task as any).specialType}
                                                    requiredCompletions={(task as any).requiredCompletions}
                                                    remainingCompletions={(task as any).remainingCompletions}
                                                    onUpdateCompletions={() => handleUpdateCompletions(task)}
                                                    createdByName={task.createdByName}
                                                    onEdit={() => { startEditingTask(task); }}
                                                    onDelete={() => confirmDeleteTask(task.id)}
                                                    onStatusChange={(newStatus) => handleStatusChange(task, newStatus)}
                                                    onChat={() => setChatTask(task)}
                                                    hasUnreadMessages={hasUnread}
                                                    onEditStatus={() => setEditingStatusTask(task)}
                                                    onEditDate={() => setEditingDateTask(task)}
                                                    onManageAssignees={() => {
                                                        setTaggingTask(task);
                                                        setTagSelection(task.assignees || []);
                                                    }}
                                                />
                                            );
                                        })}
                                        {tasks.filter(t => !t.isVolunteerTask).length === 0 && (
                                            <p className="text-xs text-gray-500">אין משימות צוות כרגע.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                        משימות למתנדבים
                                        <span className="text-xs text-gray-500">({tasks.filter(t => t.isVolunteerTask).length})</span>
                                    </h3>
                                    <div className="space-y-3 bg-amber-50/60 border border-amber-100 rounded-xl p-3">
                                        {tasks.filter(t => t.isVolunteerTask).map((task) => {
                                            const hasUnread = task.lastMessageTime && (!task.readBy || !task.readBy[user?.uid || '']) && task.lastMessageBy !== user?.uid;
                                            return (
                                                <TaskCard
                                                    key={task.id}
                                                    id={task.id}
                                                    title={task.title}
                                                    description={task.description}
                                                    currentStatus={task.currentStatus}
                                                    nextStep={task.nextStep}
                                                    assignee={task.assignee || "לא משויך"}
                                                    assignees={task.assignees}
                                                    status={task.status}
                                                    dueDate={task.dueDate}
                                                    priority={task.priority}
                                                    eventId={id}
                                                    eventTitle={event?.title}
                                                    scope={task.scope}
                                                    specialType={(task as any).specialType}
                                                    requiredCompletions={(task as any).requiredCompletions}
                                                    remainingCompletions={(task as any).remainingCompletions}
                                                    onUpdateCompletions={() => handleUpdateCompletions(task)}
                                                    createdByName={task.createdByName}
                                                    onEdit={() => { startEditingTask(task); }}
                                                    onDelete={() => confirmDeleteTask(task.id)}
                                                    onStatusChange={(newStatus) => handleStatusChange(task, newStatus)}
                                                    onChat={() => setChatTask(task)}
                                                    hasUnreadMessages={hasUnread}
                                                    onEditStatus={() => setEditingStatusTask(task)}
                                                    onEditDate={() => setEditingDateTask(task)}
                                                    onManageAssignees={() => {
                                                        setTaggingTask(task);
                                                        setTagSelection(task.assignees || []);
                                                    }}
                                                />
                                            );
                                        })}
                                        {tasks.filter(t => t.isVolunteerTask).length === 0 && (
                                            <p className="text-xs text-gray-500">אין משימות למתנדבים כרגע.</p>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Sidebar - Team, Budget & Files */}
                <div className="space-y-6">
                    {/* ... existing budget section ... */}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Team Section */}
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
                                    {canManageTeam && (
                                        <button
                                            onClick={() => {
                                                setShowCollaboratorsPicker(prev => !prev);
                                                setShowAddTeam(false);
                                            }}
                                            className="text-indigo-600 hover:bg-indigo-50 p-1 rounded-full transition"
                                            title="הוסף איש צוות"
                                        >
                                            <UserPlus size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {showAddTeam && canManageTeam && (
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

                            {showCollaboratorsPicker && canManageTeam && (
                                <div className="mb-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                            <button
                                                className={`px-2 py-1 rounded-full text-xs ${collaboratorsView === "past" ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-100"}`}
                                                onClick={() => setCollaboratorsView("past")}
                                            >
                                                עבדתי איתם
                                            </button>
                                            <button
                                                className={`px-2 py-1 rounded-full text-xs ${collaboratorsView === "all" ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-100"}`}
                                                onClick={() => setCollaboratorsView("all")}
                                            >
                                                כל המשתמשים
                                            </button>
                                        </div>
                                        <button
                                            className="text-xs text-indigo-600 hover:underline"
                                            onClick={() => {
                                                setShowAddTeam(true);
                                                setShowCollaboratorsPicker(false);
                                            }}
                                        >
                                            הוסף ידנית
                                        </button>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto p-2 space-y-2">
                                        {(collaboratorsView === "past" ? collaborators : allUsers)
                                            .filter(c => !(event?.team || []).some(m =>
                                                (m.userId && m.userId === c.id) ||
                                                (m.email && c.email && m.email.toLowerCase() === c.email.toLowerCase())
                                            ))
                                            .map(collab => (
                                                <button
                                                    key={collab.id}
                                                    onClick={() => handleAddCollaboratorToTeam(collab)}
                                                    className="w-full text-left flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition"
                                                    title="הוסף איש צוות"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                            {(collab.fullName || collab.email || "?").slice(0, 2)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-gray-900 truncate">{collab.fullName || collab.email || "משתמש"}</p>
                                                            <p className="text-xs text-gray-500 truncate">{collab.role || "חבר צוות"}</p>
                                                        </div>
                                                    </div>
                                                    <span className="px-3 py-1 text-xs rounded-full border border-indigo-200 text-indigo-700 bg-white">
                                                        הוסף
                                                    </span>
                                                </button>
                                            ))}
                                        {(collaboratorsView === "past" ? collaborators : allUsers).filter(c => !(event?.team || []).some(m =>
                                            (m.userId && m.userId === c.id) ||
                                            (m.email && c.email && m.email.toLowerCase() === c.email.toLowerCase())
                                        )).length === 0 && (
                                                <p className="text-xs text-gray-500 px-2 py-1">לא נמצאו משתמשים להצגה.</p>
                                            )}
                                    </div>
                                </div>
                            )}

                            {canManageTeam && joinRequests.filter(r => r.status === "PENDING").length > 0 && (
                                <div className="mb-4 border border-amber-200 bg-amber-50 rounded-lg p-3">
                                    <p className="text-sm font-semibold text-amber-800 mb-2">בקשות הצטרפות ממתינות</p>
                                    <div className="space-y-2">
                                        {joinRequests.filter(r => r.status === "PENDING").map((req) => (
                                            <div key={req.id} className="flex items-center justify-between gap-3 p-2 bg-white border border-amber-100 rounded-lg">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{req.requesterName || req.requesterEmail || "משתמש"}</p>
                                                    <p className="text-xs text-gray-500 truncate">{req.requesterEmail}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleApproveJoinRequest(req)}
                                                        className="px-3 py-1 text-xs rounded-full bg-green-600 text-white hover:bg-green-700"
                                                    >
                                                        אשר
                                                    </button>
                                                    <button
                                                        onClick={() => handleRejectJoinRequest(req)}
                                                        className="px-3 py-1 text-xs rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                    >
                                                        דחה
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                {event.team && event.team.length > 0 ? (
                                    event.team.map((member, idx) => (
                                        <div key={idx} className="flex items-center gap-3 justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                    {member.name.substring(0, 2)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{member.name}</p>
                                                    <p className="text-xs text-gray-500">{member.role}</p>
                                                </div>
                                            </div>
                                            {canManageTeam && (
                                                <div className="flex items-center gap-2">
                                                    {confirmRemoveIdx === idx ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleRemoveTeamMember(idx)}
                                                                className="px-2 py-1 text-xs rounded-full bg-red-600 text-white hover:bg-red-700"
                                                            >
                                                                הסר
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmRemoveIdx(null)}
                                                                className="px-2 py-1 text-xs rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                                                            >
                                                                ביטול
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmRemoveIdx(idx)}
                                                            className="p-1 rounded-full text-red-600 hover:bg-red-50 border border-red-100"
                                                            title="הסר איש צוות"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500">עדיין אין חברי צוות</p>
                                )}
                                {!canManageTeam && (
                                    <p className="text-xs text-gray-500">רק יוצר האירוע יכול להוסיף שותפים.</p>
                                )}
                            </div>
                        </div>

                        {/* Volunteers Section */}
                        {event.needsVolunteers && (
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                        <Handshake size={20} className="text-indigo-600" />
                                        מתנדבים
                                    </h3>
                                    {event.volunteersCount && (
                                        <span className="text-xs text-gray-500">
                                            {combinedVolunteers.length} / {event.volunteersCount}
                                        </span>
                                    )}
                                </div>

                                {loadingVolunteers ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
                                    </div>
                                ) : combinedVolunteers.length > 0 ? (
                                    <div className="space-y-4">
                                        {combinedVolunteers.map((volunteer, idx) => (
                                            <div key={volunteer.id || idx} className="flex items-center gap-3 justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                        {(volunteer.name || volunteer.email || "?").substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{volunteer.name || volunteer.email || "מתנדב"}</p>
                                                        {volunteer.email && volunteer.name && (
                                                            <p className="text-xs text-gray-500">{volunteer.email}</p>
                                                        )}
                                                        {volunteer.phone && (
                                                            <p className="text-xs text-gray-500">{volunteer.phone}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                {canManageTeam && volunteers.find(v => v.email === volunteer.email || v.id === volunteer.id) && (
                                                    <button
                                                        onClick={() => {
                                                            if (volunteer.id && confirm("האם אתה בטוח שברצונך להסיר את המתנדב?")) {
                                                                handleDeleteVolunteer(volunteer.id);
                                                            }
                                                        }}
                                                        className="p-1 rounded-full text-red-600 hover:bg-red-50 border border-red-100"
                                                        title="הסר מתנדב"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">עדיין אין מתנדבים שנרשמו</p>
                                )}

                                {combinedVolunteers.length > 0 && (
                                    <div className="mt-4 border-t pt-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-gray-800">שליחת הודעת וואטסאפ למתנדבים</span>
                                            <button
                                                type="button"
                                                onClick={() => setShowVolunteerMessage(prev => !prev)}
                                                className="p-2 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                title="פתח שליחת הודעה"
                                            >
                                                <MessageCircle size={16} />
                                            </button>
                                        </div>
                                        {showVolunteerMessage && (
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between text-xs">
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={selectAllVolunteers}
                                                            className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                                        >
                                                            בחר הכל
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={clearVolunteerSelection}
                                                            className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                                                        >
                                                            נקה
                                                        </button>
                                                    </div>
                                                    <span className="text-gray-500">נבחרו {volunteerSelections.size}</span>
                                                </div>
                                                <div className="max-h-40 overflow-auto border border-gray-100 rounded-lg p-2 space-y-1">
                {combinedVolunteers.map((vol, idx) => {
                    const key = buildVolunteerKey({ email: vol.email, id: vol.id, name: vol.name });
                    const checked = volunteerSelections.has(key);
                    const phoneDisplay = vol.phone || volunteerPhoneMap.get(key);
                    return (
                        <label key={vol.id || idx} className="flex items-center justify-between gap-2 text-sm px-2 py-1 rounded hover:bg-gray-50">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    className="accent-indigo-600"
                                    checked={checked}
                                    onChange={() => toggleVolunteerSelection(key)}
                                />
                                <div className="flex flex-col">
                                    <span className="font-medium text-gray-800">{vol.name || vol.email || "מתנדב"}</span>
                                    <span className="text-xs text-gray-500">
                                        {vol.email || ""}
                                        {(vol.email && (vol.phone || phoneDisplay)) ? " • " : ""}
                                        {(vol.phone || phoneDisplay) ? formatPhoneForDisplay(vol.phone || phoneDisplay) : ""}
                                    </span>
                                </div>
                            </div>
                            <span className="text-[11px] text-gray-500">
                                {phoneDisplay ? formatPhoneForDisplay(phoneDisplay) : "אין טלפון"}
                            </span>
                        </label>
                    );
                })}
                                                </div>
                                                <textarea
                                                    className="w-full border rounded-lg p-3 text-sm"
                                                    rows={3}
                                                    placeholder="כתוב את ההודעה שתרצה לשלוח לכל המתנדבים שנבחרו"
                                                    defaultValue=""
                                                    onChange={(e) => {
                                                        volunteerMessageRef.current = e.target.value;
                                                    }}
                                                />
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={handleSendVolunteerBroadcast}
                                                        disabled={sendingVolunteerMsg}
                                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
                                                    >
                                                        {sendingVolunteerMsg ? "שולח..." : "שלח הודעה לוואטסאפ"}
                                                    </button>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    השליחה מתבצעת לנבחרים בלבד, עם הפרש של 5 שניות בין הודעה להודעה.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                <Paperclip size={18} />
                                מסמכים חשובים לאירוע
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowEventFileModal(true)}
                                    className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 px-3 py-1.5 rounded-lg flex items-center gap-2"
                                >
                                    <Paperclip size={16} />
                                    העלה קובץ
                                </button>
                                <button
                                    onClick={() => router.push(`/events/${id}/files`)}
                                    className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
                                >
                                    קבצים מצורפים לאירוע
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">
                            כל הקבצים שצורפו לאירוע במקום אחד. לחצו על המאגר לצפייה בכל הקבצים, מי העלה ומתי.
                        </p>
                        {(eventFiles.length > 0 || importantDocs.length > 0) && (
                            <div className="space-y-4">
                                {eventFiles.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-gray-600 mb-2">קבצים שהועלו באירוע</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {eventFiles.slice(0, 9).map(file => (
                                                <div
                                                    key={file.id}
                                                    className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 hover:shadow-md transition text-xs text-gray-700"
                                                >
                                                    <a
                                                        href={file.url || "#"}
                                                        target={file.url ? "_blank" : undefined}
                                                        rel="noreferrer"
                                                        className="block"
                                                    >
                                                        <div className="h-20 bg-white flex items-center justify-center">
                                                            {file.url ? (
                                                                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-gray-400">תצוגה לא זמינה</span>
                                                            )}
                                                        </div>
                                                        <div className="px-2 py-2 truncate font-semibold">{file.name || "קובץ"}</div>
                                                        {file.taskTitle && <div className="px-2 text-[10px] text-gray-500 truncate">משימה: {file.taskTitle}</div>}
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleShareWhatsApp(file.name || "קובץ", file.url)}
                                                        className="w-full text-indigo-600 hover:text-indigo-800 border-t border-gray-200 py-1 text-[11px] font-semibold flex items-center justify-center gap-1"
                                                    >
                                                        שיתוף בוואטסאפ
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {importantDocs.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-gray-600 mb-2">מסמכים חשובים</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {importantDocs.slice(0, 6).map(doc => (
                                                <div
                                                    key={doc.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => router.push(`/settings?tab=documents&docId=${doc.id}`)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            router.push(`/settings?tab=documents&docId=${doc.id}`);
                                                        }
                                                    }}
                                                    className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 hover:shadow-md transition text-xs text-gray-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    title="פתח למסך העלאה ועדכון פרטי המסמך"
                                                >
                                                    <div className="h-20 bg-white flex items-center justify-center">
                                                        {doc.fileUrl ? (
                                                            <img
                                                                src={doc.fileUrl}
                                                                alt={doc.title}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <span className="text-gray-400">תצוגה לא זמינה</span>
                                                        )}
                                                    </div>
                                                    <div className="px-2 py-2 truncate font-semibold">{doc.title || doc.fileName || "מסמך"}</div>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleShareWhatsApp(doc.title || doc.fileName || "מסמך", doc.fileUrl); }}
                                                        className="w-full text-indigo-600 hover:text-indigo-800 border-t border-gray-200 py-1 text-[11px] font-semibold flex items-center justify-center gap-1"
                                                    >
                                                        שיתוף בוואטסאפ
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-8">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-full bg-indigo-50 text-indigo-700">
                            <PauseCircle size={20} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-gray-900">מרכז בקרה לאירוע</p>
                            <p className="text-xs text-gray-600">
                                עצור/הפעל שיתוף משימות עם מתנדבים והגדר מצבי אירוע מיוחדים.
                            </p>
                            {event.volunteerTasksPaused && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                    <PauseCircle size={14} />
                                    שיתוף המשימות למתנדבים מושהה
                                </span>
                            )}
                            {event.teamTasksPaused && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                    <PauseCircle size={14} />
                                    משימות הצוות בהשהיה
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!canManageTeam && (
                            <span className="text-[11px] text-gray-500">
                                רק יוצר האירוע או צוות מורשה יכולים לשנות את מצב האירוע
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowControlCenter(true)}
                            disabled={!canManageTeam}
                            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 vinyl-shadow transition ${canManageTeam
                                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                                }`}
                        >
                            <PauseCircle size={18} />
                            פתח מרכז בקרה
                        </button>
                    </div>
                </div>
            </div>

            {showControlCenter && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 space-y-5">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-indigo-50 text-indigo-700">
                                    <PauseCircle size={22} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold">מרכז בקרה לאירוע</h3>
                                    <p className="text-sm text-gray-600">הגדר מצבי השהיה והפעלה לאירוע.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowControlCenter(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">הפסקת שיתוף המשימות עם מתנדבים</p>
                                    <p className="text-xs text-gray-600">
                                        מסתיר מהמתנדבים את המשימות הפתוחות של האירוע באזור האישי שלהם עד לחידוש השיתוף.
                                    </p>
                                </div>
                                <label className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={volunteerSharePaused}
                                        onChange={(e) => setVolunteerSharePaused(e.target.checked)}
                                    />
                                    <span className="text-sm font-semibold text-gray-800">{volunteerSharePaused ? "מושבת" : "פעיל"}</span>
                                </label>
                            </div>
                            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">השהיית משימות צוות</p>
                                    <p className="text-xs text-gray-600">
                                        משימות צוות יישארו בדף ניהול האירוע, אך לא יופיעו ברשימת המשימות האישיות של חברי הצוות.
                                    </p>
                                </div>
                                <label className="inline-flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={teamSharePaused}
                                        onChange={(e) => setTeamSharePaused(e.target.checked)}
                                    />
                                    <span className="text-sm font-semibold text-gray-800">{teamSharePaused ? "מושבת" : "פעיל"}</span>
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowControlCenter(false)}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200"
                            >
                                סגור
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveControlCenter}
                                disabled={controlSaving || !canManageTeam}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 ${controlSaving ? "bg-gray-300" : "bg-indigo-600 hover:bg-indigo-700"}`}
                            >
                                {controlSaving ? "שומר..." : "שמור הגדרות"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Event File Upload Modal */}
            {showEventFileModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">העלה קובץ לאירוע</h3>
                            <button onClick={() => { setShowEventFileModal(false); setEventFile(null); setEventFileName(""); }} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUploadEventFile} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">בחר קובץ</label>
                                <input
                                    ref={eventFileInputRef}
                                    type="file"
                                    required
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        setEventFile(file);
                                        if (file) setEventFileName(file.name);
                                    }}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={() => eventFileInputRef.current?.click()}
                                    className="w-full border border-indigo-200 text-indigo-700 py-2 rounded-lg hover:bg-indigo-50 transition text-sm font-semibold flex items-center justify-center gap-2"
                                >
                                    <Paperclip size={16} />
                                    {eventFile ? "בחר מחדש" : "בחר קובץ מהמחשב"}
                                </button>
                                <p className="text-xs text-gray-500 mt-1">
                                    {eventFile ? `נבחר: ${eventFile.name}` : "טרם נבחר קובץ"}
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">שם הקובץ</label>
                                <input
                                    type="text"
                                    required
                                    value={eventFileName}
                                    onChange={(e) => setEventFileName(e.target.value)}
                                    className="w-full p-2 border rounded-lg text-sm"
                                    placeholder="לדוגמה: חוזה ספק - 12.6"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowEventFileModal(false); setEventFile(null); setEventFileName(""); }}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                                >
                                    ביטול
                                </button>
                                <button
                                    type="submit"
                                    disabled={eventFileUploading}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${eventFileUploading ? "bg-gray-300" : "bg-indigo-600 hover:bg-indigo-700"}`}
                                >
                                    {eventFileUploading ? "מעלה..." : "העלה ושמור"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Volunteer Invitation Modal */}
            {showVolunteerModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Handshake size={20} className="text-indigo-600" />
                                הזמנת מתנדבים לאירוע
                            </h3>
                            <button onClick={() => setShowVolunteerModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                <h4 className="font-semibold text-indigo-900 mb-2">איך זה עובד?</h4>
                                <ul className="text-sm text-indigo-800 space-y-2 list-disc list-inside">
                                    <li>כעת מתנדבים יוכלו להתנדב לאירוע ולעזור בשמימות</li>
                                    <li>מתנדבים יוכלו לבחור לעצמם משימות ולתייג את עצמם</li>
                                    <li>מתנדבים שלא רשומים למערכת יוכלו להירשם דרך קישור מיוחד</li>
                                    <li>ניתן להגביל את כמות המתנדבים בהתאם לצורך</li>
                                </ul>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    כמה מתנדבים צריך? (אופציונלי - השאר ריק ללא הגבלה)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={volunteerCountInput}
                                    onChange={(e) => setVolunteerCountInput(e.target.value)}
                                    className="w-full rounded-lg border-gray-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                    placeholder="מספר המתנדבים הדרוש"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    {volunteerCountInput && parseInt(volunteerCountInput, 10) > 0
                                        ? `הגבלה: ${volunteerCountInput} מתנדבים מקסימום`
                                        : "ללא הגבלה על כמות המתנדבים"}
                                </p>
                            </div>
                            <div className="pt-4 border-t">
                                <button
                                    type="button"
                                    onClick={updateVolunteerCount}
                                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 mb-3"
                                >
                                    עדכן כמות מתנדבים
                                </button>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <p className="text-sm font-medium text-gray-700 mb-2">קישור הרשמה למתנדבים:</p>
                                    <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={baseUrl ? `${baseUrl}/events/${id}/volunteers/register` : ""}
                                        className="flex-1 rounded-lg border-gray-300 border p-2 text-sm bg-white"
                                    />
                                        <button
                                            type="button"
                                            onClick={copyVolunteerLink}
                                            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${copiedVolunteersLink ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
                                        >
                                            {copiedVolunteersLink ? (
                                                <>
                                                    <Check size={16} />
                                                    הועתק!
                                                </>
                                            ) : (
                                                <>
                                                    <Copy size={16} />
                                                    העתק קישור
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Edit Modal */}
            {showSpecialModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-xl w-full p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Sparkles size={20} className="text-indigo-600" />
                                <h3 className="text-lg font-bold">משימות מיוחדות</h3>
                            </div>
                            <button onClick={() => setShowSpecialModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm text-indigo-800 flex flex-col gap-2">
                                <div>
                                    <p className="font-semibold text-gray-900 mb-1">שיווק והפצה בקבוצות</p>
                                    <p>יוצר משימת שיווק עם המלל והפלייר הרשמי, לפרסום ב-5 קבוצות וואטסאפ (30+ אנשים) והעלאת צילומי מסך כהוכחה.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCreateSpecialMarketingTask}
                                    disabled={creatingSpecialTask}
                                    className={`mt-auto px-3 py-2 rounded-lg text-sm font-semibold text-white ${creatingSpecialTask ? "bg-gray-300" : "bg-indigo-600 hover:bg-indigo-700"}`}
                                >
                                    {creatingSpecialTask ? "יוצר..." : "הוסף משימת שיווק"}
                                </button>
                            </div>
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-800 flex flex-col gap-2">
                                <div>
                                    <p className="font-semibold text-gray-900 mb-1">להעלות סטורי ולתייג</p>
                                    <p>יוצר משימת סטורי למתנדבים עם הפלייר הרשמי, תיוגי אינסטגרם מהתוכן והמדיה, והנחיה להוסיף מוזיקה ולהעלות צילום מסך.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCreateSpecialStoryTask}
                                    disabled={creatingSpecialTask}
                                    className={`mt-auto px-3 py-2 rounded-lg text-sm font-semibold text-white ${creatingSpecialTask ? "bg-gray-300" : "bg-amber-500 hover:bg-amber-600"}`}
                                >
                                    {creatingSpecialTask ? "יוצר..." : "הוסף משימת סטורי"}
                                </button>
                            </div>
                        </div>
                        <div className="border-t pt-4">
                            <h4 className="text-sm font-semibold text-gray-800 mb-2">משימות מיוחדות קיימות</h4>
                            {specialTasks.length === 0 ? (
                                <p className="text-xs text-gray-500">אין משימות מיוחדות קיימות כרגע.</p>
                            ) : (
                                <div className="space-y-2">
                                    {specialTasks.map((task) => (
                                        <div key={task.id} className="flex items-center justify-between gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
                                                <p className="text-xs text-gray-500">
                                                    סטטוס: {task.status === "DONE" ? "בוצע" : task.status === "IN_PROGRESS" ? "בתהליך" : task.status === "STUCK" ? "תקוע" : "פתוח"}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => confirmDeleteTask(task.id)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50"
                                            >
                                                מחק
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setShowSpecialModal(false)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200"
                            >
                                סגור
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Edit Modal */}
            {showContentModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold">תוכן ומדיה לאירוע</h3>
                            <button onClick={() => setShowContentModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="p-3 rounded-lg border border-indigo-100 bg-indigo-50">
                                <p className="text-sm font-semibold text-indigo-900 mb-1">שיתוף טופס למלל ותמונה רשמית</p>
                                <p className="text-xs text-indigo-800 mb-2">
                                    שלח לכל אחד קישור לטופס שמאפשר להזין מלל רשמי, תיוגים ולצרף תמונה. המידע יישמר אוטומטית באירוע.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={baseUrl ? `${baseUrl}/events/${id}/content-form` : ""}
                                        className="flex-1 rounded-lg border-gray-300 border p-2 text-xs bg-white"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={copyContentFormLink}
                                            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 ${copiedContentFormLink ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
                                        >
                                            <Copy size={14} />
                                            {copiedContentFormLink ? "הועתק" : "העתק קישור"}
                                        </button>
                                        <a
                                            href={`/events/${id}/content-form`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="px-3 py-2 rounded-lg text-xs font-semibold border border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center gap-2"
                                        >
                                            פתח
                                        </a>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">מלל רשמי לפוסט</label>
                                <textarea
                                    rows={5}
                                    className="w-full border rounded-lg p-3 text-sm"
                                    value={officialPostText}
                                    onChange={(e) => setOfficialPostText(e.target.value)}
                                    placeholder="הקלד את הטקסט הרשמי לפרסום"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">תיוגים לאינסטגרם (שם משתמש אחד בכל פעם, אנטר להוספה)</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 border rounded-lg p-2 text-sm"
                                        value={instaTagInput}
                                        placeholder="לדוגמה: user_name"
                                        onChange={(e) => setInstaTagInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addInstagramTag(instaTagInput);
                                            }
                                        }}
                                        onBlur={() => addInstagramTag(instaTagInput)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => addInstagramTag(instaTagInput)}
                                        className="px-3 py-2 rounded-lg text-sm font-semibold text-white"
                                        style={{ background: 'var(--patifon-orange)' }}
                                    >
                                        הוסף
                                    </button>
                                </div>
                                {officialInstaTagsList.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {officialInstaTagsList.map(tag => (
                                            <span key={tag} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 text-xs text-indigo-800">
                                                @{tag}
                                                <button type="button" onClick={() => removeInstagramTag(tag)} className="text-indigo-500 hover:text-indigo-700">×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">פלייר רשמי</label>
                                {officialFlyerUrl && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <a href={officialFlyerUrl} target="_blank" className="text-indigo-600 underline" rel="noreferrer">פתח פלייר נוכחי</a>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!db) return;
                                                const confirmDelete = window.confirm("למחוק את הפלייר הנוכחי?");
                                                if (!confirmDelete) return;
                                                try {
                                                    await updateDoc(doc(db, "events", id), { officialFlyerUrl: "" });
                                                    setOfficialFlyerUrl("");
                                                    setEvent(prev => prev ? { ...prev, officialFlyerUrl: "" } : prev);
                                                } catch (err) {
                                                    console.error("שגיאה במחיקת הפלייר", err);
                                                    alert("לא הצלחנו למחוק את הפלייר");
                                                }
                                            }}
                                            className="px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                                        >
                                            מחק
                                        </button>
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        ref={contentFlyerInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setOfficialFlyerFile(e.target.files?.[0] || null)}
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => contentFlyerInputRef.current?.click()}
                                        className="px-3 py-2 rounded-lg text-sm font-semibold border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                                    >
                                        בחר פלייר מהמחשב
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleUploadOfficialFlyer}
                                        disabled={officialFlyerUploading}
                                        className={`px-3 py-2 rounded-lg text-sm font-semibold text-white ${officialFlyerUploading ? "bg-gray-300" : "bg-indigo-600 hover:bg-indigo-700"}`}
                                    >
                                        {officialFlyerUploading ? "מעלה..." : "העלה פלייר"}
                                    </button>
                                </div>
                                {officialFlyerFile && <p className="text-xs text-gray-600">נבחר: {officialFlyerFile.name}</p>}
                                <button
                                    type="button"
                                    onClick={() => setShowFlyerPicker(prev => !prev)}
                                    className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
                                >
                                    בחר פלייר ממאגר האירוע
                                </button>
                                {showFlyerPicker && (
                                    <div className="mt-3 border border-gray-200 rounded-lg p-3 max-h-64 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {eventFiles.length === 0 ? (
                                            <p className="text-sm text-gray-500">אין קבצים במאגר האירוע.</p>
                                        ) : (
                                            eventFiles.map((file) => (
                                                <button
                                                    key={file.id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (file.url) {
                                                            setOfficialFlyerUrl(file.url);
                                                            setShowFlyerPicker(false);
                                                        }
                                                    }}
                                                    className="border border-gray-200 rounded-lg overflow-hidden bg-white hover:shadow-md transition text-left"
                                                >
                                                    <div className="h-20 bg-gray-50 flex items-center justify-center">
                                                        {file.url ? (
                                                            <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-xs text-gray-400">אין תצוגה</span>
                                                        )}
                                                    </div>
                                                    <div className="px-2 py-2 text-xs font-semibold text-gray-800 truncate">{file.name || "קובץ"}</div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowContentModal(false)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200"
                            >
                                ביטול
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveContentAndMedia}
                                className="px-3 py-2 rounded-lg text-sm font-semibold text-white"
                                style={{ background: 'var(--patifon-burgundy)' }}
                            >
                                שמור
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Edit Modal */}
            {showPostModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">מלל לפוסט אירוע</h3>
                            <button onClick={() => setShowPostModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-gray-700">קישור פלייר (אם יש)</label>
                            <input
                                type="text"
                                value={flyerLink}
                                onChange={(e) => setFlyerLink(e.target.value)}
                                onBlur={() => setPostContent(buildPostContent())}
                                className="w-full border rounded-lg p-2 text-sm"
                                placeholder="לינק לפלייר מעוצב"
                            />
                            <label className="text-sm font-medium text-gray-700">מלל לפוסט</label>
                            <textarea
                                rows={8}
                                className="w-full border rounded-lg p-3 text-sm"
                                value={postContent}
                                onChange={(e) => setPostContent(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <button
                                type="button"
                                onClick={handleCopyPost}
                                className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                                style={{ border: '1px solid var(--patifon-orange)', color: 'var(--patifon-orange)' }}
                            >
                                <Copy size={16} />
                                העתק
                            </button>
                            <button
                                type="button"
                                onClick={handleRefreshPost}
                                className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-gray-700 border border-gray-200"
                            >
                                רענן מלל
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Edit Modal */}
            {editingStatusTask && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">עריכת סטטוס משימה</h3>
                            <button onClick={() => setEditingStatusTask(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!db || !editingStatusTask) return;
                            try {
                                const taskRef = doc(db, "events", id, "tasks", editingStatusTask.id);
                                await updateDoc(taskRef, {
                                    currentStatus: editingStatusTask.currentStatus || "",
                                    nextStep: editingStatusTask.nextStep || "",
                                    dueDate: editingStatusTask.dueDate,
                                });
                                setEditingStatusTask(null);
                            } catch (err) {
                                console.error("Error updating status:", err);
                                alert("שגיאה בעדכון הסטטוס");
                            }
                        }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">איפה זה עומד</label>
                                <textarea className="w-full p-2 border rounded-lg text-sm" rows={2} value={editingStatusTask.currentStatus || ""} onChange={e => setEditingStatusTask({ ...editingStatusTask, currentStatus: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">הצעד הבא</label>
                                <textarea className="w-full p-2 border rounded-lg text-sm" rows={2} value={editingStatusTask.nextStep || ""} onChange={e => setEditingStatusTask({ ...editingStatusTask, nextStep: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
                                <input type="date" className="w-full p-2 border rounded-lg text-sm" value={editingStatusTask.dueDate} onChange={e => setEditingStatusTask({ ...editingStatusTask, dueDate: e.target.value })} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setEditingStatusTask(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">ביטול</button>
                                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">שמור שינויים</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Date Edit Modal */}
            {editingDateTask && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">שינוי תאריך יעד</h3>
                            <button onClick={() => setEditingDateTask(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!db || !editingDateTask) return;
                            try {
                                const taskRef = doc(db, "events", id, "tasks", editingDateTask.id);
                                const dueVal = computeDueDateFromMode(dateModalMode, parseOffset(dateModalOffset) ?? 0, dateModalTime || extractTimeString(getEventStartDate() || new Date()));
                                await updateDoc(taskRef, { dueDate: dueVal });
                                setEditingDateTask(null);
                            } catch (err) {
                                console.error("Error updating date:", err);
                                alert("שגיאה בעדכון התאריך");
                            }
                        }} className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">מועד המשימה</label>
                                <div className="flex flex-wrap gap-3 text-xs">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            className="accent-indigo-600"
                                            checked={dateModalMode === "event_day"}
                                            onChange={() => { setDateModalMode("event_day"); setDateModalOffset("0"); }}
                                        />
                                        ביום האירוע
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            className="accent-indigo-600"
                                            checked={dateModalMode === "offset"}
                                            onChange={() => setDateModalMode("offset")}
                                        />
                                        ימים ביחס לאירוע
                                    </label>
                                </div>
                                {dateModalMode === "offset" && (
                                    <div className="flex items-center gap-2 text-xs">
                                        <span>ימים מהאירוע:</span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            className="w-24 p-2 border rounded-lg text-sm"
                                            value={dateModalOffset}
                                            onChange={(e) => setDateModalOffset(e.target.value)}
                                        />
                                        <span className="text-gray-500">(שלילי = לפני, חיובי = אחרי)</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-xs">
                                    <span>שעה:</span>
                                    <input
                                        type="time"
                                        className="p-2 border rounded-lg text-sm"
                                        value={dateModalTime}
                                        onChange={(e) => setDateModalTime(e.target.value || extractTimeString(getEventStartDate() || new Date()))}
                                    />
                                </div>
                                <div className="text-xs text-gray-600">
                                    {editingDateTask.dueDate
                                        ? `המשימה מתוזמנת ל-${new Date(editingDateTask.dueDate).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}`
                                        : "לא נקבע מועד למשימה"}
                                    {!getEventStartDate() && (
                                        <div className="text-red-500 mt-1">לא נמצא תאריך לאירוע, המועד מחושב ביחס להיום.</div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setEditingDateTask(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">ביטול</button>
                                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">שמור</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
