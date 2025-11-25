"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Calendar, CheckSquare, Settings, Filter, Edit2, Trash2, Check, X, MessageCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, collectionGroup, deleteDoc, updateDoc, doc } from "firebase/firestore";
import TaskChat from "@/components/TaskChat";

import TaskCard from "@/components/TaskCard";

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
  description?: string;
  assignee: string;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK";
  dueDate: string;
  priority: "NORMAL" | "HIGH" | "CRITICAL";
  eventId: string;
  eventTitle: string;
  lastMessageTime?: any;
  lastMessageBy?: string;
  readBy?: Record<string, boolean>;
  currentStatus?: string;
  nextStep?: string;
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
  const [sortBy, setSortBy] = useState<string>("none");

  // Edit/Delete State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // State for editing status/next step
  const [editingStatusTask, setEditingStatusTask] = useState<Task | null>(null);
  const [editingDateTask, setEditingDateTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Chat State
  const [chatTask, setChatTask] = useState<Task | null>(null);

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
                priority: (taskData.priority as "NORMAL" | "HIGH" | "CRITICAL") || "NORMAL",
                assignee: taskData.assignee,
                status: (taskData.status as "TODO" | "IN_PROGRESS" | "DONE" | "STUCK") || "TODO",
                eventId: eventId,
                eventTitle: event?.title || "אירוע לא ידוע",
                currentStatus: taskData.currentStatus || "",
                nextStep: taskData.nextStep || "",
              } as Task);
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

  // Filter and sort tasks
  let filteredTasks = myTasks.filter(task => {
    if (filterEvent !== "all" && task.eventId !== filterEvent) return false;
    return true;
  });

  // Apply sorting
  if (sortBy !== "none") {
    filteredTasks = [...filteredTasks].sort((a, b) => {
      switch (sortBy) {
        case "deadline":
          // Sort by deadline (closest first)
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();

        case "priority":
          // Sort by priority (CRITICAL > HIGH > NORMAL)
          const priorityOrder = { CRITICAL: 0, HIGH: 1, NORMAL: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];

        case "status":
          // Sort by status (STUCK > IN_PROGRESS > TODO > DONE)
          const statusOrder = { STUCK: 0, IN_PROGRESS: 1, TODO: 2, DONE: 3 };
          return statusOrder[a.status] - statusOrder[b.status];

        case "eventDate":
          // Sort by event start time (we need to get this from events array)
          const eventA = events.find(e => e.id === a.eventId);
          const eventB = events.find(e => e.id === b.eventId);
          if (!eventA?.startTime) return 1;
          if (!eventB?.startTime) return -1;
          return eventA.startTime.seconds - eventB.startTime.seconds;

        case "created":
          // Sort by creation date (newest first) - we don't have this field, so skip
          return 0;

        default:
          return 0;
      }
    });
  }

  const handleUpdateTask = async (e: React.FormEvent) => {
    // existing update logic for full task edit
    e.preventDefault();
    if (!db || !editingTask) return;
    try {
      const taskRef = doc(db, "events", editingTask.eventId, "tasks", editingTask.id);
      await updateDoc(taskRef, {
        title: editingTask.title,
        dueDate: editingTask.dueDate,
        priority: editingTask.priority,
        currentStatus: editingTask.currentStatus || "",
        nextStep: editingTask.nextStep || "",
      });
      setMyTasks(prev => prev.map(t => t.id === editingTask.id ? editingTask : t));
      setEditingTask(null);
    } catch (err) {
      console.error("Error updating task:", err);
      alert("שגיאה בעדכון המשימה");
    }
  };


  const handleDeleteTask = async () => {
    if (!db || !deletingTaskId) return;

    const taskToDelete = myTasks.find(t => t.id === deletingTaskId);
    if (!taskToDelete) return;

    try {
      const taskRef = doc(db, "events", taskToDelete.eventId, "tasks", deletingTaskId);
      await deleteDoc(taskRef);

      // Update local state
      setMyTasks(prev => prev.filter(t => t.id !== deletingTaskId));
      setDeletingTaskId(null);
    } catch (err) {
      console.error("Error deleting task:", err);
      alert("שגיאה במחיקת המשימה");
    }
  };

  const handleCompleteTask = async (task: Task) => {
    if (!db) return;

    try {
      const taskRef = doc(db, "events", task.eventId, "tasks", task.id);
      await updateDoc(taskRef, {
        status: "DONE"
      });

      // Remove from local state (since we filter out DONE tasks)
      setMyTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (err) {
      console.error("Error completing task:", err);
      alert("שגיאה בסיום המשימה");
    }
  };

  if (loading) return <div className="p-8 text-center">טוען...</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--patifon-cream)' }}>
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--patifon-burgundy)' }}>שלום, {user.displayName || user.email}</h1>
          <p style={{ color: 'var(--patifon-red)' }}>ברוך הבא למערכת ניהול האירועים של פטיפון</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="px-4 py-2 rounded-lg flex items-center gap-2 transition vinyl-shadow"
            style={{ background: 'white', color: 'var(--patifon-burgundy)', border: '2px solid var(--patifon-orange)' }}
          >
            <Settings size={20} />
            הגדרות
          </Link>
          <Link
            href="/events/new"
            className="patifon-gradient text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition vinyl-shadow"
          >
            <Plus size={20} />
            אירוע חדש
          </Link>
        </div>
      </header>

      {/* Task Chat Modal */}
      {chatTask && (
        <TaskChat
          eventId={chatTask.eventId}
          taskId={chatTask.id}
          taskTitle={chatTask.title}
          onClose={() => setChatTask(null)}
        />
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">עריכת משימה</h3>
              <button onClick={() => setEditingTask(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdateTask} className="space-y-4">
              {/* title, dueDate, priority fields as before */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">כותרת</label>
                <input type="text" required className="w-full p-2 border rounded-lg text-sm" value={editingTask.title} onChange={e => setEditingTask({ ...editingTask, title: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
                <input type="date" className="w-full p-2 border rounded-lg text-sm" value={editingTask.dueDate} onChange={e => setEditingTask({ ...editingTask, dueDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">עדיפות</label>
                <select className="w-full p-2 border rounded-lg text-sm" value={editingTask.priority} onChange={e => setEditingTask({ ...editingTask, priority: e.target.value as "NORMAL" | "HIGH" | "CRITICAL" })}>
                  <option value="NORMAL">רגיל</option>
                  <option value="HIGH">גבוה</option>
                  <option value="CRITICAL">דחוף</option>
                </select>
              </div>
              {/* New fields for status and next step */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">איפה זה עומד</label>
                <textarea className="w-full p-2 border rounded-lg text-sm" rows={2} placeholder="תאר את המצב הנוכחי..." value={editingTask.currentStatus || ""} onChange={e => setEditingTask({ ...editingTask, currentStatus: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הצעד הבא</label>
                <textarea className="w-full p-2 border rounded-lg text-sm" rows={2} placeholder="מה הצעד הבא..." value={editingTask.nextStep || ""} onChange={e => setEditingTask({ ...editingTask, nextStep: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setEditingTask(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">שמור שינויים</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Status Edit Modal */}
      {editingStatusTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">עריכת סטטוס משימה</h3>
              <button onClick={() => setEditingStatusTask(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!db || !editingStatusTask) return;
              try {
                const taskRef = doc(db, "events", editingStatusTask.eventId, "tasks", editingStatusTask.id);
                await updateDoc(taskRef, {
                  currentStatus: editingStatusTask.currentStatus || "",
                  nextStep: editingStatusTask.nextStep || "",
                  dueDate: editingStatusTask.dueDate,
                });
                setMyTasks(prev => prev.map(t => t.id === editingStatusTask.id ? editingStatusTask : t));
                setEditingStatusTask(null);
              } catch (err) {
                console.error("Error updating status:", err);
                alert("שגיאה בעדכון הסטטוס");
              }
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">איפה זה עומד</label>
                <textarea className="w-full p-2 border rounded-lg text-sm" rows={2} value={editingStatusTask.currentStatus || ""} onChange={e => setEditingStatusTask({ ...editingStatusTask, currentStatus: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הצעד הבא</label>
                <textarea className="w-full p-2 border rounded-lg text-sm" rows={2} value={editingStatusTask.nextStep || ""} onChange={e => setEditingStatusTask({ ...editingStatusTask, nextStep: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
                <input type="date" className="w-full p-2 border rounded-lg text-sm" value={editingStatusTask.dueDate} onChange={e => setEditingStatusTask({ ...editingStatusTask, dueDate: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setEditingStatusTask(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">שמור שינויים</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTaskId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">אישור מחיקה</h3>
            <p className="text-gray-600 mb-6">האם אתה בטוח שברצונך למחוק את המשימה?</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingTaskId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
              >
                ביטול
              </button>
              <button
                onClick={handleDeleteTask}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition shadow-sm"
              >
                מחק
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* My Tasks Section */}
        <div className="bg-white p-6 rounded-xl vinyl-shadow" style={{ border: '2px solid var(--patifon-cream-dark)' }}>
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare style={{ color: 'var(--patifon-red)' }} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>המשימות שלי</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--patifon-yellow)', color: 'var(--patifon-burgundy)' }}>
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
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="none">ללא מיון</option>
              <option value="deadline">📅 לפי דד ליין (קרוב לרחוק)</option>
              <option value="priority">⚠️ לפי עדיפות (דחוף → רגיל)</option>
              <option value="status">🔄 לפי סטטוס (תקוע → בתהליך)</option>
              <option value="eventDate">🎉 לפי תאריך האירוע</option>
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
              {filteredTasks.map((task) => {
                const hasUnread = task.lastMessageTime && (!task.readBy || !task.readBy[user?.uid || '']) && task.lastMessageBy !== user?.uid;
                return (
                  <TaskCard
                    key={task.id}
                    id={task.id}
                    title={task.title}
                    description={task.description}
                    assignee={task.assignee || "לא משויך"}
                    status={task.status}
                    dueDate={task.dueDate}
                    priority={task.priority}
                    currentStatus={task.currentStatus}
                    nextStep={task.nextStep}
                    eventId={task.eventId}
                    eventTitle={task.eventTitle}
                    onEdit={() => setEditingTask(task)}
                    onDelete={() => setDeletingTaskId(task.id)}
                    onStatusChange={async (newStatus) => {
                      if (newStatus === "DONE") {
                        handleCompleteTask(task);
                      } else {
                        // Update status for other transitions
                        if (!db) return;
                        try {
                          const taskRef = doc(db, "events", task.eventId, "tasks", task.id);
                          await updateDoc(taskRef, { status: newStatus });
                          setMyTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
                        } catch (err) {
                          console.error("Error updating status:", err);
                        }
                      }
                    }}
                    onChat={() => setChatTask(task)}
                    hasUnreadMessages={hasUnread}
                    onEditStatus={(t) => setEditingStatusTask({
                      ...t,
                      eventId: t.eventId || "",
                      eventTitle: t.eventTitle || ""
                    } as Task)}
                    onEditDate={(t) => setEditingDateTask({
                      ...t,
                      eventId: t.eventId || "",
                      eventTitle: t.eventTitle || ""
                    } as Task)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Active Events Section */}
        <div className="bg-white p-6 rounded-xl vinyl-shadow" style={{ border: '2px solid var(--patifon-cream-dark)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Calendar style={{ color: 'var(--patifon-orange)' }} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>אירועים פעילים</h2>
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

      {/* Date Edit Modal */}
      {editingDateTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">שינוי תאריך יעד</h3>
              <button onClick={() => setEditingDateTask(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!db || !editingDateTask) return;
              try {
                const taskRef = doc(db, "events", editingDateTask.eventId, "tasks", editingDateTask.id);
                await updateDoc(taskRef, {
                  dueDate: editingDateTask.dueDate,
                });
                setMyTasks(prev => prev.map(t => t.id === editingDateTask.id ? editingDateTask : t));
                setEditingDateTask(null);
              } catch (err) {
                console.error("Error updating date:", err);
                alert("שגיאה בעדכון התאריך");
              }
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
                <input
                  type="date"
                  className="w-full p-2 border rounded-lg text-sm"
                  value={editingDateTask.dueDate}
                  onChange={e => setEditingDateTask({ ...editingDateTask, dueDate: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setEditingDateTask(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">שמור</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
