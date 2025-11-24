"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Calendar, CheckSquare, Settings } from "lucide-react";
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
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // My Tasks State
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

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
              userTasks.push({
                id: doc.id,
                title: taskData.title,
                dueDate: taskData.dueDate,
                priority: taskData.priority,
                assignee: taskData.assignee,
                status: taskData.status
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
        {/* My Tasks Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare className="text-indigo-600" />
            <h2 className="text-xl font-semibold">המשימות שלי</h2>
          </div>
          {loadingTasks ? (
            <div className="text-gray-500 text-center py-8">טוען משימות...</div>
          ) : myTasks.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              אין משימות פתוחות כרגע.
            </div>
          ) : (
            <div className="space-y-3">
              {myTasks.map((task) => (
                <div key={task.id} className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-gray-900">{task.title}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {task.dueDate ? `עד לתאריך: ${task.dueDate}` : "ללא תאריך יעד"}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${task.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                      task.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                      {task.priority === 'CRITICAL' ? 'דחוף' : task.priority === 'HIGH' ? 'גבוה' : 'רגיל'}
                    </span>
                  </div>
                </div>
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
