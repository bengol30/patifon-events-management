"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowRight, Users, Calendar, MapPin } from "lucide-react";

interface Attendee {
    id: string;
    name: string;
    phone: string;
    email: string;
    createdAt?: any;
}

export default function RegistrantsPage() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();

    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [eventMeta, setEventMeta] = useState<{ title?: string; location?: string; startTime?: any } | null>(null);

    useEffect(() => {
        if (!db || !id) return;

        // Registrants via public register flow (primary)
        const unsubRegistrants = onSnapshot(
            query(collection(db, "events", id, "registrants"), orderBy("createdAt", "desc")),
            (snap) => {
                const regs: Attendee[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Attendee));
                setAttendees(regs);
            }
        );

        // Legacy attendees collection (fallback/merge)
        const unsubAttendees = onSnapshot(
            query(collection(db, "events", id, "attendees"), orderBy("createdAt", "desc")),
            (snap) => {
                const att: Attendee[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Attendee));
                setAttendees(prev => {
                    const seen = new Set<string>();
                    const merged: Attendee[] = [];
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

        // Event meta
        const unsubEvent = onSnapshot(doc(db, "events", id), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as any;
                setEventMeta({ title: data.title, location: data.location, startTime: data.startTime });
            }
        });

        return () => {
            unsubRegistrants();
            unsubAttendees();
            unsubEvent();
        };
    }, [id]);

    const eventDate = eventMeta?.startTime?.seconds ? new Date(eventMeta.startTime.seconds * 1000) : null;

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-2">
                    <Link href={`/events/${id}`} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition">
                        <ArrowRight size={16} />
                        חזרה לדף האירוע
                    </Link>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
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
                                    <Users size={14} /> {attendees.length} נרשמים
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => router.push(`/events/${id}/register`)}
                            className="px-4 py-2 rounded-lg text-sm font-semibold text-white patifon-gradient hover:opacity-90 transition"
                        >
                            פתח טופס הרשמה
                        </button>
                    </div>

                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                            <thead className="bg-gray-50">
                                <tr className="text-right text-gray-600">
                                    <th className="px-4 py-3 font-semibold">שם</th>
                                    <th className="px-4 py-3 font-semibold">טלפון</th>
                                    <th className="px-4 py-3 font-semibold">אימייל</th>
                                    <th className="px-4 py-3 font-semibold">נרשם ב־</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {attendees.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="text-center py-6 text-gray-500">עדיין אין נרשמים</td>
                                    </tr>
                                ) : (
                                    attendees.map((att) => (
                                        <tr key={att.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-900">{att.name}</td>
                                            <td className="px-4 py-3 text-gray-700">{att.phone}</td>
                                            <td className="px-4 py-3 text-gray-700">{att.email}</td>
                                            <td className="px-4 py-3 text-gray-500">
                                                {att.createdAt?.seconds
                                                    ? new Date(att.createdAt.seconds * 1000).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })
                                                    : "-"}
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
