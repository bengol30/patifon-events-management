"use client";

import {
    AlertTriangle,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    Circle,
    Clock,
    ExternalLink,
    MessageCircle,
    Megaphone,
    Camera,
    Send,
    Clapperboard,
    Trash2,
    UserPlus,
    Play,
    Pause,
    Zap,
    RefreshCw,
    Ban,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const toLocalInputValue = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

interface TaskProps {
    id: string;
    title: string;
    description?: string;
    assignee: string;
    assignees?: { name?: string; userId?: string; email?: string; phone?: string }[];
    status: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK";
    dueDate: string;
    priority: "NORMAL" | "HIGH" | "CRITICAL";
    campaignControls?: {
        status?: "ACTIVE" | "PAUSED" | "WINDOW_BLOCKED";
        windows?: { stepKey: string; enabled: boolean; scheduledAt: string; label: string }[];
    } | null;
    onCampaignControlAction?: (action: "pause" | "resume" | "run_now" | "toggle_window" | "update_time" | "refresh_content", stepKey?: string, scheduledAt?: string) => void;
    isSelected?: boolean;
    onSelect?: (selected: boolean) => void;
    onDelete?: () => void;
    onEdit?: () => void;
    onStatusChange?: (newStatus: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK") => void;
    onChat?: () => void;
    onManageAssignees?: () => void;
    hasUnreadMessages?: boolean;
    currentStatus?: string;
    nextStep?: string;
    eventId?: string;
    eventTitle?: string;
    onEditStatus?: (task: TaskProps) => void;
    onEditDate?: (task: TaskProps) => void;
    customData?: any; // For Imagine Me CRM status
    previewImage?: string;
    createdByName?: string;
    onOpen?: () => void;
    scope?: "event" | "project" | "manual" | "general";
    specialType?: string;
    requiredCompletions?: number | null;
    remainingCompletions?: number | null;
    onUpdateCompletions?: () => void;
    onAssigneeClick?: (assignee: { name?: string; userId?: string; email?: string; phone?: string }) => void;
}

export default function TaskCard({
    id,
    title,
    description,
    assignee,
    status,
    dueDate,
    priority,
    assignees,
    isSelected,
    onSelect,
    onDelete,
    onEdit,
    onStatusChange,
    onChat,
    onManageAssignees,
    onAssigneeClick,
    hasUnreadMessages,
    currentStatus,
    nextStep,
    customData,
    eventId,
    eventTitle,
    onEditStatus,
    onEditDate,
    previewImage,
    createdByName,
    onOpen,
    scope,
    specialType,
    campaignControls,
    onCampaignControlAction,
    requiredCompletions,
    remainingCompletions,
    onUpdateCompletions,
}: TaskProps) {
    const router = useRouter();
    const [isExpanded, setIsExpanded] = useState(false);
    const [editingWindow, setEditingWindow] = useState<string | null>(null);
    const [editingTime, setEditingTime] = useState<string>("");
    const [campaignExpanded, setCampaignExpanded] = useState(false);

    const getStatusMeta = () => {
        switch (status) {
            case "DONE":
                return {
                    icon: <CheckCircle size={18} className="text-emerald-600" />,
                    label: "בוצע",
                    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    button: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                    accent: "from-emerald-500/15 via-emerald-500/5 to-transparent",
                };
            case "STUCK":
                return {
                    icon: <AlertTriangle size={18} className="text-red-600" />,
                    label: "תקוע",
                    chip: "bg-red-50 text-red-700 border-red-200",
                    button: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
                    accent: "from-red-500/15 via-red-500/5 to-transparent",
                };
            case "IN_PROGRESS":
                return {
                    icon: <Circle size={18} className="text-indigo-600" />,
                    label: "בתהליך",
                    chip: "bg-indigo-50 text-indigo-700 border-indigo-200",
                    button: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
                    accent: "from-indigo-500/15 via-indigo-500/5 to-transparent",
                };
            default:
                return {
                    icon: <Circle size={18} className="text-slate-500" />,
                    label: "לביצוע",
                    chip: "bg-slate-100 text-slate-700 border-slate-200",
                    button: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    accent: "from-slate-400/10 via-slate-400/5 to-transparent",
                };
        }
    };

    const getPriorityMeta = () => {
        switch (priority) {
            case "CRITICAL":
                return { label: "קריטי", chip: "bg-red-600 text-white border-red-600" };
            case "HIGH":
                return { label: "גבוה", chip: "bg-orange-100 text-orange-800 border-orange-200" };
            default:
                return { label: "רגיל", chip: "bg-gray-100 text-gray-700 border-gray-200" };
        }
    };

    const statusMeta = getStatusMeta();
    const priorityMeta = getPriorityMeta();
    const taskAssignees = assignees && assignees.length > 0 ? assignees : [{ name: assignee }];
    const dueDateLabel = dueDate ? new Date(dueDate).toLocaleDateString("he-IL") : "ללא תאריך";
    const completionRequired = Math.max(requiredCompletions ?? 0, 0);
    const completionRemaining = Math.max(remainingCompletions ?? requiredCompletions ?? 0, 0);
    const showCompletionCounter = completionRequired > 1;
    const summaryCount = [description, currentStatus, nextStep].filter(Boolean).length;
    const isMarketingCampaign = specialType === "whatsapp_campaign_patifon" || specialType === "instagram_story_campaign_patifon";
    const campaignStatusLabel = campaignControls?.status === "PAUSED"
        ? "מושהה"
        : campaignControls?.status === "WINDOW_BLOCKED"
            ? "חלונות חלקיים"
            : isMarketingCampaign
                ? "פעיל"
                : null;

    const getSpecialTypeMeta = () => {
        switch (specialType) {
            case "whatsapp_event_distribution":
                return {
                    icon: <Send size={13} />,
                    label: "וואטסאפ אוטומטי",
                    chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
                    dot: "bg-emerald-500",
                    accent: "border-l-emerald-400",
                };
            case "instagram_story_campaign_patifon":
                return {
                    icon: <Camera size={13} />,
                    label: "סטורי אינסטגרם",
                    chip: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
                    dot: "bg-fuchsia-500",
                    accent: "border-l-fuchsia-400",
                };
            case "marketing_distribution":
                return {
                    icon: <Megaphone size={13} />,
                    label: "שיווק קבוצות",
                    chip: "bg-indigo-100 text-indigo-800 border-indigo-200",
                    dot: "bg-indigo-500",
                    accent: "border-l-indigo-400",
                };
            case "story_tag":
                return {
                    icon: <Clapperboard size={13} />,
                    label: "סטורי ותיוג",
                    chip: "bg-amber-100 text-amber-800 border-amber-200",
                    dot: "bg-amber-500",
                    accent: "border-l-amber-400",
                };
            default:
                return null;
        }
    };
    const specialMeta = getSpecialTypeMeta();

    const handleStatusClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (!onStatusChange) return;

        const nextStatus =
            status === "TODO" ? "IN_PROGRESS" :
                status === "IN_PROGRESS" ? "DONE" :
                    status === "DONE" ? "TODO" : "TODO";
        onStatusChange(nextStatus);
    };

    const handleEditStatusClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onEditStatus) {
            onEditStatus({
                id, title, description, assignee, status, dueDate, priority,
                isSelected, onSelect, onDelete, onEdit, onStatusChange,
                onChat, hasUnreadMessages, currentStatus, nextStep, eventId, eventTitle, onEditStatus, onEditDate, scope, specialType
            });
        }
    };

    const handleDateClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onEditDate) {
            onEditDate({
                id, title, description, assignee, status, dueDate, priority,
                isSelected, onSelect, onDelete, onEdit, onStatusChange,
                onChat, hasUnreadMessages, currentStatus, nextStep, eventId, eventTitle, onEditStatus, onEditDate, scope, specialType
            });
        }
    };

    const handleCardClick = () => {
        setIsExpanded(prev => !prev);
    };

    const handleNavigate = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onOpen) {
            onOpen();
            return;
        }
        if (eventId) {
            router.push(`/tasks/${id}?eventId=${eventId}`);
        } else {
            router.push(`/tasks/${id}`);
        }
    };

    const handleKeyActivate = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
        }
    };

    return (
        <div
            onClick={handleCardClick}
            onKeyDown={handleKeyActivate}
            role="button"
            tabIndex={0}
            className={`group relative overflow-hidden rounded-3xl border bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] ${isSelected ? "border-indigo-500 ring-2 ring-indigo-200" : specialMeta ? "border-slate-200/80 border-l-4 " + specialMeta.accent : "border-slate-200/80"
                }`}
        >
            <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${statusMeta.accent}`} />

            <div className="relative flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={handleStatusClick}
                        className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition ${statusMeta.button}`}
                        title="שנה סטטוס"
                    >
                        {statusMeta.icon}
                    </button>

                    <div className="min-w-0 flex-1 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityMeta.chip}`}>
                                {priorityMeta.label}
                            </span>
                            {hasUnreadMessages && (
                                <span className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-700">
                                    הודעה חדשה
                                </span>
                            )}
                            {customData?.followUpStatus && (
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${customData.followUpStatus === 'interested' ? 'bg-green-50 text-green-700 border-green-200' :
                                    customData.followUpStatus === 'negotiating' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        customData.followUpStatus === 'awaiting_response' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                            customData.followUpStatus === 'not_interested' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                                                'bg-purple-50 text-purple-700 border-purple-200'
                                    }`}>
                                    {customData.followUpStatus === 'interested' ? '🟢 מעוניין' :
                                        customData.followUpStatus === 'negotiating' ? '🔵 במשא ומתן' :
                                            customData.followUpStatus === 'awaiting_response' ? '🟡 ממתין לתגובה' :
                                                customData.followUpStatus === 'not_interested' ? '⚫ לא מעוניין' :
                                                    '🟣 יצר קשר'}
                                </span>
                            )}
                        </div>

                        <div className="mt-3 space-y-2">
                            {campaignStatusLabel && (
                                <div className="flex justify-end">
                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${campaignControls?.status === "PAUSED"
                                        ? "border-amber-200 bg-amber-50 text-amber-800"
                                        : campaignControls?.status === "WINDOW_BLOCKED"
                                            ? "border-violet-200 bg-violet-50 text-violet-700"
                                            : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                                        קמפיין: {campaignStatusLabel}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-start justify-between gap-2">
                                {isExpanded ? (
                                    <ChevronUp size={20} className="mt-1 shrink-0 text-indigo-500 transition" />
                                ) : (
                                    <ChevronDown size={20} className="mt-1 shrink-0 text-slate-400 transition group-hover:text-slate-600" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <h3 className={`text-base font-bold leading-tight text-slate-900 sm:text-lg ${status === "DONE" ? "line-through text-slate-400" : ""}`}>
                                        {title}
                                    </h3>
                                    {specialMeta && (
                                        <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${specialMeta.chip}`}>
                                            {specialMeta.icon}
                                            {specialMeta.label}
                                        </span>
                                    )}
                                    {eventId && eventTitle && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/events/${eventId}`);
                                            }}
                                            className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
                                        >
                                            <span className="truncate">{eventTitle}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {isExpanded && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                        {description && (
                            <p className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
                                {description}
                            </p>
                        )}

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
                            <button
                                type="button"
                                onClick={handleDateClick}
                                className="flex min-h-[56px] items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-right transition hover:border-indigo-200 hover:bg-indigo-50/50"
                                title="לחץ לשינוי תאריך"
                            >
                                <div className="text-right">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">דד ליין</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-800">{dueDateLabel}</p>
                                </div>
                                <Clock size={16} className="shrink-0 text-slate-500" />
                            </button>

                            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">אחראים</span>
                                    <span className="text-[11px] font-semibold text-slate-400">{taskAssignees.length}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap justify-end gap-2">
                                    {taskAssignees.map((a, idx) => {
                                        const label = a.name || "לא משויך";
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onAssigneeClick?.(a);
                                                }}
                                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                                title="שליחת הודעת מערכת למשתמש"
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {(currentStatus || nextStep || showCompletionCounter || isMarketingCampaign) && (
                            <div className="rounded-[26px] border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                                <div className="mb-3 flex items-center justify-between gap-2 text-right">
                                    <div className="flex items-center gap-2">
                                        {showCompletionCounter && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdateCompletions?.();
                                                }}
                                                className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-indigo-200 bg-white px-2 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-50"
                                                title="עדכן מספר ביצועים"
                                            >
                                                +1
                                            </button>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">מצב עבודה</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">
                                            {summaryCount > 0 ? "מה קורה עכשיו" : "מוכן לעבודה"}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    {currentStatus && (
                                        <div
                                            onClick={handleEditStatusClick}
                                            className="cursor-pointer rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-right transition hover:bg-amber-100/80"
                                        >
                                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">איפה זה עומד</p>
                                            <p className="mt-1.5 text-sm font-medium leading-6 text-amber-950 break-words">{currentStatus}</p>
                                        </div>
                                    )}

                                    {nextStep && (
                                        <div
                                            onClick={handleEditStatusClick}
                                            className="cursor-pointer rounded-2xl border border-orange-200 bg-orange-500 px-3 py-3 text-right transition hover:bg-orange-600"
                                        >
                                            <p className="text-[11px] font-bold uppercase tracking-wide text-orange-50">הצעד הבא</p>
                                            <p className="mt-1.5 text-sm font-semibold leading-6 text-white break-words">{nextStep}</p>
                                        </div>
                                    )}
                                </div>

                                {showCompletionCounter && (
                                    <div className="mt-3 flex justify-end">
                                        <div className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800">
                                            נותרו {completionRemaining} מתוך {completionRequired}
                                        </div>
                                    </div>
                                )}

                                {isMarketingCampaign && campaignControls?.windows?.length ? (
                                    <div className="mt-3 rounded-2xl border border-fuchsia-200 bg-white p-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCampaignControlAction?.(campaignControls?.status === "PAUSED" ? "resume" : "pause");
                                                }}
                                                className={`flex items-center justify-center p-2 rounded-full border transition ${campaignControls?.status === "PAUSED" ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
                                                title={campaignControls?.status === "PAUSED" ? "הפעל קמפיין" : "השהה קמפיין"}
                                            >
                                                {campaignControls?.status === "PAUSED" ? <Play size={16} /> : <Pause size={16} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCampaignControlAction?.("run_now");
                                                }}
                                                className="flex items-center justify-center p-2 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100"
                                                title="הפעל עכשיו"
                                            >
                                                <Zap size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCampaignControlAction?.("refresh_content");
                                                }}
                                                className="flex items-center justify-center p-2 rounded-full border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                                                title="רענן תוכן ומדיה מהאירוע"
                                            >
                                                <RefreshCw size={16} />
                                            </button>
                                        </div>
                                        <div className="mt-3 flex flex-col gap-2">
                                            {campaignControls.windows.map((window) => {
                                                const windowDate = new Date(window.scheduledAt);
                                                const windowTs = windowDate.getTime();
                                                const isPastWindow = !Number.isNaN(windowTs) && windowTs < Date.now();
                                                const formattedDateTime = !Number.isNaN(windowDate.getTime())
                                                    ? `${windowDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })} • ${windowDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
                                                    : window.scheduledAt.slice(0, 16).replace("T", " ");

                                                const displayLabel = window.label && window.label.includes("T") && window.label.length >= 20 ? "מועד פרסום" : window.label;

                                                return (
                                                    <div key={window.stepKey} className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 ${isPastWindow ? "border-slate-200 bg-slate-100/80" : "border-slate-200 bg-slate-50"}`}>
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onCampaignControlAction?.("toggle_window", window.stepKey);
                                                                }}
                                                                className={`flex items-center justify-center p-2 rounded-full border transition ${window.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-slate-300 bg-white text-slate-400 hover:bg-slate-100"}`}
                                                                title={window.enabled ? "מאופשר" : "חסום"}
                                                            >
                                                                {window.enabled ? <CheckCircle size={15} /> : <Ban size={15} />}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onCampaignControlAction?.("run_now", window.stepKey);
                                                                }}
                                                                className="flex items-center justify-center p-2 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100"
                                                                title="הפעל עכשיו"
                                                            >
                                                                <Zap size={15} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingWindow(window.stepKey);
                                                                    setEditingTime(toLocalInputValue(window.scheduledAt));
                                                                }}
                                                                className="flex items-center justify-center p-2 rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                                                                title="ערוך זמן"
                                                            >
                                                                <Clock size={15} />
                                                            </button>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className={`text-[13px] font-bold ${isPastWindow ? "text-slate-500 line-through" : "text-slate-900"}`}>{displayLabel}</p>
                                                            <p className={`mt-0.5 text-xs font-semibold tracking-wide ${isPastWindow ? "text-slate-400 line-through" : "text-slate-500"}`} dir="ltr">{formattedDateTime}</p>
                                                            {isPastWindow ? <p className="mt-1 text-[11px] font-semibold text-slate-400">עבר</p> : null}
                                                            {editingWindow === window.stepKey && (
                                                                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                                                                    <input
                                                                        type="datetime-local"
                                                                        value={editingTime}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onChange={(e) => setEditingTime(e.target.value)}
                                                                        className="rounded-xl border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!editingTime) return;
                                                                            onCampaignControlAction?.("update_time", window.stepKey, new Date(editingTime).toISOString());
                                                                            setEditingWindow(null);
                                                                            setEditingTime("");
                                                                        }}
                                                                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                                                    >
                                                                        שמור
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingWindow(null);
                                                                            setEditingTime("");
                                                                        }}
                                                                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100"
                                                                    >
                                                                        ביטול
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}

                        <div className="rounded-[26px] border border-slate-200 bg-white p-3 sm:p-4">
                            <div className="mb-3 text-right">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">פעולות</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">מה אפשר לעשות עכשיו</p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*]:flex-1">
                                {onManageAssignees && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onManageAssignees();
                                        }}
                                        className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                                        title="נהל אחראים"
                                    >
                                        <UserPlus size={16} />
                                        <span>אחראים</span>
                                    </button>
                                )}

                                {onChat && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onChat();
                                        }}
                                        className="relative flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-sm font-semibold text-fuchsia-700 transition hover:bg-fuchsia-100"
                                        title="צ'אט הודעות"
                                    >
                                        <MessageCircle size={16} />
                                        <span>צ׳אט</span>
                                        {hasUnreadMessages && (
                                            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500" />
                                        )}
                                    </button>
                                )}

                                {onEdit && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEdit();
                                        }}
                                        className="flex min-h-[48px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                        title="עריכת משימה"
                                    >
                                        ערוך
                                    </button>
                                )}

                                {onDelete && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete();
                                        }}
                                        className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                                        title="מחק משימה"
                                    >
                                        <Trash2 size={16} />
                                        <span>מחק</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={handleNavigate}
                                    className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                    title="פתח משימה במלואה"
                                >
                                    <ExternalLink size={16} />
                                    <span>פתח משימה</span>
                                </button>
                            </div>
                        </div>

                        {/* Campaign accordion — only for special tasks */}
                        {specialMeta && (
                            <div className="rounded-[22px] border border-slate-200 bg-white overflow-hidden">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setCampaignExpanded(p => !p);
                                    }}
                                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${specialMeta.chip}`}>
                                            {specialMeta.icon}
                                        </span>
                                        <span className="text-sm font-semibold text-slate-800">פרטי קמפיין</span>
                                    </div>
                                    <ChevronDown
                                        size={16}
                                        className={`shrink-0 text-slate-400 transition-transform duration-200 ${campaignExpanded ? "rotate-180" : ""}`}
                                    />
                                </button>
                                {campaignExpanded && (
                                    <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                                        {showCompletionCounter && (
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="text-xs text-slate-500">התקדמות:</span>
                                                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${specialMeta.chip}`}>
                                                    נותרו {completionRemaining} מתוך {completionRequired}
                                                </span>
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleNavigate}
                                            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${specialMeta.chip} hover:opacity-80`}
                                        >
                                            <ExternalLink size={14} />
                                            פתח משימה
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
