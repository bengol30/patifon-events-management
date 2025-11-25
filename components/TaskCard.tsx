"use client";

import { CheckCircle, Circle, Clock, AlertTriangle, Trash2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface TaskProps {
    id: string;
    title: string;
    description?: string;
    assignee: string;
    status: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK";
    dueDate: string;
    priority: "NORMAL" | "HIGH" | "CRITICAL";
    isSelected?: boolean;
    onSelect?: (selected: boolean) => void;
    onDelete?: () => void;
    onEdit?: () => void;
    onStatusChange?: (newStatus: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK") => void;
    onChat?: () => void;
    hasUnreadMessages?: boolean;
    currentStatus?: string;
    nextStep?: string;
    eventId?: string;
    eventTitle?: string;
    onEditStatus?: (task: TaskProps) => void;
    onEditDate?: (task: TaskProps) => void;
}

export default function TaskCard({
    id,
    title,
    description,
    assignee,
    status,
    dueDate,
    priority,
    isSelected,
    onSelect,
    onDelete,
    onEdit,
    onStatusChange,
    onChat,
    hasUnreadMessages,
    currentStatus,
    nextStep,
    eventId,
    eventTitle,
    onEditStatus,
    onEditDate,
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
                onChat, hasUnreadMessages, currentStatus, nextStep, eventId, eventTitle, onEditStatus, onEditDate
            });
        }
    };

    const handleDateClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onEditDate) {
            onEditDate({
                id, title, description, assignee, status, dueDate, priority,
                isSelected, onSelect, onDelete, onEdit, onStatusChange,
                onChat, hasUnreadMessages, currentStatus, nextStep, eventId, eventTitle, onEditStatus, onEditDate
            });
        }
    };

    const handleCardClick = () => {
        router.push(`/tasks/${id}`);
    };

    return (
        <div
            onClick={handleCardClick}
            className={`bg-white p-4 rounded-lg shadow-sm border ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-100'} flex flex-col hover:shadow-md transition group cursor-pointer relative`}
        >
            <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-3 flex-1">
                    <button
                        onClick={handleStatusClick}
                        className="hover:bg-gray-50 p-1 rounded-full transition z-10"
                        title="שנה סטטוס"
                    >
                        {getStatusIcon()}
                    </button>
                    <div className="flex-1 min-w-0">
                        <h3 className={`font-medium text-gray-900 truncate hover:text-indigo-600 transition ${status === 'DONE' ? 'line-through text-gray-400' : ''}`} title="צפייה בפרטי המשימה">
                            {title}
                        </h3>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <span>אחראי: {assignee || 'לא משויך'}</span>
                                {description && <span className="hidden sm:inline-block text-gray-300">|</span>}
                                {description && <span className="hidden sm:inline-block truncate max-w-[200px]">{description}</span>}
                            </div>
                            {eventId && eventTitle && (
                                <span
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/events/${eventId}`);
                                    }}
                                    className="text-xs text-indigo-600 font-medium hover:underline w-fit cursor-pointer z-10"
                                >
                                    📅 {eventTitle}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 text-sm text-gray-500">
                    <div
                        className="flex items-center gap-1 hidden sm:flex hover:bg-gray-100 p-1 rounded transition z-10"
                        onClick={handleDateClick}
                        title="לחץ לשינוי תאריך"
                    >
                        <Clock size={14} />
                        <span>{dueDate ? new Date(dueDate).toLocaleDateString('he-IL') : '-'}</span>
                    </div>

                    <div className="flex items-center gap-1 z-10">
                        {onChat && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onChat(); }}
                                className="text-gray-400 hover:text-purple-500 p-1 relative"
                                title="צ'אט הודעות"
                            >
                                <MessageCircle size={16} />
                                {hasUnreadMessages && (
                                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                                )}
                            </button>
                        )}
                        {/* Edit button removed as requested */}
                        {onDelete && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                className="text-gray-400 hover:text-red-500 p-1"
                                title="מחק משימה"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Current Status and Next Step Display */}
            {(currentStatus || nextStep) && (
                <div className="mt-2 flex flex-wrap gap-2 w-full pr-12 relative z-10">
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
                                <span className="text-xs font-medium text-white">{nextStep}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
