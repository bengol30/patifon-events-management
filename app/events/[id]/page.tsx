"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import TaskCard from "@/components/TaskCard";
import { Plus, MapPin, Calendar, ArrowRight, UserPlus, Save, Trash2, X, AlertTriangle, Users, Target, Handshake, DollarSign, FileText, CheckSquare, Square, Edit2, Share2, Check, Sparkles, Lightbulb, RefreshCw, MessageCircle, User, Clock, Link as LinkIcon, List, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp, onSnapshot, updateDoc, arrayUnion, query, orderBy, deleteDoc, writeBatch } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import TaskChat from "@/components/TaskChat";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

interface Assignee {
    name: string;
    userId?: string;
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

interface EventData {
    title: string;
    location: string;
    startTime: any;
    endTime: any;
    description: string;
    status: string;
    team: { name: string; role: string; email?: string; userId?: string }[];
    participantsCount?: string;
    partners?: string;
    goal?: string;
    budget?: string;
    durationHours?: number;
    recurrence?: "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
    contactPerson?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    customSections?: CustomSection[];
    infoBlocks?: InfoBlock[];
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
    const [copiedRegister, setCopiedRegister] = useState(false);

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
    });
    const [newTaskFiles, setNewTaskFiles] = useState<File[]>([]);

    // Edit Task State
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [editingStatusTask, setEditingStatusTask] = useState<Task | null>(null);
    const [editingDateTask, setEditingDateTask] = useState<Task | null>(null);
    const [taggingTask, setTaggingTask] = useState<Task | null>(null);
    const [tagSelection, setTagSelection] = useState<Assignee[]>([]);

    const sanitizeAssigneesForWrite = (arr: Assignee[] = []) =>
        (arr || [])
            .filter(a => (a.name || "").trim())
            .map(a => ({
                name: (a.name || "").trim(),
                ...(a.userId ? { userId: a.userId } : {})
            }));


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
        partners: "",
        goal: "",
        budget: "",
        startTime: "",
        durationHours: "",
        status: "",
        contactName: "",
        contactPhone: "",
        contactEmail: "",
        recurrence: "NONE" as "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY",
        customSections: [] as CustomSection[],
    });

    const [editingInfoBlockId, setEditingInfoBlockId] = useState<string | null>(null);
    const [infoBlockDraft, setInfoBlockDraft] = useState<InfoBlock | null>(null);
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
        if (target === "new") {
            setNewTask(prev => {
                const exists = prev.assignees.some(a => a.name === assignee.name);
                const next = exists
                    ? prev.assignees.filter(a => a.name !== assignee.name)
                    : [...prev.assignees, assignee];
                return { ...prev, assignees: next, assignee: next[0]?.name || "", assigneeId: next[0]?.userId || "" };
            });
            return;
        }

        if (target === "edit" && editingTask) {
            const exists = editingTask.assignees?.some(a => a.name === assignee.name);
            const next = exists
                ? (editingTask.assignees || []).filter(a => a.name !== assignee.name)
                : ([...(editingTask.assignees || []), assignee]);
            setEditingTask({ ...editingTask, assignees: next, assignee: next[0]?.name || "", assigneeId: next[0]?.userId || "" });
            return;
        }

        if (target === "tag") {
            setTagSelection(prev => {
                const exists = prev.some(a => a.name === assignee.name);
                return exists ? prev.filter(a => a.name !== assignee.name) : [...prev, assignee];
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
                const data = doc.data() as any;
                tasksData.push({
                    id: doc.id,
                    ...data,
                    assignee: data.assignee || (data.assignees && data.assignees[0]?.name) || "",
                    assignees: data.assignees || (data.assignee ? [{ name: data.assignee, userId: data.assigneeId }] : []),
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

        return () => {
            unsubscribeEvent();
            unsubscribeTasks();
            unsubscribeBudget();
        };
    }, [id]);

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
            partners: event.partners || "",
            goal: event.goal || "",
            budget: event.budget || "",
            startTime: toInputValue(event.startTime),
            durationHours: event.durationHours ? String(event.durationHours) : "",
            status: event.status || "",
            recurrence: (event.recurrence as any) || "NONE",
            contactName: event.contactPerson?.name || "",
            contactPhone: event.contactPerson?.phone || "",
            contactEmail: event.contactPerson?.email || "",
            customSections: event.customSections || [],
        });
    }, [event]);

    const uploadTaskFiles = async (taskId: string, taskTitle: string, files: File[]) => {
        if (!storage || !db || files.length === 0) return;
        const uploadPromises = files.map(async (file) => {
            const path = `events/${id}/tasks/${taskId}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            const fileData = {
                name: file.name,
                url,
                storagePath: path,
                taskId,
                taskTitle,
                createdAt: serverTimestamp(),
            };
            await Promise.all([
                addDoc(collection(db, "events", id, "tasks", taskId, "files"), fileData),
                addDoc(collection(db, "events", id, "files"), fileData),
            ]);
        });
        await Promise.all(uploadPromises);
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;

        try {
            const cleanAssignees = sanitizeAssigneesForWrite(newTask.assignees);
            const primary = cleanAssignees[0];
            const docRef = await addDoc(collection(db, "events", id, "tasks"), {
                ...newTask,
                filesCount: newTaskFiles.length || 0,
                assignees: cleanAssignees,
                assignee: primary?.name || newTask.assignee,
                assigneeId: primary?.userId || newTask.assigneeId || null,
                status: "TODO",
                createdAt: serverTimestamp(),
                createdBy: user.uid,
            });
            if (newTaskFiles.length) {
                await uploadTaskFiles(docRef.id, newTask.title, newTaskFiles);
            }
            setShowNewTask(false);
            setNewTask({ title: "", description: "", assignee: "", assigneeId: "", assignees: [], dueDate: "", priority: "NORMAL" });
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

    const generateSuggestions = (append = false) => {
        setIsGenerating(true);
        if (!append) setShowSuggestions(true);

        // Simulate AI analysis delay
        setTimeout(() => {
            const suggestions: { title: string; description: string; priority: "NORMAL" | "HIGH" | "CRITICAL" }[] = [];
            const textToAnalyze = `${event?.title} ${event?.description} ${event?.location} ${event?.goal}`.toLowerCase();

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

            suggestions.push(...genericTasks as any);

            // Shuffle and pick unique
            const uniqueSuggestions = Array.from(new Set(suggestions.map(s => JSON.stringify(s))))
                .map(s => JSON.parse(s))
                .sort(() => 0.5 - Math.random()); // Shuffle

            if (append) {
                // Add 5 more unique tasks that are not already in the list
                const currentTitles = new Set(suggestedTasks.map(t => t.title));
                const newSuggestions = uniqueSuggestions.filter((s: any) => !currentTitles.has(s.title)).slice(0, 5);
                setSuggestedTasks(prev => [...prev, ...newSuggestions]);
            } else {
                setSuggestedTasks(uniqueSuggestions.slice(0, 7));
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">שותפים</label>
                                    <input
                                        type="text"
                                        value={eventForm.partners}
                                        onChange={(e) => setEventForm({ ...eventForm, partners: e.target.value })}
                                        className="w-full p-2 border rounded-lg text-sm"
                                    />
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
                                const checked = tagSelection.some(a => a.name === member.name);
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleToggleAssigneeSelection({ name: member.name, userId: member.userId }, "tag")}
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
                                            const checked = editingTask.assignees?.some(a => a.name === member.name);
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
                                                        onChange={() => handleToggleAssigneeSelection({ name: member.name, userId: member.userId }, "edit")}
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
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--patifon-burgundy)' }}>{event.title}</h1>
                        <div className="flex flex-wrap items-center gap-6 text-sm" style={{ color: 'var(--patifon-orange)' }}>
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
                            {event.partners && (
                                <div className="flex items-center gap-1">
                                    <Handshake size={16} />
                                    <span>שותפים: {event.partners}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex gap-2 flex-wrap justify-end">
                            <button
                                onClick={() => setIsEditEventOpen(true)}
                                className="p-2 rounded-full transition hover:bg-indigo-50"
                                style={{ color: 'var(--patifon-burgundy)', border: '1px solid var(--patifon-orange)' }}
                                title="ערוך פרטי אירוע"
                            >
                                <Edit2 size={18} />
                            </button>
                            <button
                                onClick={copyInviteLink}
                                className={`p-2 rounded-full transition vinyl-shadow text-white ${copied ? "bg-green-600 hover:bg-green-700" : "patifon-gradient hover:opacity-90"
                                    }`}
                                title={copied ? "הקישור הועתק!" : "העתק קישור להזמנה"}
                            >
                                {copied ? <Check size={20} /> : <Share2 size={20} />}
                            </button>
                            <button
                                onClick={confirmDeleteEvent}
                                className="p-2 rounded-full transition hover:bg-red-100"
                                style={{ color: 'var(--patifon-red)', background: '#fee', border: '1px solid var(--patifon-red)' }}
                                title="מחק אירוע"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-end">
                            <button
                                onClick={() => router.push(`/events/${id}/registrants`)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold text-white"
                                style={{ background: 'var(--patifon-burgundy)' }}
                            >
                                נרשמים לאירוע
                            </button>
                            <button
                                onClick={() => router.push(`/events/${id}/register`)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                                style={{ border: '2px solid var(--patifon-orange)', color: 'var(--patifon-orange)' }}
                            >
                                <LinkIcon size={16} />
                                טופס רישום לקהל
                            </button>
                            <button
                                onClick={copyRegisterLink}
                                className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${copiedRegister ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"}`}
                                title="העתק קישור לטופס רישום"
                            >
                                {copiedRegister ? <Check size={16} /> : <List size={16} />}
                                {copiedRegister ? "קישור הועתק" : "העתק קישור"}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">סטטוס</p>
                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium" style={{ background: 'var(--patifon-cream)', color: 'var(--patifon-burgundy)' }}>
                                <Square size={14} />
                                {event.status || "לא הוגדר"}
                            </span>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">תאריך ושעה</p>
                            <p className="text-sm text-gray-700">
                                {event.startTime?.seconds ? new Date(event.startTime.seconds * 1000).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "לא הוגדר"}
                            </p>
                            {event.durationHours && (
                                <p className="text-xs text-gray-500 mt-1">משך משוער: {event.durationHours} שעות</p>
                            )}
                            {event.recurrence && event.recurrence !== "NONE" && (
                                <p className="text-xs text-indigo-600 mt-1">
                                    תדירות: {event.recurrence === "WEEKLY" ? "כל שבוע" :
                                        event.recurrence === "BIWEEKLY" ? "כל שבועיים" :
                                            "כל חודש"}
                                </p>
                            )}
                        </div>
                        {event.description && (
                            <div>
                                <p className="text-xs font-semibold text-gray-500 mb-1">תיאור קצר</p>
                                <p className="text-sm text-gray-700 leading-relaxed">{event.description}</p>
                            </div>
                        )}
                    </div>
                    <div className="space-y-4">
                        {event.contactPerson?.name && (
                            <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Main Content - Tasks */}
                <div className="lg:col-span-2 space-y-6">
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
                                className="bg-white px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-80 transition text-sm font-medium vinyl-shadow"
                                style={{ border: '2px solid var(--patifon-orange)', color: 'var(--patifon-orange)' }}
                            >
                                <Sparkles size={18} />
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
                                                const checked = newTask.assignees.some(a => a.name === member.name);
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
                                                            onChange={() => handleToggleAssigneeSelection({ name: member.name, userId: member.userId }, "new")}
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
                                        <div className="flex items-center gap-2 border rounded-lg px-2 py-1.5 bg-white">
                                            <Clock size={16} className="text-gray-500 shrink-0" />
                                            <input
                                                type="date"
                                                className="w-full text-sm focus:outline-none"
                                                value={newTask.dueDate}
                                                onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                                            />
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
                                <select
                                    className="w-full p-2 border rounded-lg text-sm"
                                    value={newTask.priority}
                                    onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                                >
                                    <option value="NORMAL">רגיל</option>
                                    <option value="HIGH">גבוה</option>
                                    <option value="CRITICAL">דחוף מאוד</option>
                                </select>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                        <Paperclip size={16} />
                                        צרף קבצים למשימה (אופציונלי)
                                    </label>
                                    <input
                                        type="file"
                                        multiple
                                        onChange={(e) => {
                                            const files = e.target.files ? Array.from(e.target.files) : [];
                                            setNewTaskFiles(files);
                                        }}
                                        className="w-full text-sm text-gray-700"
                                    />
                                    {newTaskFiles.length > 0 && (
                                        <p className="text-xs text-gray-500 mt-1">{newTaskFiles.length} קבצים יועלו אחרי שמירה</p>
                                    )}
                                </div>
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
