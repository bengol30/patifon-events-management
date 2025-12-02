"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import TaskCard from "@/components/TaskCard";
import { Plus, MapPin, Calendar, ArrowRight, UserPlus, Save, Trash2, X, AlertTriangle, Users, Target, Handshake, DollarSign, FileText, CheckSquare, Square, Edit2, Share2, Check, Sparkles, Lightbulb, RefreshCw, MessageCircle, User, Clock, List, Paperclip, ChevronDown, Copy } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp, onSnapshot, updateDoc, arrayUnion, query, orderBy, deleteDoc, writeBatch, getDocs, increment, setDoc, where } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import TaskChat from "@/components/TaskChat";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import PartnersInput from "@/components/PartnersInput";

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
    lastMessageTime?: any;
    lastMessageBy?: string;
    readBy?: { [key: string]: any };
    previewImage?: string;
    isVolunteerTask?: boolean;
    volunteerHours?: number | null;
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
    participantsCount?: string;
    partners?: string | string[];
    goal?: string;
    budget?: string;
    durationHours?: number;
    recurrence?: "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
    recurrenceEndDate?: any;
    needsVolunteers?: boolean;
    volunteersCount?: number | null;
    contactPerson?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    projectId?: string | null;
    projectName?: string | null;
    customSections?: CustomSection[];
    infoBlocks?: InfoBlock[];
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
    const [suggestedTasks, setSuggestedTasks] = useState<{ title: string; description: string; priority: "NORMAL" | "HIGH" | "CRITICAL" }[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

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
    });
    const dueDateInputRef = useRef<HTMLInputElement | null>(null);
    const newTaskFileInputRef = useRef<HTMLInputElement | null>(null);
    const [newTaskFiles, setNewTaskFiles] = useState<File[]>([]);
    const updateRepeatTaskStats = async (title: string) => {
        if (!db || !title) return;
        const key = normalizeTaskKey(title);
        if (!key) return;
        try {
            await setDoc(doc(db, "repeat_tasks", key), {
                key,
                title: title.trim(),
                count: increment(1),
                lastUsedAt: serverTimestamp(),
            }, { merge: true });
        } catch (err) {
            console.error("Failed updating repeat task stats", err);
        }
    };
    const normalizeTaskKey = (title: string) =>
        (title || "")
            .toLowerCase()
            .replace(/[^\w\sא-ת]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    // Edit Task State
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [editingStatusTask, setEditingStatusTask] = useState<Task | null>(null);
    const [editingDateTask, setEditingDateTask] = useState<Task | null>(null);
    const [taggingTask, setTaggingTask] = useState<Task | null>(null);
    const [tagSelection, setTagSelection] = useState<Assignee[]>([]);

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
                ...(a.email ? { email: a.email.trim().toLowerCase() } : {})
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
    const [volunteers, setVolunteers] = useState<EventVolunteer[]>([]);
    const [loadingVolunteers, setLoadingVolunteers] = useState(true);
    const [volunteerBusyId, setVolunteerBusyId] = useState<string | null>(null);
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

        const unsubscribeEvent = onSnapshot(doc(db, "events", id), async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as EventData;
                const enrichedTeam = await hydrateTeamNames(data.team || []);
                setEvent({ ...data, team: enrichedTeam });
                setSelectedProject((data as any).projectId || "");
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
                const data = doc.data() as any;
                tasksData.push({
                    id: doc.id,
                    ...data,
                    assignee: data.assignee || (data.assignees && data.assignees[0]?.name) || "",
                    assignees: data.assignees || (data.assignee ? [{ name: data.assignee, userId: data.assigneeId }] : []),
                    previewImage: data.previewImage || "",
                } as Task);
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
            setEventFiles(filesData);
        });

        const qVolunteers = query(collection(db, "events", id, "volunteers"), orderBy("createdAt", "desc"));
        const unsubscribeVolunteers = onSnapshot(qVolunteers, (querySnapshot) => {
            const vols: EventVolunteer[] = [];
            querySnapshot.forEach((doc) => {
                vols.push({ id: doc.id, ...doc.data() } as EventVolunteer);
            });
            setVolunteers(vols);
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

    const uploadTaskFiles = async (taskId: string, taskTitle: string, files: File[]) => {
        if (!storage || !db || files.length === 0) return;

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
        });
        await Promise.all(uploadPromises);
        if (previewImage) {
            try {
                await updateDoc(doc(db!, "events", id, "tasks", taskId), { previewImage });
            } catch (err) {
                console.error("Failed to set preview image on task", err);
            }
        }
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
            if (newTask.isVolunteerTask) {
                const hours = newTask.volunteerHours;
                if (hours == null || Number(hours) <= 0 || Number.isNaN(Number(hours))) {
                    alert("יש למלא שעות משוערות למשימת מתנדב");
                    return;
                }
            }
            const cleanAssignees = sanitizeAssigneesForWrite(newTask.assignees);
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
                createdAt: serverTimestamp(),
                createdBy: user.uid,
            });
            updateRepeatTaskStats(newTask.title);
            if (newTaskFiles.length) {
                await uploadTaskFiles(docRef.id, newTask.title, newTaskFiles);
            }
            setShowNewTask(false);
            setNewTask({ title: "", description: "", assignee: "", assigneeId: "", assignees: [], dueDate: "", priority: "NORMAL", isVolunteerTask: false, volunteerHours: null });
            setNewTaskFiles([]);
        } catch (err) {
            console.error("Error adding task:", err);
            alert("שגיאה בהוספת משימה");
        }
    };

    const handleUpdateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !editingTask) return;

        try {
            if (editingTask.isVolunteerTask) {
                const hours = editingTask.volunteerHours;
                if (hours == null || Number(hours) <= 0 || Number.isNaN(Number(hours))) {
                    alert("יש למלא שעות משוערות למשימת מתנדב");
                    return;
                }
            }
            const taskRef = doc(db, "events", id, "tasks", editingTask.id);
            const cleanAssignees = sanitizeAssigneesForWrite(editingTask.assignees || []);
            const updateData: any = {
                title: editingTask.title,
                description: editingTask.description || "",
                assignee: cleanAssignees[0]?.name || editingTask.assignee || "",
                assigneeId: cleanAssignees[0]?.userId || editingTask.assigneeId || null,
                assignees: cleanAssignees,
                dueDate: editingTask.dueDate,
                priority: editingTask.priority,
                status: editingTask.status,
                currentStatus: editingTask.currentStatus || "",
                nextStep: editingTask.nextStep || "",
                isVolunteerTask: editingTask.isVolunteerTask || false,
                volunteerHours: editingTask.isVolunteerTask
                    ? (editingTask.volunteerHours != null ? Number(editingTask.volunteerHours) : null)
                    : null,
            };
            await updateDoc(taskRef, updateData);
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
            const startTimeValue = eventForm.startTime ? new Date(eventForm.startTime) : event.startTime;
            const duration = eventForm.durationHours ? parseFloat(eventForm.durationHours) : undefined;

            let startDateForDuration: Date | null = null;
            if (eventForm.startTime) {
                startDateForDuration = new Date(eventForm.startTime);
            } else if (event?.startTime?.seconds) {
                startDateForDuration = new Date(event.startTime.seconds * 1000);
            }

            const calculatedEnd = duration && startDateForDuration && !isNaN(duration)
                ? new Date(startDateForDuration.getTime() + duration * 60 * 60 * 1000)
                : event.endTime;

            let recurrenceEnd: Date | null = null;
            if (eventForm.recurrence !== "NONE" && eventForm.recurrenceEndDate) {
                const parsed = new Date(eventForm.recurrenceEndDate);
                if (!isNaN(parsed.getTime())) {
                    recurrenceEnd = parsed;
                }
            }
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
                startTime: startTimeValue,
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
        if (typeof window === "undefined") return "";
        return `${window.location.origin}/events/${id}/register`;
    };

    const buildVolunteerLink = () => {
        if (typeof window === "undefined") return "";
        return `${window.location.origin}/events/${id}/volunteers`;
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
            const inviteLink = `${window.location.origin}/events/${id}/join`;
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
            const registerLink = `${window.location.origin}/events/${id}/register`;
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
            const volunteerLink = `${window.location.origin}/events/${id}/volunteers/register`;
            await navigator.clipboard.writeText(volunteerLink);
            setCopiedVolunteersLink(true);
            setTimeout(() => setCopiedVolunteersLink(false), 2000);
        } catch (err) {
            console.error("Failed to copy volunteer link:", err);
            alert("לא הצלחנו להעתיק את הקישור להרשמת מתנדבים.");
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

    const generateSuggestions = (append = false, forceReset = false) => {
        setIsGenerating(true);
        if (!append) setShowSuggestions(true);

        // Simulate AI analysis delay
        setTimeout(() => {
            const suggestions: { title: string; description: string; priority: "NORMAL" | "HIGH" | "CRITICAL" }[] = [];
            const textToAnalyze = `${event?.title} ${event?.description} ${event?.location} ${event?.goal}`.toLowerCase();
            const isOutdoor = textToAnalyze.includes("חוץ") || textToAnalyze.includes("פארק") || textToAnalyze.includes("ים") || textToAnalyze.includes("חצר");
            const hasVendors = textToAnalyze.includes("ספק") || textToAnalyze.includes("חסות") || textToAnalyze.includes("ספונסר");
            const hasTech = textToAnalyze.includes("הגברה") || textToAnalyze.includes("תאורה") || textToAnalyze.includes("וידאו");

            // Expanded Keyword-based logic
            if (textToAnalyze.includes("חתונה") || textToAnalyze.includes("wedding")) {
                suggestions.push({ title: "תיאום טעימות קייטרינג", description: "בחירת מנות לאירוע ותיאום מול הספק", priority: "HIGH" });
                suggestions.push({ title: "בחירת שירי חופה", description: "תיאום מול הדיג'יי", priority: "NORMAL" });
                suggestions.push({ title: "עיצוב חופה", description: "בחירת מעצב וסגירת קונספט", priority: "NORMAL" });
                suggestions.push({ title: "אישורי הגעה", description: "טלפונים לאורחים שלא אישרו", priority: "CRITICAL" });
                suggestions.push({ title: "סידורי הושבה", description: "שיבוץ אורחים לשולחנות", priority: "HIGH" });
            }
            if (textToAnalyze.includes("מסיבה") || textToAnalyze.includes("party")) {
                suggestions.push({ title: "הכנת פלייליסט", description: "רשימת שירים לדיג'יי", priority: "NORMAL" });
                suggestions.push({ title: "קניית אלכוהול", description: "חישוב כמויות ורכישה", priority: "HIGH" });
                suggestions.push({ title: "קישוט המקום", description: "בלונים, שרשראות תאורה ודגלים", priority: "NORMAL" });
                suggestions.push({ title: "תיאום צלם מגנטים", description: "סגירת ספק צילום", priority: "NORMAL" });
            }
            if (textToAnalyze.includes("כנס") || textToAnalyze.includes("conference")) {
                suggestions.push({ title: "הדפסת תגים לשמות", description: "הכנת תגי שם לכל המשתתפים", priority: "NORMAL" });
                suggestions.push({ title: "תיאום ציוד הגברה", description: "מיקרופונים, מקרן ומסך", priority: "CRITICAL" });
                suggestions.push({ title: "הכנת מצגות", description: "איסוף מצגות מהמרצים", priority: "HIGH" });
                suggestions.push({ title: "תיאום כיבוד", description: "קפה ומאפה לקבלת פנים", priority: "NORMAL" });
                suggestions.push({ title: "רישום משתתפים", description: "הקמת עמדת רישום בכניסה", priority: "HIGH" });
            }

            // Contextual technical/logistics
            if (isOutdoor) {
                suggestions.push({ title: "תיאום גנרטורים ורזרבה", description: "הבאת גנרטור נוסף ותאום נקודות חשמל בשטח", priority: "CRITICAL" });
                suggestions.push({ title: "בדיקת מזג אוויר ופתרונות גשם/צל", description: "אוהלים, מחסות ושילוט חירום", priority: "HIGH" });
            }
            if (hasVendors) {
                suggestions.push({ title: "ניהול ספקים ברשימת טלפונים", description: "איסוף איש קשר לכל ספק ותוכנית התקשרות ביום האירוע", priority: "HIGH" });
                suggestions.push({ title: "אישורי בטיחות לספקים", description: "בדיקת ביטוחים, רישיונות וחתימות על נהלי בטיחות", priority: "CRITICAL" });
            }
            if (hasTech) {
                suggestions.push({ title: "חזרת טכניון מלאה", description: "בדיקת סאונד, תאורה ומקרנים עם כל הדוברים/האמנים", priority: "CRITICAL" });
                suggestions.push({ title: "תוכנית גיבוי קבצי מדיה", description: "שמירת קבצי מצגות ומוזיקה על דיסק און קי ודוא\"ל", priority: "HIGH" });
            }

            // General suggestions based on context
            if (!event?.budget || event.budget === "0") {
                suggestions.push({ title: "בניית תקציב מפורט", description: "הערכת עלויות לכל סעיף", priority: "HIGH" });
                suggestions.push({ title: "חיפוש מקורות מימון", description: "חסויות או תמיכה מהרשות", priority: "NORMAL" });
            }
            if (!event?.team || event.team.length < 2) {
                suggestions.push({ title: "גיוס מתנדבים/צוות", description: "פרסום קול קורא להצטרפות לצוות", priority: "HIGH" });
                suggestions.push({ title: "חלוקת תפקידים", description: "הגדרת תחומי אחריות לכל איש צוות", priority: "HIGH" });
            }

            // Always relevant suggestions (Pool of generic tasks)
            const genericTasks = [
                { title: "אישור סופי מול ספקים", description: "וידוא הגעה שבוע לפני האירוע", priority: "CRITICAL" },
                { title: "פרסום ברשתות החברתיות", description: "העלאת פוסט וסטורי לקידום האירוע", priority: "NORMAL" },
                { title: "הכנת לו\"ז יום האירוע", description: "טבלה מפורטת של מה קורה בכל שעה", priority: "HIGH" },
                { title: "סיור מקדים בלוקיישן", description: "בדיקת תשתיות, חשמל ודרכי גישה", priority: "NORMAL" },
                { title: "שליחת תזכורת למשתתפים", description: "הודעת וואטסאפ/מייל יום לפני", priority: "NORMAL" },
                { title: "הכנת שלטי הכוונה", description: "שילוט למקום האירוע", priority: "NORMAL" },
                { title: "בדיקת ביטוח", description: "וידוא שיש ביטוח צד ג' בתוקף", priority: "CRITICAL" },
                { title: "תיאום ניקיון", description: "סגירת חברת ניקיון לפני ואחרי", priority: "NORMAL" },
                { title: "רכישת ציוד מתכלה", description: "חד פעמי, מפיות, שקיות זבל", priority: "NORMAL" },
                { title: "הכנת תיק עזרה ראשונה", description: "וידוא ציוד רפואי בסיסי", priority: "HIGH" },
                { title: "תיאום חניה", description: "בדיקת אפשרויות חניה לאורחים", priority: "NORMAL" },
                { title: "הכנת פלייליסט רקע", description: "מוזיקה לקבלת פנים", priority: "NORMAL" }
            ];

            const technicalOps = [
                { title: "הזמנת צוות אבטחה/סדרנים", description: "סגירת מספר מאבטחים לפי גודל האירוע", priority: "HIGH" },
                { title: "תוכנית פינוי וחירום", description: "נקודות יציאה, שילוט חירום, מספרי חירום זמינים", priority: "CRITICAL" },
                { title: "בדיקת חשמל ותשתיות", description: "בדיקת עומסים, שקעים ואורכי כבלים, גיבוי מפצלים", priority: "HIGH" },
                { title: "תיאום חנייה לציוד וספקים", description: "שמירת מקומות פריקה וטעינה", priority: "NORMAL" },
                { title: "תיאום צילום/וידאו", description: "תדרוך צלמים, מסלולי תנועה, נקודות צילום מרכזיות", priority: "NORMAL" },
                { title: "ניהול טפסי אישורים", description: "חתימות ספקים/אומנים על נהלים, GDPR/צילום", priority: "NORMAL" },
                { title: "תיאום קייטרינג לפי צמחונות/רגישויות", description: "איסוף מידע על אלרגיות ותיאום תפריט חלופי", priority: "HIGH" },
                { title: "הכנת ערכת קשר/קשרי וואטסאפ", description: "פתיחת קבוצת תפעול וצירוף ספקים מרכזיים", priority: "NORMAL" },
                { title: "בדיקת מסלולי כניסה ועמדות בידוק", description: "עמדות כרטיסים/רישום ופיקוח על תורים", priority: "HIGH" }
            ];

            suggestions.push(...genericTasks as any);
            suggestions.push(...technicalOps as any);

            // Shuffle and pick unique
            const uniqueSuggestions = Array.from(new Set(suggestions.map(s => JSON.stringify(s))))
                .map(s => JSON.parse(s))
                .sort(() => 0.5 - Math.random() + (Date.now() % 7) * 0.0001); // Shuffle with slight seed by time

            if (append) {
                const currentTitles = new Set(suggestedTasks.map(t => t.title));
                const newSuggestions = uniqueSuggestions.filter((s: any) => !currentTitles.has(s.title)).slice(0, 7);
                setSuggestedTasks(prev => [...prev, ...newSuggestions]);
            } else {
                setSuggestedTasks(uniqueSuggestions.slice(0, forceReset ? 10 : 7));
            }

            setIsGenerating(false);
        }, 1000);
    };

    const handleAcceptSuggestion = (suggestion: { title: string; description: string; priority: any }) => {
        setNewTask({
            ...newTask,
            title: suggestion.title,
            description: suggestion.description,
            priority: suggestion.priority
        });
        setShowSuggestions(false);
        setShowNewTask(true);
    };

    const totalBudgetUsed = budgetItems.reduce((sum, item) => sum + item.amount, 0);
    const partnersLabel = Array.isArray(event.partners) ? event.partners.join(", ") : (event.partners || "");

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
                            <button onClick={() => { setTaggingTask(null); setTagSelection([]); }} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">בחרו את אנשי הצוות למשימה "{taggingTask.title}". ניתן לבחור יותר מאחד.</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {event.team?.map((member, idx) => {
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
                            {(!event.team || event.team.length === 0) && (
                                <span className="text-sm text-gray-500">אין חברי צוות זמינים</span>
                            )}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => { setTaggingTask(null); setTagSelection([]); }}
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">אחראים</label>
                                    <div className="flex flex-wrap gap-2">
                                        {event.team?.map((member, idx) => {
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
                                        {(!event.team || event.team.length === 0) && (
                                            <span className="text-xs text-gray-500">אין חברי צוות מוגדרים</span>
                                        )}
                                    </div>
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
                <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                        onClick={copyInviteLink}
                                className={`p-2 rounded-full transition vinyl-shadow text-white ${copied ? "bg-green-600 hover:bg-green-700" : "patifon-gradient hover:opacity-90"}`}
                                title={copied ? "הקישור הועתק!" : "שיתוף דף ניהול האירוע"}
                            >
                                {copied ? <Check size={20} /> : <Share2 size={20} />}
                            </button>
                            <button
                                onClick={() => setIsEditEventOpen(true)}
                                className="p-2 rounded-full border border-indigo-100 text-indigo-700 hover:bg-indigo-50 transition"
                                title="ערוך פרטי אירוע"
                            >
                                <Edit2 size={18} />
                            </button>
                            {isOwner && (
                                <button
                                    onClick={confirmDeleteEvent}
                                    className="p-2 rounded-full transition hover:bg-red-100"
                                    style={{ color: 'var(--patifon-red)', background: '#fee', border: '1px solid var(--patifon-red)' }}
                                    title="מחק אירוע"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100 md:w-auto md:self-start md:items-start">
                    <div className="space-y-3 w-full md:w-auto md:min-w-[14rem] md:max-w-[18rem]">
                        {event.contactPerson?.name ? (
                            <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-full" style={{ background: 'var(--patifon-cream)', color: 'var(--patifon-burgundy)' }}>
                                        <User size={20} />
                                    </div>
                                    <div className="text-sm">
                                        <p className="font-semibold text-gray-900">איש קשר: {event.contactPerson.name}</p>
                                        <div className="text-gray-600 flex flex-col">
                                            {event.contactPerson.phone && <span>טלפון: {event.contactPerson.phone}</span>}
                                            {event.contactPerson.email && <span>אימייל: {event.contactPerson.email}</span>}
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
                {/* Suggestions Modal */}
                {showSuggestions && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-200 max-h-[80vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-2">
                                    <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                                        <Sparkles size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900">משימות מוצעות לאירוע</h3>
                                        <p className="text-sm text-gray-500">מבוסס על ניתוח פרטי האירוע שלך</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowSuggestions(false)} className="text-gray-400 hover:text-gray-600">
                                    <X size={24} />
                                </button>
                            </div>

                            {isGenerating ? (
                                <div className="text-center py-12">
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                                    <p className="text-gray-600 animate-pulse">המערכת מנתחת את האירוע ומחפשת רעיונות...</p>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {suggestedTasks.map((suggestion, idx) => (
                                        <div key={idx} className="flex items-start justify-between p-4 border border-gray-100 rounded-lg hover:bg-indigo-50 transition group">
                                            <div>
                                                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                                                    {suggestion.title}
                                                    {suggestion.priority === "CRITICAL" && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">דחוף</span>}
                                                </h4>
                                                <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
                                            </div>
                                            <button
                                                onClick={() => handleAcceptSuggestion(suggestion)}
                                                className="bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-600 hover:text-white transition flex items-center gap-1 shrink-0"
                                            >
                                                <Plus size={16} />
                                                הוסף
                                            </button>
                                        </div>
                                    ))}

                                    <button
                                        onClick={() => generateSuggestions(true)}
                                        className="w-full py-3 mt-2 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition flex items-center justify-center gap-2 text-sm font-medium"
                                    >
                                        <RefreshCw size={16} />
                                        טען עוד רעיונות
                                    </button>
                                    <button
                                        onClick={() => generateSuggestions(false, true)}
                                        className="w-full py-3 border border-indigo-200 rounded-lg text-indigo-700 hover:bg-indigo-50 transition flex items-center justify-center gap-2 text-sm font-semibold"
                                    >
                                        <RefreshCw size={16} />
                                        רענן רשימה
                                    </button>
                                </div>
                            )}
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
                                onClick={() => generateSuggestions(false)}
                                className="bg-white px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:opacity-80 transition text-xs md:text-sm font-medium vinyl-shadow"
                                style={{ border: '2px solid var(--patifon-orange)', color: 'var(--patifon-orange)' }}
                            >
                                <Sparkles size={16} />
                                רעיונות למשימות
                            </button>
                            <button
                                onClick={() => setShowNewTask(!showNewTask)}
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
                                        <p className="text-xs font-semibold text-gray-600">אחראים</p>
                                        <div className="flex flex-wrap gap-2">
                                            {event.team?.map((member, idx) => {
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
                                            {(!event.team || event.team.length === 0) && (
                                                <span className="text-xs text-gray-500">אין חברי צוות מוגדרים</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-gray-600">תאריך ושעה</p>
                                        <input
                                            ref={dueDateInputRef}
                                            type="datetime-local"
                                            className="hidden"
                                            value={newTask.dueDate}
                                            onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                                            step={900}
                                        />
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => dueDateInputRef.current?.showPicker ? dueDateInputRef.current.showPicker() : dueDateInputRef.current?.click()}
                                                className="flex flex-col items-center justify-center gap-2 border-2 border-indigo-200 text-indigo-700 rounded-xl py-3 hover:bg-indigo-50 transition"
                                            >
                                                <Calendar size={28} />
                                                <span className="text-xs font-semibold">בחר תאריך</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => dueDateInputRef.current?.showPicker ? dueDateInputRef.current.showPicker() : dueDateInputRef.current?.click()}
                                                className="flex flex-col items-center justify-center gap-2 border-2 border-orange-200 text-orange-700 rounded-xl py-3 hover:bg-orange-50 transition"
                                            >
                                                <Clock size={28} />
                                                <span className="text-xs font-semibold">בחר שעה</span>
                                            </button>
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            {newTask.dueDate
                                                ? new Date(newTask.dueDate).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
                                                : "טרם נבחר תאריך/שעה"}
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
                        {tasks.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">אין משימות עדיין. צור את המשימה הראשונה!</p>
                        ) : (
                            tasks.map((task) => {
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
                                        onEdit={() => setEditingTask(task)}
                                        onDelete={() => confirmDeleteTask(task.id)}
                                        onStatusChange={(newStatus) => handleStatusChange(task.id, newStatus)}
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
                            })
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
                                            {volunteers.length} / {event.volunteersCount}
                                        </span>
                                    )}
                                </div>

                                {loadingVolunteers ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
                                    </div>
                                ) : volunteers.length > 0 ? (
                                    <div className="space-y-4">
                                        {volunteers.map((volunteer) => (
                                            <div key={volunteer.id} className="flex items-center gap-3 justify-between">
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
                                                {canManageTeam && (
                                                    <button
                                                        onClick={() => {
                                                            if (confirm("האם אתה בטוח שברצונך להסיר את המתנדב?")) {
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
                                                    className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 hover:shadow-md transition text-xs text-gray-700"
                                                >
                                                    <a
                                                        href={doc.fileUrl || "#"}
                                                        target={doc.fileUrl ? "_blank" : undefined}
                                                        rel="noreferrer"
                                                        className="block"
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
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleShareWhatsApp(doc.title || doc.fileName || "מסמך", doc.fileUrl)}
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
                                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/events/${id}/volunteers/register`}
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
                                await updateDoc(taskRef, {
                                    dueDate: editingDateTask.dueDate,
                                });
                                setEditingDateTask(null);
                            } catch (err) {
                                console.error("Error updating date:", err);
                                alert("שגיאה בעדכון התאריך");
                            }
                        }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
                                <input
                                    type="date"
                                    className="w-full p-2 border rounded-lg text-sm"
                                    value={editingDateTask.dueDate}
                                    onChange={e => setEditingDateTask({ ...editingDateTask, dueDate: e.target.value })}
                                    autoFocus
                                />
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
