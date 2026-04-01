"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { auth, db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { signOut, updateProfile, updatePassword, updateEmail, EmailAuthProvider, reauthenticateWithCredential, sendEmailVerification } from "firebase/auth";
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, updateDoc, getDoc, setDoc, getDocs, where, collectionGroup, limit } from "firebase/firestore";
import { ArrowRight, Plus, Trash2, Settings, List, RefreshCw, AlertTriangle, CheckCircle, X, Edit2, Clock, User, AlignLeft, FileText, LogOut, ShieldCheck, Copy, MessageCircle, PlugZap, Bell, Share2, Instagram, UploadCloud, Calendar, Brain, BarChart3 } from "lucide-react";
import Link from "next/link";
import ImportantDocuments from "@/components/ImportantDocuments";
import ImagineMeStyleInsightsPanel from "@/components/ImagineMeStyleInsightsPanel";
import StockTrackingPreviewPanel from "@/components/StockTrackingPreviewPanel";
const ADMIN_EMAIL = "bengo0469@gmail.com";

interface DefaultTask {
    id: string;
    title: string;
    description?: string;
    priority: "NORMAL" | "HIGH" | "CRITICAL";
    daysOffset?: number; // Days relative to event start (negative = before)
    assigneeRole?: string; // e.g., "Producer", "Designer"
    template?: any;
    files?: { name?: string; url?: string; storagePath?: string; originalName?: string }[];
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

interface UserDirectory {
    id: string;
    fullName?: string;
    email?: string;
    phone?: string;
}

interface VolunteerDirectory {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
    source?: string;
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

interface BulkFailure {
    id: string;
    name: string;
    phone: string;
    reason: string;
    type: "user" | "volunteer";
    record: any;
}

export default function SettingsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading: authLoading } = useAuth();
    const validTabs = ["defaultTasks", "documents", "account", "stockTracking", "whatsapp", "metricool", "instagram", "exportDocs"] as const;
    const getInitialTab = () => {
        const tabParam = searchParams.get("tab");
        // Start on WhatsApp tab only after auth check; default to main tab on first render
        if ((tabParam || "") === "whatsapp") return "defaultTasks";
        return validTabs.includes((tabParam || "") as (typeof validTabs)[number]) ? (tabParam as (typeof validTabs)[number]) : "defaultTasks";
    };
    const [activeTab, setActiveTab] = useState<(typeof validTabs)[number]>(getInitialTab);
    const [defaultTasks, setDefaultTasks] = useState<DefaultTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [profileName, setProfileName] = useState("");
    const [profileEmail, setProfileEmail] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [whatsappConfig, setWhatsappConfig] = useState<{ idInstance: string; apiTokenInstance: string; senderPhone?: string; baseUrl?: string; imagineMeStyleLearningEnabled?: boolean }>({
        idInstance: "",
        apiTokenInstance: "",
        senderPhone: "",
        baseUrl: "",
        imagineMeStyleLearningEnabled: true
    });
    const [bulkFailures, setBulkFailures] = useState<BulkFailure[]>([]);
    const [checkingConnection, setCheckingConnection] = useState(false);
    const [useAiFormatting, setUseAiFormatting] = useState(true);
    const [waRules, setWaRules] = useState<{ notifyOnMention: boolean; notifyOnVolunteerDone: boolean }>({ notifyOnMention: false, notifyOnVolunteerDone: false });
    const [savingWaRules, setSavingWaRules] = useState(false);
    const [loadingWhatsapp, setLoadingWhatsapp] = useState(true);
    const [savingWhatsapp, setSavingWhatsapp] = useState(false);
    const [imagineMeStyleInsights, setImagineMeStyleInsights] = useState<any[]>([]);

    const [metricoolConfig, setMetricoolConfig] = useState<{ userToken: string; userId: string }>({
        userToken: "",
        userId: ""
    });
    const [loadingMetricool, setLoadingMetricool] = useState(true);
    const [savingMetricool, setSavingMetricool] = useState(false);

    interface InstagramAccount {
        id: string;
        name: string;
        accessToken: string;
        accountId: string;
    }
    const [instagramAccounts, setInstagramAccounts] = useState<InstagramAccount[]>([]);

    // Form state for adding new account
    const [newIgAccountName, setNewIgAccountName] = useState("");
    const [newIgAccessToken, setNewIgAccessToken] = useState("");
    const [newIgAccountId, setNewIgAccountId] = useState("");

    // State for selected account in post composer
    const [igSelectedAccountId, setIgSelectedAccountId] = useState<string>("");
    const [loadingInstagram, setLoadingInstagram] = useState(true);
    const [savingInstagram, setSavingInstagram] = useState(false);

    // Export docs state
    const [exportSelectedEventId, setExportSelectedEventId] = useState("");
    const [generatingSummary, setGeneratingSummary] = useState(false);
    const [eventSummary, setEventSummary] = useState("");
    const [exportEvents, setExportEvents] = useState<{ id: string; title: string; startTime: any }[]>([]);

    // Instagram Publish State
    const [igPostType, setIgPostType] = useState<"IMAGE" | "VIDEO" | "STORY">("IMAGE");
    const [igCaption, setIgCaption] = useState("");
    const [igTags, setIgTags] = useState("");
    const [igFile, setIgFile] = useState<File | null>(null);
    const [igScheduleTime, setIgScheduleTime] = useState("");
    const [igPublishing, setIgPublishing] = useState(false);

