"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { db, storage } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { ArrowRight, Trash2, Edit2, Save, X, Paperclip } from "lucide-react";

interface EventFile {
    id: string;
    name: string;
    url: string;
    storagePath?: string;
    taskId?: string;
    taskTitle?: string;
    createdAt?: any;
    note?: string;
    createdBy?: string | null;
    createdByName?: string;
}

export default function EventFilesPage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();
    const [files, setFiles] = useState<EventFile[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftNote, setDraftNote] = useState("");

    useEffect(() => {
        if (!db || !id) return;
        const unsub = onSnapshot(
            query(collection(db, "events", id, "files"), orderBy("createdAt", "desc")),
            (snap) => {
                const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as EventFile));
                setFiles(data);
            }
        );
        return () => unsub();
    }, [id]);

    const handleDelete = async (file: EventFile) => {
        const ok = confirm(`למחוק את "${file.name}"?`);
        if (!ok) return;
        try {
            await deleteDoc(doc(db, "events", id, "files", file.id));
            if (file.storagePath) {
                await deleteObject(ref(storage, file.storagePath));
            }
        } catch (err) {
            console.error("Error deleting file", err);
            alert("שגיאה במחיקת הקובץ");
        }
    };

    const handleSaveNote = async (fileId: string) => {
        try {
            await updateDoc(doc(db, "events", id, "files", fileId), { note: draftNote });
            setEditingId(null);
            setDraftNote("");
        } catch (err) {
            console.error("Error updating note", err);
            alert("שגיאה בעדכון הפרטים");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center gap-2">
                    <Link href={`/events/${id}`} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition">
                        <ArrowRight size={16} />
                        חזרה לדף האירוע
                    </Link>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-indigo-500 font-semibold">קבצים חשובים לאירוע</p>
                            <h1 className="text-2xl font-bold text-gray-900">מאגר קבצים</h1>
                            <p className="text-sm text-gray-600 mt-1">כל הקבצים שצורפו למשימות האירוע במקום אחד.</p>
                        </div>
                        <button
                            onClick={() => router.push(`/events/${id}/register`)}
                            className="hidden"
                            aria-hidden="true"
                        />
                    </div>

                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                            <thead className="bg-gray-50">
                                <tr className="text-right text-gray-600">
                                    <th className="px-4 py-3 font-semibold flex items-center gap-1 justify-end"><Paperclip size={14} /> שם הקובץ</th>
                                    <th className="px-4 py-3 font-semibold">קשור למשימה</th>
                                    <th className="px-4 py-3 font-semibold">הועלה ע״י</th>
                                    <th className="px-4 py-3 font-semibold">הערה</th>
                                    <th className="px-4 py-3 font-semibold">נוצר ב־</th>
                                    <th className="px-4 py-3 font-semibold">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {files.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-6 text-gray-500">עדיין אין קבצים</td>
                                    </tr>
                                ) : (
                                    files.map((file) => (
                                        <tr key={file.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-indigo-600">
                                                <a href={file.url} target="_blank" rel="noreferrer" className="hover:underline break-all">{file.name}</a>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">
                                                {file.taskTitle ? (
                                                    <Link href={`/tasks/${file.taskId}?eventId=${id}`} className="text-indigo-600 hover:underline">
                                                        {file.taskTitle}
                                                    </Link>
                                                ) : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">
                                                {file.createdByName || "לא ידוע"}
                                            </td>
                                            <td className="px-4 py-3 text-gray-700">
                                                {editingId === file.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            className="border rounded-lg px-2 py-1 text-sm w-full"
                                                            value={draftNote}
                                                            onChange={(e) => setDraftNote(e.target.value)}
                                                        />
                                                        <button onClick={() => handleSaveNote(file.id)} className="text-green-600 hover:text-green-800"><Save size={16} /></button>
                                                        <button onClick={() => { setEditingId(null); setDraftNote(""); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="block break-words">{file.note || "—"}</span>
                                                        <button onClick={() => { setEditingId(file.id); setDraftNote(file.note || ""); }} className="text-gray-400 hover:text-indigo-600"><Edit2 size={14} /></button>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">
                                                {file.createdAt?.seconds
                                                    ? new Date(file.createdAt.seconds * 1000).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })
                                                    : "-"}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center gap-2 justify-end">
                                                    {file.taskId && (
                                                        <Link
                                                            href={`/tasks/${file.taskId}?eventId=${id}`}
                                                            className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                                        >
                                                            <Edit2 size={14} />
                                                            עריכת המשימה
                                                        </Link>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(file)}
                                                        className="text-red-600 hover:text-red-800 flex items-center gap-1"
                                                        title="מחק"
                                                    >
                                                        <Trash2 size={16} />
                                                        מחיקה
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
