"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Calendar, CheckSquare, Settings, Filter } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, collectionGroup } from "firebase/firestore";

interface Event {
  id: string;
  title: string;
  location: string;
  startTime: any;
  status: string;
}

interface Task {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  assignee: string;
  status: string;
  eventId: string;
  eventTitle: string;
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // My Tasks State
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Filter State
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!db || !user) {
        setLoadingEvents(false);
        setLoadingTasks(false);
        return;
      }

      try {
        // Fetch Events
        const eventsRef = collection(db, "events");
        const qEvents = query(
          eventsRef,
          where("members", "array-contains", user.uid),
          orderBy("createdAt", "desc")
        );
        const eventsSnapshot = await getDocs(qEvents);
        const eventsData = eventsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Event[];
        setEvents(eventsData);

        // Fetch My Tasks (using Collection Group Query)
        // Note: This requires a composite index in Firestore if we filter by multiple fields
        // For now, we'll fetch all tasks and filter in client to match assignee name flexibly
        const tasksQuery = query(collectionGroup(db, "tasks"));
        const tasksSnapshot = await getDocs(tasksQuery);

        const userTasks: Task[] = [];
        const userName = user.displayName || "";
        const userEmail = user.email || "";

        tasksSnapshot.forEach(doc => {
          const taskData = doc.data();
          // Check if task is assigned to user (by name or email) and not done
          if (taskData.status !== 'DONE' && taskData.assignee) {
            const assignee = taskData.assignee.toLowerCase();
            if (
              (userName && assignee.includes(userName.toLowerCase())) ||
              (userEmail && assignee.includes(userEmail.split('@')[0].toLowerCase())) ||
              assignee === "אני" // Handle explicit "Me" assignment if used
            ) {
              // Get event ID from the document path
              const eventId = doc.ref.parent.parent?.id || "";
              const event = eventsData.find(e => e.id === eventId);

              userTasks.push({
                id: doc.id,
                title: taskData.title,
                dueDate: taskData.dueDate,
                priority: taskData.priority,
                assignee: taskData.assignee,
                status: taskData.status,
                eventId: eventId,
                eventTitle: event?.title || "אירוע לא ידוע"
              });
            }
          }
        });

        setMyTasks(userTasks);

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoadingEvents(false);
        setLoadingTasks(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);

  // Filter tasks based on selected filters
  const filteredTasks = myTasks.filter(task => {
    if (filterEvent !== "all" && task.eventId !== filterEvent) return false;
    if (filterPriority !== "all" && task.priority !== filterPriority) return false;
    return true;
  });

  if (loading) return <div className="p-8 text-center">טוען...</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">שלום, {user.displayName || user.email}</h1>
          <p className="text-gray-500">ברוך הבא למערכת ניהול האירועים של פטיפון</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50 transition"
          >
            <Settings size={20} />
            הגדרות
          </Link>
          <Link
            href="/events/new"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition"
          >
            <Plus size={20} />
            אירוע חדש
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* My Tasks Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare className="text-indigo-600" />
            <h2 className="text-xl font-semibold">המשימות שלי</h2>
            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">
              {filteredTasks.length}
            </span>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <select
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">כל האירועים</option>
                {events.map(event => (
                  <option key={event.id} value={event.id}>{event.title}</option>
                ))}
              </select>
            </div>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">כל העדיפויות</option>
              <option value="CRITICAL">דחוף</option>
              <option value="HIGH">גבוה</option>
              <option value="NORMAL">רגיל</option>
            </select>
          </div>

          {loadingTasks ? (
            <div className="text-gray-500 text-center py-8">טוען משימות...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              {myTasks.length === 0 ? "אין משימות פתוחות כרגע." : "אין משימות התואמות לסינון."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => (
                <Link
                  key={task.id}
                  href={`/events/${task.eventId}`}
                  className="block p-3 border border-gray-100 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{task.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-indigo-600 font-medium">
                          📅 {task.eventTitle}
                        </span>
                        {task.dueDate && (
                          <span className="text-xs text-gray-500">
                            • עד {new Date(task.dueDate).toLocaleDateString('he-IL')}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${task.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                        task.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                      }`}>
                      {task.priority === 'CRITICAL' ? 'דחוף' : task.priority === 'HIGH' ? 'גבוה' : 'רגיל'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Active Events Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="text-indigo-600" />
            <h2 className="text-xl font-semibold">אירועים פעילים</h2>
          </div>
          {loadingEvents ? (
            <div className="text-gray-500 text-center py-8">טוען אירועים...</div>
          ) : events.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              אין אירועים פעילים.
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                >
                  <h3 className="font-semibold text-gray-900">{event.title}</h3>
                  <p className="text-sm text-gray-500">{event.location}</p>
                  <span className="inline-block mt-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                    {event.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
