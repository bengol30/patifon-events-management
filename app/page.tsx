"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Calendar, CheckSquare, Settings, Filter, Edit2, Trash2, Check, X, MessageCircle, LogOut, MapPin, Users, Clock, UserPlus, BarChart3, UserCircle2, Bell, FolderKanban, FileEdit } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, collectionGroup, deleteDoc, updateDoc, doc, getDoc, arrayUnion, setDoc, serverTimestamp, addDoc, onSnapshot } from "firebase/firestore";
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
  scope?: "event" | "project";
  lastMessageTime?: any;
  lastMessageBy?: string;
  readBy?: Record<string, boolean>;
  currentStatus?: string;
  nextStep?: string;
  lastMessageText?: string;
  lastMessageMentions?: { name?: string; userId?: string; email?: string }[];
  pendingApproval?: boolean;
}

interface TeamNote {
  id: string;
  text: string;
  createdAt?: any;
  updatedAt?: any;
}

interface Project {
  id: string;
  name?: string;
  status?: string;
  summary?: string;
  goal?: string;
  dueDate?: string;
  ownerId?: string;
  ownerEmail?: string;
  teamMembers?: { userId?: string; email?: string; fullName?: string }[];
  updatedAt?: any;
}

const matchAssignee = (opts: {
  taskData: any;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}) => {
  const { taskData, userId, userName, userEmail } = opts;
  const assigneeStr = (taskData.assignee || "").toLowerCase().trim();
  const userNameLower = (userName || "").toLowerCase().trim();
  const userEmailLower = (userEmail || "").toLowerCase().trim();
  const userEmailPrefix = userEmailLower ? userEmailLower.split("@")[0] : "";
  const assigneeId = taskData.assigneeId as string | undefined;
  const assigneesArr = (taskData.assignees as { name: string; userId?: string; email?: string }[] | undefined) ||
    (taskData.assignee ? [{ name: taskData.assignee, userId: taskData.assigneeId, email: (taskData as any).assigneeEmail }] : []);
  const mentionsArr = (taskData.lastMessageMentions as { name?: string; userId?: string; email?: string }[] | undefined) || [];
  const isAssigned =
    (assigneeId && userId && assigneeId === userId) ||
    assigneesArr.some(a => a.userId && userId && a.userId === userId) ||
    assigneesArr.some(a => a.email && userEmailLower && a.email.toLowerCase().trim() === userEmailLower) ||
    (assigneeStr && (
      (userNameLower && assigneeStr === userNameLower) ||
      (userEmailPrefix && assigneeStr === userEmailPrefix) ||
      assigneeStr === "אני"
    )) ||
    assigneesArr.some(a => {
      const nameLower = (a.name || "").toLowerCase().trim();
      return (userNameLower && nameLower === userNameLower) ||
        (userEmailPrefix && nameLower === userEmailPrefix) ||
        nameLower === "אני";
    });
  const isMentioned = mentionsArr.some(m =>
    (m.userId && userId && m.userId === userId) ||
    (m.email && userEmail && m.email.toLowerCase() === userEmail.toLowerCase())
  );
  return { isAssigned, isMentioned, assigneesArr, assigneeId };
};

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectIndex, setProjectIndex] = useState<Record<string, Project>>({});

  // My Tasks State
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Stats State
  const [stats, setStats] = useState({ myEvents: 0, attendees: 0, partners: 0, tasks: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [activePanel, setActivePanel] = useState<"stats" | "users" | "notifications" | "volunteers" | null>("stats");
  const [usersList, setUsersList] = useState<{ id: string; fullName?: string; email?: string; role?: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [volunteersList, setVolunteersList] = useState<{ id: string; name?: string; firstName?: string; lastName?: string; email?: string; phone?: string; eventId: string; eventTitle?: string; createdAt?: any; scope?: "event" | "project"; program?: string; year?: string; idNumber?: string }[]>([]);
  const [loadingVolunteers, setLoadingVolunteers] = useState(true);
  const [showAllVolunteers, setShowAllVolunteers] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<{ id: string; eventId: string; scope?: "event" | "project" } | null>(null);
  const [editVolunteerName, setEditVolunteerName] = useState("");
  const [editVolunteerEmail, setEditVolunteerEmail] = useState("");
  const [editVolunteerPhone, setEditVolunteerPhone] = useState("");
  const [savingVolunteer, setSavingVolunteer] = useState(false);
  const [deletingVolunteerId, setDeletingVolunteerId] = useState<string | null>(null);
  const [confirmDeleteVolunteer, setConfirmDeleteVolunteer] = useState<{ id: string; eventId: string; scope?: "event" | "project"; name?: string; eventTitle?: string } | null>(null);
  const [viewVolunteer, setViewVolunteer] = useState<{ id: string; name?: string; firstName?: string; lastName?: string; email?: string; phone?: string; program?: string; year?: string; idNumber?: string } | null>(null);
  const [volTasksPending, setVolTasksPending] = useState<Task[]>([]);
  const [volTasksDone, setVolTasksDone] = useState<Task[]>([]);
  const [volTasksHours, setVolTasksHours] = useState<number>(0);
  const [loadingVolTasks, setLoadingVolTasks] = useState(false);
  const [volTasksError, setVolTasksError] = useState<string | null>(null);
  const [completionRequests, setCompletionRequests] = useState<any[]>([]);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [userEventsMap, setUserEventsMap] = useState<Record<string, Event[]>>({});
  const [openUserEventsId, setOpenUserEventsId] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<Record<string, "PENDING" | "APPROVED" | "REJECTED">>({});
  const [incomingJoinRequests, setIncomingJoinRequests] = useState<JoinRequest[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [notificationTasks, setNotificationTasks] = useState<Task[]>([]);
  const [deleteEventRemoveTasks, setDeleteEventRemoveTasks] = useState(false);
  const [unreadEditRequests, setUnreadEditRequests] = useState(0);
  const [teamNotes, setTeamNotes] = useState<TeamNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

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
  const [confirmingProjectId, setConfirmingProjectId] = useState<string | null>(null);

  // Chat State
  const [chatTask, setChatTask] = useState<Task | null>(null);
  const isProjectManager = (user?.email || "").toLowerCase() === "bengo0469@gmail.com";
  const isAdmin = isProjectManager;

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

  const isProjectTaskRef = (ref?: any) => {
    if (!ref?.path) return false;
    const path = ref.path.toString();
    const marker = "/documents/";
    const idx = path.indexOf(marker);
    if (idx !== -1) {
      const sub = path.slice(idx + marker.length);
      if (sub.startsWith("projects/")) return true;
    }
    return path.startsWith("projects/") || path.includes("/projects/");
  };

  const fetchTasksForContainers = async ({
    eventIds = [],
    projectIds = [],
    eventLookup,
    projectLookup,
    currentUser,
    includeMentions = true,
  }: {
    eventIds: string[];
    projectIds: string[];
    eventLookup: Map<string, any>;
    projectLookup: Map<string, any>;
    currentUser: { id?: string; name?: string | null; email?: string | null };
    includeMentions?: boolean;
  }) => {
    if (!db) return { tasks: [] as Task[], notif: [] as Task[], tasksInMyEvents: 0 };
    const tasks: Task[] = [];
    const notif: Task[] = [];
    let tasksInMyEvents = 0;

    const loadFor = async (scope: "event" | "project", id: string) => {
      const parent = scope === "event" ? eventLookup.get(id) : projectLookup.get(id);
      if (!parent) return;
      try {
        const snap = await getDocs(collection(db!, scope === "event" ? "events" : "projects", id, "tasks"));
        snap.forEach(docSnap => {
          const data = docSnap.data();
          const match = matchAssignee({
            taskData: data,
            userId: currentUser.id,
            userName: currentUser.name,
            userEmail: currentUser.email,
          });
          const baseTask: Task = {
            id: docSnap.id,
            title: data.title,
            description: data.description,
            assignee: data.assignee,
            assigneeId: data.assigneeId,
            assignees: data.assignees,
            status: (data.status as Task["status"]) || "TODO",
            dueDate: data.dueDate,
            priority: (data.priority as Task["priority"]) || "NORMAL",
            eventId: id,
            eventTitle: (scope === "event" ? parent?.title : parent?.name) || (scope === "project" ? "פרויקט" : "אירוע לא ידוע"),
            scope,
            currentStatus: data.currentStatus,
            nextStep: data.nextStep,
            lastMessageTime: data.lastMessageTime,
            lastMessageBy: data.lastMessageBy,
            readBy: data.readBy,
            lastMessageText: data.lastMessageText,
            lastMessageMentions: data.lastMessageMentions,
          };
          tasks.push(baseTask);
          const shouldIncludeNotif = match.isAssigned || (includeMentions && match.isMentioned);
          if (shouldIncludeNotif) {
            notif.push({
              ...baseTask,
              assignees: match.assigneesArr,
              assigneeId: match.assigneeId,
            });
          }
          if (scope === "event") tasksInMyEvents += 1;
        });
      } catch (err) {
        console.error("Failed loading tasks for", scope, id, err);
      }
    };

    await Promise.all([
      ...eventIds.map(eid => loadFor("event", eid)),
      ...projectIds.map(pid => loadFor("project", pid)),
    ]);

    return { tasks, notif, tasksInMyEvents };
  };

  const isEventActive = (event: Event) => {
    const statusLower = (event.status || "").toString().toLowerCase();
    if (["done", "cancelled", "canceled", "בוטל"].includes(statusLower)) return false;
    return true;
  };

  const isProjectActive = (project: Project) => {
    const statusLower = (project.status || "").toString().toLowerCase();
    return !["הושלם", "done", "completed", "סגור", "cancelled", "canceled"].includes(statusLower);
  };

  const isEventDeletedFlag = (eventObj: any) => {
    const statusLower = (eventObj?.status || "").toString().toLowerCase();
    return eventObj?.deleted === true || ["deleted", "cancelled", "canceled", "archive", "archived"].includes(statusLower);
  };

  const normalizeKey = (val?: string | null) => (val || "").toString().trim().toLowerCase();
  const isProjectOwner = (proj: Project, currentUser?: typeof user) => {
    const u = currentUser || user;
    if (!u) return false;
    return (
      (proj.ownerId && proj.ownerId === u.uid) ||
      (proj.ownerEmail && u.email && normalizeKey(proj.ownerEmail) === normalizeKey(u.email))
    );
  };

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
        const projectLookup = new Map(Object.entries(projectIndex || {}));

        tasksSnapshot.forEach(docSnap => {
          const taskData = docSnap.data();
          const isProjectTask = isProjectTaskRef(docSnap.ref);
          const parentCollectionId = docSnap.ref.parent.parent?.parent?.id;
          const eventId = docSnap.ref.parent.parent?.id || "";
          let event = isProjectTask ? projectLookup.get(eventId) : eventLookup.get(eventId);
          if (!event && isProjectTask) {
            event = { id: eventId, title: taskData.eventTitle || "פרויקט" } as any;
          }
          // Skip tasks whose parent event no longer exists or marked deleted
          if (!isProjectTask && (!event || isEventDeletedFlag(event))) {
            return;
          }

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
              eventTitle: isProjectTask
                ? (event as any)?.name || (event as any)?.title || taskData.eventTitle || "פרויקט"
                : (event as any)?.title || taskData.eventTitle || "אירוע לא ידוע",
              scope: isProjectTask ? "project" : "event",
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

  // Fetch unread edit requests for admin badge
  useEffect(() => {
    const loadUnread = async () => {
      if (!db || !isAdmin) return;
      try {
        const snap = await getDocs(query(collection(db, "edit_requests"), where("status", "==", "UNREAD")));
        setUnreadEditRequests(snap.size);
      } catch (err) {
        console.error("Failed loading edit request unread count", err);
      }
    };
    loadUnread();
  }, [db, isAdmin]);

  // Team notes (per user)
  useEffect(() => {
    const loadNotes = async () => {
      if (!db || !user) {
        setLoadingNotes(false);
        return;
      }
      try {
        setLoadingNotes(true);
        // Avoids composite index requirement: filter by owner then sort locally.
        const snap = await getDocs(
          query(collection(db, "team_meeting_notes"), where("createdBy", "==", user.uid))
        );
        const notes: TeamNote[] = [];
        snap.forEach(n => {
          const data = n.data() as any;
          notes.push({ id: n.id, text: data.text || "", createdAt: data.createdAt, updatedAt: data.updatedAt });
        });
        notes.sort((a, b) => {
          const aTs = a.createdAt?.seconds || 0;
          const bTs = b.createdAt?.seconds || 0;
          return bTs - aTs;
        });
        setTeamNotes(notes);
      } catch (err) {
        console.error("Failed loading team notes", err);
      } finally {
        setLoadingNotes(false);
      }
    };
    loadNotes();
  }, [db, user]);

  useEffect(() => {
    const fetchData = async () => {
      if (!db || !user) {
        setLoadingEvents(false);
        setLoadingProjects(false);
        setLoadingTasks(false);
        setLoadingStats(false);
        setLoadingUsers(false);
        setLoadingVolunteers(false);
        setLoadingNotifications(false);
        return;
      }

      try {
        setLoadingStats(true);
        setLoadingProjects(true);
        setLoadingUsers(true);
        setLoadingVolunteers(true);
        setLoadingNotifications(true);
        setUsersError(null);
        // Fetch all events (for per-user stats)
        const allEventsSnapshot = await getDocs(query(collection(db, "events"), orderBy("createdAt", "desc")));
        const allEventsData = allEventsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Event[];
        // Fetch projects (for volunteer lookup from projects)
        const allProjectsSnapshot = await getDocs(collection(db, "projects"));
        const allProjectsData = allProjectsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as any[];
        setProjectIndex(Object.fromEntries(allProjectsData.map((p: any) => [p.id, p])));
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

        // Fetch projects relevant to current user
        const projectsForUser = allProjectsData.filter((p) => {
          const ownerMatch =
            p.ownerId === user.uid ||
            (p.ownerEmail && user.email && normalizeKey(p.ownerEmail) === normalizeKey(user.email));
          const teamMembers = (p as any).teamMembers as { userId?: string; email?: string }[] | undefined;
          const teamMatch = (teamMembers || []).some(
            (m) =>
              (m.userId && m.userId === user.uid) ||
              (m.email && user.email && normalizeKey(m.email) === normalizeKey(user.email))
          );
          return ownerMatch || teamMatch;
        });
        const activeProjects = projectsForUser
          .filter(isProjectActive)
          .sort((a, b) => {
            const aTime = a.updatedAt?.seconds || 0;
            const bTime = b.updatedAt?.seconds || 0;
            return bTime - aTime;
          })
          .map((p) => ({
            ...p,
            name: (p as any).name || (p as any).title || "פרויקט ללא שם",
            summary: (p as any).summary || (p as any).description || "",
          }));
        setProjects(activeProjects);
        setLoadingProjects(false);
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
        const projectLookup = new Map(allProjectsData.map(p => [p.id, p]));

        const isTaskAssignedToCurrentUser = (task: any) => {
          const uid = user.uid;
          const emailNorm = normalizeKey(user.email);
          const assigneeEmailNorm = normalizeKey(task.assigneeEmail) || normalizeKey(task.assignee);
          const assigneesArr: { userId?: string; email?: string }[] = Array.isArray(task.assignees) ? task.assignees : [];
          const hasUid = uid && (
            (task.assigneeId && task.assigneeId === uid) ||
            assigneesArr.some(a => a.userId && a.userId === uid)
          );
          const hasEmail = emailNorm && (
            assigneeEmailNorm === emailNorm ||
            assigneesArr.some(a => normalizeKey(a.email) === emailNorm)
          );
          return Boolean(hasUid || hasEmail);
        };

        tasksSnapshot.forEach(doc => {
          const taskData = doc.data();
          const isProjectTask = isProjectTaskRef(doc.ref);
          const scope: "event" | "project" = isProjectTask ? "project" : "event";
          const eventId = doc.ref.parent.parent?.id || "";
          let container = isProjectTask ? projectLookup.get(eventId) : eventLookup.get(eventId);
          if (!container && isProjectTask) {
            container = { id: eventId, name: taskData.eventTitle || taskData.title || "פרויקט" } as any;
          }
          if (!container) return;
          if (!isProjectTask && isEventDeletedFlag(container)) return;
          if (scope === "event" && myEventIds.has(eventId)) {
            tasksInMyEvents += 1;
          }

          const match = matchAssignee({
            taskData,
            userId: user.uid,
            userName,
            userEmail,
          });
          const mentionsArr = (taskData.lastMessageMentions as { name?: string; userId?: string; email?: string }[] | undefined) || [];
          const containerTitle = scope === "project"
            ? (container as any)?.name || (container as any)?.title || taskData.eventTitle || "פרויקט"
            : (container as any)?.title || taskData.eventTitle || "אירוע לא ידוע";

          if (match.isAssigned || match.isMentioned) {
            notifTasks.push({
              id: doc.id,
              title: taskData.title,
              dueDate: taskData.dueDate,
              priority: (taskData.priority as "NORMAL" | "HIGH" | "CRITICAL") || "NORMAL",
              assignee: taskData.assignee,
              assigneeId: match.assigneeId,
              assignees: match.assigneesArr,
              status: (taskData.status as "TODO" | "IN_PROGRESS" | "DONE" | "STUCK") || "TODO",
              eventId,
              eventTitle: containerTitle,
              scope,
              currentStatus: taskData.currentStatus || "",
              nextStep: taskData.nextStep || "",
              lastMessageTime: taskData.lastMessageTime || null,
              lastMessageBy: taskData.lastMessageBy || "",
              readBy: taskData.readBy || {},
              lastMessageMentions: mentionsArr,
              lastMessageText: taskData.lastMessageText || ""
            } as Task);
          }

          const isAssignedToUser = taskData.status !== "DONE" && isTaskAssignedToCurrentUser({
            ...taskData,
            assignees: match.assigneesArr,
            assigneeEmail: (taskData as any).assigneeEmail || (match.assigneesArr[0]?.email) || taskData.assigneeEmail,
          });

          if (isAssignedToUser) {
            userTasks.push({
              id: doc.id,
              title: taskData.title,
              dueDate: taskData.dueDate,
              priority: (taskData.priority as "NORMAL" | "HIGH" | "CRITICAL") || "NORMAL",
              assignee: taskData.assignee,
              assigneeId: match.assigneeId,
              assigneeEmail: (taskData as any).assigneeEmail || (match.assigneesArr[0]?.email) || "",
              assignees: match.assigneesArr,
              status: (taskData.status as "TODO" | "IN_PROGRESS" | "DONE" | "STUCK") || "TODO",
              eventId,
              eventTitle: containerTitle,
              scope,
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

        // Fetch volunteers from all events
        try {
          const volunteersData: { id: string; name?: string; firstName?: string; lastName?: string; email?: string; phone?: string; eventId: string; eventTitle?: string; createdAt?: any; scope?: "event" | "project"; program?: string; year?: string; idNumber?: string }[] = [];
          const eventTitleMap = new Map(allEventsData.map(e => [e.id, e.title || "אירוע ללא שם"]));
          const projectTitleMap = new Map(allProjectsData.map(p => [p.id, (p as any).name || (p as any).title || "פרויקט ללא שם"]));
          const seenVolunteers = new Set<string>();
          const addVolunteer = (volDoc: any, eventId: string, volData: any, eventTitle?: string, scope: "event" | "project" = "event") => {
            const key = `${scope}-${eventId}-${volDoc.id}`;
            if (seenVolunteers.has(key)) return;
            seenVolunteers.add(key);

            // Extract name - try multiple formats
            let volunteerName = "";
            if (volData.name && typeof volData.name === "string" && volData.name.trim()) {
              volunteerName = volData.name.trim();
            } else if (volData.firstName || volData.lastName) {
              volunteerName = `${volData.firstName || ""} ${volData.lastName || ""}`.trim();
            } else if (volData.email) {
              // Use email as fallback
              volunteerName = volData.email.split("@")[0];
            }

            if (!volunteerName) {
              console.warn("Volunteer without name:", { volId: volDoc.id, volData, eventId });
              volunteerName = "מתנדב ללא שם";
            }

            volunteersData.push({
              id: volDoc.id,
              name: volunteerName,
              firstName: volData.firstName,
              lastName: volData.lastName,
              email: volData.email || "",
              phone: volData.phone || "",
              eventId: eventId,
              eventTitle: eventTitleMap.get(eventId) || projectTitleMap.get(eventId) || eventTitle || (scope === "project" ? "פרויקט ללא שם" : "אירוע ללא שם"),
              createdAt: volData.createdAt,
              scope,
              program: volData.program || "",
              year: volData.year || "",
              idNumber: volData.idNumber || "",
            });
          };

          try {
            const volunteersQuery = query(collectionGroup(db, "volunteers"));
            const volunteersSnapshot = await getDocs(volunteersQuery);

            volunteersSnapshot.forEach((volDoc) => {
              const volData = volDoc.data();
              const eventId = volDoc.ref.parent.parent?.id || "";

              // Check if parent is an event or project
              const parentPath = volDoc.ref.parent.parent?.path || "";
              const isEventVolunteer = parentPath.startsWith("events/") || parentPath.includes("/events/");
              const isProjectVolunteer = parentPath.startsWith("projects/") || parentPath.includes("/projects/");
              if (isEventVolunteer) {
                addVolunteer(volDoc, eventId, volData, undefined, "event");
              } else if (isProjectVolunteer) {
                addVolunteer(volDoc, eventId, volData, undefined, "project");
              }
            });

            console.log(`Loaded ${volunteersData.length} volunteers from events via collectionGroup`, volunteersData.length > 0 ? volunteersData.slice(0, 3) : "No volunteers found");
          } catch (eventsVolunteersError) {
            console.error("Error loading volunteers from events:", eventsVolunteersError);
          }

          // General volunteers (global sign-up)
          try {
            const generalSnap = await getDocs(collection(db, "general_volunteers"));
            generalSnap.forEach((volDoc) => {
              const volData = volDoc.data();
              // Build name
              let volunteerName = "";
              if (volData.name && typeof volData.name === "string" && volData.name.trim()) {
                volunteerName = volData.name.trim();
              } else if (volData.firstName || volData.lastName) {
                volunteerName = `${volData.firstName || ""} ${volData.lastName || ""}`.trim();
              } else if (volData.email) {
                volunteerName = volData.email.split("@")[0];
              } else {
                volunteerName = "מתנדב ללא שם";
              }
              const fakeDoc = { id: volDoc.id };
              addVolunteer(fakeDoc, "general", { ...volData, name: volunteerName }, "הרשמה כללית", "event");
            });
          } catch (err) {
            console.error("Error loading general volunteers", err);
          }

          // Always also fetch per-event to include legacy/missing docs
          console.log("Loading volunteers from events individually (merge + dedup)...");
          for (const event of allEventsData) {
            try {
              const eventVolunteersSnap = await getDocs(collection(db, "events", event.id, "volunteers"));
              eventVolunteersSnap.forEach((volDoc) => {
                const volData = volDoc.data();
                addVolunteer(volDoc, event.id, volData, event.title, "event");
              });
            } catch (eventError) {
              console.error(`Error loading volunteers for event ${event.id}:`, eventError);
            }
          }
          console.log("Loading volunteers from projects individually (merge + dedup)...");
          for (const project of allProjectsData) {
            try {
              const projectVolunteersSnap = await getDocs(collection(db, "projects", project.id, "volunteers"));
              projectVolunteersSnap.forEach((volDoc) => {
                const volData = volDoc.data();
                const projTitle = (project as any).name || (project as any).title;
                addVolunteer(volDoc, project.id, volData, projTitle, "project");
              });
            } catch (projectError) {
              console.error(`Error loading volunteers for project ${project.id}:`, projectError);
            }
          }
          console.log(`Loaded ${volunteersData.length} volunteers total after merging per-event/project fetches`);
          
          // Sort by createdAt (newest first)
          const ts = (val: any) => {
            if (!val) return 0;
            if (typeof val.seconds === "number") return val.seconds;
            if (val instanceof Date) return Math.floor(val.getTime() / 1000);
            const parsed = Date.parse(val);
            return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
          };
          volunteersData.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
          
          setVolunteersList(volunteersData);
        } catch (volunteersError) {
          console.error("Error loading volunteers:", volunteersError);
          setVolunteersList([]);
        }

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
        setLoadingProjects(false);
        setLoadingTasks(false);
        setLoadingStats(false);
        setLoadingUsers(false);
        setLoadingVolunteers(false);
        setLoadingNotifications(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);

  // Load completion approval requests for task owners
  useEffect(() => {
    if (!db || !user) {
      setCompletionRequests([]);
      setShowRequestsModal(false);
      return;
    }
    const normEmail = (user.email || "").trim().toLowerCase();
    const unsubscribers: (() => void)[] = [];
    const mergeAndSet = (snapArr: any[]) => {
      const map = new Map<string, any>();
      snapArr.forEach(s => s.forEach((d: any) => map.set(d.id, d)));
      const arr = Array.from(map.values());
      setCompletionRequests(arr);
      setShowRequestsModal(arr.length > 0);
    };
    const snaps: any[] = [];
    const q1 = query(collection(db, "task_completion_requests"), where("status", "==", "PENDING"), where("ownerId", "==", user.uid));
    const unsub1 = onSnapshot(q1, (snap) => {
      snaps[0] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      mergeAndSet(snaps);
    });
    unsubscribers.push(unsub1);
    if (normEmail) {
      const q2 = query(collection(db, "task_completion_requests"), where("status", "==", "PENDING"), where("ownerEmail", "==", normEmail));
      const unsub2 = onSnapshot(q2, (snap) => {
        snaps[1] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeAndSet(snaps);
      });
      unsubscribers.push(unsub2);
    }
    return () => {
      unsubscribers.forEach(u => u && u());
    };
  }, [db, user]);

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
      const taskRef = editingTask.scope === "project"
        ? doc(db, "projects", editingTask.eventId, "tasks", editingTask.id)
        : doc(db, "events", editingTask.eventId, "tasks", editingTask.id);
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

    const taskToComplete = myTasks.find(t => t.id === deletingTaskId);
    if (!taskToComplete) return;

    try {
      const taskRef = taskToComplete.scope === "project"
        ? doc(db, "projects", taskToComplete.eventId, "tasks", deletingTaskId)
        : doc(db, "events", taskToComplete.eventId, "tasks", deletingTaskId);
      await updateDoc(taskRef, { status: "DONE" });

      // Remove from local view (DONE tasks are hidden)
      setMyTasks(prev => prev.filter(t => t.id !== deletingTaskId));
      setDeletingTaskId(null);
    } catch (err) {
      console.error("Error completing task via delete:", err);
      alert("שגיאה בסימון המשימה כהושלמה");
    }
  };

  const handleCompleteTask = async (task: Task) => {
    if (!db) return;

    try {
      const taskRef = task.scope === "project"
        ? doc(db, "projects", task.eventId, "tasks", task.id)
        : doc(db, "events", task.eventId, "tasks", task.id);
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

  const getVolunteerRef = (vol: { id: string; eventId: string; scope?: "event" | "project" }) => {
    if (!db) throw new Error("Missing db");
    return vol.scope === "project"
      ? doc(db, "projects", vol.eventId, "volunteers", vol.id)
      : doc(db, "events", vol.eventId, "volunteers", vol.id);
  };

  const startEditVolunteer = (vol: { id: string; eventId: string; scope?: "event" | "project"; name?: string; email?: string; phone?: string; eventTitle?: string }) => {
    setEditingVolunteer({ id: vol.id, eventId: vol.eventId, scope: vol.scope });
    setEditVolunteerName(vol.name || "");
    setEditVolunteerEmail(vol.email || "");
    setEditVolunteerPhone(vol.phone || "");
  };

  const handleSaveVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !editingVolunteer) return;
    const name = editVolunteerName.trim();
    const email = editVolunteerEmail.trim();
    const phone = editVolunteerPhone.trim();
    try {
      setSavingVolunteer(true);
      const ref = getVolunteerRef(editingVolunteer);
      const updateData: any = { email, phone };
      if (editingVolunteer.scope === "project") {
        const [firstName, ...rest] = name.split(" ");
        updateData.firstName = firstName || name;
        updateData.lastName = rest.join(" ").trim();
        updateData.name = name;
      } else {
        updateData.name = name;
      }
      await updateDoc(ref, updateData);
      setVolunteersList(prev =>
        prev.map(v =>
          v.id === editingVolunteer.id && v.eventId === editingVolunteer.eventId
            ? { ...v, name, email, phone }
            : v
        )
      );
      setEditingVolunteer(null);
    } catch (err) {
      console.error("Error updating volunteer", err);
      alert("שגיאה בעדכון מתנדב");
    } finally {
      setSavingVolunteer(false);
    }
  };

  const handleDeleteVolunteer = async (vol?: { id: string; eventId: string; scope?: "event" | "project"; name?: string }) => {
    if (!db) return;
    const target = vol || confirmDeleteVolunteer;
    if (!target) return;
    try {
      setDeletingVolunteerId(`${target.scope || "event"}-${target.eventId}-${target.id}`);
      const ref = getVolunteerRef(target);
      await deleteDoc(ref);
      setVolunteersList(prev =>
        prev.filter(v => !(v.id === target.id && v.eventId === target.eventId && (v.scope || "event") === (target.scope || "event")))
      );
      setConfirmDeleteVolunteer(null);
    } catch (err) {
      console.error("Error deleting volunteer", err);
      alert("שגיאה במחיקת מתנדב");
    } finally {
      setDeletingVolunteerId(null);
    }
  };

  const loadVolunteerTasks = async (vol: { email?: string; name?: string }) => {
    if (!db || !vol.email) {
      setVolTasksPending([]);
      setVolTasksDone([]);
      setVolTasksHours(0);
      setVolTasksError("לא נמצא אימייל למתנדב, לכן לא ניתן לטעון משימות.");
      return;
    }
    setVolTasksError(null);
    const emailLower = vol.email.trim().toLowerCase();
    setLoadingVolTasks(true);
    try {
      const tasksSnap = await getDocs(collectionGroup(db, "tasks"));
      const pending: Task[] = [];
      const done: Task[] = [];
      let hours = 0;

      tasksSnap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const assignees = (data.assignees as { name?: string; email?: string; userId?: string }[] | undefined) || [];
        const assigneeEmail = (data.assigneeEmail || "").toString().toLowerCase();
        const match = assignees.some(a => (a.email || "").toLowerCase() === emailLower) || (assigneeEmail && assigneeEmail === emailLower);
        if (!match) return;
        const scope: "event" | "project" = docSnap.ref.parent.parent?.path?.includes("/projects/") ? "project" : "event";
        const parentId = docSnap.ref.parent.parent?.id || "";
        const task: Task = {
          id: docSnap.id,
          title: data.title || "משימה",
          description: data.description,
          assignee: data.assignee || assignees[0]?.name || "",
          assigneeId: data.assigneeId,
          assignees: assignees,
          status: data.status || "TODO",
          dueDate: data.dueDate,
          priority: data.priority || "NORMAL",
          currentStatus: data.currentStatus,
          nextStep: data.nextStep,
          eventId: parentId,
          eventTitle: data.eventTitle || (scope === "project" ? "פרויקט" : "אירוע"),
          scope,
          volunteerHours: data.volunteerHours ?? null,
        };
        if (task.status === "DONE") {
          done.push(task);
          const h = Number(task.volunteerHours);
          if (Number.isFinite(h) && h > 0) hours += h;
        } else {
          pending.push(task);
        }
      });

      const completionsSnap = await getDocs(query(
        collection(db, "volunteer_completions"),
        where("email", "==", emailLower)
      ));
      const seenDone = new Set(done.map(t => t.id));
      completionsSnap.forEach(c => {
        const d = c.data() as any;
        const taskId = d.taskId || "";
        if (!taskId || seenDone.has(taskId)) return;
        seenDone.add(taskId);
        const scope: "event" | "project" = (d.eventId || "").startsWith("proj-") || (d.eventId || "").startsWith("project-") ? "project" : "event";
        const task: Task = {
          id: taskId,
          title: d.taskTitle || "משימה",
          description: "",
          assignee: vol.name || "",
          assigneeId: "",
          assignees: [{ name: vol.name || "", email: vol.email }],
          status: "DONE",
          dueDate: "",
          priority: "NORMAL",
          eventId: d.eventId || "",
          eventTitle: d.eventTitle || "אירוע/פרויקט",
          scope,
          volunteerHours: d.volunteerHours ?? null,
        };
        done.push(task);
        const h = Number(task.volunteerHours);
        if (Number.isFinite(h) && h > 0) hours += h;
      });

      setVolTasksPending(pending);
      setVolTasksDone(done);
      setVolTasksHours(hours);
    } catch (err) {
      console.error("Failed loading volunteer tasks", err);
      setVolTasksPending([]);
      setVolTasksDone([]);
      setVolTasksHours(0);
      setVolTasksError("שגיאה בטעינת המשימות למתנדב.");
    } finally {
      setLoadingVolTasks(false);
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

  const formatProjectDueDate = (dueDate: any) => {
    if (!dueDate) return "";
    if (typeof dueDate === "string") return dueDate;
    if (dueDate?.seconds) {
      return new Date(dueDate.seconds * 1000).toLocaleDateString("he-IL");
    }
    return "";
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

  const deleteAllTasksFor = async (type: "events" | "projects", id: string) => {
    try {
      const tasksSnap = await getDocs(collection(db!, type, id, "tasks"));
      await Promise.all(tasksSnap.docs.map(d => deleteDoc(d.ref).catch(err => console.error("Error deleting task doc", err))));
    } catch (err) {
      console.error(`Error deleting tasks for ${type}/${id}`, err);
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
      await deleteAllTasksFor("events", eventId);
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

  const handleDeleteProject = async (projectId: string) => {
    if (!db || !user) return;
    const proj = projects.find(p => p.id === projectId);
    if (!proj || !isProjectOwner(proj, user)) {
      alert("רק יוצר הפרויקט יכול למחוק אותו.");
      setConfirmingProjectId(null);
      return;
    }
    try {
      await deleteAllTasksFor("projects", projectId);
      await deleteDoc(doc(db, "projects", projectId));
      setProjects(prev => prev.filter(p => p.id !== projectId));
      setProjectIndex(prev => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setMyTasks(prev => prev.filter(t => !(t.scope === "project" && t.eventId === projectId)));
      setNotificationTasks(prev => prev.filter(t => !(t.scope === "project" && t.eventId === projectId)));
    } catch (err) {
      console.error("Error deleting project:", err);
      alert("שגיאה במחיקת הפרויקט");
    } finally {
      setConfirmingProjectId(null);
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

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !user) return;
    const text = newNote.trim();
    if (!text) return;
    try {
      const docRef = await addDoc(collection(db, "team_meeting_notes"), {
        text,
        createdBy: user.uid,
        createdByEmail: user.email || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTeamNotes(prev => [{ id: docRef.id, text, createdAt: { seconds: Math.floor(Date.now() / 1000) } }, ...prev]);
      setNewNote("");
    } catch (err) {
      console.error("Failed to add note", err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, "team_meeting_notes", id));
      setTeamNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error("Failed to delete note", err);
    }
  };

  const handleUpdateNote = async (id: string, text: string) => {
    if (!db) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await updateDoc(doc(db, "team_meeting_notes", id), { text: trimmed, updatedAt: serverTimestamp() });
      setTeamNotes(prev => prev.map(n => n.id === id ? { ...n, text: trimmed } : n));
      setEditingNoteId(null);
      setEditingNoteText("");
    } catch (err) {
      console.error("Failed to update note", err);
    }
  };

  const handleApproveCompletion = async (req: any, approve: boolean) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, "task_completion_requests", req.id), { status: approve ? "APPROVED" : "REJECTED", respondedAt: serverTimestamp() });
      const taskRef = req.scope === "project"
        ? doc(db, "projects", req.eventId, "tasks", req.taskId)
        : doc(db, "events", req.eventId, "tasks", req.taskId);
      if (!approve) {
        await updateDoc(taskRef, { status: "TODO", pendingApproval: false, pendingApprovalRequestId: "", lastApprovalDecision: "REJECTED" });
      } else {
        await updateDoc(taskRef, { status: "DONE", pendingApproval: false, pendingApprovalRequestId: "", lastApprovalDecision: "APPROVED" });
        await addDoc(collection(db, "volunteer_completions"), {
          email: req.volunteerEmail,
          name: req.volunteerName,
          eventId: req.eventId,
          eventTitle: req.eventTitle || "",
          taskId: req.taskId,
          taskTitle: req.taskTitle || "משימה",
          volunteerHours: req.volunteerHours ?? null,
          completedAt: serverTimestamp(),
        });
      }
      setCompletionRequests(prev => {
        const next = prev.filter(r => r.id !== req.id);
        if (next.length === 0) setShowRequestsModal(false);
        return next;
      });
    } catch (err) {
      console.error("Failed handling completion approval", err);
      alert("שגיאה בעדכון סטטוס המשימה");
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
            {isAdmin && (
              <Link
                href="/requests/inbox"
                className="relative p-2 rounded-full border border-gray-300 text-indigo-700 hover:bg-indigo-50 transition"
                title="בקשות לעריכה"
              >
                <FileEdit size={20} />
                {unreadEditRequests > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 rounded-full bg-red-500"></span>
                )}
              </Link>
            )}
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
          {isProjectManager && (
            <Link
              href="/projects"
              className="px-4 py-2 rounded-lg border border-indigo-200 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 transition flex items-center gap-2"
            >
              <FolderKanban size={18} />
              ניהול פרוייקטים
            </Link>
          )}
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

      {/* Completion Approval Modal */}
      {showRequestsModal && completionRequests.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">אישורי משימות ממתנדבים</h3>
              <button onClick={() => setShowRequestsModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {completionRequests.map((req) => (
                <div key={req.id} className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{req.taskTitle || "משימה"}</p>
                      <p className="text-sm text-gray-600">אירוע/פרויקט: {req.eventTitle || req.eventId}</p>
                      <p className="text-sm text-gray-600">מתנדב: {req.volunteerName || req.volunteerEmail}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{req.scope === "project" ? "פרויקט" : "אירוע"}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleApproveCompletion(req, true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                    >
                      אשר ביצוע
                    </button>
                    <button
                      onClick={() => handleApproveCompletion(req, false)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                    >
                      דחה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
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

      {/* Project Delete Confirmation Modal */}
      {confirmingProjectId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">אישור מחיקת פרויקט</h3>
            <p className="text-gray-600 mb-6">
              למחוק את הפרויקט הזה? המשימות שלו יימחקו והרשימות יוסרו ממסך הבית.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmingProjectId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
              >
                ביטול
              </button>
              <button
                onClick={() => handleDeleteProject(confirmingProjectId)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition shadow-sm"
              >
                מחק פרויקט
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
                const taskRef = editingStatusTask.scope === "project"
                  ? doc(db, "projects", editingStatusTask.eventId, "tasks", editingStatusTask.id)
                  : doc(db, "events", editingStatusTask.eventId, "tasks", editingStatusTask.id);
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

      {/* Delete Confirmation Modal (marks task as done) */}
      {deletingTaskId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">סיום משימה</h3>
            <p className="text-gray-600 mb-6">המשימה תסומן כהושלמה ותוסר מהרשימה שלך. להמשיך?</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingTaskId(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
              >
                ביטול
              </button>
              <button
                onClick={handleDeleteTask}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition shadow-sm"
              >
                סמן כהושלמה
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
                    scope={task.scope}
                    onEdit={() => setEditingTask(task)}
                    onDelete={() => setDeletingTaskId(task.id)}
                    onStatusChange={async (newStatus) => {
                      if (newStatus === "DONE") {
                        handleCompleteTask(task);
                      } else {
                        // Update status for other transitions
                        if (!db) return;
                        try {
                          const taskRef = task.scope === "project"
                            ? doc(db, "projects", task.eventId, "tasks", task.id)
                            : doc(db, "events", task.eventId, "tasks", task.id);
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
                      eventTitle: t.eventTitle || "",
                      scope: task.scope
                    } as Task)}
                    onEditDate={(t) => setEditingDateTask({
                      ...t,
                      eventId: t.eventId || "",
                      eventTitle: t.eventTitle || "",
                      scope: task.scope
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
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
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

      {/* Active Projects Section */}
      <div className="mt-8 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: '2px solid var(--patifon-cream-dark)' }}>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <FolderKanban style={{ color: 'var(--patifon-orange)' }} />
            <h2 className="text-xl font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>פרויקטים פעילים</h2>
          </div>
          <Link
            href="/projects?openForm=1"
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition"
            title="פתיחת פרויקט חדש עם אותו טופס של האדמין"
          >
            <Plus size={16} />
            פתיחת פרויקט חדש
          </Link>
        </div>
        {loadingProjects ? (
          <div className="text-gray-500 text-center py-8">טוען פרויקטים...</div>
        ) : projects.length === 0 ? (
          <div className="text-gray-500 text-center py-8">אין פרויקטים פעילים עבורך כרגע.</div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                <Link href={`/projects/${project.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">{project.name || "פרויקט ללא שם"}</h3>
                    {project.status && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {project.status}
                      </span>
                    )}
                  </div>
                  {project.summary && (
                    <p className="text-sm text-gray-600 mt-1 truncate" title={project.summary}>
                      {project.summary}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                    {project.goal && <span className="truncate" title={project.goal}>מטרה: {project.goal}</span>}
                    {formatProjectDueDate(project.dueDate) && (
                      <span className="flex items-center gap-1">
                        <Calendar size={14} className="shrink-0" />
                        יעד: {formatProjectDueDate(project.dueDate)}
                      </span>
                    )}
                  </div>
                </Link>
                {isProjectOwner(project, user) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setConfirmingProjectId(project.id);
                    }}
                    className="p-2 rounded-full text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 shrink-0"
                    title="מחק פרויקט"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Meeting Notes */}
      <div className="mt-8 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: '2px solid var(--patifon-cream-dark)' }}>
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle style={{ color: 'var(--patifon-orange)' }} />
          <h2 className="text-xl font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>נקודות לפגישת הצוות הקרובה</h2>
        </div>
        <form onSubmit={handleAddNote} className="flex flex-col gap-3 md:flex-row md:items-center mb-4">
          <textarea
            className="flex-1 p-3 border rounded-lg text-sm border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="כתבו כאן נקודות, החלטות או שאלות לפגישה..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={2}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition"
          >
            הוסף
          </button>
        </form>
        {loadingNotes ? (
          <div className="text-gray-500 text-sm">טוען נקודות...</div>
        ) : teamNotes.length === 0 ? (
          <div className="text-gray-500 text-sm">אין נקודות עדיין. הוסף את הראשונה.</div>
        ) : (
          <div className="space-y-3">
            {teamNotes.map(note => (
              <div key={note.id} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                {editingNoteId === note.id ? (
                  <div className="space-y-2">
                    <textarea
                      className="w-full p-2 border rounded-lg text-sm"
                      rows={2}
                      value={editingNoteText}
                      onChange={(e) => setEditingNoteText(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateNote(note.id, editingNoteText)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                      >
                        שמור
                      </button>
                      <button
                        onClick={() => { setEditingNoteId(null); setEditingNoteText(""); }}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        בטל
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.text}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.text); }}
                        className="text-indigo-700 text-xs hover:underline"
                      >
                        ערוך
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="text-red-600 text-xs hover:underline"
                      >
                        מחק
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
          onClick={() => setActivePanel(prev => prev === "volunteers" ? null : "volunteers")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition text-sm font-medium ${activePanel === "volunteers" ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}
        >
          <div className="relative flex items-center gap-2">
            <UserPlus size={18} />
            {completionRequests.length > 0 && (
              <span className="absolute -top-1 -right-2 h-3 w-3 rounded-full bg-red-500"></span>
            )}
            <span>מתנדבים רשומים</span>
          </div>
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

      {activePanel === "volunteers" && (
        <div className="mt-4 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: '2px solid var(--patifon-cream-dark)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserPlus style={{ color: 'var(--patifon-orange)' }} />
              <h2 className="text-xl font-semibold" style={{ color: 'var(--patifon-burgundy)' }}>מתנדבים רשומים</h2>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100">
              {volunteersList.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => {
                const url = typeof window !== "undefined" ? `${window.location.origin}/volunteers/register` : "/volunteers/register";
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(url).then(() => {
                    alert("קישור הרשמה כללי הועתק");
                  }).catch(() => {
                    alert(url);
                  });
                } else {
                  alert(url);
                }
              }}
              className="px-3 py-2 rounded-lg border border-indigo-200 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold"
            >
              העתק קישור הרשמת מתנדב כללי
            </button>
          </div>
          {completionRequests.length > 0 && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Bell className="text-amber-700" size={18} />
                  <h3 className="font-semibold text-amber-900">בקשות לאישור משימות</h3>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-amber-200 text-amber-800">{completionRequests.length}</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {completionRequests.map((req) => (
                  <div key={req.id} className="border border-amber-200 rounded-lg p-3 bg-white">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{req.taskTitle || "משימה"}</p>
                        <p className="text-sm text-gray-600 truncate">אירוע/פרויקט: {req.eventTitle || req.eventId}</p>
                        <p className="text-sm text-gray-600 truncate">מתנדב: {req.volunteerName || req.volunteerEmail}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">{req.scope === "project" ? "פרויקט" : "אירוע"}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleApproveCompletion(req, true)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                      >
                        אשר ביצוע
                      </button>
                      <button
                        onClick={() => handleApproveCompletion(req, false)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                      >
                        דחה
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {loadingVolunteers ? (
            <div className="text-gray-500 text-center py-6">טוען מתנדבים...</div>
          ) : volunteersList.length === 0 ? (
            <div className="text-gray-500 text-center py-6">לא נמצאו מתנדבים רשומים.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(showAllVolunteers ? volunteersList : volunteersList.slice(0, 5)).map((vol) => {
                  const regDate = vol.createdAt?.seconds ? new Date(vol.createdAt.seconds * 1000) : null;
                  const deletingKey = `${vol.scope || "event"}-${vol.eventId}-${vol.id}`;
                  return (
                    <div
                      key={`${vol.scope || "event"}-${vol.eventId}-${vol.id}`}
                      className="p-3 border border-gray-200 rounded-lg bg-white cursor-pointer hover:border-indigo-200"
                      onClick={() => { setViewVolunteer(vol); loadVolunteerTasks(vol); }}
                    >
                      <div className="flex items-start gap-3 justify-between">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="p-2 rounded-full" style={{ background: 'var(--patifon-cream-dark)' }}>
                            <UserPlus size={18} className="text-gray-700" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900 truncate">{vol.name || "מתנדב ללא שם"}</p>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                                {vol.scope === "project" ? "פרויקט" : "אירוע"}
                              </span>
                            </div>
                            {vol.email && (
                              <p className="text-sm text-gray-500 truncate">{vol.email}</p>
                            )}
                            {vol.phone && (
                              <p className="text-sm text-gray-500 truncate">{vol.phone}</p>
                            )}
                            <div className="mt-2 space-y-1">
                              {vol.eventTitle && vol.eventId && (
                                <Link
                                  href={vol.scope === "project" ? `/projects/${vol.eventId}` : `/events/${vol.eventId}`}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline truncate flex items-center gap-1"
                                >
                                  {vol.scope === "project" ? <FolderKanban size={12} /> : <Calendar size={12} />}
                                  {vol.eventTitle}
                                </Link>
                              )}
                              {regDate && (
                                <p className="text-xs text-gray-500">
                                  {regDate.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })} • {regDate.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => startEditVolunteer(vol)}
                              className="p-2 rounded-md border border-gray-200 hover:bg-gray-50 text-gray-700"
                              title="עריכת מתנדב"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteVolunteer(vol)}
                              disabled={deletingVolunteerId === deletingKey}
                              className={`p-2 rounded-md border text-gray-700 ${deletingVolunteerId === deletingKey ? "bg-gray-100 border-gray-200 cursor-not-allowed" : "border-gray-200 hover:bg-gray-50"}`}
                              title="מחיקת מתנדב"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {volunteersList.length > 5 && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setShowAllVolunteers(!showAllVolunteers)}
                    className="px-4 py-2 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition text-sm font-medium"
                  >
                    {showAllVolunteers ? "הצג 5 ראשונים בלבד" : `הצג את כל ${volunteersList.length} המתנדבים`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {editingVolunteer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">עריכת מתנדב</h3>
            <form className="space-y-4" onSubmit={handleSaveVolunteer}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={editVolunteerName}
                  onChange={(e) => setEditVolunteerName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={editVolunteerEmail}
                  onChange={(e) => setEditVolunteerEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                <input
                  type="tel"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={editVolunteerPhone}
                  onChange={(e) => setEditVolunteerPhone(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  onClick={() => setEditingVolunteer(null)}
                  disabled={savingVolunteer}
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-70"
                  disabled={savingVolunteer}
                >
                  {savingVolunteer ? "שומר..." : "שמור"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewVolunteer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {viewVolunteer.name || `${viewVolunteer.firstName || ""} ${viewVolunteer.lastName || ""}`.trim() || "מתנדב"}
                </h3>
                <p className="text-sm text-gray-600">{viewVolunteer.email || ""}</p>
                {viewVolunteer.phone && <p className="text-sm text-gray-600">טלפון: {viewVolunteer.phone}</p>}
                {viewVolunteer.firstName && <p className="text-sm text-gray-600">שם פרטי: {viewVolunteer.firstName}</p>}
                {viewVolunteer.lastName && <p className="text-sm text-gray-600">שם משפחה: {viewVolunteer.lastName}</p>}
                {viewVolunteer.program && <p className="text-sm text-gray-600">חוג/תחום לימוד: {viewVolunteer.program}</p>}
                {viewVolunteer.year && <p className="text-sm text-gray-600">שנת לימודים: {viewVolunteer.year}</p>}
                {viewVolunteer.idNumber && <p className="text-sm text-gray-600">ת.ז: {viewVolunteer.idNumber}</p>}
              </div>
              <button
                onClick={() => { setViewVolunteer(null); setVolTasksPending([]); setVolTasksDone([]); setVolTasksHours(0); }}
                className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {volTasksError && (
                <div className="md:col-span-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                  {volTasksError}
                </div>
              )}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900">משימות פתוחות</h4>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white border border-amber-200">{volTasksPending.length}</span>
                </div>
                {loadingVolTasks ? (
                  <p className="text-sm text-gray-500">טוען...</p>
                ) : volTasksPending.length === 0 ? (
                  <p className="text-sm text-gray-500">אין משימות פתוחות.</p>
                ) : (
                  <div className="space-y-2">
                    {volTasksPending.map((t) => (
                      <div key={t.id} className="p-2 rounded border border-gray-200 bg-white">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-semibold text-gray-900 truncate">{t.title}</span>
                          <span className="text-xs text-gray-500">{t.eventTitle}</span>
                        </div>
                        {t.volunteerHours != null && <p className="text-xs text-gray-700">שעות משימה: {t.volunteerHours}</p>}
                        {t.dueDate && <p className="text-xs text-gray-600">דד ליין: {t.dueDate}</p>}
                        <p className="text-xs text-gray-600">סוג: {t.scope === "project" ? "פרויקט" : "אירוע"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900">משימות שהושלמו</h4>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white border border-green-200">{volTasksDone.length}</span>
                </div>
                {loadingVolTasks ? (
                  <p className="text-sm text-gray-500">טוען...</p>
                ) : volTasksDone.length === 0 ? (
                  <p className="text-sm text-gray-500">אין משימות שהושלמו.</p>
                ) : (
                  <div className="space-y-2">
                    {volTasksDone.map((t) => (
                      <div key={t.id} className="p-2 rounded border border-gray-200 bg-white">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-semibold text-gray-900 truncate">{t.title}</span>
                          <span className="text-xs text-gray-500">{t.eventTitle}</span>
                        </div>
                        {t.volunteerHours != null && <p className="text-xs text-gray-700">שעות משימה: {t.volunteerHours}</p>}
                        <p className="text-xs text-gray-600">סוג: {t.scope === "project" ? "פרויקט" : "אירוע"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-indigo-800">
                סה״כ שעות שצבר: {volTasksHours}
              </p>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteVolunteer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">מחיקת מתנדב</h3>
            <p className="text-sm text-gray-700 mb-4">
              למחוק את המתנדב/ת "{confirmDeleteVolunteer.name || confirmDeleteVolunteer.id}"?
            </p>
            <div className="text-xs text-gray-500 mb-4">
              מקור: {confirmDeleteVolunteer.scope === "project" ? "פרויקט" : "אירוע"} • {confirmDeleteVolunteer.eventTitle || confirmDeleteVolunteer.eventId}
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                onClick={() => setConfirmDeleteVolunteer(null)}
                disabled={deletingVolunteerId !== null}
              >
                ביטול
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-70"
                onClick={() => handleDeleteVolunteer()}
                disabled={deletingVolunteerId !== null}
              >
                {deletingVolunteerId ? "מוחק..." : "מחק"}
              </button>
            </div>
          </div>
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
                const taskRef = editingDateTask.scope === "project"
                  ? doc(db, "projects", editingDateTask.eventId, "tasks", editingDateTask.id)
                  : doc(db, "events", editingDateTask.eventId, "tasks", editingDateTask.id);
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
