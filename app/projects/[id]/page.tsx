"use client";

import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, serverTimestamp, updateDoc, query, where, deleteDoc, addDoc } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Calendar, CheckCircle2, FolderKanban, Loader2, Pencil, Users, PlusCircle, MapPin, Trash2, MessageCircle, CheckSquare, Clock, X, UserPlus } from "lucide-react";
import TaskCard from "@/components/TaskCard";

interface Project {
  id: string;
  name: string;
  summary?: string;
  goal?: string;
  partners?: string[];
  status?: string;
  dueDate?: string;
  needsScholarshipVolunteers?: boolean;
  ownerId?: string;
  ownerEmail?: string;
  createdAt?: any;
  updatedAt?: any;
  teamMembers?: { userId: string; fullName?: string; email?: string }[];
}

interface Volunteer {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  program?: string;
  year?: string;
  createdAt?: any;
}

interface ProjectEvent {
  id: string;
  title?: string;
  startTime?: any;
  location?: string;
  status?: string;
}

interface ProjectTask {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK";
  dueDate?: string;
  priority?: "NORMAL" | "HIGH" | "CRITICAL";
  eventId: string;
  eventTitle?: string;
  assignee?: string;
  assignees?: { name: string; userId?: string; email?: string }[];
  description?: string;
  currentStatus?: string;
  nextStep?: string;
  previewImage?: string;
  scope?: "event" | "project" | "manual" | "general";
  isVolunteerTask?: boolean;
  volunteerHours?: number | null;
}

const STATUS_OPTIONS = ["בתכנון", "בביצוע", "בהקפאה", "הושלם"];