    // UI State
    const [showSeedModal, setShowSeedModal] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; taskId: string | null }>({ isOpen: false, taskId: null });
    const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
    const [deleteAllModal, setDeleteAllModal] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const isAdmin = (user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const [usersDirectory, setUsersDirectory] = useState<UserDirectory[]>([]);
    const [loadingUsersDirectory, setLoadingUsersDirectory] = useState(false);
    const [volunteersDirectory, setVolunteersDirectory] = useState<VolunteerDirectory[]>([]);
    const [loadingVolunteersDirectory, setLoadingVolunteersDirectory] = useState(false);
    const [waSelectedUserId, setWaSelectedUserId] = useState("");
    const [waPhoneInput, setWaPhoneInput] = useState("");
    const [waMessageText, setWaMessageText] = useState("היי, רצינו לעדכן אותך :)");
    const [waSearch, setWaSearch] = useState("");
    const [waSending, setWaSending] = useState(false);
    const [bulkAudience, setBulkAudience] = useState<"users" | "volunteers">("users");
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
    const [bulkTemplate, setBulkTemplate] = useState<"openTasks" | "upcomingEvents" | "custom">("openTasks");
    const [bulkCustomMessage, setBulkCustomMessage] = useState("");
    const [bulkSending, setBulkSending] = useState(false);
    const [groups, setGroups] = useState<{ id: string; name: string; chatId: string }[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [groupSearch, setGroupSearch] = useState("");
    const [groupSearchResults, setGroupSearchResults] = useState<{ name: string; chatId: string }[]>([]);
    const [searchingGroups, setSearchingGroups] = useState(false);
    const [savingGroup, setSavingGroup] = useState(false);
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
    const [groupSendMode, setGroupSendMode] = useState<"custom" | "event">("custom");
    const [groupMessage, setGroupMessage] = useState("");
    const [groupMediaFile, setGroupMediaFile] = useState<File | null>(null);
    const [groupEventId, setGroupEventId] = useState("");
    const [sendingGroupsMsg, setSendingGroupsMsg] = useState(false);
    const [eventsOptions, setEventsOptions] = useState<{ id: string; title?: string; startTime?: any; location?: string }[]>([]);
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
        const tabParam = searchParams.get("tab");
        const normalized = validTabs.includes((tabParam || "") as (typeof validTabs)[number]) ? (tabParam as (typeof validTabs)[number]) : null;
        if (!normalized) return;
        if ((normalized === "whatsapp" || normalized === "instagram" || normalized === "metricool") && !isAdmin) {
            handleTabChange("defaultTasks");
            return;
        }
        if (normalized !== activeTab) {
            setActiveTab(normalized);
        }
    }, [searchParams, activeTab, isAdmin]);

    const handleTabChange = (tab: (typeof validTabs)[number]) => {
        if ((tab === "whatsapp" || tab === "metricool" || tab === "instagram") && !isAdmin) {
            setMessage({ text: "גישה ללשונית זו מותרת רק לאדמין", type: "error" });
            return;
        }
        setActiveTab(tab);
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        params.set("tab", tab);
        if (tab !== "documents") {
            params.delete("docId");
        }
        const query = params.toString();
        router.replace(query ? `/settings?${query}` : "/settings", { scroll: false });
    };

    const documentIdFromQuery = searchParams.get("docId") || undefined;

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
        if (!db || !user || !isAdmin) {
            setLoadingWhatsapp(false);
            return;
        }

        const ref = doc(db, "integrations", "whatsapp");
        Promise.all([
            getDoc(ref),
            getDocs(query(collection(db, "integrations", "whatsapp", "imagine_me_style_insights"), orderBy("createdAt", "desc"), limit(50)))
        ])
            .then(([snap, insightsSnap]) => {
                if (snap.exists()) {
                    const data = snap.data() as any;
                    setWhatsappConfig({
                        idInstance: data.idInstance || "",
                        apiTokenInstance: data.apiTokenInstance || "",
                        senderPhone: data.senderPhone || "",
                        baseUrl: data.baseUrl || "",
                        imagineMeStyleLearningEnabled: data.imagineMeStyleLearning?.enabled !== false,
                    });
                    setWaRules({
                        notifyOnMention: !!data.rules?.notifyOnMention,
                        notifyOnVolunteerDone: !!data.rules?.notifyOnVolunteerDone,
                    });
                }
                setImagineMeStyleInsights(insightsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
            })
            .catch((err) => {
                console.error("Failed loading WhatsApp config", err);
                setMessage({ text: "שגיאה בטעינת הגדרות וואטסאפ", type: "error" });
            })
            .finally(() => setLoadingWhatsapp(false));
    }, [db, user, isAdmin]);

    useEffect(() => {
        if (!db || !user || !isAdmin) {
            setLoadingMetricool(false);
            return;
        }

        const ref = doc(db, "integrations", "metricool");
        getDoc(ref)
            .then((snap) => {
                if (snap.exists()) {
                    const data = snap.data() as any;
                    setMetricoolConfig({
                        userToken: data.userToken || "",
                        userId: data.userId || ""
                    });
                }
            })
            .catch((err) => {
                console.error("Failed loading Metricool config", err);
                setMessage({ text: "שגיאה בטעינת הגדרות Metricool", type: "error" });
            })
            .finally(() => setLoadingMetricool(false));
    }, [db, user, isAdmin]);

    useEffect(() => {
        if (!db || !user || !isAdmin) {
            setLoadingInstagram(false);
            return;
        }

        const ref = doc(db, "integrations", "instagram");
        getDoc(ref)
            .then((snap) => {
                if (snap.exists()) {
                    const data = snap.data() as any;
                    let accounts: InstagramAccount[] = data.accounts || [];

                    // Fallback for legacy single account
                    if (accounts.length === 0 && data.accessToken && data.accountId) {
                        accounts = [{
                            id: "legacy-default",
                            name: "חשבון פטיפון",
                            accessToken: data.accessToken,
                            accountId: data.accountId
                        }];
                    }
                    setInstagramAccounts(accounts);
                    if (accounts.length > 0) {
                        setIgSelectedAccountId(accounts[0].id);
                    }
                }
            })
            .catch((err) => {
                console.error("Failed loading Instagram config", err);
                setMessage({ text: "שגיאה בטעינת הגדרות Instagram", type: "error" });
            })
            .finally(() => setLoadingInstagram(false));
    }, [db, user, isAdmin]);

    useEffect(() => {
        if (!db || !isAdmin || activeTab !== "whatsapp") {
            setLoadingUsersDirectory(false);
            return;
        }
        setLoadingUsersDirectory(true);
        getDocs(collection(db, "users"))
            .then((snap) => {
                const users = snap.docs.map((d) => {
                    const data = d.data() as any;
                    return {
                        id: d.id,
                        fullName: data.fullName || data.displayName || "",
                        email: data.email || "",
                        phone: data.phone || "",
                    } as UserDirectory;
                });
                setUsersDirectory(users);
            })
            .catch((err) => {
                console.error("Failed loading users directory", err);
                setMessage({ text: "שגיאה בטעינת משתמשים", type: "error" });
            })
            .finally(() => setLoadingUsersDirectory(false));
    }, [db, isAdmin, activeTab]);

    useEffect(() => {
        if (!db || !isAdmin || activeTab !== "whatsapp") {
            setLoadingVolunteersDirectory(false);
            return;
        }
        const normalizePhoneLocal = (value: string) => {
            const digits = (value || "").replace(/\D/g, "");
            if (!digits) return "";
            if (digits.startsWith("972")) return digits;
            if (digits.startsWith("0")) return `972${digits.slice(1)}`;
            return digits;
        };
        const normalizeLowerLocal = (val?: string) => (val || "").toString().trim().toLowerCase();
        const mergeVolunteer = (arr: VolunteerDirectory[], idxMap: Map<string, number>, id: string, data: any, source: string) => {
            const name = (data.name || data.fullName || `${data.firstName || ""} ${data.lastName || ""}` || "").trim() || (data.email ? data.email.split("@")[0] : "מתנדב");
            const email = (data.email || "").trim();
            const phone = (data.phone || "").trim();
            const phoneNorm = normalizePhoneLocal(phone);
            const key = phoneNorm || normalizeLowerLocal(email) || `${source}-${id}`;
            if (idxMap.has(key)) {
                const idx = idxMap.get(key)!;
                arr[idx] = {
                    ...arr[idx],
                    name: arr[idx].name || name,
                    email: arr[idx].email || email,
                    phone: arr[idx].phone || phone,
                    source: arr[idx].source || source,
                };
                return;
            }
            idxMap.set(key, arr.length);
            arr.push({ id, name, email, phone, source });
        };

        const loadVolunteers = async () => {
            if (!db) return;
            setLoadingVolunteersDirectory(true);
            const merged: VolunteerDirectory[] = [];
            const idxMap = new Map<string, number>();
            try {
                const cg = await getDocs(collectionGroup(db, "volunteers"));
                cg.forEach((docSnap) => {
                    mergeVolunteer(merged, idxMap, docSnap.id, docSnap.data(), "volunteer");
                });
            } catch (err) {
                console.warn("Failed loading volunteers collectionGroup", err);
            }
            try {
                const general = await getDocs(collection(db, "general_volunteers"));
                general.forEach((docSnap) => mergeVolunteer(merged, idxMap, docSnap.id, docSnap.data(), "general"));
            } catch (err) {
                console.warn("Failed loading general volunteers", err);
            }
            setVolunteersDirectory(merged);
            setLoadingVolunteersDirectory(false);
        };
        loadVolunteers();
    }, [db, isAdmin, activeTab]);

    useEffect(() => {
        if (!db || !isAdmin || activeTab !== "whatsapp") {
            setLoadingGroups(false);
            return;
        }
        setLoadingGroups(true);
        const ref = collection(db, "whatsapp_groups");
        const unsub = onSnapshot(ref, (snap) => {
            const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as { id: string; name: string; chatId: string }[];
            setGroups(arr);
            setLoadingGroups(false);
        }, (err) => {
            console.error("Failed loading groups", err);
            setLoadingGroups(false);
        });
        return () => unsub();
    }, [db, isAdmin, activeTab]);

    useEffect(() => {
        if (!db || !isAdmin || activeTab !== "whatsapp") return;
        const loadEvents = async () => {
            try {
                const snap = await getDocs(collection(db!, "events"));
                const arr = snap.docs.map(d => {
                    const data = d.data() as any;
                    return {
                        id: d.id,
                        title: data.title || "אירוע",
                        startTime: data.startTime,
                        location: data.location || "",
                    };
                });
                arr.sort((a, b) => {
                    const ta = a.startTime?.toDate ? a.startTime.toDate().getTime() : new Date(a.startTime || 0).getTime();
                    const tb = b.startTime?.toDate ? b.startTime.toDate().getTime() : new Date(b.startTime || 0).getTime();
                    return (ta || 0) - (tb || 0);
                });
                setEventsOptions(arr);
            } catch (err) {
                console.error("Failed loading events list", err);
            }
        };
        loadEvents();
    }, [db, isAdmin, activeTab]);

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

    // Load events for export
    useEffect(() => {
        if (!db || !isAdmin || activeTab !== "exportDocs") return;

        const eventsRef = collection(db, "events");
        const q = query(eventsRef, orderBy("startTime", "desc"), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const eventsData = snapshot.docs.map(doc => ({
                id: doc.id,
                title: doc.data().title || "ללא שם",
                startTime: doc.data().startTime
            }));
            setExportEvents(eventsData);
        });

        return () => unsubscribe();
    }, [db, isAdmin, activeTab]);


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

    const saveRulesOnly = async (nextRules: { notifyOnMention: boolean; notifyOnVolunteerDone: boolean }) => {
        if (!db || !user) return;
        setSavingWaRules(true);
        try {
            await setDoc(
                doc(db, "integrations", "whatsapp"),
                {
                    rules: nextRules,
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid,
                    updatedByEmail: user.email || ""
                },
                { merge: true }
            );
            setMessage({ text: "ההגדרות נשמרו", type: "success" });
        } catch (err) {
            console.error("Failed saving WhatsApp rules", err);
            setMessage({ text: "שגיאה בשמירת חוקי ההתראות", type: "error" });
        } finally {
            setSavingWaRules(false);
        }
    };

    const handleCheckConnection = async () => {
        if (!whatsappConfig.idInstance || !whatsappConfig.apiTokenInstance) {
            setMessage({ text: "חסר ID/Token", type: "error" });
            return;
        }
        setCheckingConnection(true);
        try {
            const baseApi = "https://api.green-api.com";
            const endpoint = `${baseApi}/waInstance${whatsappConfig.idInstance}/getStateInstance/${whatsappConfig.apiTokenInstance}`;
            const res = await fetch(endpoint);
            const data = await res.json();
            if (data.stateInstance === "authorized") {
                setMessage({ text: "מחובר ותקין (authorized)", type: "success" });
            } else {
                setMessage({ text: `לא מחובר: ${data.stateInstance}`, type: "error" });
            }
        } catch (err) {
            console.error("Connection check failed", err);
            setMessage({ text: "שגיאה בבדיקת חיבור", type: "error" });
        } finally {
            setCheckingConnection(false);
        }
    };

    const handleSaveWhatsapp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;
        setSavingWhatsapp(true);
        try {
            await setDoc(
                doc(db, "integrations", "whatsapp"),
                {
                    idInstance: whatsappConfig.idInstance.trim(),
                    apiTokenInstance: whatsappConfig.apiTokenInstance.trim(),
                    senderPhone: (whatsappConfig.senderPhone || "").trim(),
                    baseUrl: (whatsappConfig.baseUrl || "").trim(),
                    rules: {
                        notifyOnMention: waRules.notifyOnMention,
                        notifyOnVolunteerDone: waRules.notifyOnVolunteerDone,
                    },
                    imagineMeStyleLearning: {
                        enabled: whatsappConfig.imagineMeStyleLearningEnabled !== false,
                        updatedAt: serverTimestamp(),
                    },
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid,
                    updatedByEmail: user.email || ""
                },
                { merge: true }
            );
            setMessage({ text: "ההגדרות נשמרו בהצלחה", type: "success" });
        } catch (err) {
            console.error("Failed saving WhatsApp config", err);
            setMessage({ text: "שגיאה בשמירת הגדרות וואטסאפ", type: "error" });
        } finally {
            setSavingWhatsapp(false);
        }
    };

    const handleSaveMetricool = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;
        setSavingMetricool(true);
        try {
            await setDoc(
                doc(db, "integrations", "metricool"),
                {
                    userToken: metricoolConfig.userToken.trim(),
                    userId: metricoolConfig.userId.trim(),
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid,
                    updatedByEmail: user.email || ""
                },
                { merge: true }
            );
            setMessage({ text: "הגדרות Metricool נשמרו בהצלחה", type: "success" });
        } catch (err) {
            console.error("Failed saving Metricool config", err);
            setMessage({ text: "שגיאה בשמירת הגדרות Metricool", type: "error" });
        } finally {
            setSavingMetricool(false);
        }
    };

    const handleAddInstagramAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;
        if (!newIgAccountName || !newIgAccessToken || !newIgAccountId) {
            setMessage({ text: "יש למלא את כל השדות להוספת חשבון", type: "error" });
            return;
        }
        setSavingInstagram(true);
        try {
            const newAccount: InstagramAccount = {
                id: Date.now().toString(),
                name: newIgAccountName.trim(),
                accessToken: newIgAccessToken.trim(),
                accountId: newIgAccountId.trim()
            };
            const updatedAccounts = [...instagramAccounts, newAccount];
            await setDoc(
                doc(db, "integrations", "instagram"),
                {
                    accounts: updatedAccounts,
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid,
                    updatedByEmail: user.email || ""
                },
                { merge: true }
            );
            setInstagramAccounts(updatedAccounts);
            if (!igSelectedAccountId) setIgSelectedAccountId(newAccount.id);
            setNewIgAccountName("");
            setNewIgAccessToken("");
            setNewIgAccountId("");
            setMessage({ text: "החשבון נוסף בהצלחה!", type: "success" });
        } catch (err) {
            console.error("Failed adding Instagram account", err);
            setMessage({ text: "שגיאה בהוספת החשבון", type: "error" });
        } finally {
            setSavingInstagram(false);
        }
    };

    const handleDeleteInstagramAccount = async (accountIdToRemove: string) => {
        if (!db || !user) return;
        if (!confirm("האם אתה בטוח שברצונך למחוק חשבון זה?")) return;
        setSavingInstagram(true);
        try {
            const updatedAccounts = instagramAccounts.filter(a => a.id !== accountIdToRemove);
            await setDoc(
                doc(db, "integrations", "instagram"),
                {
                    accounts: updatedAccounts,
                    updatedAt: serverTimestamp(),
                    updatedBy: user.uid,
                    updatedByEmail: user.email || ""
                },
                { merge: true }
            );
            setInstagramAccounts(updatedAccounts);
            if (igSelectedAccountId === accountIdToRemove) {
                setIgSelectedAccountId(updatedAccounts.length > 0 ? updatedAccounts[0].id : "");
            }
            setMessage({ text: "החשבון הוסר בהצלחה!", type: "success" });
        } catch (err) {
            console.error("Failed removing Instagram account", err);
            setMessage({ text: "שגיאה בהסרת החשבון", type: "error" });
        } finally {
            setSavingInstagram(false);
        }
    };

    const handleInstagramPublish = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!igFile) {
            alert("יש לבחור קובץ (תמונה או וידאו)");
            return;
        }

        const selectedAccount = instagramAccounts.find(a => a.id === igSelectedAccountId);
        if (!selectedAccount) {
            alert("יש לבחור חשבון מתוך הרשימה באפשרויות על מנת לפרסם פוסט");
            return;
        }

        setIgPublishing(true);
        try {
            if (!storage || !db) throw new Error("Firebase not initialized");
            // 1. Upload file to Firebase Storage
            const storageRef = ref(storage, `instagram_uploads/${Date.now()}_${igFile.name}`);
            const uploadRes = await uploadBytes(storageRef, igFile);
            const downloadUrl = await getDownloadURL(uploadRes.ref);

            // 2. Call API Route or Schedule Internally
            let scheduleTimestamp: number | null = null;
            if (igScheduleTime) {
                scheduleTimestamp = Math.floor(new Date(igScheduleTime).getTime() / 1000);
            }

            if (scheduleTimestamp) {
                // Internal Scheduling: Save to Firestore
                await addDoc(collection(db, "scheduled_posts"), {
                    accessToken: selectedAccount.accessToken,
                    accountId: selectedAccount.accountId,
                    imageUrl: igPostType !== "VIDEO" ? downloadUrl : null,
                    videoUrl: igPostType === "VIDEO" ? downloadUrl : null,
                    caption: igCaption,
                    type: igPostType,
                    scheduleTime: scheduleTimestamp,
                    taggedUsers: igTags.split(",").map(t => t.trim().replace("@", "")).filter(Boolean),
                    status: "pending",
                    createdAt: serverTimestamp()
                });
                setMessage({ text: "הפוסט תוזמן בהצלחה (ישמר במערכת ויפורסם בזמן)!", type: "success" });
            } else {
                // Immediate Publish via API
                const res = await fetch("/api/instagram/publish", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        accessToken: selectedAccount.accessToken,
                        accountId: selectedAccount.accountId,
                        imageUrl: igPostType !== "VIDEO" ? downloadUrl : undefined,
                        videoUrl: igPostType === "VIDEO" ? downloadUrl : undefined,
                        caption: igCaption,
                        type: igPostType,
                        scheduleTime: null, // Always null for immediate
                        taggedUsers: igTags.split(",").map(t => t.trim().replace("@", "")).filter(Boolean)
                    })
                });

                const data = await res.json();
                if (!res.ok || data.error) {
                    throw new Error(data.error || "Failed to publish");
                }
                setMessage({ text: "הפוסט פורסם בהצלחה!", type: "success" });
            }

            setIgCaption("");
            setIgFile(null);
            setIgScheduleTime("");

        } catch (err: any) {
            console.error("Instagram publish error", err);
            setMessage({ text: `שגיאה בפרסום: ${err.message}`, type: "error" });
        } finally {
            setIgPublishing(false);
        }
    };

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

    const normalizeLower = (val?: string | null) => (val || "").toString().trim().toLowerCase();

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

    const isProjectTaskRef = (ref?: any) => {
        if (!ref?.path) return false;
        const path = ref.path.toString();
        const marker = "/documents/";
        const idx = path.indexOf(marker);
        if (idx !== -1) {
            const sub = path.slice(idx + marker.length);
            if (sub.startsWith("projects/")) return true;
        }
        return path.startsWith("projects/") || path.includes("/projects/");
    };

    const isEventDeletedFlag = (eventObj: any) => {
        const statusLower = (eventObj?.status || "").toString().toLowerCase();
        return eventObj?.deleted === true || ["deleted", "cancelled", "canceled", "archive", "archived"].includes(statusLower);
    };

    const isProjectActive = (project: any) => {
        const statusLower = (project?.status || "").toString().toLowerCase();
        return !["הושלם", "done", "completed", "סגור", "cancelled", "canceled"].includes(statusLower);
    };

    const handleSelectWaUser = (uid: string) => {
        setWaSelectedUserId(uid);
        const match = usersDirectory.find((u) => u.id === uid);
        if (match?.phone) {
            setWaPhoneInput(match.phone);
        }
        if (match?.fullName && (!waMessageText || waMessageText.trim() === "היי, רצינו לעדכן אותך :)")) {
            setWaMessageText(`היי ${match.fullName}, רצינו לעדכן אותך : )`);
        }
    };

    const handleSendWhatsapp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user || !isAdmin) return;

        if (!whatsappConfig.idInstance.trim() || !whatsappConfig.apiTokenInstance.trim()) {
            setMessage({ text: "חסר מזהה אינסטנס או טוקן. שמור הגדרות קודם.", type: "error" });
            return;
        }
        const phoneNormalized = normalizePhone(waPhoneInput);
        if (!phoneNormalized || phoneNormalized.length < 9) {
            setMessage({ text: "מספר וואטסאפ לא תקין", type: "error" });
            return;
        }
        if (!waMessageText.trim()) {
            setMessage({ text: "הודעה ריקה לא נשלחת", type: "error" });
            return;
        }

        const chatId = `${phoneNormalized}@c.us`;
        setWaSending(true);
        try {
            const endpoint = `https://api.green-api.com/waInstance${whatsappConfig.idInstance.trim()}/SendMessage/${whatsappConfig.apiTokenInstance.trim()}`;
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId, message: waMessageText.trim() }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `Status ${res.status}`);
            }
            setMessage({ text: "ההודעה נשלחה לוואטסאפ", type: "success" });
        } catch (err) {
            console.error("Failed sending WhatsApp", err);
            setMessage({ text: "שגיאה בשליחת ההודעה. בדוק את הפרטים ונסה שוב.", type: "error" });
        } finally {
            setWaSending(false);
        }
    };

    const handleSearchGroups = async () => {
        if (!whatsappConfig.idInstance.trim() || !whatsappConfig.apiTokenInstance.trim()) {
            setMessage({ text: "חסר ID/Token כדי לחפש קבוצות", type: "error" });
            return;
        }
        const term = groupSearch.trim().toLowerCase();
        if (!term) {
            setMessage({ text: "הקלד שם קבוצה לחיפוש", type: "error" });
            return;
        }
        setSearchingGroups(true);
        try {
            const endpoint = `https://api.green-api.com/waInstance${whatsappConfig.idInstance.trim()}/GetChats/${whatsappConfig.apiTokenInstance.trim()}`;
            const res = await fetch(endpoint);
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || `Status ${res.status}`);
            }
            const data = await res.json();
            const matches = (Array.isArray(data) ? data : []).filter((c: any) =>
                (c?.id || "").toLowerCase().endsWith("@g.us") &&
                ((c.name || c.chatName || "").toLowerCase().includes(term))
            ).map((c: any) => ({
                name: c.name || c.chatName || c.id,
                chatId: c.id,
            }));
            setGroupSearchResults(matches);
            if (!matches.length) {
                setMessage({ text: "לא נמצאו קבוצות תואמות", type: "error" });
            }
        } catch (err) {
            console.error("Failed searching groups", err);
            setMessage({ text: "שגיאה בחיפוש קבוצות", type: "error" });
        } finally {
            setSearchingGroups(false);
        }
    };

    const handleAddGroup = async (group: { name: string; chatId: string }) => {
        if (!db || !user) return;
        if (!group.name || !group.chatId) {
            setMessage({ text: "חסר שם/קוד קבוצה", type: "error" });
            return;
        }
        setSavingGroup(true);
        try {
            await addDoc(collection(db, "whatsapp_groups"), {
                name: group.name,
                chatId: group.chatId,
                createdAt: serverTimestamp(),
                createdBy: user.uid,
                createdByEmail: user.email || "",
            });
            setMessage({ text: "הקבוצה נוספה למאגר", type: "success" });
        } catch (err) {
            console.error("Failed adding group", err);
            setMessage({ text: "שגיאה בהוספת קבוצה", type: "error" });
        } finally {
            setSavingGroup(false);
        }
    };

    const handleDeleteGroup = async (id: string) => {
        if (!db) return;
        try {
            await deleteDoc(doc(db, "whatsapp_groups", id));
        } catch (err) {
            console.error("Failed deleting group", err);
            setMessage({ text: "שגיאה במחיקת קבוצה", type: "error" });
        }
    };

    const fileNameFromUrl = (url: string) => {
        try {
            const clean = url.split("?")[0];
            const last = clean.split("/").pop() || "media.jpg";
            return last || "media.jpg";
        } catch {
            return "media.jpg";
        }
    };

    const fileToBase64 = (file: File) => {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const res = reader.result as string;
                const base64 = res.includes(",") ? res.split(",")[1] : res;
                resolve(base64 || "");
            };
            reader.onerror = () => reject(reader.error || new Error("file read error"));
            reader.readAsDataURL(file);
        });
    };

    const handleSendGroupsMessage = async () => {
        const isLikelyUrl = (value: string) => /^(https?:\/\/|www\.|wa\.me\/)/i.test(value.trim());
        const normalizeLink = (value: string) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);
        const trimLink = (value: string) => value.replace(/[),.!?]+$/g, "");
        const replaceOrigin = (text: string, publicBase?: string) => {
            const target = getPublicBaseUrl(publicBase);
            if (!target) return text;
            const local = typeof window !== "undefined" ? window.location.origin : "";
            let out = text;
            if (local && local !== target) {
                out = out.split(local).join(target);
            }
            out = out.replace(/https?:\/\/localhost:\d+/g, target);
            out = out.replace(/https?:\/\/127\.0\.0\.1:\d+/g, target);
            return out;
        };

        if (!db || !user || !isAdmin) return;
        if (!whatsappConfig.idInstance.trim() || !whatsappConfig.apiTokenInstance.trim()) {
            setMessage({ text: "חסר ID/Token כדי לשלוח לקבוצות", type: "error" });
            return;
        }
        const selected = groups.filter((g) => selectedGroups.has(g.id));
        if (!selected.length) {
            setMessage({ text: "בחר קבוצות לשליחה", type: "error" });
            return;
        }
        let textToSend = groupMessage.trim();
        let mediaUrl = "";
        let mediaFile: File | null = null;

        if (groupSendMode === "event") {
            if (!groupEventId) {
                setMessage({ text: "בחר אירוע להזמנה", type: "error" });
                return;
            }
            const eventSnap = await getDoc(doc(db, "events", groupEventId));
            if (!eventSnap.exists()) {
                setMessage({ text: "האירוע לא נמצא", type: "error" });
                return;
            }
            const eventData = eventSnap.data() as any;
            const publicBase = getPublicBaseUrl(whatsappConfig.baseUrl || eventData?.baseUrl);
            textToSend = replaceOrigin((eventData.officialPostText || "").trim(), publicBase);
            mediaUrl = (eventData.officialFlyerUrl || "").trim();
            if (!textToSend) {
                setMessage({ text: "אין מלל רשמי לאירוע. עדכן בתוכן ומדיה.", type: "error" });
                return;
            }
            if (!mediaUrl) {
                setMessage({ text: "אין תמונה רשמית לאירוע. עדכן בתוכן ומדיה.", type: "error" });
                return;
            }
        } else {
            if (groupMediaFile) {
                mediaFile = groupMediaFile;
            }
        }

        if (!textToSend && !mediaUrl && !mediaFile) {
            setMessage({ text: "אין תוכן לשלוח", type: "error" });
            return;
        }



        const extractLinks = (text: string) => {
            const links: string[] = [];
            let working = text || "";
            const collect = (regex: RegExp) => {
                working = working.replace(regex, (m) => {
                    const cleaned = trimLink(m);
                    if (cleaned) links.push(cleaned);
                    const suffix = m.slice(cleaned.length);
                    return suffix;
                });
            };
            collect(/(?:https?:\/\/|www\.|wa\.me\/)\S+/gi);
            collect(/\b(?!\S+@\S+)([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/\S*)?/gi);
            const cleaned = working.replace(/\n{2,}/g, "\n").trim();
            return { cleaned, links };
        };

        const formatWhatsappText = (raw: string) => {
            const trimmed = (raw || "").trim();
            if (!trimmed) return "";

            // Expanded emoji lists for variety
            const emojiMap: Record<string, string[]> = {
                important: ["❗", "⚠️", "🔴", "📢", "🔥"],
                reminder: ["⏰", "⏳", "📅", "🔔", "⌚"],
                event: ["🎉", "🥳", "🎊", "🎈", "✨"],
                task: ["📝", "✅", "📋", "📌", "🔨"],
                link: ["🔗", "🌐", "💻", "📲", "👉"],
                thanks: ["🙏", "❤️", "💐", "🙌", "😊"],
                general: ["✨", "💫", "🌟", "💡", "📍"]
            };

            const getRandomEmoji = (category: string) => {
                const list = emojiMap[category] || emojiMap.general;
                return list[Math.floor(Math.random() * list.length)];
            };

            const emojiRules = [
                { rx: /חשוב|דחוף|שימו לב/i, category: "important" },
                { rx: /תזכורת|מתי|שעה|תאריך/i, category: "reminder" },
                { rx: /אירוע|מסיבה|חגיגה/i, category: "event" },
                { rx: /משימה|מטלה|לביצוע/i, category: "task" },
                { rx: /קישור|לינק|להרשמה|כנסו/i, category: "link" },
                { rx: /תודה|בהצלחה|מזל טוב/i, category: "thanks" },
            ];

            const boldify = (line: string) => {
                const rawLine = line.trim();
                if (!rawLine) return rawLine;
                if (isLikelyUrl(rawLine)) return rawLine;

                // Bold bullet points
                const bulletMatch = rawLine.match(/^\s*[-•]\s+(.*)$/);
                if (bulletMatch) {
                    const content = bulletMatch[1].trim();
                    if (!content) return "•";
                    if (isLikelyUrl(content)) return `• ${content}`;

                    // Bold text before colon
                    const colonIdx = content.indexOf(":");
                    if (colonIdx > 0 && content.slice(colonIdx, colonIdx + 3) !== "://") {
                        const title = content.slice(0, colonIdx).trim();
                        const rest = content.slice(colonIdx + 1).trim();
                        return `• *${title}*: ${rest}`;
                    }

                    // Bold first few words if no colon
                    const words = content.split(/\s+/);
                    const headCount = Math.min(words.length, 3);
                    const head = words.slice(0, headCount).join(" ");
                    const tail = words.slice(headCount).join(" ");
                    return `• *${head}*${tail ? ` ${tail}` : ""}`;
                }

                // Bold text before colon in regular lines
                const idx = rawLine.indexOf(":");
                if (idx > 0 && rawLine.slice(idx, idx + 3) !== "://") {
                    const title = rawLine.slice(0, idx).trim();
                    const rest = rawLine.slice(idx + 1).trim();
                    return `*${title}*: ${rest}`;
                }
                return rawLine;
            };

            const addEmoji = (line: string) => {
                let out = line;
                // Only add emoji if line doesn't start with one
                if (/^[\u{1F300}-\u{1F9FF}]/u.test(out)) return out;

                for (const rule of emojiRules) {
                    if (rule.rx.test(out)) {
                        return `${getRandomEmoji(rule.category)} ${out}`;
                    }
                }

                // Randomly add general emoji removed to reduce clutter
                // if (Math.random() < 0.2 && out.length > 10) {
                //     return `${getRandomEmoji("general")} ${out}`;
                // }

                return out;
            };

            let formatted = trimmed
                .split("\n")
                .map((line) => addEmoji(boldify(line.trim())))
                .join("\n");

            // Ensure at least one bold element exists
            if (!formatted.includes("*")) {
                const lines = formatted.split("\n");
                if (lines.length > 0) {
                    // Bold the first line or part of it
                    const firstLine = lines[0];
                    // If it's a short title line, bold the whole thing
                    if (firstLine.length < 50 && !isLikelyUrl(firstLine)) {
                        const emojiMatch = firstLine.match(/^(\s*[\u{1F300}-\u{1F9FF}]+\s*)/u);
                        const cleanLine = firstLine.replace(/^\s*[\u{1F300}-\u{1F9FF}]+\s*/u, "");
                        lines[0] = (emojiMatch ? emojiMatch[1] : "") + `*${cleanLine}*`;
                    } else {
                        // Bold first 3 words
                        const words = firstLine.split(/\s+/);
                        if (words.length > 1) {
                            // Handle emoji at start
                            let startIndex = 0;
                            if (/^[\u{1F300}-\u{1F9FF}]/u.test(words[0])) {
                                startIndex = 1;
                            }

                            const headCount = Math.min(words.length - startIndex, 3);
                            if (headCount > 0) {
                                const head = words.slice(startIndex, startIndex + headCount).join(" ");
                                const tail = words.slice(startIndex + headCount).join(" ");
                                const prefix = startIndex > 0 ? words[0] + " " : "";

                                lines[0] = `${prefix}*${head}* ${tail}`;
                            }
                        }
                    }
                    formatted = lines.join("\n");
                }
            }

            return formatted;
        };

        const formatWithAi = async (raw: string) => {
            const clean = (raw || "").trim();
            if (!clean) return "";
            try {
                const res = await fetch("/api/ai/format-whatsapp", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: clean }),
                });
                if (!res.ok) {
                    console.error("AI format failed:", res.status, await res.text());
                    return "";
                }
                const data = await res.json();
                const formatted = typeof data?.formatted === "string" ? data.formatted.trim() : "";
                return formatted.replace(/^```[\s\S]*?```$/g, "").trim();
            } catch (err) {
                console.error("AI format exception:", err);
                return "";
            }
        };

        const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

        setSendingGroupsMsg(true);
        try {
            // Text messages still use direct API call (no CORS issue for simple POST)

            const errors: string[] = [];
            const mediaFileName = mediaFile?.name || "media";
            // No need for base64 conversion - we upload to storage now

            // Upload file once if needed
            let uploadedUrl = "";
            let storageRefToDelete: any = null;

            if (mediaFile) {
                try {
                    if (!storage) throw new Error("Storage not initialized");
                    const storageRef = ref(storage, `whatsapp_uploads/${Date.now()}_${mediaFile.name}`);
                    const uploadRes = await uploadBytes(storageRef, mediaFile);
                    uploadedUrl = await getDownloadURL(uploadRes.ref);
                    storageRefToDelete = storageRef;
                } catch (uploadErr) {
                    console.error("Failed to upload file for WhatsApp", uploadErr);
                    setMessage({ text: "שגיאה בהעלאת הקובץ לשרת", type: "error" });
                    setSendingGroupsMsg(false);
                    return;
                }
            }

            const { cleaned: rawWithoutLinks, links } = extractLinks(textToSend);

            let captionToUse = rawWithoutLinks;
            if (useAiFormatting) {
                const aiFormatted = await formatWithAi(rawWithoutLinks);
                const formattedBase = aiFormatted || formatWhatsappText(rawWithoutLinks);
                captionToUse = formattedBase || (links.length ? "🔗 קישור מצורף" : textToSend);
            } else {
                captionToUse = rawWithoutLinks || (links.length ? "🔗 קישור מצורף" : textToSend);
            }
            let linkMessage = links.length ? links.map((l) => `🔗 ${normalizeLink(l)}`).join("\n") : "";

            if (groupSendMode === "event") {
                linkMessage = "https://patifon-events-management.vercel.app/events/register";
            }

            for (const g of selected) {
                await ensureGlobalRateLimit();
                // Case 1: Event mode with existing URL
                if (groupSendMode === "event" && mediaUrl) {
                    const res = await fetch("/api/whatsapp/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            method: "url",
                            chatId: g.chatId,
                            urlFile: mediaUrl,
                            fileName: fileNameFromUrl(mediaUrl),
                            caption: captionToUse,
                            idInstance: whatsappConfig.idInstance.trim(),
                            apiTokenInstance: whatsappConfig.apiTokenInstance.trim(),
                        }),
                    });
                    const body = await res.text();
                    if (!res.ok) {
                        errors.push(`${g.name || g.chatId}: ${body || "שליחה נכשלה"}`);
                    } else if (linkMessage) {
                        await sleep(2000);
                        await ensureGlobalRateLimit();
                        const resLink = await fetch("/api/whatsapp/send", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ chatId: g.chatId, message: linkMessage }),
                        });
                        if (!resLink.ok) {
                            const text = await resLink.text();
                            errors.push(`${g.name || g.chatId}: ${text || "שליחת קישור נכשלה"}`);
                        }
                    }
                    continue;
                }

                // Case 2: Custom file upload (using the single uploaded URL)
                if (uploadedUrl) {
                    const res = await fetch("/api/whatsapp/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            method: "url",
                            chatId: g.chatId,
                            urlFile: uploadedUrl,
                            fileName: mediaFileName,
                            caption: captionToUse,
                            idInstance: whatsappConfig.idInstance.trim(),
                            apiTokenInstance: whatsappConfig.apiTokenInstance.trim(),
                        }),
                    });
                    const body = await res.text();
                    if (!res.ok) {
                        errors.push(`${g.name || g.chatId}: ${body || "שליחה נכשלה"}`);
                    } else if (linkMessage) {
                        await sleep(2000);
                        await ensureGlobalRateLimit();
                        const resLink = await fetch("/api/whatsapp/send", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ chatId: g.chatId, message: linkMessage }),
                        });
                        if (!resLink.ok) {
                            const text = await resLink.text();
                            errors.push(`${g.name || g.chatId}: ${text || "שליחת קישור נכשלה"}`);
                        }
                    }
                } else {
                    // Case 3: Text only
                    const res = await fetch("/api/whatsapp/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ chatId: g.chatId, message: captionToUse }),
                    });
                    const body = await res.text();
                    if (!res.ok) {
                        errors.push(`${g.name || g.chatId}: ${body || "שליחה נכשלה"}`);
                    } else if (linkMessage) {
                        await sleep(2000);
                        await ensureGlobalRateLimit();
                        const resLink = await fetch("/api/whatsapp/send", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ chatId: g.chatId, message: linkMessage }),
                        });
                        if (!resLink.ok) {
                            const text = await resLink.text();
                            errors.push(`${g.name || g.chatId}: ${text || "שליחת קישור נכשלה"}`);
                        }
                    }
                }
            }

            // Cleanup uploaded file after a delay to allow Green API to download it
            if (storageRefToDelete) {
                setTimeout(async () => {
                    try {
                        console.log("Deleting temp whatsapp file...");
                        await deleteObject(storageRefToDelete);
                        console.log("Temp file deleted");
                    } catch (delErr) {
                        console.warn("Failed to delete temp whatsapp file", delErr);
                    }
                }, 60000); // Wait 60 seconds
            }

            if (errors.length) {
                setMessage({ text: `חלק מהקבוצות לא קיבלו את ההודעה: ${errors.join(" | ")}`, type: "error" });
            } else {
                setMessage({ text: "ההודעה (כולל המדיה אם צורפה) נשלחה לקבוצות שנבחרו", type: "success" });
            }
        } catch (err) {
            console.error("Failed sending to groups", err);
            setMessage({ text: "שגיאה בשליחת ההודעה לקבוצות", type: "error" });
        } finally {
            setSendingGroupsMsg(false);
            setGroupMediaFile(null);
        }
    };

    const getUserPhone = async (uid: string, email?: string) => {
        if (!db) return "";
        try {
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) {
                const data = snap.data() as any;
                if (data?.phone) return data.phone;
            }
        } catch { /* ignore */ }
        if (email) {
            try {
                const q = query(collection(db, "users"), where("email", "==", email.toLowerCase()));
                const res = await getDocs(q);
                const data = res.docs[0]?.data() as any;
                if (data?.phone) return data.phone;
            } catch { /* ignore */ }
        }
        return "";
    };

    const fetchOpenTasksForUser = async (
        uid: string,
        email: string | undefined,
        fullName: string | undefined,
        phone: string | undefined,
        parents: { events: Map<string, any>; projects: Map<string, any> },
    ) => {
        if (!db) return [];
        const statusesOpen = ["TODO", "IN_PROGRESS", "STUCK", "PENDING_APPROVAL"];
        const tasks: { title: string; dueDate?: any; status?: string; path: string; eventTitle?: string; scope?: "event" | "project" }[] = [];
        const seen = new Set<string>();
        const emailLower = normalizeLower(email);
        const nameLower = normalizeLower(fullName);
        const phoneNorm = normalizePhone(phone || "");
        const emailPrefix = emailLower ? emailLower.split("@")[0] : "";

        const matchesAssignee = (data: any) => {
            const assigneeStr = (data.assignee || "").toLowerCase().trim();
            const assigneeEmail = (data.assigneeEmail || "").toLowerCase().trim();
            const assigneeId = data.assigneeId || "";
            const assigneesArr = Array.isArray(data.assignees) ? data.assignees : [];

            if (assigneeId && uid && assigneeId === uid) return true;
            if (assigneeEmail && emailLower && assigneeEmail === emailLower) return true;
            if (assigneeStr) {
                if (nameLower && assigneeStr === nameLower) return true;
                if (emailPrefix && assigneeStr === emailPrefix) return true;
            }
            return assigneesArr.some((a: any) => {
                const aEmail = (a.email || "").toLowerCase().trim();
                const aName = (a.name || "").toLowerCase().trim();
                const aPhone = normalizePhone(a.phone || "");
                return (a.userId && uid && a.userId === uid) ||
                    (aEmail && emailLower && aEmail === emailLower) ||
                    (aName && nameLower && aName === nameLower) ||
                    (aPhone && phoneNorm && aPhone === phoneNorm);
            });
        };

        const pushTask = (snap: any) => {
            const data = snap.data() as any;
            if (data?.status === "DONE" || !statusesOpen.includes(data?.status || "TODO")) return;
            if (!matchesAssignee(data)) return;
            const key = snap.ref.path;
            if (seen.has(key)) return;
            // Check parent entity validity
            const parent = snap.ref.parent?.parent;
            const parentId = parent?.id || "";
            const isProj = isProjectTaskRef(snap.ref);
            if (isProj) {
                const proj = parents.projects.get(parentId);
                if (!proj || !isProjectActive(proj)) return;
                const projTitle = proj?.title || proj?.name || data.eventTitle || "פרויקט";
                tasks.push({ title: data.title || "משימה", dueDate: data.dueDate, status: data.status, path: key, eventTitle: projTitle, scope: "project" });
                seen.add(key);
                return;
            } else {
                const ev = parents.events.get(parentId);
                if (!ev || isEventDeletedFlag(ev)) return;
                const evTitle = ev?.title || data.eventTitle || "אירוע";
                tasks.push({ title: data.title || "משימה", dueDate: data.dueDate, status: data.status, path: key, eventTitle: evTitle, scope: "event" });
                seen.add(key);
                return;
            }
        };

        // Queries by direct fields
        // By assigneeId
        if (uid) {
            try {
                const q1 = query(collectionGroup(db, "tasks"), where("assigneeId", "==", uid), limit(400));
                (await getDocs(q1)).forEach(pushTask);
            } catch (err) {
                console.warn("Query assigneeId failed", err);
            }
        }

        // By assigneeEmail
        if (emailLower) {
            try {
                const q2 = query(collectionGroup(db, "tasks"), where("assigneeEmail", "==", emailLower), limit(400));
                (await getDocs(q2)).forEach(pushTask);
            } catch (err) {
                console.warn("Query assigneeEmail failed", err);
            }
        }

        // By assignee name
        if (fullName) {
            try {
                const q3 = query(collectionGroup(db, "tasks"), where("assignee", "==", fullName), limit(400));
                (await getDocs(q3)).forEach(pushTask);
            } catch (err) {
                console.warn("Query assignee(name) failed", err);
            }
        }

        // Scan per status to catch matches in assignees array/name/email prefix/phone
        for (const st of statusesOpen) {
            try {
                const qs = query(collectionGroup(db, "tasks"), where("status", "==", st), limit(500));
                (await getDocs(qs)).forEach(pushTask);
            } catch (err) {
                console.warn("Query status scan failed", st, err);
            }
        }

        // Final fallback: broad limited scan
        if (!tasks.length) {
            try {
                const qAny = query(collectionGroup(db, "tasks"), limit(500));
                (await getDocs(qAny)).forEach(pushTask);
            } catch (err) {
                console.warn("Broad scan tasks failed", err);
            }
        }

        return tasks.slice(0, 40).map(t => ({ title: t.title, dueDate: t.dueDate, status: t.status, eventTitle: t.eventTitle, scope: t.scope }));
    };

    const fetchUpcomingEvents = async () => {
        if (!db) return [];
        const now = new Date();
        try {
            const qEvents = query(collection(db, "events"), where("startTime", ">=", now), orderBy("startTime", "asc"), limit(3));
            const snap = await getDocs(qEvents);
            return snap.docs.map((d) => {
                const data = d.data() as any;
                return { title: data.title || "אירוע", startTime: data.startTime, location: data.location || "" };
            });
        } catch {
            return [];
        }
    };

    const loadParentsIndex = async () => {
        const events = new Map<string, any>();
        const projects = new Map<string, any>();
        try {
            const evSnap = await getDocs(collection(db!, "events"));
            evSnap.forEach(d => events.set(d.id, { id: d.id, ...d.data() }));
        } catch (err) {
            console.warn("Failed loading events map", err);
        }
        try {
            const projSnap = await getDocs(collection(db!, "projects"));
            projSnap.forEach(d => projects.set(d.id, { id: d.id, ...d.data() }));
        } catch (err) {
            console.warn("Failed loading projects map", err);
        }
        return { events, projects };
    };

    const fetchUpcomingEventsForUser = async (
        uid: string,
        email: string | undefined,
        fullName: string | undefined,
        phone: string | undefined,
        parents: { events: Map<string, any> },
    ) => {
        const emailLower = normalizeLower(email);
        const nameLower = normalizeLower(fullName);
        const phoneNorm = normalizePhone(phone || "");
        const now = Date.now();
        const matchesUser = (ev: any) => {
            if (!ev) return false;
            const ownerId = ev.ownerId || ev.createdBy || "";
            const ownerEmail = normalizeLower(ev.ownerEmail || ev.createdByEmail);
            if (ownerId && uid && ownerId === uid) return true;
            if (ownerEmail && emailLower && ownerEmail === emailLower) return true;
            const membersArr = Array.isArray(ev.members) ? ev.members : [];
            if (membersArr.includes(uid)) return true;
            const teamArr = Array.isArray(ev.team) ? ev.team : [];
            return teamArr.some((m: any) => {
                const mEmail = normalizeLower(m.email);
                const mName = normalizeLower(m.name);
                const mPhone = normalizePhone(m.phone || "");
                return (m.userId && m.userId === uid) ||
                    (mEmail && emailLower && mEmail === emailLower) ||
                    (mName && nameLower && mName === nameLower) ||
                    (mPhone && phoneNorm && mPhone === phoneNorm);
            });
        };

        const upcoming: { title: string; startTime?: any; location?: string }[] = [];
        parents.events.forEach((ev) => {
            if (!ev || isEventDeletedFlag(ev)) return;
            const start = ev.startTime?.toDate ? ev.startTime.toDate() : ev.startTime instanceof Date ? ev.startTime : null;
            if (!start || start.getTime() < now) return;
            if (!matchesUser(ev)) return;
            upcoming.push({ title: ev.title || "אירוע", startTime: start, location: ev.location || "" });
        });
        upcoming.sort((a, b) => {
            const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
            const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
            return ta - tb;
        });
        return upcoming.slice(0, 3);
    };

    const generateMessageLines = async (rec: any, origin: string, parentsIndex: any) => {
        const displayName = rec.fullName || rec.name || rec.email || "מתנדב/ת";
        if (bulkTemplate === "custom") {
            return [bulkCustomMessage.trim()];
        } else if (bulkTemplate === "openTasks") {
            const tasks = await fetchOpenTasksForUser(rec.id, rec.email, rec.fullName || rec.name, rec.phone, parentsIndex);
            const list = tasks.slice(0, 5).map((t: any) => {
                const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString("he-IL") : "";
                const ev = t.eventTitle ? ` | אירוע: ${t.eventTitle}` : "";
                return `- ${t.title}${ev}${due ? ` (דדליין: ${due})` : ""}`;
            });
            return [
                `היי ${displayName},`,
                "תזכורת למשימות פתוחות שלך:",
                ...(list.length ? list : ["לא נמצאו משימות פתוחות."]),
                origin ? `כניסה למערכת: ${origin}` : "",
            ].filter(Boolean);
        } else {
            const events = await fetchUpcomingEventsForUser(rec.id, rec.email, rec.fullName || rec.name, rec.phone, parentsIndex);
            const list = events.map((ev: any) => {
                const date = ev.startTime ? new Date(ev.startTime).toLocaleDateString("he-IL") : "";
                return `- ${ev.title}${date ? ` (${date})` : ""}${ev.location ? ` @ ${ev.location}` : ""}`;
            });
            return [
                `היי ${displayName},`,
                "הנה 3 האירועים הקרובים:",
                ...(list.length ? list : ["לא נמצאו אירועים קרובים."]),
                origin ? `כניסה למערכת: ${origin}` : "",
            ].filter(Boolean);
        }
    };

    const handleSendBulk = async () => {
        if (!db || !user || !isAdmin) return;
        if (!whatsappConfig.idInstance.trim() || !whatsappConfig.apiTokenInstance.trim()) {
            setMessage({ text: "חסר ID/Token כדי לשלוח הודעות", type: "error" });
            return;
        }
        const selectedUsers = usersDirectory.filter(u => bulkSelected.has(`u:${u.id}`));
        const selectedVolunteers = volunteersDirectory.filter(v => bulkSelected.has(`v:${v.id}`));
        const targets = [
            ...selectedUsers.map((u) => ({ type: "user" as const, record: u })),
            ...selectedVolunteers.map((v) => ({ type: "volunteer" as const, record: v })),
        ];
        if (!targets.length) {
            setMessage({ text: "בחר משתמשים או מתנדבים לשליחה", type: "error" });
            return;
        }
        if (bulkTemplate === "custom" && !bulkCustomMessage.trim()) {
            setMessage({ text: "כתוב הודעה חופשית לפני שליחה", type: "error" });
            return;
        }
        setBulkSending(true);
        try {
            const origin = getPublicBaseUrl(whatsappConfig.baseUrl);
            const parentsIndex = await loadParentsIndex();
            setEventsOptions(Array.from(parentsIndex.events.values()) as any);
            let successCount = 0;
            let failCount = 0;
            setBulkFailures([]);
            const currentFailures: BulkFailure[] = [];

            for (const target of targets) {
                await ensureGlobalRateLimit();
                const rec = target.record as any;
                const displayName = rec.fullName || rec.name || rec.email || "מתנדב/ת";
                let phone = target.type === "user"
                    ? normalizePhone(await getUserPhone(rec.id, rec.email))
                    : normalizePhone(rec.phone || "");
                if (!phone && target.type === "volunteer" && rec.email) {
                    phone = normalizePhone(await getUserPhone(rec.id, rec.email));
                }
                if (!phone) {
                    console.warn("No phone for contact", rec);
                    failCount++;
                    currentFailures.push({
                        id: rec.id,
                        name: displayName,
                        phone: "",
                        reason: "חסר מספר טלפון",
                        type: target.type,
                        record: rec
                    });
                    continue;
                }

                const messageLines = await generateMessageLines(rec, origin, parentsIndex);

                const res = await fetch("/api/whatsapp/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phone, message: messageLines.join("\n") }),
                });
                if (!res.ok) {
                    const errText = await res.text();
                    console.warn("Bulk WhatsApp failed", rec, errText);
                    failCount++;
                    currentFailures.push({
                        id: rec.id,
                        name: displayName,
                        phone: phone,
                        reason: `שגיאת שליחה: ${errText || "לא ידוע"}`,
                        type: target.type,
                        record: rec
                    });
                } else {
                    successCount++;
                }
            }

            setBulkFailures(currentFailures);

            if (failCount > 0) {
                setMessage({
                    text: `נשלח ל-${successCount} נמענים. נכשל עבור ${failCount}. בדוק את דוח התקלות למטה.`,
                    type: "error"
                });
            } else {
                setMessage({ text: `נשלח בהצלחה לכל ${successCount} הנמענים!`, type: "success" });
            }
        } catch (err) {
            console.error("Failed bulk WhatsApp", err);
            setMessage({ text: "שגיאה כללית בשליחת ההודעות", type: "error" });
        } finally {
            setBulkSending(false);
        }
    };

    const handleRetryBulkItem = async (item: BulkFailure) => {
        if (!item.phone) {
            setMessage({ text: "לא ניתן לנסות שוב ללא מספר טלפון", type: "error" });
            return;
        }
        try {
            const origin = getPublicBaseUrl(whatsappConfig.baseUrl);
            const parentsIndex = await loadParentsIndex();
            const messageLines = await generateMessageLines(item.record, origin, parentsIndex);

            const res = await fetch("/api/whatsapp/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: item.phone, message: messageLines.join("\n") }),
            });

            if (!res.ok) {
                const errText = await res.text();
                setMessage({ text: `עדיין נכשל: ${errText}`, type: "error" });
            } else {
                setMessage({ text: "נשלח בהצלחה!", type: "success" });
                setBulkFailures(prev => prev.filter(f => f.id !== item.id));
            }
        } catch (err) {
            console.error("Retry failed", err);
            setMessage({ text: "שגיאה בנסיון חוזר", type: "error" });
        }
    };

    const handleRemoveBulkFailure = (id: string) => {
        setBulkFailures(prev => prev.filter(f => f.id !== id));
    };

    const handleGenerateEventSummary = async () => {
        if (!exportSelectedEventId) {
            setMessage({ text: "בחר אירוע לסיכום", type: "error" });
            return;
        }

        setGeneratingSummary(true);
        setEventSummary("");

        try {
            const response = await fetch("/api/ai/summarize-event", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eventId: exportSelectedEventId }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to generate summary");
            }

            const data = await response.json();
            setEventSummary(data.summary || "");
            setMessage({ text: "הסיכום נוצר בהצלחה!", type: "success" });
        } catch (error: any) {
            console.error("Error generating summary:", error);
            setMessage({ text: `שגיאה ביצירת סיכום: ${error.message}`, type: "error" });
        } finally {
            setGeneratingSummary(false);
        }
    };

    const handleDownloadSummary = () => {
        if (!eventSummary) return;

        const blob = new Blob([eventSummary], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const eventTitle = exportEvents.find(e => e.id === exportSelectedEventId)?.title || "event";
        link.download = `${eventTitle}_summary.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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
                batch.delete(doc(db!, "default_tasks", taskId));
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
                batch.delete(doc(db!, "default_tasks", task.id));
            });
            await batch.commit();
            setSelectedTasks(new Set());
            setMessage({ text: "כל המשימות נמחקו בהצלחה", type: "success" });
        } catch (err) {
            console.error("Error deleting all tasks:", err);
            setMessage({ text: "שגיאה במחיקת כל המשימות", type: "error" });
        }
    };

    const bulkAudienceList = bulkAudience === "users" ? usersDirectory : volunteersDirectory;
    const bulkAudienceLoading = bulkAudience === "users" ? loadingUsersDirectory : loadingVolunteersDirectory;
    const filteredBulkRecipients = (bulkAudienceLoading ? [] : bulkAudienceList)
        .filter((u: any) => {
            const s = waSearch.toLowerCase().trim();
            if (!s) return true;
            return (u.fullName || u.name || "").toLowerCase().includes(s)
                || (u.email || "").toLowerCase().includes(s)
                || (u.phone || "").includes(s);
        })
        .slice(0, 200);
    const bulkKeyPrefix = bulkAudience === "users" ? "u" : "v";
    const bulkAllVisibleSelected = filteredBulkRecipients.length > 0 && filteredBulkRecipients.every((u: any) => bulkSelected.has(`${bulkKeyPrefix}:${u.id}`));
    const bulkVisibleSelectedCount = filteredBulkRecipients.filter((u: any) => bulkSelected.has(`${bulkKeyPrefix}:${u.id}`)).length;
    const toggleSelectAllBulk = () => {
        setBulkSelected((prev) => {
            const next = new Set(prev);
            if (bulkAllVisibleSelected) {
                filteredBulkRecipients.forEach((u: any) => next.delete(`${bulkKeyPrefix}:${u.id}`));
            } else {
                filteredBulkRecipients.forEach((u: any) => next.add(`${bulkKeyPrefix}:${u.id}`));
            }
            return next;
        });
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
                                onClick={() => handleTabChange("defaultTasks")}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "defaultTasks"
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "text-gray-600 hover:bg-gray-50"
                                    }`}
                            >
                                <List size={18} />
                                משימות קבועות
                            </button>
                            <button
                                onClick={() => handleTabChange("documents")}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "documents"
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "text-gray-600 hover:bg-gray-50"
                                    }`}
                            >
                                <FileText size={18} />
                                מסמכים חשובים
                            </button>
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={() => handleTabChange("whatsapp")}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "whatsapp"
                                            ? "bg-indigo-50 text-indigo-700"
                                            : "text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        <MessageCircle size={18} />
                                        וואטסאפ (Green API)
                                    </button>
                                    <button
                                        onClick={() => handleTabChange("metricool")}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "metricool"
                                            ? "bg-indigo-50 text-indigo-700"
                                            : "text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        <Share2 size={18} />
                                        Metricool
                                    </button>
                                    <button
                                        onClick={() => handleTabChange("instagram")}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "instagram"
                                            ? "bg-indigo-50 text-indigo-700"
                                            : "text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        <Instagram size={18} />
                                        אינסטגרם (ישיר)
                                    </button>
                                    <button
                                        onClick={() => handleTabChange("exportDocs")}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "exportDocs"
                                            ? "bg-indigo-50 text-indigo-700"
                                            : "text-gray-600 hover:bg-gray-50"
                                            }`}
                                    >
                                        <FileText size={18} />
                                        מסמכים לייצוא
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => handleTabChange("account")}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "account"
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "text-gray-600 hover:bg-gray-50"
                                    }`}
                            >
                                <ShieldCheck size={18} />
                                חשבון ואבטחה
                            </button>
                            <button
                                onClick={() => handleTabChange("stockTracking")}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === "stockTracking"
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "text-gray-600 hover:bg-gray-50"
                                    }`}
                            >
                                <BarChart3 size={18} />
                                מעקב מניות
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
                            <ImportantDocuments focusDocumentId={documentIdFromQuery} />
                        )}

                        {activeTab === "whatsapp" && isAdmin && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <PlugZap size={20} className="text-indigo-500" />
                                                <h2 className="text-xl font-bold text-gray-900">חיבור וואטסאפ (Green API)</h2>
                                            </div>
                                            <p className="text-gray-500 text-sm mt-1">
                                                הזן את מזהה האינסטנס והאסימון מ-Green API כדי לשלוח הודעות וואטסאפ מהמערכת.
                                            </p>
                                        </div>
                                        <a
                                            href="https://green-api.com/en/docs/"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-sm text-indigo-600 hover:text-indigo-800 underline"
                                        >
                                            מדריך Green API
                                        </a>
                                    </div>

                                    {loadingWhatsapp ? (
                                        <div className="mt-4 text-gray-500 text-sm">טוען הגדרות...</div>
                                    ) : (
                                        <form className="space-y-4 mt-6" onSubmit={handleSaveWhatsapp}>
                                            <div className="grid sm:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-sm text-gray-600">ID אינסטנס</label>
                                                    <input
                                                        type="text"
                                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        value={whatsappConfig.idInstance}
                                                        onChange={(e) => setWhatsappConfig(prev => ({ ...prev, idInstance: e.target.value }))}
                                                        placeholder="לדוגמה: 1100123456"
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm text-gray-600">API Token</label>
                                                    <input
                                                        type="password"
                                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        value={whatsappConfig.apiTokenInstance}
                                                        onChange={(e) => setWhatsappConfig(prev => ({ ...prev, apiTokenInstance: e.target.value }))}
                                                        placeholder="token מ-Green API"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm text-gray-600">מספר שולח (אופציונלי)</label>
                                                <input
                                                    type="text"
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={whatsappConfig.senderPhone || ""}
                                                    onChange={(e) => setWhatsappConfig(prev => ({ ...prev, senderPhone: e.target.value }))}
                                                    placeholder="לדוגמה: 972501234567"
                                                />
                                                <p className="text-xs text-gray-500">שמור כאן את המספר שמחובר לאינסטנס כדי להציגו במסכים אחרים.</p>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm text-gray-600">כתובת בסיס לקישורים (חובה לוואטסאפ)</label>
                                                <input
                                                    type="url"
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={whatsappConfig.baseUrl || ""}
                                                    onChange={(e) => setWhatsappConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                                                    placeholder="https://app.domain.com"
                                                    required
                                                />
                                                <p className="text-xs text-gray-500">הקישורים בהודעות ייבנו מהכתובת הזו (לא localhost).</p>
                                            </div>
                                            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="flex items-center gap-2 text-sm font-bold text-violet-900">
                                                            <Brain size={16} className="text-violet-600" />
                                                            לימוד סגנון Imagine Me
                                                        </div>
                                                        <p className="text-xs text-violet-800 mt-1 leading-5">
                                                            כשהפיצ'ר פעיל, כל שליחה מתוך Imagine Me CRM מנותחת ונשמרות ממנה תובנות כדי לשפר את "הצעת הודעה".
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setWhatsappConfig(prev => ({ ...prev, imagineMeStyleLearningEnabled: !(prev.imagineMeStyleLearningEnabled !== false) }))}
                                                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${whatsappConfig.imagineMeStyleLearningEnabled !== false ? 'bg-violet-600' : 'bg-gray-300'}`}
                                                        aria-pressed={whatsappConfig.imagineMeStyleLearningEnabled !== false}
                                                        title="הפעל/כבה לימוד סגנון"
                                                    >
                                                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${whatsappConfig.imagineMeStyleLearningEnabled !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                                                    </button>
                                                </div>
                                                <div className="text-xs font-medium text-violet-900">
                                                    מצב נוכחי: {whatsappConfig.imagineMeStyleLearningEnabled !== false ? 'פעיל' : 'כבוי'}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="submit"
                                                    disabled={savingWhatsapp}
                                                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-60"
                                                >
                                                    {savingWhatsapp ? "שומר..." : "שמור הגדרות"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleCheckConnection}
                                                    disabled={checkingConnection}
                                                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium disabled:opacity-60"
                                                >
                                                    {checkingConnection ? "בודק..." : "בדוק חיבור"}
                                                </button>
                                                <span className="text-xs text-gray-500">השמירה מתבצעת ב-Firestore ותהיה זמינה לכלי שליחה.</span>
                                            </div>
                                        </form>
                                    )}
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-start justify-between gap-3 mb-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <MessageCircle size={20} className="text-green-600" />
                                                <h3 className="text-lg font-bold text-gray-900">שליחת הודעת וואטסאפ למשתמשים</h3>
                                            </div>
                                            <p className="text-gray-500 text-sm mt-1">
                                                בחר משתמש מהמערכת או הזן מספר באופן ידני ושלח הודעה ישירה דרך Green API.
                                            </p>
                                        </div>
                                    </div>

                                    <form className="space-y-4" onSubmit={handleSendWhatsapp}>
                                        <div className="grid sm:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm text-gray-600">חיפוש משתמש</label>
                                                <input
                                                    type="text"
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={waSearch}
                                                    onChange={(e) => setWaSearch(e.target.value)}
                                                    placeholder="חפש לפי שם, אימייל או טלפון"
                                                />
                                                <div className="relative">
                                                    <select
                                                        value={waSelectedUserId}
                                                        onChange={(e) => handleSelectWaUser(e.target.value)}
                                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                                    >
                                                        <option value="">בחר משתמש</option>
                                                        {(loadingUsersDirectory ? [] : usersDirectory)
                                                            .filter((u) => {
                                                                const search = waSearch.toLowerCase();
                                                                if (!search) return true;
                                                                return (u.fullName || "").toLowerCase().includes(search) ||
                                                                    (u.email || "").toLowerCase().includes(search) ||
                                                                    (u.phone || "").includes(search);
                                                            })
                                                            .slice(0, 30)
                                                            .map((u) => (
                                                                <option key={u.id} value={u.id}>
                                                                    {u.fullName || u.email || "משתמש"} {u.phone ? `(${u.phone})` : ""}
                                                                </option>
                                                            ))}
                                                    </select>
                                                    {loadingUsersDirectory && (
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">טוען משתמשים...</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-gray-600">מספר וואטסאפ</label>
                                                <input
                                                    type="tel"
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={waPhoneInput}
                                                    onChange={(e) => setWaPhoneInput(e.target.value)}
                                                    placeholder="לדוגמה: 05x-xxxxxxx או 9725..."
                                                    required
                                                />
                                                <p className="text-xs text-gray-500">המספר מנורמל אוטומטית לפורמט 972 לפני השליחה.</p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm text-gray-600">תוכן ההודעה</label>
                                            <textarea
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                rows={4}
                                                value={waMessageText}
                                                onChange={(e) => setWaMessageText(e.target.value)}
                                                placeholder="מה תרצה לשלוח?"
                                                required
                                            />
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <button
                                                type="submit"
                                                disabled={waSending}
                                                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium disabled:opacity-60"
                                            >
                                                {waSending ? "שולח..." : "שלח הודעה"}
                                            </button>
                                            <div className="text-xs text-gray-500">
                                                יש לוודא שה-ID וה-Token תקפים ושהמספר מאומת ב-Green API.
                                            </div>
                                        </div>
                                    </form>
                                </div>

                                <ImagineMeStyleInsightsPanel 
                                    insights={imagineMeStyleInsights}
                                    enabled={whatsappConfig.imagineMeStyleLearningEnabled !== false}
                                />

                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-start justify-between gap-3 mb-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <PlugZap size={20} className="text-indigo-500" />
                                                <h3 className="text-lg font-bold text-gray-900">שליחה מרוכזת</h3>
                                            </div>
                                            <p className="text-gray-500 text-sm mt-1">
                                                בחר משתמשים או מתנדבים והודעה מוכנה לשליחה בבת אחת.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 mb-4">
                                        <div className="flex bg-gray-50 border rounded-lg p-1">
                                            <button
                                                type="button"
                                                onClick={() => setBulkAudience("users")}
                                                className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${bulkAudience === "users" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-700 hover:bg-white"}`}
                                            >
                                                משתמשי מערכת
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setBulkAudience("volunteers")}
                                                className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${bulkAudience === "volunteers" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-700 hover:bg-white"}`}
                                            >
                                                מתנדבים רשומים
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={toggleSelectAllBulk}
                                            disabled={!filteredBulkRecipients.length}
                                            className="text-sm px-3 py-1.5 rounded-md border border-gray-200 hover:border-indigo-300 hover:text-indigo-700 transition disabled:opacity-50"
                                        >
                                            {bulkAllVisibleSelected ? "בטל סימון נוכחי" : "סמן את כל הנראים"}
                                        </button>
                                        <span className="text-xs text-gray-500">
                                            נבחרו {bulkVisibleSelectedCount}/{filteredBulkRecipients.length || 0} • סה״כ {bulkAudienceList.length}
                                        </span>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="text-sm text-gray-600">חיפוש</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                value={waSearch}
                                                onChange={(e) => setWaSearch(e.target.value)}
                                                placeholder="חפש לפי שם, אימייל או טלפון"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm text-gray-600">סוג הודעה</label>
                                            <select
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                                value={bulkTemplate}
                                                onChange={(e) => setBulkTemplate(e.target.value as any)}
                                            >
                                                <option value="openTasks">תזכורת למשימות פתוחות</option>
                                                <option value="upcomingEvents">עדכון 3 האירועים הקרובים</option>
                                                <option value="custom">הודעה חופשית</option>
                                            </select>
                                        </div>
                                    </div>

                                    {bulkTemplate === "custom" && (
                                        <div className="mb-4">
                                            <label className="text-sm text-gray-600">תוכן ההודעה החופשית</label>
                                            <textarea
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px]"
                                                value={bulkCustomMessage}
                                                onChange={(e) => setBulkCustomMessage(e.target.value)}
                                                placeholder="כתוב כאן את ההודעה שתישלח לנמענים שסימנת..."
                                            />
                                        </div>
                                    )}

                                    <div className="max-h-52 overflow-y-auto border rounded-lg p-3 mb-4">
                                        {(bulkAudienceLoading ? [] : filteredBulkRecipients).map((u: any) => {
                                            const key = `${bulkKeyPrefix}:${u.id}`;
                                            return (
                                                <label key={key} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={bulkSelected.has(key)}
                                                        onChange={(e) => {
                                                            setBulkSelected((prev) => {
                                                                const next = new Set(prev);
                                                                if (e.target.checked) next.add(key); else next.delete(key);
                                                                return next;
                                                            });
                                                        }}
                                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    />
                                                    <span className="flex-1 truncate">{u.fullName || u.name || u.email || "איש קשר"}</span>
                                                    {u.phone && <span className="text-xs text-gray-400">{u.phone}</span>}
                                                </label>
                                            );
                                        })}
                                        {!bulkAudienceLoading && filteredBulkRecipients.length === 0 && (
                                            <div className="text-sm text-gray-500">לא נמצאו תוצאות.</div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleSendBulk}
                                        disabled={bulkSending}
                                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-60"
                                    >
                                        {bulkSending ? "שולח..." : "שלח לנבחרים"}
                                    </button>
                                    <p className="text-xs text-gray-400 mt-2">
                                        דוח תקלות יופיע כאן במידה והיו שגיאות בשליחה.
                                    </p>

                                    {bulkFailures.length > 0 && (
                                        <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
                                            <div className="flex items-center gap-2 mb-3 text-red-800">
                                                <AlertTriangle size={20} />
                                                <h4 className="font-bold">דוח תקלות בשליחה ({bulkFailures.length})</h4>
                                            </div>
                                            <div className="space-y-2">
                                                {bulkFailures.map((fail) => (
                                                    <div key={fail.id} className="bg-white p-3 rounded-lg border border-red-100 flex items-center justify-between gap-4">
                                                        <div>
                                                            <p className="font-medium text-gray-900">{fail.name}</p>
                                                            <p className="text-xs text-red-600">{fail.reason}</p>
                                                            {fail.phone && <p className="text-xs text-gray-500">{fail.phone}</p>}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {fail.phone && (
                                                                <button
                                                                    onClick={() => handleRetryBulkItem(fail)}
                                                                    className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-100 transition"
                                                                >
                                                                    נסה שוב
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleRemoveBulkFailure(fail.id)}
                                                                className="text-gray-400 hover:text-red-500 transition"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-start justify-between gap-3 mb-4">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <MessageCircle size={20} className="text-indigo-500" />
                                                <h3 className="text-lg font-bold text-gray-900">הודעות לקבוצות</h3>
                                            </div>
                                            <p className="text-gray-500 text-sm mt-1">חפש קבוצות וואטסאפ לפי שם, והוסף למאגר לשליחה עתידית.</p>
                                        </div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="text-sm text-gray-600">חפש לפי שם קבוצה</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                value={groupSearch}
                                                onChange={(e) => setGroupSearch(e.target.value)}
                                                placeholder="לדוגמה: צוות הפקה"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleSearchGroups}
                                                disabled={searchingGroups}
                                                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-60"
                                            >
                                                {searchingGroups ? "מחפש..." : "חפש"}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2 mb-4">
                                        {searchingGroups && <div className="text-sm text-gray-500">מחפש קבוצות...</div>}
                                        {!searchingGroups && groupSearchResults.map((g, idx) => (
                                            <div key={`${g.chatId}-${idx}`} className="flex items-center justify-between p-2 border rounded-lg">
                                                <div>
                                                    <p className="font-medium text-sm text-gray-800">{g.name}</p>
                                                    <p className="text-xs text-gray-500 break-all">{g.chatId}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleAddGroup(g)}
                                                    className="text-xs text-indigo-600 hover:text-indigo-800"
                                                    type="button"
                                                    disabled={savingGroup}
                                                >
                                                    הוסף למאגר
                                                </button>
                                            </div>
                                        ))}
                                        {!searchingGroups && !groupSearchResults.length && (
                                            <div className="text-sm text-gray-500">אין תוצאות לחיפוש.</div>
                                        )}
                                    </div>
                                    <h4 className="text-sm font-semibold text-gray-800 mb-2">קבוצות במאגר</h4>
                                    <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2">
                                        {loadingGroups && <div className="text-sm text-gray-500">טוען קבוצות...</div>}
                                        {!loadingGroups && groups.map((g) => (
                                            <div key={g.id} className="flex items-center justify-between p-2 border rounded-lg gap-2">
                                                <label className="flex items-center gap-2 flex-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedGroups.has(g.id)}
                                                        onChange={(e) => {
                                                            setSelectedGroups((prev) => {
                                                                const next = new Set(prev);
                                                                if (e.target.checked) next.add(g.id); else next.delete(g.id);
                                                                return next;
                                                            });
                                                        }}
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-sm text-gray-800 truncate">{g.name}</p>
                                                        <p className="text-xs text-gray-500 break-all">{g.chatId}</p>
                                                    </div>
                                                </label>
                                                <button
                                                    onClick={() => handleDeleteGroup(g.id)}
                                                    className="text-xs text-red-600 hover:text-red-800"
                                                    type="button"
                                                >
                                                    מחק
                                                </button>
                                            </div>
                                        ))}
                                        {!loadingGroups && groups.length === 0 && (
                                            <div className="text-sm text-gray-500">עדיין לא נוספו קבוצות למאגר.</div>
                                        )}
                                    </div>

                                    <div className="mt-4 space-y-2">
                                        <h4 className="text-sm font-semibold text-gray-800">תוכן ההודעה</h4>
                                        <div className="flex items-center gap-4 text-sm">
                                            <label className="flex items-center gap-1">
                                                <input
                                                    type="radio"
                                                    name="groupSendMode"
                                                    checked={groupSendMode === "custom"}
                                                    onChange={() => setGroupSendMode("custom")}
                                                />
                                                הודעה חופשית
                                            </label>
                                            <label className="flex items-center gap-1">
                                                <input
                                                    type="radio"
                                                    name="groupSendMode"
                                                    checked={groupSendMode === "event"}
                                                    onChange={() => setGroupSendMode("event")}
                                                />
                                                הזמנה לאירוע
                                            </label>
                                        </div>

                                        {groupSendMode === "custom" && (
                                            <textarea
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                rows={3}
                                                value={groupMessage}
                                                onChange={(e) => setGroupMessage(e.target.value)}
                                                placeholder="מה תרצה לשלוח לקבוצות?"
                                            />
                                        )}
                                        {groupSendMode === "custom" && (
                                            <div className="space-y-1">
                                                <label className="text-xs text-gray-600">מדיה מצורפת (אופציונלי, תמונה/וידאו)</label>
                                                <input
                                                    type="file"
                                                    accept="image/*,video/*"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0] || null;
                                                        setGroupMediaFile(file);
                                                    }}
                                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                                                />
                                                {groupMediaFile && (
                                                    <p className="text-[11px] text-gray-600">נבחר: {groupMediaFile.name}</p>
                                                )}
                                                <p className="text-[11px] text-gray-500">הקובץ נשלח ולא נשמר במערכת לאחר השליחה.</p>
                                            </div>
                                        )}

                                        {groupSendMode === "event" && (
                                            <div className="grid sm:grid-cols-2 gap-2">
                                                <select
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                                    value={groupEventId}
                                                    onChange={(e) => setGroupEventId(e.target.value)}
                                                >
                                                    <option value="">בחר אירוע</option>
                                                    {eventsOptions.map((ev) => (
                                                        <option key={ev.id} value={ev.id}>
                                                            {ev.title || "אירוע"} {ev.startTime ? `(${new Date(ev.startTime).toLocaleDateString("he-IL")})` : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                                <p className="text-xs text-gray-500">נשלח המלל והתמונה הרשמיים מתוך "תוכן ומדיה" של האירוע.</p>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 mb-2">
                                            <input
                                                type="checkbox"
                                                id="useAiFormatting"
                                                checked={useAiFormatting}
                                                onChange={(e) => setUseAiFormatting(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                            />
                                            <label htmlFor="useAiFormatting" className="text-sm text-gray-700 select-none cursor-pointer">
                                                עיצוב חכם (AI) - הדגשות ואימוג'ים אוטומטיים
                                            </label>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleSendGroupsMessage}
                                            disabled={sendingGroupsMsg}
                                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium disabled:opacity-60"
                                        >
                                            {sendingGroupsMsg ? "שולח..." : "שלח לקבוצות שנבחרו"}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Bell size={18} className="text-indigo-500" />
                                        <h3 className="text-lg font-bold text-gray-900">חוקי התראות אוטומטיות</h3>
                                    </div>
                                    <p className="text-gray-500 text-sm mb-4">בחר מתי לשלוח התרעה אוטומטית בוואטסאפ. החוק פועל רק אם הוגדר אינסטנס פעיל.</p>
                                    <div className="flex items-center gap-3">
                                        <input
                                            id="notifyOnMention"
                                            type="checkbox"
                                            checked={waRules.notifyOnMention}
                                            onChange={(e) => {
                                                const next = { notifyOnMention: e.target.checked, notifyOnVolunteerDone: waRules.notifyOnVolunteerDone };
                                                setWaRules(next);
                                                saveRulesOnly(next);
                                            }}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <label htmlFor="notifyOnMention" className="text-sm text-gray-700 cursor-pointer">
                                            שלח הודעה אוטומטית כשמתייגים משתמש במשימה
                                        </label>
                                    </div>
                                    <div className="flex items-center gap-3 mt-3">
                                        <input
                                            id="notifyOnVolunteerDone"
                                            type="checkbox"
                                            checked={waRules.notifyOnVolunteerDone}
                                            onChange={(e) => {
                                                const next = { notifyOnMention: waRules.notifyOnMention, notifyOnVolunteerDone: e.target.checked };
                                                setWaRules(next);
                                                saveRulesOnly(next);
                                            }}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <label htmlFor="notifyOnVolunteerDone" className="text-sm text-gray-700 cursor-pointer">
                                            שלח הודעה ליוצר המשימה כשמתנדב מסמן ביצוע
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        נשתמש במספר שמוגדר למשתמש, ואם אין – לא תישלח הודעה. השמירה מתבצעת מידית.
                                        {savingWaRules && " שומר..."}
                                    </p>
                                </div>

                                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900 flex items-start gap-2">
                                    <AlertTriangle size={18} className="mt-0.5" />
                                    <div>
                                        <p className="font-semibold">טיפ אבטחה</p>
                                        <p>האסימון נשמר ב-Firestore ונגיש רק למנהלי מערכת. אם שינית את האסימון ב-Green API, עדכן אותו כאן.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "metricool" && isAdmin && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Share2 size={20} className="text-indigo-500" />
                                                <h2 className="text-xl font-bold text-gray-900">חיבור Metricool</h2>
                                            </div>
                                            <p className="text-gray-500 text-sm mt-1">
                                                הזן את פרטי החיבור ל-Metricool כדי לאפשר אוטומציה של פוסטים וסטורים.
                                            </p>
                                        </div>
                                        <a
                                            href="https://metricool.com/"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-sm text-indigo-600 hover:text-indigo-800 underline"
                                        >
                                            לאתר Metricool
                                        </a>
                                    </div>

                                    {loadingMetricool ? (
                                        <div className="mt-4 text-gray-500 text-sm">טוען הגדרות...</div>
                                    ) : (
                                        <form className="space-y-4 mt-6" onSubmit={handleSaveMetricool}>
                                            <div className="grid sm:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-sm text-gray-600">User ID</label>
                                                    <input
                                                        type="text"
                                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        value={metricoolConfig.userId}
                                                        onChange={(e) => setMetricoolConfig(prev => ({ ...prev, userId: e.target.value }))}
                                                        placeholder="מזהה משתמש ב-Metricool"
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm text-gray-600">API Token</label>
                                                    <input
                                                        type="password"
                                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        value={metricoolConfig.userToken}
                                                        onChange={(e) => setMetricoolConfig(prev => ({ ...prev, userToken: e.target.value }))}
                                                        placeholder="Token מ-Metricool"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="submit"
                                                    disabled={savingMetricool}
                                                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-60"
                                                >
                                                    {savingMetricool ? "שומר..." : "שמור הגדרות"}
                                                </button>
                                                <span className="text-xs text-gray-500">השמירה מתבצעת ב-Firestore.</span>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === "instagram" && isAdmin && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Instagram size={20} className="text-pink-600" />
                                                <h2 className="text-xl font-bold text-gray-900">חיבור אינסטגרם (Graph API)</h2>
                                            </div>
                                            <p className="text-gray-500 text-sm mt-1">
                                                הגדר את פרטי החיבור ל-Instagram Graph API כדי להעלות ולתזמן פוסטים וסטורים ישירות מהמערכת.
                                            </p>
                                        </div>
                                        <a
                                            href="https://developers.facebook.com/tools/explorer/"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-sm text-indigo-600 hover:text-indigo-800 underline"
                                        >
                                            Graph API Explorer
                                        </a>
                                    </div>

                                    {loadingInstagram ? (
                                        <div className="mt-4 text-gray-500 text-sm">טוען הגדרות...</div>
                                    ) : (
                                        <div className="mt-6 space-y-6">
                                            {instagramAccounts.length > 0 && (
                                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                                    {instagramAccounts.map(account => (
                                                        <div key={account.id} className="border border-indigo-100 bg-indigo-50/50 rounded-xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group">
                                                            <div className="pb-8">
                                                                <div className="flex items-center gap-2 font-bold text-indigo-900 mb-2">
                                                                    <User size={16} className="text-indigo-600" />
                                                                    {account.name}
                                                                </div>
                                                                <p className="text-xs text-indigo-700/70 truncate" dir="ltr"><strong>ID:</strong> {account.accountId}</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteInstagramAccount(account.id)}
                                                                className="absolute bottom-4 left-4 text-red-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
                                                                title="מחק חשבון"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <form className="bg-white border border-gray-100 shadow-sm rounded-xl p-5 space-y-4" onSubmit={handleAddInstagramAccount}>
                                                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                                    <Plus size={16} className="text-indigo-500" /> הוספת חשבון אינסטגרם חדש
                                                </h4>
                                                <div className="grid sm:grid-cols-3 gap-4">
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-medium text-gray-600">שם לזיהוי ברשימה</label>
                                                        <input
                                                            type="text"
                                                            className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition"
                                                            value={newIgAccountName}
                                                            onChange={(e) => setNewIgAccountName(e.target.value)}
                                                            placeholder="לדוגמה: חשבון אישי..."
                                                            required
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-medium text-gray-600">Account ID</label>
                                                        <input
                                                            type="text"
                                                            className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition"
                                                            value={newIgAccountId}
                                                            onChange={(e) => setNewIgAccountId(e.target.value)}
                                                            placeholder="1784..."
                                                            required
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs font-medium text-gray-600">Access Token (Long Lived)</label>
                                                        <input
                                                            type="password"
                                                            className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition"
                                                            value={newIgAccessToken}
                                                            onChange={(e) => setNewIgAccessToken(e.target.value)}
                                                            placeholder="EAAG..."
                                                            required
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 pt-2">
                                                    <button
                                                        type="submit"
                                                        disabled={savingInstagram}
                                                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
                                                    >
                                                        <Plus size={16} />
                                                        {savingInstagram ? "מוסיף..." : "הוסף חשבון"}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <UploadCloud size={20} className="text-indigo-500" />
                                        <h3 className="text-lg font-bold text-gray-900">העלאה ותזמון תוכן</h3>
                                    </div>

                                    <form onSubmit={handleInstagramPublish} className="space-y-4">
                                        <div className="grid sm:grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">בחר חשבון מפרסם</label>
                                                <select
                                                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-gray-50 text-gray-800 h-[42px]"
                                                    value={igSelectedAccountId}
                                                    onChange={(e) => setIgSelectedAccountId(e.target.value)}
                                                    required
                                                >
                                                    {instagramAccounts.length === 0 && <option value="">אין חשבונות מחוברים</option>}
                                                    {instagramAccounts.map(acc => (
                                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 mb-1">סוג פוסט</label>
                                                <div className="flex gap-2 h-[42px]">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIgPostType("IMAGE")}
                                                        className={`flex-1 rounded-lg text-sm font-medium border transition ${igPostType === "IMAGE" ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-inner" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                                                    >
                                                        תמונה
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIgPostType("VIDEO")}
                                                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${igPostType === "VIDEO" ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                                                    >
                                                        וידאו
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setIgPostType("STORY")}
                                                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${igPostType === "STORY" ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                                                    >
                                                        סטורי
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">קובץ מדיה</label>
                                                <input
                                                    type="file"
                                                    accept={igPostType === "VIDEO" ? "video/*" : "image/*"}
                                                    onChange={(e) => setIgFile(e.target.files?.[0] || null)}
                                                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">תיוג משתמשים (אופציונלי)</label>
                                            <input
                                                type="text"
                                                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-left ${igPostType === "STORY" ? "bg-gray-100 text-gray-400 cursor-not-allowed" : ""}`}
                                                value={igTags}
                                                onChange={(e) => setIgTags(e.target.value)}
                                                placeholder="@username1, @username2"
                                                dir="ltr"
                                                disabled={igPostType === "STORY"}
                                            />
                                            <p className={`text-xs mt-1 ${igPostType === "STORY" ? "text-amber-600 font-medium" : "text-gray-500"}`}>
                                                {igPostType === "STORY"
                                                    ? "שים לב: תיוג משתמשים בסטורי אינו נתמך דרך ה-API של אינסטגרם."
                                                    : "מופרד בפסיקים. המערכת תנסה לתייג אותם בפוסט."}
                                            </p>
                                        </div>

                                        {igPostType !== "STORY" && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">כיתוב (Caption)</label>
                                                <textarea
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    rows={3}
                                                    value={igCaption}
                                                    onChange={(e) => setIgCaption(e.target.value)}
                                                    placeholder="כתוב משהו..."
                                                />
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">תזמון (אופציונלי)</label>
                                            <div className="relative">
                                                <input
                                                    type="datetime-local"
                                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={igScheduleTime}
                                                    onChange={(e) => setIgScheduleTime(e.target.value)}
                                                />
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">השאר ריק לפרסום מיידי. שים לב: תזמון סטורי עשוי לא נתמך בכל החשבונות דרך ה-API.</p>
                                        </div>

                                        <div className="flex justify-end">
                                            <button
                                                type="submit"
                                                disabled={igPublishing}
                                                className="bg-pink-600 text-white px-6 py-2.5 rounded-lg hover:bg-pink-700 transition font-medium shadow-sm disabled:opacity-60 flex items-center gap-2"
                                            >
                                                {igPublishing ? (
                                                    <>Processing...</>
                                                ) : (
                                                    <>
                                                        <UploadCloud size={18} />
                                                        {igScheduleTime ? "תזמן פוסט" : "פרסם עכשיו"}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {activeTab === "exportDocs" && isAdmin && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <FileText size={20} className="text-indigo-500" />
                                        <h2 className="text-xl font-bold text-gray-900">סיכום אירועים מקיף</h2>
                                    </div>
                                    <p className="text-gray-500 text-sm mb-6">
                                        יצר סיכום מקיף של אירוע עם כל הפרטים: משימות, מתנדבים, שעות ואחראים.
                                        הסיכום נוצר באמצעות GPT ומכיל את כל המידע המלא לייצוא.
                                    </p>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                בחר אירוע לסיכום
                                            </label>
                                            <select
                                                value={exportSelectedEventId}
                                                onChange={(e) => setExportSelectedEventId(e.target.value)}
                                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                            >
                                                <option value="">-- בחר אירוע --</option>
                                                {exportEvents.map(event => (
                                                    <option key={event.id} value={event.id}>
                                                        {event.title}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex gap-3">
                                            <button
                                                onClick={handleGenerateEventSummary}
                                                disabled={!exportSelectedEventId || generatingSummary}
                                                className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {generatingSummary ? "מייצר סיכום..." : "צור סיכום מקיף"}
                                            </button>

                                            {eventSummary && (
                                                <button
                                                    onClick={handleDownloadSummary}
                                                    className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition text-sm font-medium"
                                                >
                                                    💾 הורד כקובץ טקסט
                                                </button>
                                            )}
                                        </div>

                                        {eventSummary && (
                                            <div className="mt-6">
                                                <h3 className="text-lg font-bold text-gray-900 mb-3">סיכום האירוע:</h3>
                                                <div className="bg-gray-50 border rounded-lg p-6 max-h-[600px] overflow-y-auto">
                                                    <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                                                        {eventSummary}
                                                    </pre>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-2">
                                                    💡 טיפ: העתק את הטקסט מעלה או הורד אותו כקובץ והעלה ל-NotebookLM שלך
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "stockTracking" && (
                            <StockTrackingPreviewPanel />
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
