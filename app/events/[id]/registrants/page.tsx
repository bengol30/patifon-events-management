"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowRight, Users, Calendar, MapPin, Download } from "lucide-react";

interface FormField {
    id: string;
    label: string;
    type: "text" | "tel" | "email" | "number" | "select" | "textarea" | "checkbox";
    required: boolean;
    placeholder?: string;
    options?: string[];
}

const DEFAULT_FORM_SCHEMA: FormField[] = [
    { id: "name", label: "שם", type: "text", required: true },
    { id: "phone", label: "טלפון", type: "tel", required: true },
    { id: "email", label: "אימייל", type: "email", required: true },
];

interface Registrant {
    id: string;
    [key: string]: any;
}

export default function RegistrantsPage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();

    const [registrants, setRegistrants] = useState<Registrant[]>([]);
    const [eventMeta, setEventMeta] = useState<{ title?: string; location?: string; startTime?: any; formSchema?: FormField[] } | null>(null);

    useEffect(() => {
        if (!db || !id) return;

        // Registrants via public register flow (primary)
        const unsubRegistrants = onSnapshot(
            query(collection(db, "events", id, "registrants"), orderBy("createdAt", "desc")),
            (snap) => {
                const regs: Registrant[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                setRegistrants(regs);
            }
        );

        // Legacy attendees collection (fallback/merge)
        const unsubAttendees = onSnapshot(
            query(collection(db, "events", id, "attendees"), orderBy("createdAt", "desc")),
            (snap) => {
                const att: Registrant[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                setRegistrants(prev => {
                    const seen = new Set<string>();
                    const merged: Registrant[] = [];
                    [...att, ...prev].forEach(a => {
                        const key = a.id || `${a.name}-${a.phone}-${a.email}`;
                        if (seen.has(key)) return;
                        seen.add(key);
                        merged.push(a);
                    });
                    merged.sort((a, b) => {
                        const ta = a.createdAt?.seconds ? a.createdAt.seconds : 0;
                        const tb = b.createdAt?.seconds ? b.createdAt.seconds : 0;
                        return tb - ta;
                    });
                    return merged;
                });
            }
        );

        // Event meta including formSchema
        const unsubEvent = onSnapshot(doc(db, "events", id), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as any;
                setEventMeta({
                    title: data.title,
                    location: data.location,
                    startTime: data.startTime,
                    formSchema: data.formSchema,
                });
            }
        });

        return () => {
            unsubRegistrants();
            unsubAttendees();
            unsubEvent();
        };
    }, [id]);

    const formSchema: FormField[] = (eventMeta?.formSchema && eventMeta.formSchema.length > 0)
        ? eventMeta.formSchema
        : DEFAULT_FORM_SCHEMA;

    const eventDate = eventMeta?.startTime?.seconds ? new Date(eventMeta.startTime.seconds * 1000) : null;

    const getCellValue = (registrant: Registrant, field: FormField): string => {
        const val = registrant[field.id];
        if (val === undefined || val === null) return "—";
        if (field.type === "checkbox") return val ? "✓" : "✗";
        return String(val);
    };

    const handleExportCSV = () => {
        const headers = [...formSchema.map(f => f.label), "תאריך הרשמה"];
        const rows = registrants.map(r => {
            const cells = formSchema.map(field => {
                const val = getCellValue(r, field);
                return `"${val.replace(/"/g, '""')}"`;
            });
            const dateStr = r.createdAt?.seconds
                ? new Date(r.createdAt.seconds * 1000).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })
                : "";
            cells.push(`"${dateStr}"`);
            return cells.join(",");
        });
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `נרשמים_${eventMeta?.title || id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center gap-2">
                    <Link href={`/events/${id}`} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition">
                        <ArrowRight size={16} />
                        חזרה לדף האירוע
                    </Link>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-indigo-500 font-semibold">נרשמים</p>
                            <h1 className="text-2xl font-bold text-gray-900">{eventMeta?.title || "נרשמים לאירוע"}</h1>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mt-2">
                                {eventMeta?.location && (
                                    <span className="flex items-center gap-1"><MapPin size={14} /> {eventMeta.location}</span>
                                )}
                                {eventDate && (
                                    <span className="flex items-center gap-1"><Calendar size={14} /> {eventDate.toLocaleDateString("he-IL")} • {eventDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
                                )}
                                <span className="flex items-center gap-1 font-semibold text-indigo-600">
                                    <Users size={14} /> {registrants.length} נרשמים
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {registrants.length > 0 && (
                                <button
                                    onClick={handleExportCSV}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
                                >
                                    <Download size={15} />
                                    ייצוא CSV
                                </button>
                            )}
                            <button
                                onClick={() => router.push(`/events/${id}/register`)}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-white patifon-gradient hover:opacity-90 transition"
                            >
                                פתח טופס הרשמה
                            </button>
                        </div>
                    </div>

                    {registrants.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <Users size={36} className="mx-auto mb-3 opacity-30" />
                            <p className="font-medium">עדיין אין נרשמים לאירוע זה</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-gray-100 rounded-xl">
                            <table className="min-w-full divide-y divide-gray-100 text-sm">
                                <thead className="bg-gray-50">
                                    <tr className="text-right text-gray-600">
                                        <th className="px-4 py-3 font-semibold text-gray-500">#</th>
                                        {formSchema.map(field => (
                                            <th key={field.id} className="px-4 py-3 font-semibold whitespace-nowrap">
                                                {field.label}
                                            </th>
                                        ))}
                                        <th className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">נרשם ב</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {registrants.map((r, idx) => (
                                        <tr key={r.id} className="hover:bg-gray-50 transition">
                                            <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                                            {formSchema.map(field => (
                                                <td key={field.id} className="px-4 py-3 text-gray-800">
                                                    {field.type === "checkbox" ? (
                                                        <span className={r[field.id] ? "text-emerald-600 font-bold" : "text-gray-400"}>
                                                            {r[field.id] ? "✓" : "✗"}
                                                        </span>
                                                    ) : (
                                                        <span className="block max-w-[200px] truncate" title={String(r[field.id] ?? "")}>
                                                            {r[field.id] ?? <span className="text-gray-300">—</span>}
                                                        </span>
                                                    )}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                                                {r.createdAt?.seconds
                                                    ? new Date(r.createdAt.seconds * 1000).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })
                                                    : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
