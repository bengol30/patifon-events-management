"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, collectionGroup, doc, getDocs, query, where, updateDoc, onSnapshot, addDoc, serverTimestamp, deleteDoc, getDoc, setDoc } from "firebase/firestore";
import { Calendar, MapPin, Users, Handshake, Clock, Target, AlertCircle, ArrowRight, CheckSquare, Square, UserCheck, Lock, Circle, CheckCircle2, MessageCircle, X } from "lucide-react";

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
    scope?: "event" | "project";
    pendingApproval?: boolean;
    pendingApprovalRequestId?: string;
    lastApprovalDecision?: string;
    createdBy?: string;
    ownerId?: string;
    contactPhone?: string;
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

interface CompletedTaskItem {
    eventId?: string;
    eventTitle?: string;
    task: Task;
    completedAt?: any;
}

const ADMIN_EMAIL = "bengo0469@gmail.com";

interface EventData {
    id: string;
    title: string;
    location: string;
    startTime?: any;
    description?: string;
    needsVolunteers?: boolean;
    volunteersCount?: number | null;
    tasks?: Task[];
    scope?: "event" | "project";
    contactPhone?: string;
    contactName?: string;
    createdBy?: string;
    createdByEmail?: string;
    ownerId?: string;
    ownerEmail?: string;
}

export default function VolunteerEventsPage() {
    const router = useRouter();
    const LOCAL_AUTH_KEY = "volunteerAuthSession";
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
    const [tasksReady, setTasksReady] = useState(false);
    const [completedLogs, setCompletedLogs] = useState<CompletedLog[]>([]);
    const [autoAuthTried, setAutoAuthTried] = useState(false);
    const [autoAuthInProgress, setAutoAuthInProgress] = useState(false);
    const [showPendingOnly, setShowPendingOnly] = useState(true);
    const [showAllCompleted, setShowAllCompleted] = useState(false);
    const [userMetaCache, setUserMetaCache] = useState<Record<string, { phone?: string; name?: string }>>({});
    const selectionSummaryTimer = useRef<NodeJS.Timeout | null>(null);
    const [manualRequestModalOpen, setManualRequestModalOpen] = useState(false);
    const [manualRequestTitle, setManualRequestTitle] = useState("");
    const [manualRequestHours, setManualRequestHours] = useState("");
    const [manualRequestEvent, setManualRequestEvent] = useState("");
    const [manualRequestNotes, setManualRequestNotes] = useState("");
    const [manualRequestSubmitting, setManualRequestSubmitting] = useState(false);
    const handleVolunteerLogout = () => {
        setSessionMap({});
        setMatchedEventIds(new Set());
        setIsAuthed(false);
        setSelectedTasksByEvent({});
        setTasksByEvent({});
        setTasksReady(false);
        setCompletedLogs([]);
        setShowAllCompleted(false);
        setShowPendingOnly(true);
        setAuthEmail("");
        setAuthPassword("");
        if (typeof window !== "undefined") {
            localStorage.removeItem(LOCAL_AUTH_KEY);
        }
        router.push("/volunteers/events");
    };
    const [projectsPool, setProjectsPool] = useState<EventData[]>([]);
    const latestProjects = useRef<EventData[]>([]);

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

    const eventMetaMap = useMemo(() => {
        const map = new Map<string, EventData>();
        events.forEach(ev => map.set(ev.id, ev));
        projectsPool.forEach(p => map.set(p.id, p));
        return map;
    }, [events, projectsPool]);

    // helper to read selected tasks per event
    const getSelectedForEvent = useMemo(() => {
        return (eventId: string): Set<string> => selectedTasksByEvent[eventId] || new Set<string>();
    }, [selectedTasksByEvent]);

    // Mark tasks as ready once we have any snapshot (even ריק) after login
    useEffect(() => {
        if (tasksReady) return;
        // Consider ready once any tasks array was populated OR listeners ran (tasksByEvent has any key)
        if (Object.keys(tasksByEvent).length > 0) {
            setTasksReady(true);
        }
    }, [tasksByEvent, tasksReady]);

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

    const completedTasks = useMemo<CompletedTaskItem[]>(() => {
        if (!currentEmail || !isAuthed) return [];
        // Sort by completion time descending
        const sorted = [...completedLogs].sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));
        return sorted.map<CompletedTaskItem>((log) => ({
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
            completedAt: log.completedAt,
        }));
    }, [currentEmail, isAuthed, completedLogs]);

    const totalCompletedHours = useMemo(() => {
        return completedTasks.reduce((sum, item) => {
            const hrs = Number(item.task.volunteerHours);
            return sum + (Number.isFinite(hrs) && hrs > 0 ? hrs : 0);
        }, 0);
    }, [completedTasks]);