export default function ProjectDetailsPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loadingVolunteers, setLoadingVolunteers] = useState(true);
  const [projectEvents, setProjectEvents] = useState<ProjectEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [volunteerBusy, setVolunteerBusy] = useState<string | null>(null);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [loadingProjectTasks, setLoadingProjectTasks] = useState(true);
  const [editingStatusTask, setEditingStatusTask] = useState<ProjectTask | null>(null);
  const [editingDateTask, setEditingDateTask] = useState<ProjectTask | null>(null);
  const isAdmin = true; // כל המשתמשים יכולים לראות ולערוך כמו באדמין
  const [copiedLink, setCopiedLink] = useState(false);
  const [usersList, setUsersList] = useState<{ id: string; fullName?: string; email?: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [savingNewTask, setSavingNewTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "NORMAL" as "NORMAL" | "HIGH" | "CRITICAL",
    assignees: [] as { name: string; userId?: string; email?: string }[],
    isVolunteerTask: false,
    volunteerHours: null as number | null,
  });
  const [newTaskSearch, setNewTaskSearch] = useState("");
  const [taggingProjectTask, setTaggingProjectTask] = useState<ProjectTask | null>(null);
  const [projectTagSelection, setProjectTagSelection] = useState<{ name: string; userId?: string; email?: string }[]>([]);
  const [projectTagSearch, setProjectTagSearch] = useState("");

  const [form, setForm] = useState({
    name: "",
    summary: "",
    goal: "",
    partners: "",
    dueDate: "",
    status: STATUS_OPTIONS[0],
    needsScholarshipVolunteers: false,
    teamMembers: [] as { userId: string; fullName?: string; email?: string }[],
  });

  const isProjectOwner = (proj: Project | null, currentUser: typeof user) => {
    if (!proj || !currentUser) return false;
    const norm = (v?: string | null) => (v || "").trim().toLowerCase();
    return (
      (proj.ownerId && proj.ownerId === currentUser.uid) ||
      (proj.ownerEmail && currentUser.email && norm(proj.ownerEmail) === norm(currentUser.email))
    );
  };

  useEffect(() => {
    const loadProject = async () => {
      if (!db || !projectId) return;
      setLoadingProject(true);
      setLoadingVolunteers(true);
      setLoadingEvents(true);
      setLoadingUsers(true);
      setError(null);
      try {
        const [snap, volunteersSnap, eventsSnap, usersSnap] = await Promise.all([
          getDoc(doc(db, "projects", projectId)),
          getDocs(collection(db, "projects", projectId, "volunteers")),
          getDocs(query(collection(db, "events"), where("projectId", "==", projectId))),
          getDocs(collection(db, "users")),
        ]);

        if (!snap.exists()) {
          setError("הפרויקט לא נמצא");
          return;
        }
        const data = snap.data() as any;
        const proj: Project = {
          id: snap.id,
          name: data.name || data.title || "פרויקט ללא שם",
          summary: data.summary || data.description || "",
          goal: data.goal || data.scope || "",
          partners: Array.isArray(data.partners) ? data.partners : [],
          status: data.status || "בביצוע",
          dueDate: data.dueDate || data.targetDate || "",
          needsScholarshipVolunteers: data.needsScholarshipVolunteers || false,
          ownerId: data.ownerId,
          ownerEmail: data.ownerEmail,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          teamMembers: Array.isArray(data.teamMembers) ? data.teamMembers : [],
        };
        setProject(proj);
        setForm({
          name: proj.name || "",
          summary: proj.summary || "",
          goal: proj.goal || "",
          partners: (proj.partners || []).join("\n"),
          dueDate: proj.dueDate || "",
          status: proj.status || STATUS_OPTIONS[0],
          needsScholarshipVolunteers: !!proj.needsScholarshipVolunteers,
          teamMembers: proj.teamMembers || [],
        });

        const vols: Volunteer[] = [];
        volunteersSnap.forEach((v) => {
          const d = v.data() as any;
          vols.push({
            id: v.id,
            firstName: d.firstName,
            lastName: d.lastName,
            phone: d.phone,
            email: d.email,
            program: d.program,
            year: d.year,
            createdAt: d.createdAt,
          });
        });
        vols.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setVolunteers(vols);

        const evs: ProjectEvent[] = [];
        eventsSnap.forEach((ev) => {
          const d = ev.data() as any;
          evs.push({
            id: ev.id,
            title: d.title || "אירוע ללא שם",
            startTime: d.startTime,
            location: d.location,
            status: d.status,
          });
        });
        evs.sort((a, b) => (a.startTime?.seconds || 0) - (b.startTime?.seconds || 0));
        setProjectEvents(evs);

        const users = usersSnap.docs.map((u) => {
          const d = u.data() as any;
          return { id: u.id, fullName: d.fullName || d.name || d.displayName || d.email || "משתמש ללא שם", email: d.email || "" };
        });
        setUsersList(users);

        // Load tasks for all related events
        setLoadingProjectTasks(true);
        const tasks: ProjectTask[] = [];
        for (const ev of evs) {
          try {
            const tSnap = await getDocs(collection(db, "events", ev.id, "tasks"));
            tSnap.forEach((t) => {
              const d = t.data() as any;
              tasks.push({
                id: t.id,
                title: d.title || "משימה",
                status: (d.status as any) || "TODO",
                dueDate: d.dueDate,
                priority: (d.priority as any) || "NORMAL",
                eventId: ev.id,
                eventTitle: ev.title,
                assignee: d.assignee,
                assignees: d.assignees,
                description: d.description,
                currentStatus: d.currentStatus,
                nextStep: d.nextStep,
                previewImage: d.previewImage,
                scope: "event",
                isVolunteerTask: !!d.isVolunteerTask,
                volunteerHours: d.volunteerHours ?? null,
              });
            });
          } catch (err) {
            console.error("Failed loading tasks for event", ev.id, err);
          }
        }
        // Project-level tasks
        try {
          const pTasksSnap = await getDocs(collection(db, "projects", projectId, "tasks"));
          pTasksSnap.forEach((t) => {
            const d = t.data() as any;
            tasks.push({
              id: t.id,
              title: d.title || "משימה",
              status: (d.status as any) || "TODO",
              dueDate: d.dueDate,
              priority: (d.priority as any) || "NORMAL",
              eventId: projectId,
              eventTitle: proj.name,
              assignee: d.assignee,
              assignees: d.assignees,
              description: d.description,
              currentStatus: d.currentStatus,
              nextStep: d.nextStep,
              previewImage: d.previewImage,
              scope: "project",
              isVolunteerTask: !!d.isVolunteerTask,
              volunteerHours: d.volunteerHours ?? null,
            });
          });
        } catch (err) {
          console.error("Failed loading project tasks", err);
        }
        // sort by due date or status
        tasks.sort((a, b) => {
          if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
          return 0;
        });
        setProjectTasks(tasks);
      } catch (err) {
        console.error("Failed loading project", err);
        setError("שגיאה בטעינת הפרויקט.");
      } finally {
        setLoadingProject(false);
        setLoadingVolunteers(false);
        setLoadingProjectTasks(false);
        setLoadingEvents(false);
        setLoadingUsers(false);
      }
    };

    if (!loading && user) {
      loadProject();
    }
  }, [loading, user, projectId]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
  }, [user, loading, router]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return usersList;
    const q = userSearch.trim().toLowerCase();
    return usersList.filter(
      (u) =>
        (u.fullName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [usersList, userSearch]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || !project) return;
    if (!form.name.trim()) {
      setError("חייבים לתת שם לפרויקט.");
      return;
    }

    const partnersArr = form.partners
      .split(/[\n,]/)
      .map((p) => p.trim())
      .filter(Boolean);
    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db, "projects", project.id), {
        name: form.name.trim(),
        summary: form.summary.trim(),
        goal: form.goal.trim(),
        partners: partnersArr,
        status: form.status,
        dueDate: form.dueDate,
        needsScholarshipVolunteers: form.needsScholarshipVolunteers,
        teamMembers: form.teamMembers,
        updatedAt: serverTimestamp(),
      });

      setProject({
        ...project,
        name: form.name.trim(),
        summary: form.summary.trim(),
        goal: form.goal.trim(),
        partners: partnersArr,
        status: form.status,
        dueDate: form.dueDate,
        needsScholarshipVolunteers: form.needsScholarshipVolunteers,
        teamMembers: form.teamMembers,
      });
      setEditMode(false);
    } catch (err) {
      console.error("Failed updating project", err);
      setError("לא ניתן לשמור כרגע. נסה שוב בעוד רגע.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!db || !project || !user) return;
    if (!isProjectOwner(project, user)) {
      alert("רק יוצר הפרויקט יכול למחוק אותו.");
      return;
    }
    const confirmDelete = window.confirm("למחוק את הפרויקט הזה וכל המשימות שלו?");
    if (!confirmDelete) return;
    try {
      const tasksSnap = await getDocs(collection(db, "projects", project.id, "tasks"));
      const deletes = tasksSnap.docs.map((d) => deleteDoc(d.ref).catch(err => console.error("Failed deleting project task", err)));
      await Promise.all(deletes);
      await deleteDoc(doc(db, "projects", project.id));
      alert("הפרויקט נמחק בהצלחה");
      router.push("/projects");
    } catch (err) {
      console.error("Failed deleting project", err);
      alert("שגיאה במחיקת הפרויקט");
    }
  };

  const handleDeleteVolunteer = async (volunteerId: string) => {
    if (!db || !project) return;
    if (!confirm("למחוק את המתנדב מהרשימה?")) return;
    setVolunteerBusy(volunteerId);
    try {
      await deleteDoc(doc(db, "projects", project.id, "volunteers", volunteerId));
      setVolunteers(prev => prev.filter(v => v.id !== volunteerId));
    } catch (err) {
      console.error("Failed to delete volunteer", err);
      alert("שגיאה במחיקת המתנדב");
    } finally {
      setVolunteerBusy(null);
    }
  };

  const openWhatsApp = (phone?: string) => {
    if (!phone) return;
    const digits = phone.replace(/\D/g, "");
    if (!digits) return;
    let normalized = digits;
    if (normalized.startsWith("972")) {
      // already includes country code
    } else if (normalized.startsWith("0")) {
      normalized = "972" + normalized.slice(1);
    } else if (normalized.length === 9) {
      normalized = "972" + normalized;
    }
    const url = `https://wa.me/${normalized}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleProjectTaskStatus = async (task: ProjectTask, newStatus: "TODO" | "IN_PROGRESS" | "DONE" | "STUCK") => {
    if (!db) return;
    try {
      const taskRef = task.scope === "project"
        ? doc(db, "projects", projectId, "tasks", task.id)
        : doc(db, "events", task.eventId, "tasks", task.id);
      await updateDoc(taskRef, { status: newStatus });
      setProjectTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (err) {
      console.error("Failed to update task status", err);
      alert("שגיאה בעדכון סטטוס המשימה");
    }
  };

  const handleProjectTaskDate = async (task: ProjectTask, date: string) => {
    if (!db) return;
    try {
      const taskRef = task.scope === "project"
        ? doc(db, "projects", projectId, "tasks", task.id)
        : doc(db, "events", task.eventId, "tasks", task.id);
      await updateDoc(taskRef, { dueDate: date });
      setProjectTasks(prev => prev.map(t => t.id === task.id ? { ...t, dueDate: date } : t));
    } catch (err) {
      console.error("Failed to update task date", err);
      alert("שגיאה בעדכון התאריך");
    }
  };

  const getAssigneeKey = (a?: { name?: string; userId?: string; email?: string } | null) => {
    if (!a) return "";
    if (a.userId) return a.userId;
    if (a.email) return a.email.toLowerCase();
    if (a.name) return a.name.toLowerCase();
    return "";
  };

  const sanitizeAssignees = (arr: { name?: string; userId?: string; email?: string }[]) => {
    const seen = new Set<string>();
    return (arr || [])
      .map(a => ({
        name: (a.name || "").trim(),
        ...(a.userId ? { userId: a.userId } : {}),
        ...(a.email ? { email: a.email.toLowerCase().trim() } : {}),
      }))
      .filter(a => {
        const key = getAssigneeKey(a);
        if (!a.name || !key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };

  const toggleNewTaskAssignee = (userId: string, fullName?: string, email?: string) => {
    setNewTask(prev => {
      const exists = prev.assignees.some(a => getAssigneeKey(a) === getAssigneeKey({ userId, email, name: fullName }));
      const next = exists
        ? prev.assignees.filter(a => getAssigneeKey(a) !== getAssigneeKey({ userId, email, name: fullName }))
        : [...prev.assignees, { userId, email, name: fullName || email || "משתמש" }];
      return { ...prev, assignees: next };
    });
  };

  const handleCreateProjectTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || !projectId || !project) return;
    const title = newTask.title.trim();
    if (!title) {
      alert("יש להזין כותרת למשימה");
      return;
    }
    if (!user) {
      alert("יש להתחבר כדי ליצור משימה חדשה");
      return;
    }
    const cleanAssignees = sanitizeAssignees(newTask.assignees);
    const primary = cleanAssignees[0];
    setSavingNewTask(true);
    try {
      const docRef = await addDoc(collection(db, "projects", projectId, "tasks"), {
        title,
        description: newTask.description.trim(),
        status: "TODO",
        dueDate: newTask.dueDate,
        priority: newTask.priority,
        assignee: primary?.name || "",
        assigneeId: primary?.userId || "",
        assignees: cleanAssignees,
        currentStatus: "",
        nextStep: "",
        isVolunteerTask: !!newTask.isVolunteerTask,
        volunteerHours: newTask.isVolunteerTask
          ? (newTask.volunteerHours != null ? Number(newTask.volunteerHours) : null)
          : null,
        createdBy: user.uid,
        createdByEmail: user.email || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const added: ProjectTask = {
        id: docRef.id,
        title,
        description: newTask.description.trim(),
        status: "TODO",
        dueDate: newTask.dueDate,
        priority: newTask.priority,
        assignee: primary?.name,
        assignees: cleanAssignees,
        currentStatus: "",
        nextStep: "",
        eventId: projectId,
        eventTitle: project.name,
        scope: "project",
        isVolunteerTask: !!newTask.isVolunteerTask,
        volunteerHours: newTask.isVolunteerTask
          ? (newTask.volunteerHours != null ? Number(newTask.volunteerHours) : null)
          : null,
      };
      setProjectTasks(prev => [added, ...prev]);
      setShowNewTask(false);
      setNewTask({ title: "", description: "", dueDate: "", priority: "NORMAL", assignees: [], isVolunteerTask: false, volunteerHours: null });
    } catch (err) {
      console.error("Failed creating project task", err);
      alert("שגיאה ביצירת המשימה");
    } finally {
      setSavingNewTask(false);
    }
  };

  const handleSaveProjectTagging = async () => {
    if (!db || !projectId || !taggingProjectTask) return;
    const clean = sanitizeAssignees(projectTagSelection);
    const primary = clean[0];
    try {
      await updateDoc(doc(db, "projects", projectId, "tasks", taggingProjectTask.id), {
        assignees: clean,
        assignee: primary?.name || "",
        assigneeId: primary?.userId || "",
        updatedAt: serverTimestamp(),
      });
      setProjectTasks(prev => prev.map(t => t.id === taggingProjectTask.id ? { ...t, assignees: clean, assignee: primary?.name } : t));
      setTaggingProjectTask(null);
      setProjectTagSelection([]);
      setProjectTagSearch("");
    } catch (err) {
      console.error("Failed updating assignees", err);
      alert("שגיאה בעדכון האחראים");
    }
  };

  const submitEditStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || !editingStatusTask) return;
    try {
      const ref = editingStatusTask.scope === "project"
        ? doc(db, "projects", projectId, "tasks", editingStatusTask.id)
        : doc(db, "events", editingStatusTask.eventId, "tasks", editingStatusTask.id);
      await updateDoc(ref, {
        currentStatus: editingStatusTask.currentStatus || "",
        nextStep: editingStatusTask.nextStep || "",
        dueDate: editingStatusTask.dueDate || "",
      });
      setProjectTasks(prev => prev.map(t => t.id === editingStatusTask.id ? { ...t, currentStatus: editingStatusTask.currentStatus, nextStep: editingStatusTask.nextStep, dueDate: editingStatusTask.dueDate } : t));
      setEditingStatusTask(null);
    } catch (err) {
      console.error("Failed to update task status fields", err);
      alert("שגיאה בעדכון המשימה");
    }
  };

  if (loading || loadingProject || !user) {
    return <div className="p-6 text-center">טוען...</div>;
  }

  if (!project) {
    return <div className="p-6 text-center text-gray-700">{error || "הפרויקט לא נמצא."}</div>;
  }

  return (
    <div className="min-h-screen p-3 sm:p-6" style={{ background: "var(--patifon-cream)" }}>
      <header className="mb-4 sm:mb-8">
        <div className="flex flex-col gap-3 sm:gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight" style={{ color: "var(--patifon-burgundy)" }}>
              {project.name}
            </h1>
            <p className="text-sm sm:text-base text-gray-700">ניהול פרויקט</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-2 mt-4">
          <Link
            href="/projects"
            className="flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-1 sm:gap-2 text-sm"
          >
            <ArrowRight size={16} className="rotate-180" />
            <span className="hidden sm:inline">חזרה לרשימת הפרוייקטים</span>
            <span className="sm:hidden">חזרה</span>
          </Link>
          {isProjectOwner(project, user) && (
            <button
              type="button"
              onClick={handleDeleteProject}
              className="px-3 sm:px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition flex items-center justify-center gap-2 text-sm"
              title="מחיקת הפרויקט"
            >
              <Trash2 size={16} />
              <span className="hidden sm:inline">מחק פרויקט</span>
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {showNewTask && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PlusCircle className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold">משימה חדשה לפרויקט</h3>
              </div>
              <button onClick={() => setShowNewTask(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateProjectTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">כותרת</label>
                <input
                  type="text"
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  value={newTask.title}
                  onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
                <textarea
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  value={newTask.description}
                  onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="פרטי המשימה, צעד הבא, קבצים רלוונטיים וכו'"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
                  <input
                    type="date"
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    value={newTask.dueDate}
                    onChange={e => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">עדיפות</label>
                  <select
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    value={newTask.priority}
                    onChange={e => setNewTask(prev => ({ ...prev, priority: e.target.value as any }))}
                  >
                    <option value="NORMAL">רגילה</option>
                    <option value="HIGH">גבוהה</option>
                    <option value="CRITICAL">קריטית</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">תיוג/הקצאה</label>
                  <span className="text-xs text-gray-500">{newTask.assignees.length} נבחרו</span>
                </div>
                <input
                  type="text"
                  value={newTaskSearch}
                  onChange={(e) => setNewTaskSearch(e.target.value)}
                  placeholder="חיפוש לפי שם"
                  className="w-full p-2 border rounded-lg text-xs mb-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <div className="max-h-48 overflow-auto border rounded-lg divide-y">
                  {usersList
                    .filter(u => (u.fullName || "").toLowerCase().includes(newTaskSearch.trim().toLowerCase()))
                    .map(u => {
                      const checked = newTask.assignees.some(a => getAssigneeKey(a) === getAssigneeKey({ userId: u.id, email: u.email, name: u.fullName }));
                      return (
                        <label key={u.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleNewTaskAssignee(u.id, u.fullName, u.email)}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">{u.fullName || "ללא שם"}</span>
                            <span className="text-xs text-gray-600">{u.email}</span>
                          </div>
                        </label>
                      );
                    })}
                  {usersList.filter(u => (u.fullName || "").toLowerCase().includes(newTaskSearch.trim().toLowerCase())).length === 0 && (
                    <div className="p-2 text-xs text-gray-500">אין משתמשים זמינים לתיוג.</div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id="projectTaskVolunteer"
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={newTask.isVolunteerTask}
                    onChange={(e) => setNewTask(prev => ({ ...prev, isVolunteerTask: e.target.checked }))}
                  />
                  <label htmlFor="projectTaskVolunteer" className="text-sm font-medium text-gray-700">
                    משימה למאגר מתנדבים
                  </label>
                </div>
                {newTask.isVolunteerTask && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">שעות התנדבות (אופציונלי)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="w-full p-2 border rounded-lg text-sm"
                        value={newTask.volunteerHours ?? ""}
                        onChange={(e) => setNewTask(prev => ({ ...prev, volunteerHours: e.target.value ? parseFloat(e.target.value) : null }))}
                        placeholder="לדוגמה 2"
                      />
                    </div>
                    <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800">
                      המשימה תופיע גם בלוח המשימות של המתנדבים
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowNewTask(false); setNewTask({ title: "", description: "", dueDate: "", priority: "NORMAL", assignees: [], isVolunteerTask: false, volunteerHours: null }); setNewTaskSearch(""); }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={savingNewTask}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
                >
                  {savingNewTask ? "שומר..." : "צור משימה"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <FolderKanban style={{ color: "var(--patifon-red)" }} size={20} />
              <h2 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>פרטי פרויקט</h2>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/events/new?projectId=${project.id}&projectName=${encodeURIComponent(project.name || "")}`}
                className="px-3 sm:px-4 py-2 rounded-lg border border-indigo-200 text-indigo-800 bg-white hover:bg-indigo-50 transition flex items-center gap-2 text-sm"
              >
                <PlusCircle size={16} />
                <span className="hidden sm:inline">פתח אירוע לפרויקט זה</span>
                <span className="sm:hidden">פתח אירוע</span>
              </Link>
              <button
                onClick={() => setEditMode((prev) => !prev)}
                className="p-2 rounded-lg border border-indigo-200 text-indigo-800 bg-white hover:bg-indigo-50 transition flex items-center justify-center"
                title={editMode ? "סגור עריכה" : "ערוך פרטים"}
              >
                <Pencil size={18} />
              </button>
            </div>
          </div>

          {!editMode ? (
            <div className="space-y-4">
              <DetailRow label="שם הפרויקט" value={project.name} />
              <DetailRow label="מה הפרויקט?" value={project.summary || "—"} />
              <DetailRow label="מטרה / יעד מרכזי" value={project.goal || "—"} />
              <DetailRow
                label="שותפים / בעלי עניין"
                value={
                  project.partners && project.partners.length > 0
                    ? project.partners.join(" · ")
                    : "אין שותפים רשומים"
                }
              />
              <DetailRow label="סטטוס" value={<StatusBadge status={project.status} />} />
              <DetailRow label="יעד זמן" value={project.dueDate || "לא צוין"} />
              {project.needsScholarshipVolunteers && (
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-indigo-800 bg-indigo-50 border border-indigo-100 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg w-fit">
                    <CheckCircle2 size={14} />
                    <span className="whitespace-nowrap">דרושים מתנדבי מלגה</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/projects/${project.id}/volunteers`;
                      if (navigator?.clipboard?.writeText) {
                        navigator.clipboard.writeText(url).then(() => {
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2000);
                        }).catch(() => alert(url));
                      } else {
                        alert(url);
                      }
                    }}
                    className="text-xs sm:text-sm font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                  >
                    {copiedLink ? "קישור הועתק" : "העתק קישור לטופס"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם הפרויקט</label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">מה הפרויקט?</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={2}
                  value={form.summary}
                  onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">מטרה / יעד מרכזי</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={2}
                  value={form.goal}
                  onChange={(e) => setForm((prev) => ({ ...prev, goal: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שותפים / בעלי עניין</label>
                  <textarea
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={3}
                    value={form.partners}
                    onChange={(e) => setForm((prev) => ({ ...prev, partners: e.target.value }))}
                    placeholder="שם בכל שורה או מופרד בפסיק"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">יעד זמן</label>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={form.dueDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={form.status}
                      onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input
                  id="needsScholarshipVolunteers"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={form.needsScholarshipVolunteers}
                  onChange={(e) => setForm((prev) => ({ ...prev, needsScholarshipVolunteers: e.target.checked }))}
                />
                <label htmlFor="needsScholarshipVolunteers" className="text-gray-800">
                  דורש מתנדבים במסלול מלגה
                </label>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">צוות הפרויקט</label>
                {loadingUsers ? (
                  <p className="text-xs text-gray-500">טוען משתמשים...</p>
                ) : usersList.length === 0 ? (
                  <p className="text-xs text-gray-500">לא נמצאו משתמשים.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="חפש לפי שם או אימייל"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1">עבדתי איתם</p>
                      <div className="max-h-48 overflow-auto border border-gray-200 rounded-lg p-2 space-y-1">
                        {filteredUsers
                          .filter((u) => project.teamMembers?.some((m) => m.userId === u.id))
                          .map((u) => {
                            const checked = form.teamMembers.some((m) => m.userId === u.id);
                            return (
                              <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1 rounded hover:bg-gray-50">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-indigo-600"
                                  checked={checked}
                                  onChange={() => {
                                    setForm((prev) => {
                                      const exists = prev.teamMembers.some((m) => m.userId === u.id);
                                      const nextMembers = exists
                                        ? prev.teamMembers.filter((m) => m.userId !== u.id)
                                        : [...prev.teamMembers, { userId: u.id, fullName: u.fullName, email: u.email }];
                                      return { ...prev, teamMembers: nextMembers };
                                    });
                                  }}
                                />
                                <span className="text-gray-800">{u.fullName || "ללא שם"}</span>
                                <span className="text-xs text-gray-500">{u.email}</span>
                              </label>
                            );
                          })}
                        {!(project.teamMembers || []).some((m) => filteredUsers.find((u) => u.id === m.userId)) && (
                          <p className="text-xs text-gray-500">אין היסטוריה משותפת.</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1">שאר המשתמשים</p>
                      <div className="max-h-48 overflow-auto border border-gray-200 rounded-lg p-2 space-y-1">
                        {filteredUsers
                          .filter((u) => !(project.teamMembers || []).some((m) => m.userId === u.id))
                          .map((u) => {
                            const checked = form.teamMembers.some((m) => m.userId === u.id);
                            return (
                              <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1 rounded hover:bg-gray-50">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-indigo-600"
                                  checked={checked}
                                  onChange={() => {
                                    setForm((prev) => {
                                      const exists = prev.teamMembers.some((m) => m.userId === u.id);
                                      const nextMembers = exists
                                        ? prev.teamMembers.filter((m) => m.userId !== u.id)
                                        : [...prev.teamMembers, { userId: u.id, fullName: u.fullName, email: u.email }];
                                      return { ...prev, teamMembers: nextMembers };
                                    });
                                  }}
                                />
                                <span className="text-gray-800">{u.fullName || "ללא שם"}</span>
                                <span className="text-xs text-gray-500">{u.email}</span>
                              </label>
                            );
                          })}
                        {filteredUsers.filter((u) => !(project.teamMembers || []).some((m) => m.userId === u.id)).length === 0 && (
                          <p className="text-xs text-gray-500">כל המשתמשים כבר עבדו איתך.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditMode(false);
                    setForm({
                      ...form,
                      name: project.name,
                      summary: project.summary || "",
                      goal: project.goal || "",
                      partners: (project.partners || []).join("\n"),
                      dueDate: project.dueDate || "",
                      status: project.status || STATUS_OPTIONS[0],
                      needsScholarshipVolunteers: !!project.needsScholarshipVolunteers,
                      teamMembers: project.teamMembers || [],
                    });
                    setError(null);
                  }}
                  className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                  שמור שינויים
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-4">
        <div className="bg-white p-4 sm:p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckSquare style={{ color: "var(--patifon-orange)" }} size={20} />
              <h2 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>
                משימות הקשורות לפרויקט
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowNewTask(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-white text-sm font-semibold hover:bg-indigo-700 transition"
              >
                <PlusCircle size={16} />
                משימה חדשה
              </button>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100">
                {projectTasks.length}
              </span>
            </div>
          </div>
          {loadingProjectTasks ? (
            <div className="flex items-center gap-2 text-gray-600 py-4">
              <Loader2 size={16} className="animate-spin" />
              טוען משימות...
            </div>
          ) : projectTasks.length === 0 ? (
            <div className="text-gray-600 text-sm">אין משימות לאירועים המשויכים לפרויקט.</div>
          ) : (
            <div className="space-y-3">
              {projectTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  id={t.id}
                  title={t.title}
                  description={t.description}
                  assignee={t.assignee || "לא משויך"}
                  assignees={t.assignees}
                  status={t.status}
                  dueDate={t.dueDate || ""}
                  priority={t.priority || "NORMAL"}
                  currentStatus={t.currentStatus}
                  nextStep={t.nextStep}
                  eventId={t.eventId}
                  eventTitle={t.eventTitle}
                  scope={t.scope}
                  previewImage={t.previewImage}
                  onStatusChange={(newStatus) => handleProjectTaskStatus(t, newStatus)}
                  onEditStatus={(task) => setEditingStatusTask({ ...t, currentStatus: task.currentStatus, nextStep: task.nextStep })}
                  onEditDate={(task) => setEditingDateTask({ ...t, dueDate: task.dueDate, eventId: t.eventId })}
                  onManageAssignees={t.scope === "event"
                    ? () => router.push(`/tasks/${t.id}?eventId=${t.eventId}&focus=assignees`)
                    : undefined}
                  onDelete={() => {
                    if (!db) return;
                    if (confirm("למחוק משימה זו?")) {
                      const ref = t.scope === "project"
                        ? doc(db, "projects", projectId, "tasks", t.id)
                        : doc(db, "events", t.eventId, "tasks", t.id);
                      deleteDoc(ref).then(() => {
                        setProjectTasks(prev => prev.filter(pt => pt.id !== t.id));
                      }).catch(err => {
                        console.error("Failed deleting task", err);
                        alert("שגיאה במחיקת משימה");
                      });
                    }
                  }}
                  onChat={() => router.push(`/tasks/${t.id}?eventId=${t.eventId}`)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Users style={{ color: "var(--patifon-orange)" }} size={20} />
            <h2 className="text-base sm:text-lg font-semibold" style={{ color: "var(--patifon-burgundy)" }}>צוות הפרויקט</h2>
            <button
              type="button"
              onClick={() => setShowTeamPicker((prev) => !prev)}
              className="p-2 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50 ml-auto"
              title="הוסף משתמשים לפרויקט"
            >
              <UserPlus size={16} />
            </button>
          </div>
          {project.teamMembers && project.teamMembers.length > 0 ? (
            <div className="space-y-2">
              {project.teamMembers.map((m) => (
                <div key={m.userId} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-semibold text-gray-900">{m.fullName || "ללא שם"}</span>
                    <span className="text-xs text-gray-600">{m.email}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">לא נבחר צוות לפרויקט.</p>
          )}
          {showTeamPicker && (
            <div className="mt-3 border border-indigo-100 rounded-lg p-3 bg-indigo-50 space-y-2">
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="חפש לפי שם או אימייל"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-auto space-y-1">
                {(filteredUsers || []).map((u) => {
                  const checked = (project.teamMembers || []).some((m) => m.userId === u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1 rounded hover:bg-white">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600"
                        checked={checked}
                        onChange={async () => {
                          if (!db || !project) return;
                          const exists = checked;
                          const nextMembers = exists
                            ? (project.teamMembers || []).filter((m) => m.userId !== u.id)
                            : [...(project.teamMembers || []), { userId: u.id, fullName: u.fullName, email: u.email }];
                          try {
                            await updateDoc(doc(db, "projects", project.id), { teamMembers: nextMembers });
                            setProject({ ...project, teamMembers: nextMembers });
                          } catch (err) {
                            console.error("Failed updating team", err);
                            alert("שגיאה בעדכון צוות");
                          }
                        }}
                      />
                      <span className="text-gray-800">{u.fullName || "ללא שם"}</span>
                      <span className="text-xs text-gray-500">{u.email}</span>
                    </label>
                  );
                })}
                {filteredUsers.length === 0 && <p className="text-xs text-gray-600">לא נמצאו משתמשים תואמים.</p>}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowTeamPicker(false)}
                  className="text-xs text-indigo-700 underline"
                >
                  סגור
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 sm:mt-6 bg-white p-4 sm:p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar style={{ color: "var(--patifon-orange)" }} size={20} />
            <h2 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>
              אירועים שקשורים לפרויקט
            </h2>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100">
            {projectEvents.length}
          </span>
        </div>
        {loadingEvents ? (
          <div className="flex items-center gap-2 text-gray-600 py-4">
            <Loader2 size={16} className="animate-spin" />
            טוען אירועים...
          </div>
        ) : projectEvents.length === 0 ? (
          <div className="text-gray-600 text-sm">עדיין לא שויכו אירועים לפרויקט.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {projectEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:border-indigo-200 hover:bg-indigo-50 transition block"
              >
                <p className="font-semibold text-gray-900 text-lg truncate">{ev.title}</p>
                <div className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                  <Calendar size={14} />
                  <span>{ev.startTime?.seconds ? new Date(ev.startTime.seconds * 1000).toLocaleString("he-IL") : "ללא תאריך"}</span>
                </div>
                <div className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                  <MapPin size={14} />
                  <span>{ev.location || "ללא מיקום"}</span>
                </div>
                {ev.status && (
                  <div className="text-xs text-gray-700 mt-2">סטטוס: {ev.status}</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Project Task Tagging Modal */}
      {taggingProjectTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">תיוג אחראים למשימה</h3>
              <button onClick={() => { setTaggingProjectTask(null); setProjectTagSelection([]); setProjectTagSearch(""); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-2">בחרו את אנשי הצוות למשימה "{taggingProjectTask.title}". ניתן לבחור יותר מאחד.</p>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">תיוג/הקצאה</label>
              <span className="text-xs text-gray-500">{projectTagSelection.length} נבחרו</span>
            </div>
            <div className="mb-3">
              <input
                type="text"
                value={projectTagSearch}
                onChange={(e) => setProjectTagSearch(e.target.value)}
                placeholder="חיפוש לפי שם"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2 mb-4 max-h-56 overflow-auto">
              {usersList
                .filter(u => (u.fullName || "").toLowerCase().includes(projectTagSearch.trim().toLowerCase()))
                .map((u) => {
                  const key = getAssigneeKey({ userId: u.id, email: u.email, name: u.fullName });
                  const checked = projectTagSelection.some(a => getAssigneeKey(a) === key);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        const exists = projectTagSelection.some(a => getAssigneeKey(a) === key);
                        setProjectTagSelection(prev => exists ? prev.filter(a => getAssigneeKey(a) !== key) : [...prev, { name: u.fullName || u.email || "משתמש", userId: u.id, email: u.email }]);
                      }}
                      className={`px-3 py-1 rounded-full text-sm border transition ${checked ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-50 text-gray-700 border-gray-200"}`}
                    >
                      {u.fullName || u.email || "משתמש"}
                    </button>
                  );
                })}
              {usersList.filter(u => (u.fullName || "").toLowerCase().includes(projectTagSearch.trim().toLowerCase())).length === 0 && (
                <span className="text-sm text-gray-500">אין חברי צוות זמינים</span>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setTaggingProjectTask(null); setProjectTagSelection([]); setProjectTagSearch(""); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleSaveProjectTagging}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Modal */}
      {editingStatusTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">עדכון מצב המשימה</h3>
              <button onClick={() => setEditingStatusTask(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitEditStatus} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">איפה זה עומד</label>
                <textarea
                  className="w-full p-2 border rounded-lg text-sm"
                  rows={2}
                  value={editingStatusTask.currentStatus || ""}
                  onChange={(e) => setEditingStatusTask(prev => prev ? { ...prev, currentStatus: e.target.value } : prev)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הצעד הבא</label>
                <textarea
                  className="w-full p-2 border rounded-lg text-sm"
                  rows={2}
                  value={editingStatusTask.nextStep || ""}
                  onChange={(e) => setEditingStatusTask(prev => prev ? { ...prev, nextStep: e.target.value } : prev)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingStatusTask(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">ביטול</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">שמור</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Date Modal */}
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
                const ref = editingDateTask.scope === "project"
                  ? doc(db, "projects", projectId, "tasks", editingDateTask.id)
                  : doc(db, "events", editingDateTask.eventId, "tasks", editingDateTask.id);
                await updateDoc(ref, {
                  dueDate: editingDateTask.dueDate,
                });
                setProjectTasks(prev => prev.map(t => t.id === editingDateTask.id ? { ...t, dueDate: editingDateTask.dueDate } : t));
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
                  value={editingDateTask.dueDate || ""}
                  onChange={e => setEditingDateTask(prev => prev ? { ...prev, dueDate: e.target.value } : prev)}
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

      {project.needsScholarshipVolunteers && (
        <div className="mt-4 sm:mt-6 bg-white p-4 sm:p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users style={{ color: "var(--patifon-orange)" }} size={20} />
              <h2 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>
                מתנדבי מלגה שנרשמו
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100">
              {volunteers.length}
            </span>
          </div>
          {loadingVolunteers ? (
            <div className="flex items-center gap-2 text-gray-600 py-4">
              <Loader2 size={16} className="animate-spin" />
              טוען רשימת מתנדבים...
            </div>
          ) : volunteers.length === 0 ? (
            <div className="text-gray-600 text-sm">עוד לא נרשמו מתנדבים.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {volunteers.map((v) => (
                <div key={v.id} className="p-4 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-lg truncate">
                        {[v.firstName, v.lastName].filter(Boolean).join(" ") || "מתנדב/ת"}{" "}
                      </p>
                      <div className="flex items-center gap-2">
                        {v.phone && (
                          <button
                            onClick={() => openWhatsApp(v.phone)}
                            className="p-1.5 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition"
                            title="שלח הודעת וואטסאפ"
                          >
                            <MessageCircle size={14} />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteVolunteer(v.id)}
                            disabled={volunteerBusy === v.id}
                            className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition disabled:opacity-50"
                            title="מחק מתנדב"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    {v.createdAt?.seconds && (
                      <span className="text-[11px] text-gray-500">
                        {new Date(v.createdAt.seconds * 1000).toLocaleDateString("he-IL")}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 space-y-1">
                    {v.program && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">חוג:</span>
                        <span className="font-medium">{v.program}</span>
                      </div>
                    )}
                    {v.year && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">שנת לימודים:</span>
                        <span className="font-medium">{v.year}</span>
                      </div>
                    )}
                    {v.phone && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">נייד:</span>
                        <span className="font-medium">{v.phone}</span>
                      </div>
                    )}
                    {v.email && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">מייל:</span>
                        <span className="font-medium">{v.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs sm:text-sm font-semibold text-gray-800 mb-1">{label}</p>
      <div className="text-gray-700 text-xs sm:text-sm leading-relaxed">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    "בתכנון": { bg: "bg-blue-50", text: "text-blue-800" },
    "בביצוע": { bg: "bg-green-50", text: "text-green-800" },
    "בהקפאה": { bg: "bg-yellow-50", text: "text-yellow-800" },
    "הושלם": { bg: "bg-gray-200", text: "text-gray-800" },
  };
  const colors = colorMap[status || ""] || colorMap["בביצוע"];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colors.bg} ${colors.text} border-current`}>
      <CheckCircle2 size={12} />
      {status || "בביצוע"}
    </span>
  );
}
