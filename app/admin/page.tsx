"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, collectionGroup, deleteDoc as firestoreDeleteDoc, doc as firestoreDoc } from "firebase/firestore";
import { ShieldCheck, Users, Calendar, AlertTriangle, ArrowRight, Repeat, ClipboardList, Trash2 } from "lucide-react";

interface UserRow {
    id: string;
    fullName?: string;
    email?: string;
    phone?: string;
    role?: string;
    organization?: string;
    createdAt?: any;
}

interface EventRow {
    id: string;
    title?: string;
    status?: string;
    location?: string;
    startTime?: any;
    createdAt?: any;
    createdBy?: string;
    partners?: string | string[];
}

interface RepeatTaskRow {
    key: string;
    title?: string;
    count?: number;
    lastUsedAt?: any;
}

interface TaskRow {
    id: string;
    eventId: string;
    title?: string;
}

const ADMIN_EMAIL = "bengo0469@gmail.com";

export default function AdminDashboard() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [usersData, setUsersData] = useState<UserRow[]>([]);
    const [eventsData, setEventsData] = useState<EventRow[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    const [repeatTasks, setRepeatTasks] = useState<RepeatTaskRow[]>([]);
    const [tasksCount, setTasksCount] = useState(0);
    const [tasksData, setTasksData] = useState<TaskRow[]>([]);
    const [ownerFilter, setOwnerFilter] = useState<string>("all");
    const [partnerFilter, setPartnerFilter] = useState<string>("");
    const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
    const [deletingTaskKey, setDeletingTaskKey] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && (!user || user.email !== ADMIN_EMAIL)) {
            router.push("/");
        }
    }, [user, loading, router]);

    useEffect(() => {
        const fetchData = async () => {
            if (!db || !user || user.email !== ADMIN_EMAIL) return;
            try {
                const usersSnap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
                const eventsSnap = await getDocs(query(collection(db, "events"), orderBy("createdAt", "desc")));
                const repeatSnap = await getDocs(query(collection(db, "repeat_tasks"), orderBy("count", "desc")));
                const tasksSnap = await getDocs(collectionGroup(db, "tasks"));
                setUsersData(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserRow)));
                setEventsData(eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EventRow)));
                setRepeatTasks(repeatSnap.docs.map(d => ({ key: d.id, ...d.data() } as RepeatTaskRow)));
                setTasksCount(tasksSnap.size);
                setTasksData(tasksSnap.docs.map(d => ({
                    id: d.id,
                    eventId: d.ref.parent.parent?.id || "",
                    title: (d.data() as any).title || ""
                } as TaskRow)));
            } catch (err) {
                console.error("Error loading admin data:", err);
            } finally {
                setLoadingData(false);
            }
        };
        fetchData();
    }, [user]);

    const stats = useMemo(() => {
        const totalUsers = usersData.length;
        const totalEvents = eventsData.length;
        const pendingEvents = eventsData.filter(e => (e.status || "").toLowerCase() === "planning").length;
        return { totalUsers, totalEvents, pendingEvents };
    }, [usersData, eventsData]);

    const filteredEvents = useMemo(() => {
        return eventsData.filter(e => {
            const byOwner = ownerFilter === "all" ? true : e.createdBy === ownerFilter;
            const partnerText = Array.isArray(e.partners) ? e.partners.join(", ") : (e.partners || "");
            const byPartner = partnerFilter.trim()
                ? partnerText.toLowerCase().includes(partnerFilter.trim().toLowerCase())
                : true;
            return byOwner && byPartner;
        });
    }, [eventsData, ownerFilter, partnerFilter]);

    const ownerOptions = useMemo(() => {
        const set = new Set<string>();
        eventsData.forEach(e => { if (e.createdBy) set.add(e.createdBy); });
        return Array.from(set);
    }, [eventsData]);

    const filteredTasksCount = useMemo(() => {
        if (ownerFilter === "all" && !partnerFilter.trim()) return tasksCount;
        const allowedEventIds = new Set(filteredEvents.map(e => e.id));
        return tasksData.filter(t => allowedEventIds.has(t.eventId)).length;
    }, [filteredEvents, tasksData, ownerFilter, partnerFilter, tasksCount]);

    const handleDeleteUser = async (userId: string) => {
        if (!db) return;
        const userToDelete = usersData.find(u => u.id === userId);
        const userName = userToDelete?.fullName || userToDelete?.email || "משתמש זה";
        const ok = confirm(`למחוק את ${userName} מהמערכת? פעולה זו תמחק את המשתמש ואת כל הנתונים הקשורים אליו.`);
        if (!ok) return;
        setDeletingUserId(userId);
        try {
            await firestoreDeleteDoc(firestoreDoc(db!, "users", userId));
            setUsersData(prev => prev.filter(u => u.id !== userId));
            alert("המשתמש נמחק בהצלחה");
        } catch (err) {
            console.error("Error deleting user", err);
            alert("שגיאה במחיקת המשתמש");
        } finally {
            setDeletingUserId(null);
        }
    };

    const handleDeleteRepeatTask = async (taskKey: string) => {
        if (!db) return;
        const taskToDelete = repeatTasks.find(t => t.key === taskKey);
        const taskName = taskToDelete?.title || taskKey;
        const ok = confirm(`למחוק את "${taskName}" ממאגר המשימות החוזרות?`);
        if (!ok) return;
        setDeletingTaskKey(taskKey);
        try {
            await firestoreDeleteDoc(firestoreDoc(db!, "repeat_tasks", taskKey));
            setRepeatTasks(prev => prev.filter(t => t.key !== taskKey));
            alert("המשימה נמחקה בהצלחה מהמאגר");
        } catch (err) {
            console.error("Error deleting repeat task", err);
            alert("שגיאה במחיקת המשימה");
        } finally {
            setDeletingTaskKey(null);
        }
    };

    const handleDeleteEvent = async (eventId: string) => {
        if (!db) return;
        const ok = confirm("למחוק את האירוע הזה?");
        if (!ok) return;
        setDeletingEventId(eventId);
        try {
            await firestoreDeleteDoc(firestoreDoc(db, "events", eventId));
            setEventsData(prev => prev.filter(e => e.id !== eventId));
        } catch (err) {
            console.error("Error deleting event", err);
            alert("שגיאה במחיקת האירוע");
        } finally {
            setDeletingEventId(null);
        }
    };

    if (loading || (user && user.email === ADMIN_EMAIL && loadingData)) {
        return <div className="min-h-screen flex items-center justify-center text-gray-600">טוען נתוני בקרה...</div>;
    }

    if (!user || user.email !== ADMIN_EMAIL) {
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 p-3 rounded-full text-indigo-700">
                            <ShieldCheck size={26} />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-indigo-500 font-semibold">Admin</p>
                            <h1 className="text-3xl font-bold text-gray-900">אזור בקרה</h1>
                            <p className="text-gray-600 mt-1">מידע על משתמשים, הרשמות ואירועים פתוחים.</p>
                        </div>
                    </div>
                    <Link href="/" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
                        <ArrowRight size={16} />
                        חזרה לדשבורד
                    </Link>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <StatCard icon={<Users size={20} />} title="משתמשים רשומים" value={stats.totalUsers} />
                    <StatCard icon={<Calendar size={20} />} title="אירועים במערכת" value={stats.totalEvents} />
                    <StatCard icon={<AlertTriangle size={20} />} title="אירועים בתכנון" value={stats.pendingEvents} />
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                    <Panel title="משתמשים במערכת">
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                            {usersData.length === 0 && <EmptyRow text="אין משתמשים רשומים." />}
                            {usersData.map(u => (
                                <div key={u.id} className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm flex flex-col gap-1">
                                    <div className="flex justify-between text-sm font-semibold text-gray-900">
                                        <span>{u.fullName || "ללא שם"}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">{u.role || ""}</span>
                                            <button
                                                onClick={() => handleDeleteUser(u.id)}
                                                className="p-1 rounded-full text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200"
                                                title="מחק משתמש"
                                                disabled={deletingUserId === u.id}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-600">{u.email}</div>
                                    {u.phone && <div className="text-sm text-gray-600">טלפון: {u.phone}</div>}
                                    {u.organization && <div className="text-xs text-gray-500">ארגון: {u.organization}</div>}
                                </div>
                            ))}
                        </div>
                    </Panel>

                    <Panel title="אירועים שנפתחו">
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                            {filteredEvents.length === 0 && <EmptyRow text="אין אירועים במערכת לפי הסינון." />}
                            {filteredEvents.map(e => (
                                <div key={e.id} className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm flex flex-col gap-2">
                                    <div className="flex justify-between items-start text-sm font-semibold text-gray-900">
                                        <span className="truncate">{e.title || "אירוע ללא שם"}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{e.status || "N/A"}</span>
                                            <button
                                                onClick={() => handleDeleteEvent(e.id)}
                                                className="p-1 rounded-full text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200"
                                                title="מחק אירוע"
                                                disabled={deletingEventId === e.id}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    {e.location && <div className="text-sm text-gray-600">מיקום: {e.location}</div>}
                                    {e.startTime?.seconds && (
                                        <div className="text-sm text-gray-600">
                                            תאריך: {new Date(e.startTime.seconds * 1000).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Panel>

                    <Panel title="משימות חוזרות">
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                            {repeatTasks.length === 0 && <EmptyRow text="אין נתונים על משימות חוזרות." />}
                            {repeatTasks.map((t, idx) => (
                                <div key={t.key} className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm flex items-center gap-3">
                                    <div className="p-2 rounded-full bg-indigo-50 text-indigo-700">
                                        <Repeat size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
                                            <span className="truncate">{t.title || t.key}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">x{t.count || 1}</span>
                                                <button
                                                    onClick={() => handleDeleteRepeatTask(t.key)}
                                                    className="p-1 rounded-full text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200"
                                                    title="מחק משימה"
                                                    disabled={deletingTaskKey === t.key}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        {t.lastUsedAt?.seconds && (
                                            <div className="text-xs text-gray-500">
                                                לאחרונה: {new Date(t.lastUsedAt.seconds * 1000).toLocaleDateString("he-IL", { dateStyle: "short" })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">מבט מהיר</h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard icon={<Users size={18} />} title="משתמשים" value={usersData.length} />
                        <StatCard icon={<Calendar size={18} />} title="אירועים (לפי סינון)" value={filteredEvents.length} />
                        <StatCard icon={<ClipboardList size={18} />} title="משימות (לפי סינון)" value={filteredTasksCount} />
                        <StatCard icon={<AlertTriangle size={18} />} title="אירועים בתכנון" value={stats.pendingEvents} />
                    </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 flex flex-wrap gap-3 items-center">
                    <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">סינון לפי יוצר האירוע</label>
                        <select
                            value={ownerFilter}
                            onChange={(e) => setOwnerFilter(e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        >
                            <option value="all">כל היוצרים</option>
                            {ownerOptions.map(owner => {
                                const userObj = usersData.find(u => u.id === owner);
                                const label = userObj?.fullName || userObj?.email || owner;
                                return <option key={owner} value={owner}>{label}</option>;
                            })}
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">חיפוש לפי שותפים</label>
                        <input
                            type="text"
                            value={partnerFilter}
                            onChange={(e) => setPartnerFilter(e.target.value)}
                            placeholder="לדוגמה: עירייה, ספונסר..."
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-56"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={() => { setOwnerFilter("all"); setPartnerFilter(""); }}
                            className="text-sm text-gray-600 hover:text-gray-800 underline"
                        >
                            אפס סינון
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, title, value }: { icon: React.ReactNode; title: string; value: number; }) {
    return (
        <div className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm flex items-center gap-3">
            <div className="p-2 rounded-full bg-indigo-50 text-indigo-700">{icon}</div>
            <div>
                <p className="text-sm text-gray-500">{title}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
        </div>
    );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                {title}
            </h2>
            {children}
        </div>
    );
}

function EmptyRow({ text }: { text: string }) {
    return (
        <div className="p-4 border border-dashed border-gray-200 rounded-xl text-center text-gray-500 bg-gray-50">
            {text}
        </div>
    );
}
