"use client";

import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, serverTimestamp, updateDoc, query, where, deleteDoc } from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Calendar, CheckCircle2, FolderKanban, Loader2, Pencil, Users, PlusCircle, MapPin, Trash2, MessageCircle, CheckSquare, Clock, X } from "lucide-react";
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
}

const ALLOWED_EMAIL = "bengo0469@gmail.com";
const STATUS_OPTIONS = ["בתכנון", "בביצוע", "בהקפאה", "הושלם"];
const normalizeEmail = (val?: string | null) => (val || "").toLowerCase();

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
  const isAdmin = (user?.email || "").toLowerCase() === ALLOWED_EMAIL;
  const [copiedLink, setCopiedLink] = useState(false);

  const isAllowed = useMemo(() => normalizeEmail(user?.email) === ALLOWED_EMAIL, [user?.email]);

  const [form, setForm] = useState({
    name: "",
    summary: "",
    goal: "",
    partners: "",
    dueDate: "",
    status: STATUS_OPTIONS[0],
    needsScholarshipVolunteers: false,
  });

  useEffect(() => {
    const loadProject = async () => {
      if (!db || !projectId) return;
      setLoadingProject(true);
      setLoadingVolunteers(true);
      setLoadingEvents(true);
      setError(null);
      try {
        const [snap, volunteersSnap, eventsSnap] = await Promise.all([
          getDoc(doc(db, "projects", projectId)),
          getDocs(collection(db, "projects", projectId, "volunteers")),
          getDocs(query(collection(db, "events"), where("projectId", "==", projectId))),
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
              });
            });
          } catch (err) {
            console.error("Failed loading tasks for event", ev.id, err);
          }
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
      }
    };

    if (!loading && user && isAllowed) {
      loadProject();
    }
  }, [loading, user, isAllowed, projectId]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!isAllowed) {
      router.push("/");
    }
  }, [user, loading, isAllowed, router]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || !project || !isAllowed) return;
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
      });
      setEditMode(false);
    } catch (err) {
      console.error("Failed updating project", err);
      setError("לא ניתן לשמור כרגע. נסה שוב בעוד רגע.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVolunteer = async (volunteerId: string) => {
    if (!db || !project || !isAdmin) return;
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
      await updateDoc(doc(db, "events", task.eventId, "tasks", task.id), { status: newStatus });
      setProjectTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (err) {
      console.error("Failed to update task status", err);
      alert("שגיאה בעדכון סטטוס המשימה");
    }
  };

  const handleProjectTaskDate = async (task: ProjectTask, date: string) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, "events", task.eventId, "tasks", task.id), { dueDate: date });
      setProjectTasks(prev => prev.map(t => t.id === task.id ? { ...t, dueDate: date } : t));
    } catch (err) {
      console.error("Failed to update task date", err);
      alert("שגיאה בעדכון התאריך");
    }
  };

  if (loading || loadingProject || !user) {
    return <div className="p-6 text-center">טוען...</div>;
  }

  if (!isAllowed) {
    return <div className="p-6 text-center text-gray-700">המסך זמין רק לחשבון המורשה.</div>;
  }

  if (!project) {
    return <div className="p-6 text-center text-gray-700">{error || "הפרויקט לא נמצא."}</div>;
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--patifon-cream)" }}>
      <header className="flex items-start justify-between mb-8">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-indigo-800 font-semibold bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full w-fit">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-100 text-indigo-700">✦</span>
            גישה זמינה רק ל- {ALLOWED_EMAIL}
          </div>
          <div>
            <h1 className="text-3xl font-bold leading-tight" style={{ color: "var(--patifon-burgundy)" }}>
              {project.name}
            </h1>
            <p className="text-gray-700">ניהול פרויקט</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/projects"
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
          >
            <ArrowRight size={16} className="rotate-180" />
            חזרה לרשימת הפרוייקטים
          </Link>
          <Link
            href={`/events/new?projectId=${project.id}&projectName=${encodeURIComponent(project.name || "")}`}
            className="px-4 py-2 rounded-lg border border-indigo-200 text-indigo-800 bg-white hover:bg-indigo-50 transition flex items-center gap-2"
          >
            <PlusCircle size={16} />
            פתח אירוע לפרויקט זה
          </Link>
          <button
            onClick={() => setEditMode((prev) => !prev)}
            className="px-4 py-2 rounded-lg border border-indigo-200 text-indigo-800 bg-white hover:bg-indigo-50 transition flex items-center gap-2"
          >
            <Pencil size={16} />
            {editMode ? "סגור עריכה" : "ערוך פרטים"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl vinyl-shadow lg:col-span-2" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
          <div className="flex items-center gap-2 mb-4">
            <FolderKanban style={{ color: "var(--patifon-red)" }} />
            <h2 className="text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>פרטי פרויקט</h2>
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
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-indigo-800 bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-lg w-fit">
                    <CheckCircle2 size={14} />
                    דרושים מתנדבי מלגה
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
                    className="text-sm font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
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

        <div className="bg-white p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Calendar style={{ color: "var(--patifon-orange)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--patifon-burgundy)" }}>מידע נוסף</h2>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-500" />
              <span>בעלים: {project.ownerEmail || "—"}</span>
            </div>
            {project.createdAt?.seconds && (
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-gray-500" />
                <span>נוצר ב- {new Date(project.createdAt.seconds * 1000).toLocaleString("he-IL")}</span>
              </div>
            )}
            {project.updatedAt?.seconds && (
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-gray-500" />
                <span>עודכן לאחרונה: {new Date(project.updatedAt.seconds * 1000).toLocaleString("he-IL")}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar style={{ color: "var(--patifon-orange)" }} />
            <h2 className="text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>
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
                await updateDoc(doc(db, "events", editingDateTask.eventId, "tasks", editingDateTask.id), {
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
      <div className="mt-6 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckSquare style={{ color: "var(--patifon-orange)" }} />
            <h2 className="text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>
              משימות הקשורות לפרויקט
            </h2>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100">
            {projectTasks.length}
          </span>
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
                previewImage={t.previewImage}
                onStatusChange={(newStatus) => handleProjectTaskStatus(t, newStatus)}
                onEditStatus={(task) => setEditingStatusTask({ ...t, currentStatus: task.currentStatus, nextStep: task.nextStep })}
                onEditDate={(task) => setEditingDateTask({ ...t, dueDate: task.dueDate, eventId: t.eventId })}
                onManageAssignees={() => router.push(`/tasks/${t.id}?eventId=${t.eventId}&focus=assignees`)}
                onDelete={() => {
                  if (!db || !isAdmin) return;
                  if (confirm("למחוק משימה זו?")) {
                    deleteDoc(doc(db, "events", t.eventId, "tasks", t.id)).then(() => {
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

      {project.needsScholarshipVolunteers && (
        <div className="mt-6 bg-white p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users style={{ color: "var(--patifon-orange)" }} />
              <h2 className="text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>
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
      <p className="text-sm font-semibold text-gray-800 mb-1">{label}</p>
      <div className="text-gray-700 text-sm">{value}</div>
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
  // Handle edit status modal for tasks
  const submitEditStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || !editingStatusTask) return;
    try {
      await updateDoc(doc(db, "events", editingStatusTask.eventId, "tasks", editingStatusTask.id), {
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
