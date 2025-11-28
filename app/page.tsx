"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Calendar, CheckSquare, Settings, Filter, Edit2, Trash2, Check, X, MessageCircle, LogOut, MapPin, Users, Clock, UserPlus, BarChart3, UserCircle2, Bell } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, collectionGroup, deleteDoc, updateDoc, doc, getDoc, arrayUnion, setDoc, serverTimestamp } from "firebase/firestore";
import TaskChat from "@/components/TaskChat";

import TaskCard from "@/components/TaskCard";
import { signOut } from "firebase/auth";

interface Event {
  id: string;
  title: string;
  location: string;
  startTime: any;
  status: string;
  participantsCount?: string;
  createdBy?: string;
  createdByEmail?: string;
  partners?: string | string[];
  members?: string[];
  team?: { name: string; role: string; email?: string; userId?: string }[];
}

interface JoinRequest {
  id: string;
  eventId: string;
  eventTitle?: string;
  requesterId?: string;
  requesterName?: string;
  requesterEmail?: string;
  ownerId?: string;
  ownerEmail?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface Task {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  assigneeId?: string;
  assignees?: { name: string; userId?: string; email?: string }[];
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
  lastMessageText?: string;
  lastMessageMentions?: { name?: string; userId?: string; email?: string }[];
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // My Tasks State
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Stats State
  const [stats, setStats] = useState({ myEvents: 0, attendees: 0, partners: 0, tasks: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [activePanel, setActivePanel] = useState<"stats" | "users" | "notifications" | null>("stats");
  const [usersList, setUsersList] = useState<{ id: string; fullName?: string; email?: string; role?: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userEventsMap, setUserEventsMap] = useState<Record<string, Event[]>>({});
  const [openUserEventsId, setOpenUserEventsId] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<Record<string, "PENDING" | "APPROVED" | "REJECTED">>({});
  const [incomingJoinRequests, setIncomingJoinRequests] = useState<JoinRequest[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [notificationTasks, setNotificationTasks] = useState<Task[]>([]);
  const [deleteEventRemoveTasks, setDeleteEventRemoveTasks] = useState(false);

  // Filter State
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("none");

  // Edit/Delete State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // State for editing status/next step
  const [editingStatusTask, setEditingStatusTask] = useState<Task | null>(null);
  const [editingDateTask, setEditingDateTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [confirmingEventId, setConfirmingEventId] = useState<string | null>(null);

  // Chat State
  const [chatTask, setChatTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const toPartnerArray = (raw: any): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(p => (p || "").toString().trim()).filter(Boolean);
    if (typeof raw === "string") return raw.split(/[,\n]/).map(p => p.trim()).filter(Boolean);
    return [];
  };

  const isEventActive = (event: Event) => {
    const statusLower = (event.status || "").toString().toLowerCase();
    if (["done", "cancelled", "canceled", "בוטל"].includes(statusLower)) return false;
    return true;
  };

  const normalizeKey = (val?: string | null) => (val || "").toString().trim().toLowerCase();

  // Onboarding gate: new users must complete profile
  useEffect(() => {
    const checkOnboarding = async () => {
      if (!db || !user) return;
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists() || !userDoc.data()?.onboarded) {
          router.push("/onboarding");
        }
      } catch (err) {
        console.error("Error checking onboarding:", err);
      }
    };
    checkOnboarding();
  }, [user]);

  // Refresh notifications (messages/join requests) when panel opens
  useEffect(() => {
    const fetchNotificationTasks = async () => {
      if (!db || !user || activePanel !== "notifications") return;
      try {
        setLoadingNotifications(true);
        const tasksSnapshot = await getDocs(collectionGroup(db, "tasks"));
        const notif: Task[] = [];
        const userName = user.displayName || "";
        const userEmail = user.email || "";
        const currentUid = user.uid;
        const eventLookup = new Map(events.map(e => [e.id, e]));

        tasksSnapshot.forEach(docSnap => {
          const taskData = docSnap.data();
          const eventId = docSnap.ref.parent.parent?.id || "";
          const event = eventLookup.get(eventId);

          const assigneeStr = (taskData.assignee || "").toLowerCase();
          const assigneeId = taskData.assigneeId as string | undefined;
          const assigneesArr = (taskData.assignees as { name: string; userId?: string; email?: string }[] | undefined) ||
            (taskData.assignee ? [{ name: taskData.assignee, userId: taskData.assigneeId, email: (taskData as any).assigneeEmail }] : []);
          const mentionsArr = (taskData.lastMessageMentions as { name?: string; userId?: string; email?: string }[] | undefined) || [];
          const isAssigned =
            (assigneeId && assigneeId === currentUid) ||
            assigneesArr.some(a => a.userId && a.userId === currentUid) ||
            assigneesArr.some(a => a.email && userEmail && a.email.toLowerCase() === userEmail.toLowerCase()) ||
            (assigneeStr && (
              (userName && assigneeStr.includes(userName.toLowerCase())) ||
              (userEmail && assigneeStr.includes(userEmail.split('@')[0].toLowerCase())) ||
              assigneeStr === "אני"
            )) ||
            assigneesArr.some(a => {
              const nameLower = (a.name || "").toLowerCase();
              return (userName && nameLower.includes(userName.toLowerCase())) ||
                (userEmail && nameLower.includes(userEmail.split('@')[0].toLowerCase())) ||
                nameLower === "אני";
            });

          const isMentioned = mentionsArr.some(m =>
            (m.userId && m.userId === currentUid) ||
            (m.email && userEmail && m.email.toLowerCase() === userEmail.toLowerCase())
          );

          if (isAssigned || isMentioned) {
            notif.push({
              id: docSnap.id,
              title: taskData.title,
              dueDate: taskData.dueDate,
              priority: (taskData.priority as "NORMAL" | "HIGH" | "CRITICAL") || "NORMAL",
              assignee: taskData.assignee,
              assigneeId,
              assignees: assigneesArr,
              status: (taskData.status as "TODO" | "IN_PROGRESS" | "DONE" | "STUCK") || "TODO",
              eventId: eventId,
              eventTitle: event?.title || taskData.eventTitle || "אירוע לא ידוע",
              currentStatus: taskData.currentStatus || "",
              nextStep: taskData.nextStep || "",
              lastMessageTime: taskData.lastMessageTime || null,
              lastMessageBy: taskData.lastMessageBy || "",
              readBy: taskData.readBy || {},
              lastMessageMentions: mentionsArr
            } as Task);
          }
        });
        setNotificationTasks(notif);
      } catch (err) {
        console.error("Error loading notification tasks:", err);
      } finally {
        setLoadingNotifications(false);
      }
    };
    fetchNotificationTasks();
  }, [activePanel, user, events, db]);

  useEffect(() => {
    const fetchData = async () => {
      if (!db || !user) {
        setLoadingEvents(false);
        setLoadingTasks(false);
        setLoadingStats(false);
        setLoadingUsers(false);
        setLoadingNotifications(false);
        return;
      }

      try {
        setLoadingStats(true);
        setLoadingUsers(true);
        setLoadingNotifications(true);
        setUsersError(null);
        // Fetch all events (for per-user stats)
        const allEventsSnapshot = await getDocs(query(collection(db, "events"), orderBy("createdAt", "desc")));
        const allEventsData = allEventsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Event[];
        const eventsByCreator: Record<string, Event[]> = {};
        const addToMap = (key: string | undefined | null, ev: Event) => {
          const normKey = normalizeKey(key);
          if (!normKey) return;
          if (!eventsByCreator[normKey]) eventsByCreator[normKey] = [];
          const exists = eventsByCreator[normKey].some(e => e.id === ev.id);
          if (!exists) eventsByCreator[normKey].push(ev);
        };
        allEventsData.forEach(ev => {
          addToMap(ev.createdBy, ev);
          addToMap(ev.createdByEmail, ev);
          const teamArr = (ev as any).team as { userId?: string; email?: string }[] | undefined;
          (teamArr || []).forEach(member => {
            addToMap(member.userId, ev);
            if (member.email) addToMap(member.email, ev);
          });
        });
        setUserEventsMap(eventsByCreator);

        // Fetch events relevant to current user
        const eventsForUser = allEventsData.filter(e =>
          (Array.isArray((e as any).members) && (e as any).members.includes(user.uid)) ||
          (e.createdByEmail && user.email && normalizeKey(e.createdByEmail) === normalizeKey(user.email)) ||
          (e.createdBy && e.createdBy === user.uid)
        );
        const sortedByDate = [...eventsForUser].sort((a, b) => {
          const aDate = a.startTime?.seconds ? a.startTime.seconds : 0;
          const bDate = b.startTime?.seconds ? b.startTime.seconds : 0;
          return aDate - bDate;
        });
        setEvents(sortedByDate);
        const myCreatedEvents = allEventsData.filter(e =>
          e.createdBy === user.uid ||
          (e.createdByEmail && user.email && normalizeKey(e.createdByEmail) === normalizeKey(user.email))
        );
        const myEventIds = new Set(myCreatedEvents.map(e => e.id));
        const uniquePartners = new Set<string>();
        myCreatedEvents.forEach(e => {
          toPartnerArray((e as any).partners).forEach(p => uniquePartners.add(p));
        });

        // Fetch My Tasks (using Collection Group Query)
        // Note: This requires a composite index in Firestore if we filter by multiple fields
        // For now, we'll fetch all tasks and filter in client to match assignee name flexibly
        const tasksQuery = query(collectionGroup(db, "tasks"));
        const tasksSnapshot = await getDocs(tasksQuery);

        const userTasks: Task[] = [];
        const notifTasks: Task[] = [];
        const userName = user.displayName || "";
        const userEmail = user.email || "";
        let tasksInMyEvents = 0;

        const eventLookup = new Map(allEventsData.map(e => [e.id, e]));

        tasksSnapshot.forEach(doc => {
          const taskData = doc.data();
          const eventId = doc.ref.parent.parent?.id || "";
          const event = eventLookup.get(eventId);
          if (!event) return;
          if (myEventIds.has(eventId)) {
            tasksInMyEvents += 1;
          }

          const assigneeStr = (taskData.assignee || "").toLowerCase();
          const assigneeId = taskData.assigneeId as string | undefined;
          const assigneesArr = (taskData.assignees as { name: string; userId?: string; email?: string }[] | undefined) ||
            (taskData.assignee ? [{ name: taskData.assignee, userId: taskData.assigneeId, email: (taskData as any).assigneeEmail }] : []);
          const mentionsArr = (taskData.lastMessageMentions as { name?: string; userId?: string; email?: string }[] | undefined) || [];
          const isAssigned =
            (assigneeId && assigneeId === user.uid) ||
            assigneesArr.some(a => a.userId && a.userId === user.uid) ||
            assigneesArr.some(a => a.email && userEmail && a.email.toLowerCase() === userEmail.toLowerCase()) ||
            (assigneeStr && (
              (userName && assigneeStr.includes(userName.toLowerCase())) ||
              (userEmail && assigneeStr.includes(userEmail.split('@')[0].toLowerCase())) ||
              assigneeStr === "אני"
            )) ||
            assigneesArr.some(a => {
              const nameLower = (a.name || "").toLowerCase();
              return (userName && nameLower.includes(userName.toLowerCase())) ||
                (userEmail && nameLower.includes(userEmail.split('@')[0].toLowerCase())) ||
                nameLower === "אני";
            });
          const isMentioned = mentionsArr.some(m =>
            (m.userId && m.userId === user.uid) ||
            (m.email && userEmail && m.email.toLowerCase() === userEmail.toLowerCase())
          );

          if (isAssigned || isMentioned) {
            notifTasks.push({
              id: doc.id,
              title: taskData.title,
              dueDate: taskData.dueDate,
              priority: (taskData.priority as "NORMAL" | "HIGH" | "CRITICAL") || "NORMAL",
              assignee: taskData.assignee,
              assigneeId,
              assignees: assigneesArr,
              status: (taskData.status as "TODO" | "IN_PROGRESS" | "DONE" | "STUCK") || "TODO",
              eventId: eventId,
              eventTitle: event?.title || "אירוע לא ידוע",
              currentStatus: taskData.currentStatus || "",
              nextStep: taskData.nextStep || "",
              lastMessageTime: taskData.lastMessageTime || null,
              lastMessageBy: taskData.lastMessageBy || "",
              readBy: taskData.readBy || {},
              lastMessageMentions: mentionsArr,
              lastMessageText: taskData.lastMessageText || ""
            } as Task);
          }

          const isAssignedToUser = taskData.status !== "DONE" && isAssigned;

          if (isAssignedToUser) {
            userTasks.push({
              id: doc.id,
              title: taskData.title,
              dueDate: taskData.dueDate,
              priority: (taskData.priority as "NORMAL" | "HIGH" | "CRITICAL") || "NORMAL",
              assignee: taskData.assignee,
              assigneeId,
              assignees: assigneesArr,
              status: (taskData.status as "TODO" | "IN_PROGRESS" | "DONE" | "STUCK") || "TODO",
              eventId: eventId,
              eventTitle: event?.title || "אירוע לא ידוע",
              currentStatus: taskData.currentStatus || "",
              nextStep: taskData.nextStep || "",
              lastMessageTime: taskData.lastMessageTime || null,
              lastMessageBy: taskData.lastMessageBy || "",
              readBy: taskData.readBy || {},
              lastMessageText: taskData.lastMessageText || ""
            } as Task);
          }
        });

        setMyTasks(userTasks);
        setNotificationTasks(notifTasks);
        const attendeesByEvent = await Promise.all(
          myCreatedEvents.map(async (ev) => {
            try {
              const attendeesSnap = await getDocs(collection(db!, "events", ev.id, "attendees"));
              return attendeesSnap.size;
            } catch (err) {
              console.error("Error loading attendees for event", ev.id, err);
              return 0;
            }
          })
        );
        const totalAttendees = attendeesByEvent.reduce((sum, num) => sum + num, 0);
        setStats({
          myEvents: myCreatedEvents.length,
          attendees: totalAttendees,
          partners: uniquePartners.size,
          tasks: tasksInMyEvents,
        });

        // Fetch Users in system + add placeholders from events/team (for non-onboarded users)
        const usersSnap = await getDocs(collection(db, "users"));
        const usersFromDb = usersSnap.docs.map(u => ({ id: u.id, ...u.data() } as any));
        const existingEmails = new Set(
          usersFromDb
            .map(u => normalizeKey((u as any).email))
            .filter(Boolean)
        );
        const placeholders: { id: string; fullName?: string; email?: string; role?: string }[] = [];
        const addPlaceholderUser = (email?: string, name?: string) => {
          const key = normalizeKey(email);
          if (!key || existingEmails.has(key)) return;
          existingEmails.add(key);
          placeholders.push({
            id: `placeholder-${key}`,
            email: email || "",
            fullName: name || email || "משתמש ללא שם",
            role: "לא השלימו הרשמה",
          });
        };
        allEventsData.forEach(ev => {
          addPlaceholderUser(ev.createdByEmail, (ev as any).creatorName);
          const teamArr = (ev as any).team as { email?: string; name?: string }[] | undefined;
          (teamArr || []).forEach(m => addPlaceholderUser(m.email, m.name));
        });
        setUsersList([...usersFromDb, ...placeholders]);

        // Fetch join requests of current user to show pending/approved
        const myJoinRequestsSnap = await getDocs(query(
          collection(db, "join_requests"),
          where("requesterId", "==", user.uid)
        ));
        const reqMap: Record<string, "PENDING" | "APPROVED" | "REJECTED"> = {};
        myJoinRequestsSnap.forEach(r => {
          const data = r.data() as any;
          if (data.eventId && data.status) {
            reqMap[data.eventId] = data.status;
          }
        });
        setJoinRequests(reqMap);

        // Join requests directed to me as בעל אירוע
        const incomingByOwnerId = await getDocs(query(collection(db!, "join_requests"), where("ownerId", "==", user.uid)));
        let incomingByEmail: any = null;
        if (user.email) {
          incomingByEmail = await getDocs(query(collection(db!, "join_requests"), where("ownerEmail", "==", user.email)));
        }
        const incomingCombined: Record<string, JoinRequest> = {};
        incomingByOwnerId.forEach(d => { incomingCombined[d.id] = { id: d.id, ...d.data() } as JoinRequest; });
        (incomingByEmail?.docs || []).forEach((d: any) => { incomingCombined[d.id] = { id: d.id, ...d.data() } as JoinRequest; });
        setIncomingJoinRequests(Object.values(incomingCombined).filter(r => r.status === "PENDING"));

      } catch (error) {
        console.error("Error fetching data:", error);
        setUsersError("שגיאה בטעינת משתמשים");
      } finally {
        setLoadingEvents(false);
        setLoadingTasks(false);
        setLoadingStats(false);
        setLoadingUsers(false);
        setLoadingNotifications(false);
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

  const currentUid = user?.uid || "";
  const taskNotifications = currentUid
    ? notificationTasks.filter(t => {
      const hasNewMessage = t.lastMessageTime && t.lastMessageBy && t.lastMessageBy !== currentUid;
      const unread = !t.readBy || !t.readBy[currentUid];
      const mentioned = (t as any).lastMessageMentions?.some((m: any) =>
        (m?.userId && m.userId === currentUid) ||
        (m?.email && user?.email && m.email.toLowerCase() === user.email.toLowerCase())
      );
      return (hasNewMessage && unread) || mentioned;
    })
    : [];

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

  const handleApproveJoinRequest = async (reqId: string) => {
    if (!db || !user) return;
    const req = incomingJoinRequests.find(r => r.id === reqId);
    if (!req || req.status !== "PENDING") return;
    try {
      const requesterName = req.requesterName || req.requesterEmail?.split("@")[0] || "חבר צוות";
      await Promise.all([
        updateDoc(doc(db, "events", req.eventId), {
          ...(req.requesterId ? { members: arrayUnion(req.requesterId) } : {}),
          team: arrayUnion({
            name: requesterName,
            role: "חבר צוות",
            email: req.requesterEmail || "",
            userId: req.requesterId || undefined
          })
        }),
        updateDoc(doc(db, "join_requests", req.id), { status: "APPROVED", respondedAt: serverTimestamp() })
      ]);
      setIncomingJoinRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: "APPROVED" } : r));
    } catch (err) {
      console.error("Error approving join request:", err);
      alert("שגיאה באישור הבקשה");
    }
  };

  const handleRejectJoinRequest = async (reqId: string) => {
    if (!db || !user) return;
    const req = incomingJoinRequests.find(r => r.id === reqId);
    if (!req || req.status !== "PENDING") return;
    try {
      await updateDoc(doc(db, "join_requests", req.id), { status: "REJECTED", respondedAt: serverTimestamp() });
      setIncomingJoinRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: "REJECTED" } : r));
    } catch (err) {
      console.error("Error rejecting join request:", err);
      alert("שגיאה בדחיית הבקשה");
    }
  };

  const handleLogout = async () => {
    try {
      if (auth) {
        await signOut(auth);
        router.push("/login");
      }
    } catch (err) {
      console.error("Error signing out:", err);
      alert("שגיאה בהתנתקות");
    }
  };

  const formatEventDate = (startTime: any) => {
    if (!startTime) return "";
    const date = startTime.seconds ? new Date(startTime.seconds * 1000) : new Date(startTime);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
  };

  const handleUpdateEventField = async (eventId: string, field: "startTime" | "location" | "participantsCount" | "status") => {
    if (!db) return;
    const event = events.find(e => e.id === eventId);
    if (!event) return;

    const current = field === "startTime"
      ? (event.startTime?.seconds ? new Date(event.startTime.seconds * 1000).toISOString().slice(0, 16) : "")
      : (event as any)[field] || "";

    const labelMap: Record<typeof field, string> = {
      startTime: "תאריך ושעה (פורמט: 2025-12-31T20:00)",
      location: "מיקום",
      participantsCount: "מספר משתתפים משוער",
      status: "סטטוס"
    };

    const input = window.prompt(`עדכן ${labelMap[field]}`, current);
    if (input === null) return; // cancel
    const trimmed = input.trim();

    let patch: any = {};
    if (field === "startTime") {
      const dt = new Date(trimmed);
      if (isNaN(dt.getTime())) {
        alert("תאריך/שעה לא תקינים");
        return;
      }
      patch.startTime = dt;
      patch.endTime = dt;
    } else {
      patch[field] = trimmed;
    }

    try {
      await updateDoc(doc(db, "events", eventId), patch);
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, ...patch } : e));
    } catch (err) {
      console.error("Error updating event field:", err);
      alert("שגיאה בעדכון האירוע");
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!db || !user) return;
    const ev = events.find(e => e.id === eventId);
    const isOwner = ev && (
      (ev.createdBy && ev.createdBy === user.uid) ||
      (ev.createdByEmail && user.email && normalizeKey(ev.createdByEmail) === normalizeKey(user.email))
    );
    if (!isOwner) {
      alert("רק יוצר האירוע יכול למחוק אותו.");
      setConfirmingEventId(null);
      return;
    }
    try {
      if (deleteEventRemoveTasks) {
        const tasksSnap = await getDocs(collection(db, "events", eventId, "tasks"));
        const deletes = tasksSnap.docs.map(d => deleteDoc(d.ref).catch(err => console.error("Error deleting task doc", err)));
        await Promise.all(deletes);
      }
      await deleteDoc(doc(db, "events", eventId));
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setMyTasks(prev => prev.filter(t => t.eventId !== eventId));
      setNotificationTasks(prev => prev.filter(t => t.eventId !== eventId));
      setConfirmingEventId(null);
      setDeleteEventRemoveTasks(false);
    } catch (err) {
      console.error("Error deleting event:", err);
      alert("שגיאה במחיקת האירוע");
    }
  };

  const handleJoinEventRequest = async (eventObj: Event) => {
    if (!db || !user) return;
    const eventId = eventObj.id;
    if (eventObj.members?.includes(user.uid)) {
      alert("אתה כבר חלק מהצוות באירוע הזה");
      return;
    }
    if (joinRequests[eventId] === "PENDING") {
      alert("בקשה ממתינה לאישור מנהל האירוע");
      return;
    }
    try {
      await setDoc(doc(db, "join_requests", `${eventId}_${user.uid}`), {
        eventId,
        eventTitle: eventObj.title || "",
        requesterId: user.uid,
        requesterName: user.displayName || user.email?.split("@")[0] || "משתמש",
        requesterEmail: user.email || "",
        ownerId: eventObj.createdBy || "",
        ownerEmail: eventObj.createdByEmail || "",
        status: "PENDING",
        createdAt: serverTimestamp(),
      }, { merge: true });
      setJoinRequests(prev => ({ ...prev, [eventId]: "PENDING" }));
      alert("הבקשה נשלחה למנהל האירוע לאישור");
    } catch (err) {
      console.error("Error requesting to join event:", err);
      alert("שגיאה בשליחת בקשת ההצטרפות");
    }
  };

  if (loading) return <div className="p-8 text-center">טוען...</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--patifon-cream)' }}>
      <header className="flex justify-between items-start mb-8">
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="p-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
              title="הגדרות"
            >
              <Settings size={20} />
            </Link>
            <button
              onClick={handleLogout}
              className="p-2 rounded-full border border-red-200 text-red-600 hover:bg-red-50 transition"
              title="התנתקות"
            >
              <LogOut size={20} />
            </button>
          </div>
          <h1 className="text-3xl font-bold leading-tight" style={{ color: 'var(--patifon-burgundy)' }}>
            {user.displayName || user.email}
          </h1>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Event Delete Confirmation Modal */}
      {confirmingEventId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">אישור מחיקת אירוע</h3>
            <p className="text-gray-600 mb-6">
              למחוק את האירוע הזה? פעולה זו תמחק את כל המשימות והנתונים הקשורים אליו.
            </p>
            <label className="flex items-center gap-2 mb-6 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={deleteEventRemoveTasks}
                onChange={(e) => setDeleteEventRemoveTasks(e.target.checked)}
              />
              מחק גם את המשימות של האירוע מהרשימות שלי
            </label>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmingEventId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDeleteEvent(confirmingEventId)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition shadow-sm"
              >
                מחק אירוע
              </button>
            </div>
          </div>
        </div>
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
                    assignees={task.assignees}
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
                    onManageAssignees={() => {
                      // מוביל למסך פרטי המשימה עם רמז אירוע כדי לאפשר תיוג גם במובייל
                      router.push(`/tasks/${task.id}?eventId=${task.eventId}&focus=assignees`);
                    }}
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
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                >
                  <Link href={`/events/${event.id}`} className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{event.title}</h3>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-600">
                      <button
                        type="button"
                        onClick={() => handleUpdateEventField(event.id, "startTime")}
                        className="flex items-center gap-1 min-w-0 text-left hover:text-indigo-700"
                        title="עדכון תאריך ושעה"
                      >
                        <Calendar size={14} className="shrink-0" />
                        <span className="truncate underline-offset-2">{formatEventDate(event.startTime) || "אין תאריך"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateEventField(event.id, "location")}
                        className="flex items-center gap-1 min-w-0 text-left hover:text-indigo-700"
                        title="עדכון מיקום"
                      >
                        <MapPin size={14} className="shrink-0" />
                        <span className="truncate underline-offset-2">{event.location || "לא צוין מיקום"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateEventField(event.id, "participantsCount")}
                        className="flex items-center gap-1 min-w-0 text-left hover:text-indigo-700"
                        title="עדכון כמות משתתפים"
                      >
                        <Users size={14} className="shrink-0" />
                        <span className="truncate underline-offset-2">{event.participantsCount || "משתתפים: לא צוין"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateEventField(event.id, "status")}
                        className="flex items-center gap-1 min-w-0 text-left hover:text-indigo-700"
                        title="עדכון סטטוס"
                      >
                        <CheckSquare size={14} className="shrink-0" />
                        <span className="truncate underline-offset-2">{event.status || "ללא סטטוס"}</span>
                      </button>
                    </div>
                  </Link>
                  {(
                    (event.createdBy && event.createdBy === user.uid) ||
                    (event.createdByEmail && user.email && normalizeKey(event.createdByEmail) === normalizeKey(user.email))
                  ) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDeleteEventRemoveTasks(false);
                          setConfirmingEventId(event.id);
                        }}
                        className="p-2 rounded-full text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 shrink-0"
                        title="מחק אירוע"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex justify-center gap-3 flex-wrap">
        <button
          onClick={() => setActivePanel(prev => prev === "stats" ? null : "stats")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition text-sm font-medium ${activePanel === "stats" ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}
        >
          <BarChart3 size={18} />
          סטטיסטיקות
        </button>
        <button
          onClick={() => setActivePanel(prev => prev === "users" ? null : "users")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition text-sm font-medium ${activePanel === "users" ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}
        >
          <Users size={18} />
          משתמשי מערכת
        </button>
        <button
          onClick={() => setActivePanel(prev => prev === "notifications" ? null : "notifications")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition text-sm font-medium ${activePanel === "notifications" ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}
        >
          <Bell size={18} />
          הודעות
        </button>
      </div>

      {activePanel === "stats" && (
        <div className="mt-4 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: '2px solid var(--patifon-cream-dark)' }}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 style={{ color: 'var(--patifon-orange)' }} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>סטטיסטיקות על האירועים שלי</h2>
          </div>
          {loadingStats ? (
            <div className="text-gray-500 text-center py-6">טוען נתונים...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ background: 'var(--patifon-cream-dark)' }}>
                  <Calendar size={20} className="text-gray-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">אירועים שפתחתי</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.myEvents}</p>
                </div>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ background: 'var(--patifon-cream-dark)' }}>
                  <Users size={20} className="text-gray-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">נרשמים דרך הטפסים</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.attendees}</p>
                </div>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ background: 'var(--patifon-cream-dark)' }}>
                  <UserPlus size={20} className="text-gray-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">שותפים שהצטרפו</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.partners}</p>
                </div>
              </div>
              <div className="p-4 border border-gray-200 rounded-lg flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ background: 'var(--patifon-cream-dark)' }}>
                  <CheckSquare size={20} className="text-gray-700" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">משימות שבוצעו</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.tasks}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activePanel === "users" && (
        <div className="mt-4 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: '2px solid var(--patifon-cream-dark)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Users style={{ color: 'var(--patifon-orange)' }} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>משתמשי המערכת</h2>
          </div>
          {usersError && (
            <div className="text-red-600 text-sm mb-3">{usersError}</div>
          )}
          {loadingUsers ? (
            <div className="text-gray-500 text-center py-6">טוען משתמשים...</div>
          ) : usersList.length === 0 ? (
            <div className="text-gray-500 text-center py-6">לא נמצאו משתמשים.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {usersList.map((u) => {
                const userActiveEvents =
                  userEventsMap[u.id] ||
                  (u.email ? userEventsMap[normalizeKey(u.email)] : []) ||
                  [];
                const isOpen = openUserEventsId === u.id;
                return (
                  <div key={u.id} className="p-3 border border-gray-200 rounded-lg bg-white">
                    <div className="flex items-center gap-3 justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-full" style={{ background: 'var(--patifon-cream-dark)' }}>
                          <UserCircle2 size={22} className="text-gray-700" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{u.fullName || u.email || "משתמש ללא שם"}</p>
                          <p className="text-sm text-gray-500 truncate">{u.role || "ללא תפקיד"}</p>
                        </div>
                      </div>
                      <button
                        className="flex items-center gap-1 px-3 py-1 rounded-full border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        onClick={() => setOpenUserEventsId(isOpen ? null : u.id)}
                        title="הצג אירועים פעילים של המשתמש"
                      >
                        <Calendar size={14} />
                        <span>{userActiveEvents.length}</span>
                      </button>
                    </div>
                    {isOpen && userActiveEvents.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {userActiveEvents.map(ev => (
                          <div key={ev.id} className="p-2 border border-gray-100 rounded-lg flex items-start gap-2 bg-gray-50">
                            <div className="p-1.5 rounded-full bg-white border border-gray-200">
                              <Calendar size={14} className="text-gray-700" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{ev.title || "אירוע ללא שם"}</p>
                              <p className="text-xs text-gray-500 truncate">{formatEventDate(ev.startTime) || "ללא תאריך"}</p>
                              <div className="flex items-center gap-1 mt-1 text-xs text-gray-600">
                                <Users size={12} />
                                <span>נרשמים:</span>
                                <span>{(ev as any).attendeesCount ?? "—"}</span>
                              </div>
                              <div className="mt-2">
                                <button
                                  onClick={() => handleJoinEventRequest(ev)}
                                  disabled={joinRequests[ev.id] === "PENDING" || joinRequests[ev.id] === "APPROVED"}
                                  className={`text-xs px-3 py-1 rounded-full border transition ${joinRequests[ev.id] === "PENDING" || joinRequests[ev.id] === "APPROVED"
                                    ? "border-gray-200 text-gray-500 bg-gray-100 cursor-not-allowed"
                                    : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                    }`}
                                >
                                  {joinRequests[ev.id] === "PENDING"
                                    ? "ממתין לאישור"
                                    : joinRequests[ev.id] === "APPROVED"
                                      ? "מאושר"
                                      : "הצטרף לצוות"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {isOpen && userActiveEvents.length === 0 && (
                      <div className="mt-3 text-xs text-gray-500">אין אירועים פעילים למשתמש זה.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activePanel === "notifications" && (
        <div className="mt-4 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: '2px solid var(--patifon-cream-dark)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Bell style={{ color: 'var(--patifon-orange)' }} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>הודעות והתראות</h2>
          </div>
          {loadingNotifications ? (
            <div className="text-gray-500 text-center py-6">טוען התראות...</div>
          ) : (
            <div className="space-y-3">
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-sm font-semibold text-gray-800 mb-2">בקשות הצטרפות לאירועים שלי</p>
                {incomingJoinRequests.length === 0 ? (
                  <p className="text-xs text-gray-500">אין בקשות חדשות.</p>
                ) : (
                  incomingJoinRequests.map((req) => (
                    <div key={req.id} className="flex items-start justify-between gap-3 bg-white border border-gray-200 rounded-lg p-3 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{req.requesterName || req.requesterEmail || "משתמש"}</p>
                        <p className="text-xs text-gray-500 truncate">אירוע: {req.eventTitle || req.eventId}</p>
                        <p className="text-xs text-gray-500 truncate">סטטוס: {req.status === "PENDING" ? "ממתין" : req.status === "APPROVED" ? "אושר" : "נדחה"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleApproveJoinRequest(req.id)}
                          className="px-3 py-1 text-xs rounded-full bg-green-600 text-white hover:bg-green-700"
                        >
                          אשר
                        </button>
                        <button
                          onClick={() => handleRejectJoinRequest(req.id)}
                          className="px-3 py-1 text-xs rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                          דחה
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-sm font-semibold text-gray-800 mb-2">הודעות ממשימות שמוקצות לי</p>
                {taskNotifications.length === 0 ? (
                  <p className="text-xs text-gray-500">אין הודעות חדשות.</p>
                ) : (
                  taskNotifications.map(t => (
                    <div key={t.id} className="flex items-start justify-between gap-3 bg-white border border-gray-200 rounded-lg p-3 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 truncate">{t.title}</p>
                          {(!t.readBy || !t.readBy[currentUid]) && (
                            <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="לא נקרא"></span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">אירוע: {t.eventTitle}</p>
                        <p className="text-xs text-gray-700 truncate">{t.lastMessageText || "הודעה חדשה"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setChatTask(t)}
                          className="px-3 py-1 text-xs rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        >
                          פתח צ'אט
                        </button>
                        <button
                          onClick={() => setNotificationTasks(prev => prev.filter(nt => nt.id !== t.id))}
                          className="px-3 py-1 text-xs rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                          title="הסר מההתראות"
                        >
                          הסר
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