const totalAvailableVolunteerTasks = useMemo(() => {
    return Object.values(tasksByEvent).reduce((acc, arr) => acc + (arr?.length || 0), 0);
}, [tasksByEvent]);

    const visibleMyTasks = useMemo(() => {
        return showPendingOnly ? myTasks.filter(({ task }) => task.status !== "DONE") : myTasks;
    }, [showPendingOnly, myTasks]);

    const groupedMyTasks = useMemo(() => {
        const map = new Map<string, { eventTitle?: string; tasks: { eventId: string; task: Task }[] }>();
        visibleMyTasks.forEach(({ eventId, eventTitle, task }) => {
            if (!map.has(eventId)) {
                map.set(eventId, { eventTitle, tasks: [] });
            }
            map.get(eventId)!.tasks.push({ eventId, task });
        });
        return Array.from(map.entries()).map(([eventId, val]) => ({
            eventId,
            eventTitle: val.eventTitle,
            tasks: val.tasks,
        }));
    }, [visibleMyTasks]);

    useEffect(() => {
        if (!db) return;
        setLoading(true);
    const taskUnsubs = new Map<string, () => void>();
    const eventsQuery = collection(db!, "events");
    const projectsQuery = collection(db!, "projects");
        const eventsPoolRef = { current: [] as EventData[] };

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
                            scope: "event",
                            createdBy: (eventData as any).createdBy,
                            createdByEmail: (eventData as any).createdByEmail,
                            contactPhone: (eventData as any)?.contactPerson?.phone || (eventData as any)?.contactPhone || "",
                            contactName: (eventData as any)?.contactPerson?.name || "",
                        });

                // attach task listener if not exists
                if (!taskUnsubs.has(evId)) {
                    const tasksQuery = query(
                        collection(db!, "events", evId, "tasks")
                    );
                    const unsubTask = onSnapshot(tasksQuery, (tasksSnap) => {
                        const tasks: Task[] = [];
                        tasksSnap.forEach((taskDoc) => {
                            const taskData = { id: taskDoc.id, ...taskDoc.data(), scope: "event" } as Task;
                            tasks.push(taskData);
                        });
                        setTasksByEvent((prev) => ({ ...prev, [evId]: tasks }));
                        setTasksReady(true);
                    });
                    taskUnsubs.set(evId, unsubTask);
                }
            });

            // cleanup removed events (preserve project listeners)
            const existingProjects = new Set(latestProjects.current.map((e) => e.id));
            Array.from(taskUnsubs.keys()).forEach((evId) => {
                if (!seen.has(evId) && !existingProjects.has(evId)) {
                    const unsub = taskUnsubs.get(evId);
                    unsub && unsub();
                    taskUnsubs.delete(evId);
                    setTasksByEvent((prev) => {
                        const { [evId]: _, ...rest } = prev;
                        return rest;
                    });
                }
            });

            eventsPoolRef.current = eventsData;
            setEvents([...eventsData, ...latestProjects.current]);
            setLoading(false);
        }, (err) => {
            console.error("Error loading events", err);
            setError("שגיאה בטעינת האירועים");
            setLoading(false);
        });

        const unsubProjects = onSnapshot(projectsQuery, (projectsSnap) => {
            const projectData: EventData[] = [];
            const seen = new Set<string>();
                projectsSnap.forEach((projDoc) => {
                    const data = projDoc.data() as any;
                    const pid = projDoc.id;
                    seen.add(pid);
                    projectData.push({
                        id: pid,
                        title: data.name || data.title || "פרויקט ללא שם",
                        location: data.location || "",
                        startTime: data.dueDate || data.updatedAt,
                        description: data.summary || data.description || "",
                        needsVolunteers: true, // מאפשר הצגת המשימות כמאגר
                        volunteersCount: null,
                        scope: "project",
                        createdBy: data.ownerId,
                        createdByEmail: data.ownerEmail,
                    });

                if (!taskUnsubs.has(pid)) {
                    const tasksQuery = query(
                        collection(db!, "projects", pid, "tasks")
                    );
                    const unsubTask = onSnapshot(tasksQuery, (tasksSnap) => {
                        const tasks: Task[] = [];
                        tasksSnap.forEach((taskDoc) => {
                            const taskData = { id: taskDoc.id, ...taskDoc.data(), scope: "project" } as Task;
                            tasks.push(taskData);
                        });
                        setTasksByEvent((prev) => ({ ...prev, [pid]: tasks }));
                        setTasksReady(true);
                    });
                    taskUnsubs.set(pid, unsubTask);
                }
            });

            // remove listeners for projects that disappeared
            Array.from(taskUnsubs.keys()).forEach((id) => {
                if (!seen.has(id) && !eventsPoolRef.current.some(ev => ev.id === id)) {
                    const unsub = taskUnsubs.get(id);
                    unsub && unsub();
                    taskUnsubs.delete(id);
                    setTasksByEvent((prev) => {
                        const { [id]: _, ...rest } = prev;
                        return rest;
                    });
                }
            });

            // merge projects into existing events list
            latestProjects.current = projectData;
            setProjectsPool(projectData);
            setEvents([...eventsPoolRef.current, ...projectData]);
        }, (err) => {
            console.error("Error loading projects for volunteer tasks", err);
        });

        return () => {
            unsubEvents();
            unsubProjects();
            taskUnsubs.forEach((unsub) => unsub());
        };
    }, [db]);

    // Fallback: one-time backfill of volunteer tasks (events + projects) in case listeners miss older data
    useEffect(() => {
        if (!db) return;
        (async () => {
            try {
                const snap = await getDocs(collectionGroup(db, "tasks"));
                const grouped: Record<string, Task[]> = {};
                snap.forEach((docSnap) => {
                    const data = docSnap.data() as any;
                    if (data.isVolunteerTask === false) return;
                    const isVolunteerLike = data.isVolunteerTask === true || data.volunteerHours != null;
                    if (!isVolunteerLike) return;
                    const parent = docSnap.ref.parent.parent;
                    if (!parent) return;
                    const parentId = parent.id;
                    const path = parent.path || "";
                    const isProject = path.startsWith("projects/") || path.includes("/projects/");
                    const scope: "event" | "project" = isProject ? "project" : "event";
                    if (!grouped[parentId]) grouped[parentId] = [];
                    grouped[parentId].push({
                        id: docSnap.id,
                        ...data,
                        scope,
                    } as Task);
                });
                if (Object.keys(grouped).length) {
                    setTasksByEvent((prev) => ({ ...grouped, ...prev }));
                    setTasksReady(true);
                }
            } catch (err) {
                console.warn("Fallback volunteer tasks load failed", err);
            }
        })();
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

    const MIN_SEND_INTERVAL_MS = 5000;
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const ensureGlobalRateLimit = async () => {
        if (!db) return;
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
            } catch {
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
            if (!data.idInstance || !data.apiTokenInstance) return null;
            return {
                idInstance: data.idInstance as string,
                apiTokenInstance: data.apiTokenInstance as string,
                baseUrl: data.baseUrl as string | undefined,
                rules: data.rules || {},
            };
        } catch (err) {
            console.warn("Failed reading whatsapp config", err);
            return null;
        }
    };

    const getUserPhone = async (uid?: string, email?: string) => {
        if (!db) return "";
        if (uid) {
            try {
                const snap = await getDoc(doc(db!, "users", uid));
                if (snap.exists()) {
                    const data = snap.data() as any;
                    if (data?.phone) return data.phone;
                }
            } catch { /* ignore */ }
        }
        if (email) {
            try {
                const q = query(collection(db!, "users"), where("email", "==", email.toLowerCase()));
                const res = await getDocs(q);
                const data = res.docs[0]?.data() as any;
                if (data?.phone) return data.phone;
            } catch { /* ignore */ }
        }
        return "";
    };

    const notifyOwnerTaskCompletion = async (opts: { ownerId?: string; ownerEmail?: string; taskTitle: string; volunteerName: string; eventId: string }) => {
        const cfg = await fetchWhatsappConfig();
        if (!cfg || !cfg.rules?.notifyOnVolunteerDone) return;
        await ensureGlobalRateLimit();
        const phone = normalizePhone(await getUserPhone(opts.ownerId, opts.ownerEmail));
        if (!phone) return;
        const origin = getPublicBaseUrl(cfg.baseUrl);
        const messageLines = [
            `שלום,`,
            `${opts.volunteerName} סימן/ה שהמשימה "${opts.taskTitle}" הושלמה.`,
            `יש לאשר את הביצוע באזור האישי.`,
            origin ? `קישור: ${origin}` : ""
        ].filter(Boolean);
        const endpoint = `https://api.green-api.com/waInstance${cfg.idInstance}/SendMessage/${cfg.apiTokenInstance}`;
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId: `${phone}@c.us`, message: messageLines.join("\n") }),
            });
            if (!res.ok) {
                console.warn("Failed sending completion WhatsApp", await res.text());
            }
        } catch (err) {
            console.warn("Error sending completion WhatsApp", err);
        }
    };

    const handleManualRequestSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!db) return;
        if (!isAuthed) {
            alert("יש להתחבר כדי לשלוח בקשה זו.");
            return;
        }
        const title = manualRequestTitle.trim();
        if (!title) {
            alert("יש להזין שם משימה או פעילות.");
            return;
        }
        const hours = parseFloat(manualRequestHours);
        if (!Number.isFinite(hours) || hours <= 0) {
            alert("יש להזין מספר שעות חיובי.");
            return;
        }
        const volunteerEmail = sessionIdentity.email;
        if (!volunteerEmail) {
            alert("המערכת לא מזהה אימייל. נסה/י להתחבר שוב.");
            return;
        }
        setManualRequestSubmitting(true);
        try {
            await addDoc(collection(db, "task_completion_requests"), {
                taskId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                taskTitle: title,
                eventId: "manual",
                eventTitle: manualRequestEvent.trim() || "הגשה ידנית",
                scope: "manual",
                volunteerEmail,
                volunteerName: sessionIdentity.name,
                volunteerHours: hours,
                ownerEmail: ADMIN_EMAIL.toLowerCase(),
                status: "PENDING",
                manualRequest: true,
                notes: manualRequestNotes.trim(),
                createdAt: serverTimestamp(),
            });
            notifyOwnerTaskCompletion({
                ownerEmail: ADMIN_EMAIL.toLowerCase(),
                ownerId: undefined,
                taskTitle: title,
                volunteerName: sessionIdentity.name,
                eventId: "manual"
            });
            alert("הבקשה נשלחה למנהל. ההתנדבות תתווסף לאחר אישור.");
            setManualRequestModalOpen(false);
            setManualRequestTitle("");
            setManualRequestHours("");
            setManualRequestEvent("");
            setManualRequestNotes("");
        } catch (err) {
            console.error("Error sending manual completion request", err);
            alert("שגיאה בשליחת הבקשה. נסה/י שנית.");
        } finally {
            setManualRequestSubmitting(false);
        }
    };

    const hashPassword = async (password: string) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    };

    // Helper: validate volunteer credentials against event volunteer lists
    const openAuth = (eventId?: string) => {
        if (eventId) setAuthEventId(eventId);
        setAuthEmail("");
        setAuthPassword("");
        setAuthError("");
        setAuthModalVisible(true);
    };

    const performAuthWithHash = async (emailInput: string, passwordHash: string) => {
        if (!db) return { matched: {} as Record<string, { volunteerId: string; name: string; email: string }>, matchedIds: [] as string[] };
        const emailLower = emailInput.trim().toLowerCase();
        const matched: Record<string, { volunteerId: string; name: string; email: string }> = {};
        let hasGeneral = false;

        for (const ev of events) {
            try {
                const volunteersCollection = ev.scope === "project"
                    ? collection(db, "projects", ev.id, "volunteers")
                    : collection(db, "events", ev.id, "volunteers");
                const volunteersSnap = await getDocs(
                    query(volunteersCollection, where("email", "==", emailInput.trim()))
                );
                if (!volunteersSnap.empty) {
                    const docSnap = volunteersSnap.docs[0];
                    const data = docSnap.data() as any;
                    const storedHash = data.passwordHash;
                    if (storedHash && storedHash === passwordHash) {
                        const name = data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "מתנדב/ת";
                        matched[ev.id] = { volunteerId: docSnap.id, name, email: emailInput.trim() };
                        continue;
                    }
                }
                const volunteersSnapAll = await getDocs(volunteersCollection);
                for (const volDoc of volunteersSnapAll.docs) {
                    const data = volDoc.data() as any;
                    const emailVal = (data.email || "").toLowerCase();
                    if (emailVal !== emailLower) continue;
                    const storedHash = data.passwordHash;
                    if (storedHash && storedHash === passwordHash) {
                        const name = data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "מתנדב/ת";
                        matched[ev.id] = { volunteerId: volDoc.id, name, email: emailInput.trim() };
                        break;
                    }
                }
            } catch (lookupErr) {
                console.warn("Login lookup failed", lookupErr);
            }
        }

        // General volunteers collection (not tied to event/project)
        try {
            const generalSnap = await getDocs(query(collection(db, "general_volunteers"), where("email", "==", emailInput.trim())));
            const docSnap = generalSnap.docs[0];
            if (docSnap) {
                const data = docSnap.data() as any;
                const storedHash = data.passwordHash;
                if (storedHash && storedHash === passwordHash) {
                    const name = data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || emailInput.trim();
                    matched["general"] = { volunteerId: docSnap.id, name, email: emailInput.trim() };
                    hasGeneral = true;
                }
            }
        } catch (err) {
            console.warn("General volunteer lookup failed", err);
        }

        const matchedIds = Object.keys(matched);
        return { matched, matchedIds };
    };

    const applyAuthResult = (matched: Record<string, { volunteerId: string; name: string; email: string }>, matchedIds: string[], emailLower: string) => {
        setSessionMap(matched);
        setMatchedEventIds(new Set(matchedIds.length ? matchedIds : ["general"]));
        setIsAuthed(true);
        setTasksReady(false);
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
    };

    // Attempt auto-auth from stored session (email + hashed password)
    useEffect(() => {
        if (!db || autoAuthTried || isAuthed || events.length === 0) return;
        const saved = typeof window !== "undefined" ? localStorage.getItem(LOCAL_AUTH_KEY) : null;
        if (!saved) {
            setAutoAuthTried(true);
            return;
        }
        try {
            const parsed = JSON.parse(saved) as { email?: string; passwordHash?: string };
            if (!parsed.email || !parsed.passwordHash) {
                setAutoAuthTried(true);
                return;
            }
                setAutoAuthInProgress(true);
                // Optimistically mark as authed to avoid jump to login while we verify
                setIsAuthed(true);
                (async () => {
                    const { matched, matchedIds } = await performAuthWithHash(parsed.email!, parsed.passwordHash!);
                    if (matchedIds.length > 0) {
                        const emailLower = parsed.email!.trim().toLowerCase();
                        applyAuthResult(matched, matchedIds, emailLower);
                    } else {
                        // fallback: clear optimistic auth if no match
                        setIsAuthed(false);
                        localStorage.removeItem(LOCAL_AUTH_KEY);
                    }
                    setAutoAuthTried(true);
                    setAutoAuthInProgress(false);
                })();
            } catch (err) {
                console.warn("Auto auth parse failed", err);
                setAutoAuthTried(true);
                setAutoAuthInProgress(false);
            }
    }, [db, events.length, isAuthed, autoAuthTried]);

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
            const computed = await hashPassword(authPassword.trim());
            const { matched, matchedIds } = await performAuthWithHash(authEmail.trim(), computed);

            if (matchedIds.length === 0) {
                setAuthError("לא נמצא חשבון מתנדב עם הפרטים שהוזנו. ודא/י שנרשמת לאירוע הזה.");
                return;
            }

            applyAuthResult(matched, matchedIds, emailLower);
            if (typeof window !== "undefined") {
                localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify({ email: authEmail.trim(), passwordHash: computed }));
            }
        } catch (err) {
            console.error("Volunteer auth failed", err);
            setAuthError("שגיאה באימות. נסו שוב.");
        } finally {
            setAuthing(false);
        }
    };

    type TaskRefPath = ["projects" | "events", string, "tasks", string];
    const getTaskRefPath = (scope: "event" | "project" = "event", eventId: string, taskId: string): TaskRefPath =>
        scope === "project" ? ["projects", eventId, "tasks", taskId] : ["events", eventId, "tasks", taskId];

    const buildWhatsappLink = (rawPhone?: any, taskTitle?: string, creatorName?: string) => {
        if (!rawPhone) return "";
        const digits = String(rawPhone).replace(/\D/g, "");
        if (!digits) return "";
        const normalized = digits.startsWith("0") ? `972${digits.replace(/^0+/, "")}` : digits;
        const text = encodeURIComponent(`היי ${creatorName || ""}, לגבי המשימה "${taskTitle || "משימה"}"`);
        return `https://wa.me/${normalized}?text=${text}`;
    };

    // Prefetch phone numbers of task creators/owners for quick whatsapp links
    useEffect(() => {
        if (!db) return;
        const ids = new Set<string>();
        Object.values(tasksByEvent).forEach((arr) => {
            (arr || []).forEach((t) => {
                if (t.createdBy) ids.add(String(t.createdBy));
                if ((t as any).ownerId) ids.add(String((t as any).ownerId));
            });
        });
        const missing = Array.from(ids).filter((id) => !userMetaCache[id]);
        if (!missing.length) return;
        (async () => {
            try {
                const updates: Record<string, { phone?: string; name?: string }> = {};
                for (const uid of missing) {
                    try {
                        const docSnap = await getDoc(doc(db, "users", uid));
                        if (docSnap.exists()) {
                            const data = docSnap.data() as any;
                            updates[uid] = {
                                phone: data.phone || "",
                                name: data.fullName || data.name || data.displayName || data.email || "",
                            };
                        }
                    } catch (err) {
                        console.warn("failed fetch phone for user", uid, err);
                    }
                }
                if (Object.keys(updates).length) {
                    setUserMetaCache((prev) => ({ ...prev, ...updates }));
                }
            } catch {
                /* ignore */
            }
        })();
    }, [db, tasksByEvent, userMetaCache]);

    const setTaskSelectionImmediate = async (eventId: string, taskId: string, select: boolean, scope: "event" | "project" = "event") => {
        if (!db) return;
        if (!isAuthed) {
            openAuth(eventId);
            return;
        }

        try {
            setSaveStatus((prev) => ({ ...prev, [eventId]: "saving" }));
            const taskRef = doc(db, ...getTaskRefPath(scope, eventId, taskId));
            const snap = await getDoc(taskRef);
            if (!snap.exists()) {
                setSaveStatus((prev) => ({ ...prev, [eventId]: "error" }));
                return;
            }

            const data = snap.data() as any;
            const currentAssignees = Array.isArray(data.assignees) ? data.assignees : [];
            const filtered = currentAssignees.filter((a: any) => (a?.email || "").toLowerCase() !== sessionIdentity.email);

            // Try to bind the assignee to an existing user for dashboard visibility
            let assigneeIdPatch: any = {};
            let enrichedAssignee: { name: string; email: string; userId?: string } | null = null;
            if (select) {
                try {
                    const usersSnap = await getDocs(
                        query(collection(db, "users"), where("email", "==", sessionIdentity.email))
                    );
                    const matchedUser = usersSnap.docs[0];
                    if (matchedUser) {
                        enrichedAssignee = {
                            name: sessionIdentity.name,
                            email: sessionIdentity.email.toLowerCase(),
                            userId: matchedUser.id,
                        };
                        assigneeIdPatch = {
                            assigneeId: matchedUser.id,
                            assignee: sessionIdentity.name,
                            assigneeEmail: sessionIdentity.email.toLowerCase(),
                        };
                    } else {
                        enrichedAssignee = {
                            name: sessionIdentity.name,
                            email: sessionIdentity.email.toLowerCase(),
                        };
                        assigneeIdPatch = { assignee: sessionIdentity.name, assigneeId: "", assigneeEmail: sessionIdentity.email.toLowerCase() };
                    }
                } catch (lookupErr) {
                    console.warn("user lookup failed", lookupErr);
                    assigneeIdPatch = { assignee: sessionIdentity.name, assigneeEmail: sessionIdentity.email.toLowerCase() };
                    enrichedAssignee = { name: sessionIdentity.name, email: sessionIdentity.email.toLowerCase() };
                }
            } else if (filtered.length === 0) {
                assigneeIdPatch = { assignee: "", assigneeId: "", assigneeEmail: "" };
            }

            const updatedAssignees = select
                ? [...filtered, enrichedAssignee || { name: sessionIdentity.name, email: sessionIdentity.email.toLowerCase() }]
                : filtered;

            await updateDoc(taskRef, { assignees: updatedAssignees, ...assigneeIdPatch });

            // Update local selections
            setSelectedTasksByEvent((prev) => {
                const next = { ...prev };
                const set = new Set(next[eventId] || []);
                if (select) set.add(taskId);
                else set.delete(taskId);
                next[eventId] = set;
                return next;
            });

            setTasksByEvent((prev) => {
                const current = prev[eventId] || [];
                const updated = current.map((t) => (t.id === taskId ? { ...t, assignees: updatedAssignees } : t));
                return { ...prev, [eventId]: updated };
            });

            // Update local events/tasks for immediate UI sync
            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === eventId
                        ? {
                            ...ev,
                            tasks: (ev.tasks || []).map((t) =>
                                t.id === taskId ? { ...t, assignees: updatedAssignees } : t
                            ),
                        }
                        : ev
                )
            );

            setSaveStatus((prev) => ({ ...prev, [eventId]: "saved" }));
        } catch (err) {
            console.error("Error saving volunteer tasks", err);
            setSaveStatus((prev) => ({ ...prev, [eventId]: "error" }));
        }
    };

    const removeTaskSelection = async (eventId: string, taskId: string, scope: "event" | "project" = "event") => {
        // Prevent removing a task that was already completed
        const currentStatus = (tasksByEvent[eventId] || []).find((t) => t.id === taskId)?.status;
        if (currentStatus === "DONE") return;
        await setTaskSelectionImmediate(eventId, taskId, false, scope);
    };

    const toggleTaskDone = async (eventId: string, taskId: string, currentStatus: string, scope: "event" | "project" = "event") => {
        if (!db) return;
        if (!isAuthed) return;
        const isPending = currentStatus === "PENDING_APPROVAL";
        try {
            setSaveStatus((prev) => ({ ...prev, [eventId]: "saving" }));
            const taskRef = doc(db, ...getTaskRefPath(scope, eventId, taskId));

            if (isPending) {
                await updateDoc(taskRef, { pendingApproval: false, pendingApprovalRequestId: "", status: "TODO" });
            } else {
                const task = (tasksByEvent[eventId] || []).find((t) => t.id === taskId);
                const ev = events.find((e) => e.id === eventId);
                let ownerId = (task as any)?.createdBy || (task as any)?.ownerId || (ev as any)?.createdBy || (ev as any)?.ownerId || "";
                let ownerEmail = ((task as any)?.createdByEmail || (task as any)?.ownerEmail || (ev as any)?.createdByEmail || (ev as any)?.ownerEmail || "") as string;
                if (!ownerId || !ownerEmail) {
                    try {
                        const parentRef = scope === "project" ? doc(db, "projects", eventId) : doc(db, "events", eventId);
                        const parentSnap = await getDoc(parentRef);
                        const data = parentSnap.data() as any;
                        ownerId = ownerId || data?.ownerId || data?.createdBy || "";
                        ownerEmail = ownerEmail || data?.ownerEmail || data?.createdByEmail || "";
                    } catch (lookupErr) {
                        console.warn("Owner lookup failed", lookupErr);
                    }
                }
                ownerEmail = typeof ownerEmail === "string" ? ownerEmail.toLowerCase() : "";
                const reqRef = await addDoc(collection(db, "task_completion_requests"), {
                    taskId,
                    taskTitle: task?.title || "משימה",
                    eventId,
                    eventTitle: ev?.title || "",
                    scope,
                    volunteerEmail: sessionIdentity.email,
                    volunteerName: sessionIdentity.name,
                    volunteerHours: task?.volunteerHours ?? null,
                    ownerId,
                    ownerEmail,
                    status: "PENDING",
                    createdAt: serverTimestamp(),
                });
                await updateDoc(taskRef, { pendingApproval: true, pendingApprovalRequestId: reqRef.id, status: "TODO" });
                if (ownerEmail || ownerId) {
                    notifyOwnerTaskCompletion({
                        ownerEmail,
                        ownerId,
                        taskTitle: task?.title || "משימה",
                        volunteerName: sessionIdentity.name || sessionIdentity.email || "מתנדב/ת",
                        eventId,
                    });
                }
                alert("הבקשה לאישור נשלחה ליוצר המשימה. המשימה תסומן כהושלמה רק לאחר אישור.");
            }

            setEvents((prev) =>
                prev.map((ev) =>
                    ev.id === eventId
                        ? {
                            ...ev,
                            tasks: (ev.tasks || []).map((t) => (t.id === taskId ? { ...t, pendingApproval: !isPending, status: isPending ? "TODO" : t.status } : t)),
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

    const shouldBlockForTasks = isAuthed && !tasksReady;

    if (loading || autoAuthInProgress || shouldBlockForTasks) {
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
                        <div className="flex flex-col items-end gap-1">
                            {isAuthed && (
                                <div className="text-right text-xs text-indigo-800">
                                    <div className="font-semibold">{sessionIdentity.name}</div>
                                    <div className="text-indigo-700">{sessionIdentity.email}</div>
                                </div>
                            )}
                            <button
                                onClick={handleVolunteerLogout}
                                className="px-3 py-2 text-sm rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold"
                            >
                                התנתק
                            </button>
                        </div>
                    </div>
                    
                {!isAuthed && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                        <h2 className="font-semibold text-indigo-900 mb-2">איך זה עובד?</h2>
                        <ul className="text-sm text-indigo-800 space-y-1 list-disc list-inside">
                            <li>נרשמים פעם אחת לאירוע (דרך טופס ההרשמה)</li>
                            <li>מתחברים כאן עם אימייל+סיסמה שבחרתם, בוחרים משימות למתנדבים ומשריינים אותן</li>
                            <li>כל משימה כוללת תיאור ותאריך יעד (דד ליין)</li>
                            <li>ניתן לבחור מספר משימות ולעדכן סטטוס באזור האישי</li>
                        </ul>
                    </div>
                )}
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
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">סיכום שעות מתנדב</h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-sm text-gray-700">משימות שהושלמו: {completedTasks.length}</span>
                                            <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                                                סה\"כ שעות: {totalCompletedHours}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowAllCompleted((v) => !v)}
                                        className="text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-semibold"
                                    >
                                        {showAllCompleted ? "הצג פחות" : "הצג הכל"}
                                    </button>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-auto pr-1">
                                    {(showAllCompleted ? completedTasks : completedTasks.slice(0, 4)).map(({ eventId, eventTitle, task, completedAt }) => {
                                        return (
                                            <div key={`${eventId}-${task.id}-${completedAt?.seconds || ""}`} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
                                                    <div className="text-[11px] text-gray-500 truncate">
                                                        אירוע: {eventTitle || eventId || "אירוע"}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    {task.volunteerHours != null && (
                                                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                            {task.volunteerHours} ש\"ע
                                                        </span>
                                                    )}
                                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">בוצע</span>
                                                </div>
                                            </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    {isAuthed && (
                        <div className="flex justify-end">
                            <button
                                onClick={() => setManualRequestModalOpen(true)}
                                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
                            >
                                דיווח על שעות/משימות שלא נרשמו
                            </button>
                        </div>
                    )}
                        {isAuthed && totalAvailableVolunteerTasks === 0 && (
                            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 text-center text-gray-700">
                                <p className="text-lg font-semibold mb-1">אין כרגע משימות פנויות למתנדבים.</p>
                                <p className="text-sm text-gray-500">כשתתווסף משימה חדשה שמתאימה למתנדבים היא תופיע כאן.</p>
                            </div>
                        )}
                        {myTasks.length > 0 && (
                            <div
                                className="rounded-2xl shadow-xl border p-6"
                                style={{ background: "#fff9d6", borderColor: "#f3e4a3" }}
                            >
                                <div className="flex items-center justify-between mb-3 gap-3">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">המשימות שלי</h3>
                                        <p className="text-sm text-gray-600">משימות שסימנת או הוקצתה אליך באירועים שלך.</p>
                                        <p className="text-xs text-gray-600 mt-1">
                                            קודם בחר משימות שתרצה לבצע. אחרי שסיימת, סמן שהמשימה בוצעה כדי לשלוח לאישור ולצבור שעות התנדבות.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowPendingOnly((v) => !v)}
                                        className={`text-xs px-3 py-2 rounded-lg border font-semibold transition ${
                                            showPendingOnly
                                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                : "bg-white text-gray-700 border-gray-200"
                                        }`}
                                    >
                                        {showPendingOnly ? "הצג הכל" : "הצג רק משימות פתוחות"}
                                    </button>
                                </div>
                                {showPendingOnly && visibleMyTasks.length === 0 && (
                                    <p className="text-sm text-gray-500 mb-3">אין משימות פתוחות כרגע.</p>
                                )}
                                <div className="space-y-4">
                                    {groupedMyTasks.map(group => (
                                        <div key={group.eventId} className="rounded-lg border border-amber-100 bg-white p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                                    <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">{group.eventTitle || "אירוע/פרויקט"}</span>
                                                </div>
                                                <span className="text-xs text-gray-500">{group.tasks.length} משימות</span>
                                            </div>
                                            <div className="divide-y divide-gray-100">
                                                {group.tasks.map(({ eventId, task }) => {
                                                    const taskDate = task.dueDate ? new Date(task.dueDate) : null;
                                                    return (
                                                        <div
                                                            key={`${eventId}-${task.id}`}
                                                            className="py-2 flex items-center gap-3"
                                                        >
                                                            <button
                                                                onClick={() => toggleTaskDone(eventId, task.id, task.pendingApproval ? "PENDING_APPROVAL" : task.status, task.scope || "event")}
                                                                className="flex items-center gap-1 text-sm font-semibold shrink-0"
                                                            >
                                                                {task.pendingApproval ? (
                                                                    <Circle className="text-amber-500" size={18} />
                                                                ) : task.status === "DONE" ? (
                                                                    <CheckCircle2 className="text-emerald-600" size={18} />
                                                                ) : (
                                                                    <Circle className="text-gray-400" size={18} />
                                                                )}
                                                                <span className="text-xs text-gray-700">
                                                                    {task.pendingApproval ? "ממתין לאישור" : task.status === "DONE" ? "הושלם" : "סמן כהושלם"}
                                                                </span>
                                                            </button>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-gray-900 truncate">{task.title}</p>
                                                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                                                                    {taskDate && (
                                                                        <span className="flex items-center gap-1">
                                                                            <Clock size={11} />
                                                                            דד ליין: {taskDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                                                        </span>
                                                                    )}
                                                                    {task.volunteerHours != null && (
                                                                        <span>משך: {task.volunteerHours} ש&apos;ע</span>
                                                                    )}
                                                                    {task.pendingApproval && <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">נשלח לאישור</span>}
                                                                    {task.lastApprovalDecision === "REJECTED" && <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">הבקשה נדחתה</span>}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => router.push(`/tasks/${task.id}?eventId=${eventId}&source=volunteer`)}
                                                                    className="text-xs text-indigo-700 hover:underline"
                                                                >
                                                                    פרטים נוספים
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        if (task.status === "DONE") return;
                                                                        removeTaskSelection(eventId, task.id, task.scope || "event");
                                                                    }}
                                                                    disabled={task.status === "DONE"}
                                                                    className={`text-xs font-semibold ${task.status === "DONE" ? "text-gray-400 cursor-not-allowed" : "text-red-600 hover:text-red-700"}`}
                                                                >
                                                                    שחרר
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {isAuthed && (
                            <div
                                className="border rounded-xl p-4 mb-4 text-sm"
                                style={{ background: "#fff9d6", borderColor: "#f5e7a8", color: "#5c3c1f" }}
                            >
                                בכל משימה יש כפתור "פרטים נוספים" לקבלת כל המידע על המשימה, וכפתור וואטסאפ ליצירת קשר עם יוצר המשימה במקרה של שאלות.
                            </div>
                        )}
                        {events.map((event) => {
                            const eventTasks = (tasksByEvent[event.id] || []).filter((t) => t.isVolunteerTask === true || (t.isVolunteerTask === undefined && t.volunteerHours != null));
                            const eventDate = event.startTime?.seconds ? new Date(event.startTime.seconds * 1000) : (event.startTime ? new Date(event.startTime) : null);
                            const eventTasksAvailable = eventTasks.filter((task) => {
                                if (task.status === "DONE") return false;
                                const assignees = (task.assignees || []).map(a => (a.email || "").toLowerCase()).filter(Boolean);
                                const assignedToMe = assignees.includes(sessionIdentity.email);
                                const assignedToOthers = assignees.length > 0 && !assignedToMe;
                                return !assignedToOthers || assignedToMe;
                            });
                            const hasTasks = eventTasksAvailable.length > 0;
                            
                            if (!hasTasks) return null;
                            return (
                                <div key={event.id} className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                                    <div
                                        className="p-5 flex flex-col gap-1 border-b"
                                        style={{ background: "#ffe6bf", borderColor: "#f4c98f", color: "#5c2f00" }}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <h2 className="text-xl font-bold" style={{ color: "#5c2f00" }}>{event.title}</h2>
                                            {isAuthed ? (
                                                <div className="flex items-center gap-2 text-sm text-gray-700">
                                                    <UserCheck size={16} className="text-emerald-600" />
                                                    <span>מחובר/ת</span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => openAuth()}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                >
                                                    <Lock size={14} />
                                                    התחבר/י לבחור משימות
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-xs" style={{ color: "#5c2f00" }}>
                                            {event.location && (
                                                <span className="flex items-center gap-1"><MapPin size={14} />{event.location}</span>
                                            )}
                                            {eventDate && (
                                                <span className="flex items-center gap-1">
                                                    <Calendar size={14} />
                                                    {eventDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })} •{" "}
                                                    {eventDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                            )}
                                            {event.volunteersCount && (
                                                <span className="flex items-center gap-1"><Users size={14} />מקומות: {event.volunteersCount}</span>
                                            )}
                                        </div>
                                        {event.description && (
                                            <p className="text-xs text-amber-900 mt-1 leading-relaxed line-clamp-2">{event.description}</p>
                                        )}
                                    </div>
                                    <div className="p-5">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Target size={18} className="text-indigo-600" />
                                            <h3 className="text-sm font-bold text-gray-900">משימות זמינות</h3>
                                        </div>
                                        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                                            {eventTasksAvailable.map((task) => {
                                                const taskDate = task.dueDate ? new Date(task.dueDate) : null;
                                                const selectedSet = getSelectedForEvent(event.id);
                                                const isSelected = selectedSet.has(task.id);
                                                const assignedEmails = (task.assignees || []).map((a) => (a.email || "").toLowerCase()).filter(Boolean);
                                                const assignedToMe = assignedEmails.includes(sessionIdentity.email);
                                                const assignedToOthers = assignedEmails.length > 0 && !assignedToMe;
                                                const creatorId = (task as any).createdBy || (task as any).ownerId || "";
                                                const cachedMeta = creatorId ? userMetaCache[creatorId] : undefined;
                                                const creatorName =
                                                    cachedMeta?.name ||
                                                    (task as any)?.createdByName ||
                                                    (event as any)?.contactPerson?.name ||
                                                    (event as any)?.contactName ||
                                                    "";
                                                const whatsappLink = buildWhatsappLink(
                                                    (task as any).createdByPhone ||
                                                    (task as any).creatorPhone ||
                                                    (task as any).ownerPhone ||
                                                    (task as any).contactPhone ||
                                                    (cachedMeta?.phone) ||
                                                    (event as any)?.contactPhone ||
                                                    (event as any)?.contactPerson?.phone,
                                                    task.title,
                                                    creatorName
                                                );
                                                return (
                                                    <div key={task.id} className="flex items-center gap-3 px-3 py-2 bg-white">
                                                        <button
                                                            onClick={() => setTaskSelectionImmediate(event.id, task.id, !isSelected, event.scope || "event")}
                                                            className="shrink-0"
                                                        >
                                                            {isSelected ? <CheckSquare className="text-indigo-600" size={18} /> : <Square className="text-gray-400" size={18} />}
                                                        </button>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="font-semibold text-sm text-gray-900 truncate">{task.title}</p>
                                                                <span className={`text-[11px] px-2 py-0.5 rounded ${task.priority === "CRITICAL" ? "bg-red-100 text-red-700" : task.priority === "HIGH" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                                                                    {task.priority === "CRITICAL" ? "קריטי" : task.priority === "HIGH" ? "גבוה" : "רגיל"}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                                                                {taskDate && (
                                                                    <span className="flex items-center gap-1">
                                                                        <Clock size={11} />
                                                                        דד ליין: {taskDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                                                    </span>
                                                                )}
                                                                {task.volunteerHours != null && (
                                                                    <span>משך: {task.volunteerHours} ש&apos;ע</span>
                                                                )}
                                                                {task.pendingApproval && (
                                                                    <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">נשלח לאישור</span>
                                                                )}
                                                                {task.lastApprovalDecision === "REJECTED" && (
                                                                    <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">נדחה</span>
                                                                )}
                                                                {assignedToMe && <span className="text-emerald-700">שמור עבורך</span>}
                                                                {assignedToOthers && <span className="text-amber-700">שמור למתנדב אחר</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs">
                                                            {whatsappLink ? (
                                                                <a
                                                                    href={whatsappLink}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="p-2 rounded-full border border-green-500 bg-green-50 text-green-700 hover:bg-green-100 transition shadow-sm"
                                                                    title="שליחת הודעת וואטסאפ ליוצר המשימה"
                                                                >
                                                                    <MessageCircle size={16} />
                                                                </a>
                                                            ) : (
                                                                <span className="p-2 rounded-full border border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed" title="אין מספר וואטסאפ זמין">
                                                                    <MessageCircle size={16} />
                                                                </span>
                                                            )}
                                                            <button
                                                                onClick={() => router.push(`/tasks/${task.id}?eventId=${event.id}&source=volunteer`)}
                                                                className="text-indigo-700 hover:underline"
                                                            >
                                                                פרטים נוספים
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
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
            {manualRequestModalOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">בקשת דיווח שעות ישנות</h3>
                            <button
                                onClick={() => setManualRequestModalOpen(false)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <p className="text-sm text-gray-600">
                            תוכל לדווח על משימה או שעת התנדבות שנעשתה לפני שהמערכת הייתה פעילה.
                            המנהל יאשר ויעדכן את סך השעות שלך באזור האישי.
                        </p>
                        <form className="space-y-3" onSubmit={handleManualRequestSubmit}>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">אירוע/פרויקט (אופציונלי)</label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={manualRequestEvent}
                                    onChange={(e) => setManualRequestEvent(e.target.value)}
                                    placeholder="לדוגמה: אירוע התרמה 2022"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">שם המשימה</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={manualRequestTitle}
                                    onChange={(e) => setManualRequestTitle(e.target.value)}
                                    placeholder="לדוגמה: סידור אולם"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">שעות</label>
                                <input
                                    type="number"
                                    step="0.25"
                                    min="0"
                                    required
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={manualRequestHours}
                                    onChange={(e) => setManualRequestHours(e.target.value)}
                                    placeholder="לדוגמה: 3"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">פרטים נוספים</label>
                                <textarea
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    rows={3}
                                    value={manualRequestNotes}
                                    onChange={(e) => setManualRequestNotes(e.target.value)}
                                    placeholder="תיאור קצר של הפעילות"
                                />
                            </div>
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setManualRequestModalOpen(false)}
                                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                                    disabled={manualRequestSubmitting}
                                >
                                    ביטול
                                </button>
                                <button
                                    type="submit"
                                    disabled={manualRequestSubmitting}
                                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-70"
                                >
                                    {manualRequestSubmitting ? "שולח..." : "שלח בקשה"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
