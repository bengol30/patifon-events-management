"use client";

import React, { useState, useEffect } from "react";
import { MessageCircle, FileText, Calendar, CheckSquare, Loader2, RefreshCw, Clock, Settings } from "lucide-react";
import { doc, updateDoc, serverTimestamp, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

interface GroupSummary {
    lastSummarizedAt?: any;
    taskIdeas?: string[];
    importantPoints?: string[];
    importantDates?: string[];
}

interface ProjectWhatsappSummarizerProps {
    projectId: string;
    projectName: string;
    whatsappGroupId?: string;
    whatsappGroupName?: string;
    whatsappSummary?: GroupSummary;
    whatsappGroups?: { chatId: string; name: string; summary?: GroupSummary }[];
}

interface WhatsAppGroup {
    id: string;
    name: string;
    chatId: string;
    description?: string;
}

export default function ProjectWhatsappSummarizer({ 
    projectId, 
    projectName,
    whatsappGroupId: initialGroupId,
    whatsappGroupName: initialGroupName,
    whatsappSummary: initialSummary,
    whatsappGroups: initialGroups
}: ProjectWhatsappSummarizerProps) {
    const router = useRouter();
    const [timeframe, setTimeframe] = useState<"1_day" | "3_days" | "1_week">("1_day");
    const [isExtracting, setIsExtracting] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const normalizedInitialGroups = (initialGroups && initialGroups.length > 0)
        ? initialGroups
        : (initialGroupId && initialGroupName ? [{ chatId: initialGroupId, name: initialGroupName, summary: initialSummary }] : []);
    const [projectGroups, setProjectGroups] = useState(normalizedInitialGroups);
    const [activeGroupId, setActiveGroupId] = useState(normalizedInitialGroups[0]?.chatId || initialGroupId || "");
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [availableGroups, setAvailableGroups] = useState<WhatsAppGroup[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [groupSearchQuery, setGroupSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<WhatsAppGroup[]>([]);

    // Search WhatsApp groups from Green API (all groups, not just saved ones)
    const searchGroups = async (query: string) => {
        if (!query || query.length < 2) {
            setSearchResults([]);
            return;
        }

        setLoadingGroups(true);
        try {
            // Call our backend to fetch from Green API
            const res = await fetch("/api/whatsapp/search-groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            });

            const data = await res.json();
            if (data.ok && Array.isArray(data.groups)) {
                setSearchResults(data.groups);
            } else {
                setSearchResults([]);
            }
        } catch (err) {
            console.error("Error searching groups:", err);
            setSearchResults([]);
        } finally {
            setLoadingGroups(false);
        }
    };

    // Load available WhatsApp groups from system (only for reference)
    const loadGroups = async () => {
        if (!db) return;
        setLoadingGroups(true);
        try {
            const groupsSnap = await getDocs(collection(db, "whatsapp_groups"));
            const groups: WhatsAppGroup[] = [];
            groupsSnap.forEach(doc => {
                const data = doc.data();
                groups.push({
                    id: doc.id,
                    name: data.name || "ללא שם",
                    chatId: data.chatId || "",
                    description: data.description
                });
            });
            setAvailableGroups(groups.sort((a, b) => a.name.localeCompare(b.name, "he")));
        } catch (err) {
            console.error("Error loading groups:", err);
        } finally {
            setLoadingGroups(false);
        }
    };

    const activeGroup = projectGroups.find((g) => g.chatId === activeGroupId);
    const whatsappSummary = activeGroup?.summary;

    // Save/add selected group to project
    const handleSaveGroup = async (_groupId: string, groupName: string, chatId: string) => {
        if (!db) return;
        try {
            const nextGroups = projectGroups.some((g) => g.chatId === chatId)
                ? projectGroups.map((g) => ({
                    chatId: g.chatId,
                    name: g.name,
                    ...(g.summary ? { summary: g.summary } : {}),
                }))
                : [...projectGroups.map((g) => ({
                    chatId: g.chatId,
                    name: g.name,
                    ...(g.summary ? { summary: g.summary } : {}),
                })), { chatId, name: groupName }];
            await updateDoc(doc(db, "projects", projectId), {
                whatsappGroups: nextGroups,
                whatsappGroupId: chatId,
                whatsappGroupName: groupName,
            });
            setProjectGroups(nextGroups);
            setActiveGroupId(chatId);
            setShowGroupPicker(false);
            setSuccessMsg("✅ קבוצה נוספה לפרויקט בהצלחה!");
            setTimeout(() => setSuccessMsg(""), 3000);
        } catch (err: any) {
            setError(err.message || "שגיאה בשמירת הקבוצה");
        }
    };

    const handleRemoveGroup = async (chatId: string) => {
        if (!db) return;
        try {
            const nextGroups = projectGroups
                .filter((g) => g.chatId !== chatId)
                .map((g) => ({
                    chatId: g.chatId,
                    name: g.name,
                    ...(g.summary ? { summary: g.summary } : {}),
                }));
            await updateDoc(doc(db, "projects", projectId), {
                whatsappGroups: nextGroups,
                whatsappGroupId: nextGroups[0]?.chatId || null,
                whatsappGroupName: nextGroups[0]?.name || null,
            });
            setProjectGroups(nextGroups);
            if (activeGroupId === chatId) setActiveGroupId(nextGroups[0]?.chatId || "");
            setSuccessMsg("✅ קבוצה הוסרה מהפרויקט");
            setTimeout(() => setSuccessMsg(""), 3000);
        } catch (err: any) {
            setError(err.message || "שגיאה בהסרת הקבוצה");
        }
    };

    const handleExtract = async () => {
        setIsExtracting(true);
        setError("");
        setSuccessMsg("");
        try {
            // Create a mock fetch call to a future API endpoint
            const res = await fetch("/api/ai/summarize-crm-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, timeframe, chatId: activeGroupId }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "שגיאה בחילוץ נתונים");

            const summaryToSave = {
                lastSummarizedAt: serverTimestamp(),
                taskIdeas: data.summary?.taskIdeas || [],
                importantPoints: data.summary?.importantPoints || [],
                importantDates: data.summary?.importantDates || []
            };

            if (!db) throw new Error("Firebase לא מוגדר");
            const nextGroups = projectGroups.map((g) => g.chatId === activeGroupId
                ? { chatId: g.chatId, name: g.name, summary: summaryToSave }
                : { chatId: g.chatId, name: g.name, ...(g.summary ? { summary: g.summary } : {}) }
            );
            await updateDoc(doc(db, "projects", projectId), {
                whatsappGroups: nextGroups,
                whatsappSummary: summaryToSave,
                whatsappGroupId: activeGroupId,
                whatsappGroupName: activeGroup?.name || null,
            });

            setProjectGroups(nextGroups);
            setSuccessMsg("✅ הסיכום בוצע בהצלחה!");
        } catch (err: any) {
            console.error(err);
            setError(err.message || "שגיאה לא צפויה בפנייה לשרת");
        } finally {
            setIsExtracting(false);
        }
    };

    const formattedDate = whatsappSummary?.lastSummarizedAt?.toDate
        ? whatsappSummary.lastSummarizedAt.toDate().toLocaleString("he-IL", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
        })
        : whatsappSummary?.lastSummarizedAt
            ? new Date(whatsappSummary.lastSummarizedAt).toLocaleString("he-IL", {
                day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
            })
            : "מעולם לא סוכם";

    return (
        <div className="bg-white p-4 sm:p-6 rounded-xl vinyl-shadow flex flex-col gap-4 mt-6" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-emerald-100 text-emerald-600">
                        <MessageCircle size={22} />
                    </div>
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold text-emerald-950">מעקב קבוצת WhatsApp</h2>
                        <p className="text-xs text-emerald-700/80 mt-0.5">סיכום אוטומטי של בקשות, תאריכים ומשימות</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => {
                            setShowGroupPicker(!showGroupPicker);
                            if (!showGroupPicker) loadGroups();
                        }}
                        className="flex items-center gap-2 border border-slate-300 bg-white text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold transition hover:bg-slate-50"
                        title="בחר קבוצת WhatsApp"
                    >
                        <Settings size={14} />
                        {activeGroup?.name || "הוסף/בחר קבוצה"}
                    </button>
                    <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as any)}
                        className="text-sm border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        dir="rtl"
                        disabled={!activeGroupId}
                    >
                        <option value="1_day">היום האחרון</option>
                        <option value="3_days">3 ימים אחרונים</option>
                        <option value="1_week">שבוע אחרון</option>
                    </select>
                    <button
                        onClick={handleExtract}
                        disabled={isExtracting || !activeGroupId}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
                        title={!activeGroupId ? "יש לבחור קבוצה קודם" : ""}
                    >
                        {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        חלץ וסכם
                    </button>
                </div>
            </div>

            {/* Group Picker */}
            {showGroupPicker && (
                <div className="border border-indigo-200 rounded-lg bg-indigo-50 p-4">
                    <h3 className="text-sm font-bold text-indigo-900 mb-3">בחר קבוצת WhatsApp לפרויקט</h3>
                    
                    {/* Search Input */}
                    <div className="mb-3">
                        <input
                            type="text"
                            placeholder="חפש קבוצה לפי שם..."
                            value={groupSearchQuery}
                            onChange={(e) => {
                                setGroupSearchQuery(e.target.value);
                                searchGroups(e.target.value);
                            }}
                            className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            dir="rtl"
                        />
                        <p className="text-xs text-slate-600 mt-1">
                            הקלד לפחות 2 תווים כדי לחפש בכל הקבוצות שלך ב-WhatsApp
                        </p>
                    </div>

                    {loadingGroups ? (
                        <div className="flex items-center gap-2 text-slate-600">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="text-xs">מחפש קבוצות...</span>
                        </div>
                    ) : searchResults.length > 0 ? (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            <p className="text-xs font-bold text-indigo-900 mb-2">תוצאות חיפוש:</p>
                            {searchResults.map(group => (
                                <button
                                    key={group.chatId}
                                    onClick={() => {
                                        handleSaveGroup(group.chatId, group.name, group.chatId);
                                        setGroupSearchQuery("");
                                        setSearchResults([]);
                                    }}
                                    className={`w-full text-right p-3 rounded-lg border transition ${
                                        activeGroupId === group.chatId
                                            ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                                    }`}
                                >
                                    <div className="font-semibold text-sm">{group.name}</div>
                                    <div className="text-xs text-slate-500 mt-1">{group.chatId}</div>
                                </button>
                            ))}
                        </div>
                    ) : groupSearchQuery.length >= 2 ? (
                        <p className="text-xs text-amber-600">לא נמצאו קבוצות התואמות לחיפוש</p>
                    ) : availableGroups.length > 0 ? (
                        <>
                            <p className="text-xs font-bold text-slate-600 mb-2">קבוצות שמורות במערכת (לעיון):</p>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {availableGroups.map(group => (
                                    <div
                                        key={group.id}
                                        className="w-full text-right p-2 rounded-lg border border-slate-100 bg-slate-50 text-slate-600"
                                    >
                                        <div className="text-sm">{group.name}</div>
                                        <div className="text-xs text-slate-400 mt-1">
                                            (שמור בהגדרות - לא לבחירה כאן)
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            {/* Group Tabs */}
            {projectGroups.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {projectGroups.map((group) => (
                        <div key={group.chatId} className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setActiveGroupId(group.chatId)}
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${activeGroupId === group.chatId ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                            >
                                {group.name}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleRemoveGroup(group.chatId)}
                                className="rounded-full px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                title="הסר קבוצה מהפרויקט"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 px-1 mb-2">
                <Clock size={12} />
                <span>עודכן לאחרונה: {formattedDate}</span>
                {!activeGroupId && <span className="text-amber-600 mr-2">⚠️ לא נבחרה קבוצה</span>}
                {activeGroup?.name && <span className="text-indigo-600 mr-2">קבוצה פעילה: {activeGroup.name}</span>}
                {error && <span className="text-red-500 mr-2">{error}</span>}
                {successMsg && <span className="text-emerald-500 mr-2">{successMsg}</span>}
            </div>

            {whatsappSummary && ((whatsappSummary.taskIdeas?.length ?? 0) > 0 || (whatsappSummary.importantPoints?.length ?? 0) > 0 || (whatsappSummary.importantDates?.length ?? 0) > 0) ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-2">
                    {/* משימות פוטנציאליות */}
                    <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl p-4 flex flex-col gap-3">
                        <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                            <CheckSquare size={16} className="text-indigo-500" />
                            רעיונות למשימות
                        </h3>
                        <ul className="space-y-2">
                            {whatsappSummary.taskIdeas?.map((task: string, i: number) => (
                                <li key={i} className="text-sm text-indigo-800 bg-white p-2.5 rounded-lg border border-indigo-100 shadow-sm leading-tight flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0"></span>
                                    <span>{task}</span>
                                </li>
                            ))}
                            {(!whatsappSummary.taskIdeas || !whatsappSummary.taskIdeas.length) && <li className="text-xs text-indigo-400">אין משימות חדשות בסיכום זה.</li>}
                        </ul>
                    </div>

                    {/* נקודות חשובות */}
                    <div className="border border-amber-100 bg-amber-50/50 rounded-xl p-4 flex flex-col gap-3">
                        <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                            <FileText size={16} className="text-amber-500" />
                            נקודות חשובות
                        </h3>
                        <ul className="space-y-2">
                            {whatsappSummary.importantPoints?.map((point: string, i: number) => (
                                <li key={i} className="text-sm text-amber-900 bg-white p-2.5 rounded-lg border border-amber-100 shadow-sm leading-tight flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0"></span>
                                    <span>{point}</span>
                                </li>
                            ))}
                            {(!whatsappSummary.importantPoints || !whatsappSummary.importantPoints.length) && <li className="text-xs text-amber-400">לא חולצו נקודות חשובות.</li>}
                        </ul>
                    </div>

                    {/* תאריכים חשובים */}
                    <div className="border border-rose-100 bg-rose-50/50 rounded-xl p-4 flex flex-col gap-3">
                        <h3 className="text-sm font-bold text-rose-900 flex items-center gap-2">
                            <Calendar size={16} className="text-rose-500" />
                            תאריכים שצוינו
                        </h3>
                        <ul className="space-y-2">
                            {whatsappSummary.importantDates?.map((dateStr: string, i: number) => (
                                <li key={i} className="text-sm text-rose-900 bg-white p-2.5 rounded-lg border border-rose-100 shadow-sm leading-tight flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0"></span>
                                    <span>{dateStr}</span>
                                </li>
                            ))}
                            {(!whatsappSummary.importantDates || !whatsappSummary.importantDates.length) && <li className="text-xs text-rose-400">לא צוינו תאריכים בשיחה.</li>}
                        </ul>
                    </div>
                </div>
            ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-2">
                    <MessageCircle size={32} className="text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">אין עדיין סיכום זמין</p>
                    <p className="text-xs text-slate-500">לחץ על כפתור "חלץ וסכם" כדי לקרוא את היסטוריית הקבוצה ולייצר תובנות.</p>
                </div>
            )}
        </div>
    );
}
