"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { db, storage } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { ArrowRight, Trash2, Edit2, Save, X, Paperclip, Image as ImageIcon } from "lucide-react";

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

    const isImage = (url: string | undefined) => {
        if (!url) return false;
        return /\.(png|jpe?g|gif|webp|svg)$/i.test(url.split("?")[0]);
    };

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
        if (!db || !storage) return;
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
        if (!db) return;
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

                    {files.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                            <Paperclip className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500">עדיין אין קבצים במאגר</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                            {files.map((file) => (
                                <div key={file.id} className="border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition group overflow-hidden">
                                    <a href={file.url} target="_blank" rel="noreferrer" className="block">
                                        <div className="h-40 bg-gray-100 flex items-center justify-center overflow-hidden">
                                            {isImage(file.url) ? (
                                                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center text-gray-400 gap-2">
                                                    <Paperclip size={28} />
                                                    <span className="text-xs">תצוגה מקדימה לא זמינה</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <div className="font-semibold text-gray-900 truncate">{file.name}</div>
                                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                <ImageIcon size={14} className="text-gray-400" />
                                                {isImage(file.url) ? "תמונה" : "קובץ"}
                                            </div>
                                            {file.taskTitle && (
                                                <div className="text-xs text-indigo-600 mt-1 truncate">
                                                    קשור למשימה: {file.taskTitle}
                                                </div>
                                            )}
                                            {file.createdAt?.seconds && (
                                                <div className="text-[11px] text-gray-400 mt-1">
                                                    {new Date(file.createdAt.seconds * 1000).toLocaleDateString("he-IL")}
                                                </div>
                                            )}
                                        </div>
                                    </a>
                                    <div className="flex items-center justify-between px-3 pb-3 text-xs text-gray-500">
                                        <span>{file.createdByName || "לא ידוע"}</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleDelete(file)}
                                                className="text-red-600 hover:text-red-800 flex items-center gap-1"
                                                title="מחק"
                                            >
                                                <Trash2 size={14} />
                                                מחיקה
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
