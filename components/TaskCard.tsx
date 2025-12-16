"use client";

import { CheckCircle, Circle, Clock, AlertTriangle, Trash2, MessageCircle, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

interface TaskProps {
    id: string;
    title: string;
    description?: string;
    assignee: string;
    assignees?: { name?: string; userId?: string; email?: string }[];
    status: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK";
    dueDate: string;
    priority: "NORMAL" | "HIGH" | "CRITICAL";
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
    previewImage?: string;
    createdByName?: string;
    onOpen?: () => void;
    scope?: "event" | "project";
    specialType?: string;
    requiredCompletions?: number | null;
    remainingCompletions?: number | null;
    onUpdateCompletions?: () => void;
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
    hasUnreadMessages,
    currentStatus,
    nextStep,
    eventId,
    eventTitle,
    onEditStatus,
    onEditDate,
    previewImage,
    createdByName,
    onOpen,
    scope,
    specialType,
    requiredCompletions,
    remainingCompletions,
    onUpdateCompletions,
}: TaskProps) {
    const router = useRouter();

    const getStatusIcon = () => {
        switch (status) {
            case "DONE": return <CheckCircle className="text-green-500" />;
            case "STUCK": return <AlertTriangle className="text-red-500" />;
            case "IN_PROGRESS": return <Circle className="text-indigo-500" />;
            default: return <Circle className="text-gray-300" />;
        }
    };

    const handleStatusClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card navigation
        e.preventDefault(); // Prevent default button behavior
        if (!onStatusChange) return;

        const nextStatus = status === "TODO" ? "IN_PROGRESS" :
            status === "IN_PROGRESS" ? "DONE" :
                status === "DONE" ? "TODO" : "TODO";
        onStatusChange(nextStatus);
    };

    // Helper to trigger onEditStatus with all props
    const handleEditStatusClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card navigation
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
            className={`p-4 rounded-xl shadow-sm border ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-100'} flex flex-col hover:shadow-md transition group cursor-pointer relative overflow-hidden`}
        >
            <div className="flex items-start justify-between gap-3 w-full mb-3">
                <button
                    onClick={handleStatusClick}
                    className="hover:bg-gray-50 p-1.5 rounded-full transition z-10 shrink-0 border border-gray-200"
                    title="שנה סטטוס"
                >
                    {getStatusIcon()}
                </button>
                <div className="flex-1 min-w-0 text-right">
                    <h3 className={`font-semibold text-gray-900 leading-tight break-words ${status === 'DONE' ? 'line-through text-gray-400' : ''}`} title="צפייה בפרטי המשימה">
                        {title}
                    </h3>
                    {description && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{description}</p>
                    )}
                    {eventId && eventTitle && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/events/${eventId}`);
                            }}
                            className="text-xs text-indigo-600 font-medium hover:underline mt-1"
                        >
                            📅 {eventTitle}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
                <div className="flex items-center gap-2 flex-wrap max-w-full">
                    <span className="text-xs text-gray-500">אחראי:</span>
                    {(assignees && assignees.length > 0 ? assignees : [{ name: assignee }]).map((a, idx) => (
                        <span key={idx} className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs border border-gray-200">
                            {a.name || 'לא משויך'}
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <div
                        className="flex items-center gap-1 hover:bg-gray-50 px-2 py-1 rounded-lg transition z-10 text-xs sm:text-sm border border-gray-100"
                        onClick={handleDateClick}
                        title="לחץ לשינוי תאריך"
                    >
                        <Clock size={14} />
                        <span className="font-medium">{dueDate ? new Date(dueDate).toLocaleDateString('he-IL') : '-'}</span>
                    </div>
                    {onUpdateCompletions && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onUpdateCompletions(); }}
                            className="p-1.5 rounded-full border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition"
                            title="עדכן מספר ביצועים"
                        >
                            <span className="text-[10px] font-bold leading-none">+1</span>
                        </button>
                    )}
                </div>
            </div>

            {(requiredCompletions || remainingCompletions) && (requiredCompletions || 0) > 1 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-indigo-800">
                    <span className="px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 font-semibold">
                        {Math.max(remainingCompletions ?? requiredCompletions ?? 0, 0)} / {requiredCompletions ?? 0} נותרו
                    </span>
                </div>
            )}

            <div className="mt-3 flex items-center gap-2 justify-end text-sm text-gray-500">
                {onManageAssignees && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onManageAssignees(); }}
                        className="text-gray-400 hover:text-indigo-600 p-2 rounded-full border border-transparent hover:border-indigo-100 transition"
                        title="נהל אחראים"
                    >
                        <UserPlus size={16} />
                    </button>
                )}
                {onChat && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onChat(); }}
                        className="text-gray-400 hover:text-purple-500 p-2 rounded-full border border-transparent hover:border-purple-100 transition relative"
                        title="צ'אט הודעות"
                    >
                        <MessageCircle size={16} />
                        {hasUnreadMessages && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                        )}
                    </button>
                )}
                {onDelete && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="text-gray-400 hover:text-red-500 p-2 rounded-full border border-transparent hover:border-red-100 transition"
                        title="מחק משימה"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>

            {(currentStatus || nextStep) && (
                <div className="mt-3 flex flex-wrap gap-2 w-full relative z-10">
                    {currentStatus && (
                        <div
                            onClick={handleEditStatusClick}
                            className="p-1.5 rounded-lg flex-1 min-w-[200px] hover:opacity-90 transition cursor-pointer"
                            style={{ background: 'var(--patifon-yellow)', border: '1px solid var(--patifon-yellow-orange)' }}
                        >
                            <div className="flex items-start gap-2">
                                <span className="font-bold text-xs shrink-0" style={{ color: 'var(--patifon-burgundy)' }}>📍 איפה זה עומד:</span>
                                <span className="text-xs font-medium" style={{ color: 'var(--patifon-burgundy)' }}>{currentStatus}</span>
                            </div>
                        </div>
                    )}
                    {nextStep && (
                        <div
                            onClick={handleEditStatusClick}
                            className="p-1.5 rounded-lg flex-1 min-w-[200px] hover:opacity-90 transition cursor-pointer"
                            style={{ background: 'var(--patifon-orange)', border: '1px solid var(--patifon-orange-dark)' }}
                        >
                            <div className="flex items-start gap-2">
                                <span className="font-bold text-xs shrink-0 text-white">➡️ הצעד הבא:</span>
                                <span className="text-xs font-medium text-white break-words">{nextStep}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
