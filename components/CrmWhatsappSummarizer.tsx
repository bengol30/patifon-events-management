"use client";

import React, { useState } from "react";
import { MessageCircle, FileText, Calendar, CheckSquare, Loader2, RefreshCw, Clock } from "lucide-react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface CrmWhatsappSummarizerProps {
    projectId: string;
    whatsappSummary?: {
        lastSummarizedAt?: any;
        taskIdeas?: string[];
        importantPoints?: string[];
        importantDates?: string[];
    };
}

export default function CrmWhatsappSummarizer({ projectId, whatsappSummary }: CrmWhatsappSummarizerProps) {
    const [timeframe, setTimeframe] = useState<"1_day" | "3_days" | "1_week">("1_day");
    const [isExtracting, setIsExtracting] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

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

            await updateDoc(doc(db, "projects", projectId), {
                whatsappSummary: summaryToSave
            });

            setSuccessMsg("הסיכום בוצע בהצלחה! הנתונים נשמרו.");
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
                    <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as any)}
                        className="text-sm border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        dir="rtl"
                    >
                        <option value="1_day">היום האחרון</option>
                        <option value="3_days">3 ימים אחרונים</option>
                        <option value="1_week">שבוע אחרון</option>
                    </select>
                    <button
                        onClick={handleExtract}
                        disabled={isExtracting}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
                    >
                        {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        חלץ וסכם
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 px-1 mb-2">
                <Clock size={12} />
                <span>עודכן לאחרונה: {formattedDate}</span>
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
