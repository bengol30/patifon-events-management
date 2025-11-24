"use client";

import { CheckCircle, Circle, Clock, AlertTriangle, Trash2, Edit2, CheckSquare, Square } from "lucide-react";

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
    onStatusChange
}: TaskProps) {
    const getStatusIcon = () => {
        switch (status) {
            case "DONE": return <CheckCircle className="text-green-500" />;
            case "STUCK": return <AlertTriangle className="text-red-500" />;
            case "IN_PROGRESS": return <Circle className="text-indigo-500" />;
            default: return <Circle className="text-gray-300" />;
        }
    };

    const handleStatusClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onStatusChange) return;

        const nextStatus = status === "TODO" ? "IN_PROGRESS" :
            status === "IN_PROGRESS" ? "DONE" :
                status === "DONE" ? "TODO" : "TODO";
        onStatusChange(nextStatus);
    };

    return (
        <div className={`bg-white p-4 rounded-lg shadow-sm border ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-100'} flex items-center justify-between hover:shadow-md transition group`}>
            <div className="flex items-center gap-3 flex-1">
                {onSelect && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onSelect(!isSelected); }}
                        className="text-gray-400 hover:text-indigo-600 transition"
                    >
                        {isSelected ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
                    </button>
                )}
                <button
                    onClick={handleStatusClick}
                    className="hover:bg-gray-50 p-1 rounded-full transition"
                    title="שנה סטטוס"
                >
                    {getStatusIcon()}
                </button>
                <div className="flex-1 min-w-0">
                    <h3 className={`font-medium text-gray-900 truncate ${status === 'DONE' ? 'line-through text-gray-400' : ''}`}>
                        {title}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>אחראי: {assignee || 'לא משויך'}</span>
                        {description && <span className="hidden sm:inline-block text-gray-300">|</span>}
                        {description && <span className="hidden sm:inline-block truncate max-w-[200px]">{description}</span>}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-gray-500">
                <div className="flex items-center gap-1 hidden sm:flex">
                    <Clock size={14} />
                    <span>{dueDate ? new Date(dueDate).toLocaleDateString('he-IL') : '-'}</span>
                </div>

                {priority === "CRITICAL" && (
                    <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">
                        דחוף
                    </span>
                )}
                {priority === "HIGH" && (
                    <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">
                        גבוה
                    </span>
                )}

                <div className="flex items-center gap-1">
                    {onEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="text-gray-400 hover:text-indigo-500 p-1"
                            title="ערוך משימה"
                        >
                            <Edit2 size={16} />
                        </button>
                    )}
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
    );
}
