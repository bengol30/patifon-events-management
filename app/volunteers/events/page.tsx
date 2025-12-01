"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Calendar, MapPin, Users, Handshake, Clock, Target, AlertCircle, ArrowRight } from "lucide-react";

interface Task {
    id: string;
    title: string;
    description?: string;
    status: string;
    priority: string;
    dueDate?: string;
    isVolunteerTask?: boolean;
}

interface EventData {
    id: string;
    title: string;
    location: string;
    startTime?: any;
    description?: string;
    needsVolunteers?: boolean;
    volunteersCount?: number | null;
    tasks?: Task[];
}

export default function VolunteerEventsPage() {
    const [events, setEvents] = useState<EventData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchEvents = async () => {
            if (!db) return;
            try {
                // Fetch all events that need volunteers
                const eventsQuery = query(
                    collection(db, "events"),
                    where("needsVolunteers", "==", true)
                );
                const eventsSnap = await getDocs(eventsQuery);
                
                const eventsData: EventData[] = [];
                
                for (const eventDoc of eventsSnap.docs) {
                    const eventData = eventDoc.data() as EventData;
                    
                    // Fetch tasks for this event - only volunteer tasks
                    const tasksQuery = query(collection(db, "events", eventDoc.id, "tasks"));
                    const tasksSnap = await getDocs(tasksQuery);
                    const tasks: Task[] = [];
                    tasksSnap.forEach((taskDoc) => {
                        const taskData = { id: taskDoc.id, ...taskDoc.data() } as Task;
                        // Only include tasks marked as volunteer tasks
                        if (taskData.isVolunteerTask) {
                            tasks.push(taskData);
                        }
                    });
                    
                    eventsData.push({
                        ...eventData,
                        id: eventDoc.id,
                        tasks: tasks,
                    });
                }
                
                setEvents(eventsData);
            } catch (err) {
                console.error("Error loading events", err);
                setError("שגיאה בטעינת האירועים");
            } finally {
                setLoading(false);
            }
        };
        fetchEvents();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center gap-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                    <AlertCircle />
                </div>
                <p className="text-red-600 font-semibold">{error}</p>
                <Link href="/" className="text-indigo-600 hover:underline">חזרה לדף הבית</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#fff7ed] via-white to-[#f5f3ff] p-6">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl border border-orange-100 p-6 md:p-8 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-indigo-100 rounded-full">
                            <Handshake className="text-indigo-600" size={24} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">אירועים ומשימות פתוחות למתנדבים</h1>
                            <p className="text-gray-600 mt-1">הרשמו לאירועים ובחרו משימות שתרצו לקחת עליכם אחריות</p>
                        </div>
                    </div>
                    
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                        <h2 className="font-semibold text-indigo-900 mb-2">איך זה עובד?</h2>
                        <ul className="text-sm text-indigo-800 space-y-1 list-disc list-inside">
                            <li>תוכלו להרשם לכל אירוע שפתוח למתנדבים</li>
                            <li>בחרו משימות שתרצו לקחת עליכם אחריות</li>
                            <li>כל משימה כוללת תיאור ותאריך יעד (דד ליין)</li>
                            <li>ניתן להרשם למספר אירועים ולבחור מספר משימות</li>
                        </ul>
                    </div>
                </div>

                {events.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center">
                        <Handshake className="mx-auto mb-4 text-gray-400" size={48} />
                        <h2 className="text-xl font-bold text-gray-900 mb-2">אין אירועים פתוחים כרגע</h2>
                        <p className="text-gray-600">נבדוק שוב בקרוב לאירועים חדשים!</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {events.map((event) => {
                            const eventDate = event.startTime?.seconds ? new Date(event.startTime.seconds * 1000) : null;
                            const hasTasks = event.tasks && event.tasks.length > 0;
                            
                            return (
                                <div key={event.id} className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                                    {/* Event Header */}
                                    <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-6 text-white">
                                        <h2 className="text-2xl font-bold mb-3">{event.title}</h2>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                            {event.location && (
                                                <div className="flex items-center gap-2">
                                                    <MapPin size={16} />
                                                    <span>{event.location}</span>
                                                </div>
                                            )}
                                            {eventDate && (
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={16} />
                                                    <span>
                                                        {eventDate.toLocaleDateString("he-IL", { 
                                                            weekday: "long", 
                                                            day: "2-digit", 
                                                            month: "long",
                                                            year: "numeric"
                                                        })} • {eventDate.toLocaleTimeString("he-IL", { 
                                                            hour: "2-digit", 
                                                            minute: "2-digit" 
                                                        })}
                                                    </span>
                                                </div>
                                            )}
                                            {event.volunteersCount && (
                                                <div className="flex items-center gap-2">
                                                    <Users size={16} />
                                                    <span>מקומות למתנדבים: {event.volunteersCount}</span>
                                                </div>
                                            )}
                                        </div>
                                        {event.description && (
                                            <p className="text-sm text-indigo-100 mt-3 leading-relaxed">{event.description}</p>
                                        )}
                                    </div>

                                    {/* Tasks Section */}
                                    <div className="p-6">
                                        {hasTasks ? (
                                            <>
                                                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                    <Target size={20} className="text-indigo-600" />
                                                    משימות זמינות
                                                </h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                                                    {event.tasks!.map((task) => {
                                                        const taskDate = task.dueDate ? new Date(task.dueDate) : null;
                                                        return (
                                                            <div
                                                                key={task.id}
                                                                className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-md transition"
                                                            >
                                                                <h4 className="font-semibold text-sm text-gray-900 mb-2">{task.title}</h4>
                                                                {task.description && (
                                                                    <p className="text-xs text-gray-600 mb-3 line-clamp-2">{task.description}</p>
                                                                )}
                                                                {taskDate && (
                                                                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                                                                        <Clock size={12} />
                                                                        <span>דד ליין: {taskDate.toLocaleDateString("he-IL", { 
                                                                            day: "2-digit", 
                                                                            month: "2-digit", 
                                                                            year: "numeric" 
                                                                        })}</span>
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                                                        task.priority === "CRITICAL" ? "bg-red-100 text-red-700" :
                                                                        task.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                                                                        "bg-gray-100 text-gray-700"
                                                                    }`}>
                                                                        {task.priority === "CRITICAL" ? "קריטי" :
                                                                         task.priority === "HIGH" ? "גבוה" : "רגיל"}
                                                                    </span>
                                                                    <span className="text-xs text-gray-500">
                                                                        {task.status === "DONE" ? "הושלם" :
                                                                         task.status === "IN_PROGRESS" ? "בביצוע" :
                                                                         task.status === "STUCK" ? "תקוע" : "לעשות"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500 text-sm mb-6">
                                                אין משימות זמינות כרגע לאירוע זה
                                            </div>
                                        )}
                                        
                                        {/* Register Button */}
                                        <Link
                                            href={`/events/${event.id}/volunteers/register`}
                                            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
                                        >
                                            <ArrowRight size={16} />
                                            הרשמה כמתנדב לאירוע זה
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

