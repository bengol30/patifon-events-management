"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { CheckCircle, Clock, Calendar, MessageSquare, UploadCloud, Link as LinkIcon, Send, Image as ImageIcon, AlertTriangle, Loader2, X } from "lucide-react";
import Link from "next/link";

interface SendingList {
    id: string;
    name: string;
    members?: any[];
}

export default function ClientSchedulePage() {
    const params = useParams();
    const listId = params.listId as string;

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");

    const [sendingList, setSendingList] = useState<SendingList | null>(null);

    // Form states
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [messageText, setMessageText] = useState("");
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchList = async () => {
            if (!db || !listId) return;
            try {
                const snap = await getDoc(doc(db, "whatsapp_sending_lists", listId));
                if (snap.exists()) {
                    setSendingList({ id: snap.id, ...snap.data() } as SendingList);
                } else {
                    setError("הקבוצה לא נמצאה או שהוסרה.");
                }
            } catch (err) {
                console.error("Error loading specific list", err);
                setError("שגיאה בטעינת הקבוצה. אנא פנה למנהל המערכת.");
            } finally {
                setLoading(false);
            }
        };
        fetchList();
    }, [listId]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // basic validation
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
            setError("ניתן להעלות רק תמונות או וידאו.");
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            setError("גודל הקובץ חורג מהמותר (עד 20MB).");
            return;
        }

        setError("");
        setMediaFile(file);

        if (file.type.startsWith("image/")) {
            const previewUrl = URL.createObjectURL(file);
            setMediaPreview(previewUrl);
        } else {
            setMediaPreview(null);
        }
    };

    const handleRemoveFile = () => {
        setMediaFile(null);
        setMediaPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !sendingList) return;

        if (!date || !time) {
            setError("יש לבחור תאריך ושעה לשליחה.");
            return;
        }

        if (!messageText.trim()) {
            setError("יש להזין תוכן להודעה.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            // Ensure time string is padded properly for mobile Safari
            const [timeH = "00", timeM = "00"] = time.split(':');
            const parsedTime = `${timeH.padStart(2, '0')}:${timeM.padStart(2, '0')}:00`;
            const datetimeStr = `${date}T${parsedTime}`;
            const scheduledAt = new Date(datetimeStr).toISOString();

            let mediaUrl = "";
            if (mediaFile && storage) {
                const storageRef = ref(storage, `whatsapp_uploads/schedules/client_${Date.now()}_${mediaFile.name}`);
                await uploadBytes(storageRef, mediaFile);
                mediaUrl = await getDownloadURL(storageRef);
            }

            // Create pending schedule request
            await addDoc(collection(db, "whatsapp_list_schedules"), {
                listId: sendingList.id,
                listName: sendingList.name,
                sendMode: "custom",
                messageText: messageText.trim(),
                ...(mediaUrl ? { mediaUrl } : {}),
                scheduleType: "once",
                scheduledAt,
                status: "pending_client",
                nextRunAt: scheduledAt,
                createdAt: new Date(),
                isClientSubmitted: true,
            });

            setSubmitted(true);
        } catch (err) {
            console.error("Error submitting schedule", err);
            setError("אירעה שגיאה בשליחת הבקשה. אנא נסה שנית.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-50 via-gray-50 to-white">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={32} className="text-violet-600 animate-spin" />
                    <span className="text-violet-900/60 font-medium text-sm animate-pulse">טוען נתוני טופס...</span>
                </div>
            </div>
        );
    }

    if (error && !sendingList) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center gap-4">
                <div className="p-4 rounded-full bg-red-100 text-red-600 shadow-sm border border-red-200">
                    <AlertTriangle size={32} />
                </div>
                <h1 className="text-xl font-bold text-gray-800">שגיאה</h1>
                <p className="text-gray-600 max-w-sm">{error}</p>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#eff6ff] to-[#eef2ff] flex items-center justify-center p-6" dir="rtl">
                <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl shadow-blue-900/5 border border-white relative overflow-hidden text-center">

                    {/* Background decorations */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl -mx-20 -my-20"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-400/10 rounded-full blur-3xl -mx-20 -my-20"></div>

                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative mb-8 w-28 h-28">
                            <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-40"></div>
                            <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-200/50">
                                <CheckCircle size={50} className="text-white" strokeWidth={2} />
                            </div>
                        </div>

                        <h2 className="text-2xl font-bold text-gray-900 mb-3 tracking-wide">בקשת התזמון נשלחה!</h2>
                        <p className="text-gray-500 text-base mb-8 max-w-[280px] mx-auto leading-relaxed">
                            ההודעה הועברה למנהל המערכת לאירוע <strong className="text-gray-800 font-semibold">"{sendingList?.name}"</strong> ותפורסם מיד עם אישורה.
                        </p>

                        <button
                            onClick={() => window.location.reload()}
                            className="bg-gray-50 hover:bg-gray-100 text-gray-600 px-6 py-3 rounded-xl font-medium transition-colors text-sm"
                        >
                            שלח בקשה נוספת
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans selection:bg-violet-100 selection:text-violet-900" dir="rtl">
            <div className="h-48 w-full bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 absolute top-0 left-0 z-0 overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            </div>

            <div className="relative z-10 max-w-xl mx-auto pt-12 pb-24 px-4 sm:px-6">

                {/* Header */}
                <div className="mb-8 text-center sm:text-right text-white">
                    <div className="inline-flex items-center justify-center sm:justify-start gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-4 py-1.5 mb-4 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        <span className="text-xs font-medium tracking-wide">טופס תזמון תוכן ללקוחות</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2 drop-shadow-sm">בקשת שליחה הודעה</h1>
                    <p className="text-violet-100 text-lg opacity-90 max-w-md">הצע תוכן ותזמון לרשימת התפוצה: <strong className="font-bold text-white">{sendingList?.name}</strong></p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-3xl shadow-xl shadow-indigo-900/5 p-6 sm:p-8 border border-gray-100">
                    <form onSubmit={handleSubmit} className="space-y-8">

                        {/* Time Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                        <Clock size={16} />
                                    </div>
                                    מתי לשלוח את ההודעה?
                                </h3>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700 block">תאריך</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                                            <Calendar size={16} />
                                        </div>
                                        <input
                                            type="date"
                                            required
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full pl-3 pr-10 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none bg-gray-50/50 hover:bg-white transition-colors text-sm font-medium text-gray-800"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700 block">שעה</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                                            <Clock size={16} />
                                        </div>
                                        <input
                                            type="time"
                                            required
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                            className="w-full pl-3 pr-10 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none bg-gray-50/50 hover:bg-white transition-colors text-sm font-medium text-gray-800"
                                        />
                                    </div>
                                </div>
                            </div>
                            <p className="text-[11px] text-gray-400">השליחה תתבצע רק לאחר אישור מנהל הקהילה.</p>
                        </div>

                        {/* Content Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center">
                                        <MessageSquare size={16} />
                                    </div>
                                    מה נשלח?
                                </h3>
                            </div>

                            <div className="space-y-2 relative">
                                <label className="text-sm font-medium text-gray-700 block">תוכן ההודעה</label>
                                <textarea
                                    required
                                    rows={5}
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    placeholder="כתוב כאן את הודעת הווצאפ שתרצה לשלוח לקבוצה..."
                                    className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none bg-gray-50/50 hover:bg-white transition-colors text-sm resize-none"
                                />
                                <div className="absolute bottom-4 left-4 text-xs font-medium text-gray-300 pointer-events-none">
                                    {messageText.length} תווים
                                </div>
                            </div>

                            <div className="space-y-3 pt-2">
                                <label className="text-sm font-medium text-gray-700 block mb-1">
                                    מדיה מצורפת (אופציונלי)
                                    <span className="text-xs font-normal text-gray-400 block mt-0.5">תמונה או סרטון קצר המלווה להודעה</span>
                                </label>

                                {!mediaFile ? (
                                    <div
                                        className="border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 hover:bg-gray-100/50 transition-colors p-6 flex flex-col items-center justify-center cursor-pointer group"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-3 group-hover:scale-105 transition-transform text-violet-500">
                                            <UploadCloud size={24} />
                                        </div>
                                        <span className="text-sm font-medium text-gray-600 mb-1">לחץ להעלאת קובץ</span>
                                        <span className="text-xs text-gray-400">PNG, JPG או MP4 עד 20MB</span>
                                    </div>
                                ) : (
                                    <div className="relative border border-gray-200 rounded-xl bg-gray-50/50 p-4 flex items-start gap-4">
                                        {mediaPreview ? (
                                            <div className="w-16 h-16 rounded-lg bg-gray-200 overflow-hidden shrink-0 border border-black/5 shadow-sm">
                                                <img src={mediaPreview} alt="Preview" className="w-full h-full object-cover" />
                                            </div>
                                        ) : (
                                            <div className="w-16 h-16 rounded-lg bg-indigo-50 text-indigo-500 shrink-0 border border-indigo-100 flex items-center justify-center">
                                                <ImageIcon size={24} />
                                            </div>
                                        )}

                                        <div className="flex-1 min-w-0 pt-1">
                                            <p className="text-sm font-medium text-gray-800 truncate mb-1" dir="ltr">{mediaFile.name}</p>
                                            <p className="text-xs text-gray-500 mb-2">{(mediaFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                                            <button
                                                type="button"
                                                onClick={handleRemoveFile}
                                                className="text-xs font-medium text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                                            >
                                                הסר קובץ
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <input
                                    type="file"
                                    accept="image/*,video/*"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3.5 bg-red-50 border border-red-100 text-red-800 text-sm rounded-xl flex items-center gap-3">
                                <AlertTriangle size={18} className="shrink-0 text-red-500" />
                                <span className="font-medium">{error}</span>
                            </div>
                        )}

                        <div className="pt-6 border-t border-gray-100">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-violet-600/30 flex justify-center items-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        מעבד בקשה...
                                    </>
                                ) : (
                                    <>
                                        שלח בקשה לאישור
                                        <Send size={18} className="rotate-180" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="text-center mt-8 space-y-2">
                    <p className="text-sm font-medium text-gray-400">מופעל על ידי Patifon Events Management</p>
                </div>
            </div>
        </div>
    );
}
