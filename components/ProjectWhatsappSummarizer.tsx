"use client";

import React, { useState, useEffect } from "react";
import { MessageCircle, FileText, Calendar, CheckSquare, Loader2, RefreshCw, Clock, Settings } from "lucide-react";
import { doc, updateDoc, serverTimestamp, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

interface ProjectWhatsappSummarizerProps {
    projectId: string;
    projectName: string;
    whatsappGroupId?: string;
    whatsappGroupName?: string;
    whatsappSummary?: {
        lastSummarizedAt?: any;
        taskIdeas?: string[];
        importantPoints?: string[];
        importantDates?: string[];
    };
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
    whatsappSummary: initialSummary 
}: ProjectWhatsappSummarizerProps) {
    const router = useRouter();
    const [timeframe, setTimeframe] = useState<"1_day" | "3_days" | "1_week">("1_day");
    const [isExtracting, setIsExtracting] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [whatsappSummary, setWhatsappSummary] = useState(initialSummary);
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [availableGroups, setAvailableGroups] = useState<WhatsAppGroup[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId);
    const [selectedGroupName, setSelectedGroupName] = useState(initialGroupName);
    const [loadingGroups, setLoadingGroups] = useState(false);

    // Load available WhatsApp groups
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

    // Save selected group to project
    const handleSaveGroup = async (groupId: string, groupName: string, chatId: string) => {
        if (!db) return;
        try {
            await updateDoc(doc(db, "projects", projectId), {
                whatsappGroupId: chatId,
                whatsappGroupName: groupName,
            });
            setSelectedGroupId(chatId);
            setSelectedGroupName(groupName);
            setShowGroupPicker(false);
            setSuccessMsg("✅ קבוצה נבחרה בהצלחה!");
            setTimeout(() => setSuccessMsg(""), 3000);
        } catch (err: any) {
            setError(err.message || "שגיאה בשמירת הקבוצה");
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
                body: JSON.stringify({ projectId, timeframe }),
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
            await updateDoc(doc(db, "projects", projectId), {
                whatsappSummary: summaryToSave
            });

            // Update local state immediately
            setWhatsappSummary(summaryToSave);
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
                        {selectedGroupName || "בחר קבוצה"}
                    </button>
                    <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as any)}
                        className="text-sm border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        dir="rtl"
                        disabled={!selectedGroupId}
                    >
                        <option value="1_day">היום האחרון</option>
                        <option value="3_days">3 ימים אחרונים</option>
                        <option value="1_week">שבוע אחרון</option>
                    </select>
                    <button
                        onClick={handleExtract}
                        disabled={isExtracting || !selectedGroupId}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
                        title={!selectedGroupId ? "יש לבחור קבוצה קודם" : ""}
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
                    {loadingGroups ? (
                        <div className="flex items-center gap-2 text-slate-600">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="text-xs">טוען קבוצות...</span>
                        </div>
                    ) : availableGroups.length === 0 ? (
                        <p className="text-xs text-slate-600">לא נמצאו קבוצות במערכת</p>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {availableGroups.map(group => (
                                <button
                                    key={group.id}
                                    onClick={() => handleSaveGroup(group.id, group.name, group.chatId)}
                                    className={`w-full text-right p-3 rounded-lg border transition ${
                                        selectedGroupId === group.chatId
                                            ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                                            : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                                    }`}
                                >
                                    <div className="font-semibold text-sm">{group.name}</div>
                                    {group.description && (
                                        <div className="text-xs text-slate-500 mt-1">{group.description}</div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 px-1 mb-2">
                <Clock size={12} />
                <span>עודכן לאחרונה: {formattedDate}</span>
                {!selectedGroupId && <span className="text-amber-600 mr-2">⚠️ לא נבחרה קבוצה</span>}
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
