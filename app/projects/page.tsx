"use client";

import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc, where, query } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Calendar, CheckCircle2, ClipboardList, FolderKanban, Loader2, Plus, RefreshCcw, Users } from "lucide-react";

interface Project {
  id: string;
  name: string;
  summary?: string;
  goal?: string;
  partners?: string[];
  status?: string;
  dueDate?: string;
  ownerId?: string;
  ownerEmail?: string;
  createdAt?: any;
  updatedAt?: any;
  needsScholarshipVolunteers?: boolean;
  teamMembers?: { userId: string; fullName?: string; email?: string }[];
}

const ALLOWED_EMAIL = "bengo0469@gmail.com";
const STATUS_OPTIONS = ["בתכנון", "בביצוע", "בהקפאה", "הושלם"];

const normalizeEmail = (val?: string | null) => (val || "").toLowerCase();

export default function ProjectsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [usersList, setUsersList] = useState<{ id: string; fullName?: string; email?: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [collaboratedIds, setCollaboratedIds] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState("");

  const emptyForm = {
    name: "",
    summary: "",
    goal: "",
    partners: "",
    dueDate: "",
    status: STATUS_OPTIONS[0],
    needsScholarshipVolunteers: false,
    teamMembers: [] as { userId: string; fullName?: string; email?: string }[],
  };

  const [form, setForm] = useState(emptyForm);

  const isAllowed = useMemo(() => normalizeEmail(user?.email) === ALLOWED_EMAIL, [user?.email]);

  const fetchProjects = useCallback(async () => {
    if (!db || !user) return;
    setLoadingProjects(true);
    setError(null);
    try {
      const byIdQuery = query(collection(db, "projects"), where("ownerId", "==", user.uid));
      const snapshots = [await getDocs(byIdQuery)];

      if (user.email) {
        const byEmailQuery = query(collection(db, "projects"), where("ownerEmail", "==", user.email));
        snapshots.push(await getDocs(byEmailQuery));
      }

      const combined: Project[] = [];
      const seen = new Set<string>();

      snapshots.forEach((snap) => {
        snap.forEach((docSnap) => {
          if (seen.has(docSnap.id)) return;
          seen.add(docSnap.id);
          const data = docSnap.data() as any;
          combined.push({
            id: docSnap.id,
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
          });
        });
      });

      const sorted = combined.sort((a, b) => {
        const aDate = a.createdAt?.seconds || 0;
        const bDate = b.createdAt?.seconds || 0;
        return bDate - aDate;
      });

      setProjects(sorted);
    } catch (err) {
      console.error("Failed loading projects", err);
      setError("שגיאה בטעינת הפרוייקטים.");
    } finally {
      setLoadingProjects(false);
    }
  }, [user]);

  useEffect(() => {
    const loadUsers = async () => {
      if (!db || !showForm) return;
      setLoadingUsers(true);
      try {
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            fullName: data.fullName || data.name || data.displayName || data.email || "משתמש ללא שם",
            email: data.email || "",
          };
        });
        setUsersList(list);
      } catch (err) {
        console.error("Failed loading users list", err);
      } finally {
        setLoadingUsers(false);
      }
    };
    loadUsers();
  }, [db, showForm]);
  // derive collaborators from existing projects teamMembers
  useEffect(() => {
    const ids = new Set<string>();
    projects.forEach((p) => (p.teamMembers || []).forEach((m) => m.userId && ids.add(m.userId)));
    setCollaboratedIds(ids);
  }, [projects]);
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return usersList;
    const q = userSearch.trim().toLowerCase();
    return usersList.filter(
      (u) =>
        (u.fullName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [usersList, userSearch]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!isAllowed) {
      router.push("/");
      return;
    }
    fetchProjects();
  }, [user, loading, isAllowed, fetchProjects, router]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || !user || !isAllowed) return;
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
      const docRef = await addDoc(collection(db, "projects"), {
        name: form.name.trim(),
        summary: form.summary.trim(),
        goal: form.goal.trim(),
        partners: partnersArr,
        status: form.status,
        dueDate: form.dueDate,
        needsScholarshipVolunteers: form.needsScholarshipVolunteers,
        teamMembers: form.teamMembers,
        ownerId: user.uid,
        ownerEmail: user.email || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const optimistic: Project = {
        id: docRef.id,
        name: form.name.trim(),
        summary: form.summary.trim(),
        goal: form.goal.trim(),
        partners: partnersArr,
        status: form.status,
        dueDate: form.dueDate,
        needsScholarshipVolunteers: form.needsScholarshipVolunteers,
        teamMembers: form.teamMembers,
        ownerId: user.uid,
        ownerEmail: user.email || "",
        createdAt: { seconds: Math.floor(Date.now() / 1000) },
      };
      setProjects((prev) => [optimistic, ...prev]);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      console.error("Failed creating project", err);
      setError("לא ניתן לשמור כרגע. נסה שוב בעוד רגע.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    if (!db || !isAllowed) return;
    setStatusUpdating(projectId);
    try {
      await updateDoc(doc(db, "projects", projectId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p)));
    } catch (err) {
      console.error("Failed updating status", err);
      setError("לא הצלחנו לעדכן סטטוס.");
    } finally {
      setStatusUpdating(null);
    }
  };

  if (loading || !user) {
    return <div className="p-6 text-center">טוען...</div>;
  }

  if (!isAllowed) {
    return <div className="p-6 text-center text-gray-700">המסך זמין רק לחשבון המורשה.</div>;
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--patifon-cream)" }}>
      <header className="flex items-start justify-between mb-8">
        <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-indigo-800 font-semibold bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full w-fit">
          <SparklesDot />
          גישה זמינה רק ל- {ALLOWED_EMAIL}
          </div>
          <div>
            <h1 className="text-3xl font-bold leading-tight" style={{ color: "var(--patifon-burgundy)" }}>
              ניהול פרוייקטים
            </h1>
            <p className="text-gray-700">לוח פנימי לכל הפרוייקטים שאני מוביל.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
          >
            <ArrowRight size={16} className="rotate-180" />
            חזרה ללוח הבית
          </Link>
          <button
            onClick={fetchProjects}
            className="px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition flex items-center gap-2"
          >
            {loadingProjects ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            רענן רשימה
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
          <div className="flex items-center gap-2 mb-4">
            <FolderKanban style={{ color: "var(--patifon-red)" }} />
            <h2 className="text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>פרויקט חדש</h2>
          </div>
          {!showForm ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">לחץ כדי לפתוח טופס פרויקט חדש. המידע יישמר ב-Firestore.</p>
              <button
                onClick={() => { setShowForm(true); setForm(emptyForm); setError(null); }}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-semibold hover:bg-indigo-700 transition"
              >
                <Plus size={16} />
                פתח פרויקט חדש
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                המידע נשמר ב- Firestore ב-collection `projects`, כך שבעתיד יופיע גם באתר החי.
              </p>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שם הפרויקט</label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="לדוגמה: שדרוג מערכת ההזמנות"
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
                    placeholder="תיאור קצר / תחום אחריות"
                    value={form.summary}
                    onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מטרה / יעד מרכזי</label>
                  <textarea
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={2}
                    placeholder="איך נדע שהצלחנו?"
                    value={form.goal}
                    onChange={(e) => setForm((prev) => ({ ...prev, goal: e.target.value }))}
                  />
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
                        {filteredUsers.filter(u => collaboratedIds.has(u.id)).map((u) => {
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
                        {filteredUsers.filter(u => collaboratedIds.has(u.id)).length === 0 && <p className="text-xs text-gray-500">אין היסטוריה משותפת.</p>}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1">שאר המשתמשים</p>
                      <div className="max-h-48 overflow-auto border border-gray-200 rounded-lg p-2 space-y-1">
                        {filteredUsers.filter(u => !collaboratedIds.has(u.id)).map((u) => {
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
                        {filteredUsers.filter(u => !collaboratedIds.has(u.id)).length === 0 && <p className="text-xs text-gray-500">כל המשתמשים כבר עבדו איתך.</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שותפים / בעלי עניין</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      rows={3}
                      placeholder="שם בכל שורה או מופרד בפסיק"
                      value={form.partners}
                      onChange={(e) => setForm((prev) => ({ ...prev, partners: e.target.value }))}
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
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setForm(emptyForm); setError(null); }}
                    className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    ביטול
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    הוסף פרויקט
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList style={{ color: "var(--patifon-orange)" }} />
            <h2 className="text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>הפרוייקטים שלי</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100">{projects.length}</span>
          </div>
          {loadingProjects ? (
            <div className="flex items-center justify-center gap-2 text-gray-600 py-10">
              <Loader2 size={18} className="animate-spin" />
              טוען פרוייקטים...
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center text-gray-600 py-10">לא נוצרו פרוייקטים עדיין.</div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="p-4 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50 transition"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h3>
                        <StatusBadge status={project.status} />
                      </div>
                      {project.summary && (
                        <p className="text-sm text-gray-700 mb-1">{project.summary}</p>
                      )}
                      {project.goal && (
                        <p className="text-xs text-gray-600">מטרה: {project.goal}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-600">
                        <Users size={14} />
                        {project.partners && project.partners.length > 0 ? (
                          <span>{project.partners.join(" · ")}</span>
                        ) : (
                          <span>אין שותפים רשומים</span>
                        )}
                      </div>
                      {project.dueDate && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                          <Calendar size={14} />
                          <span>יעד: {project.dueDate}</span>
                        </div>
                      )}
                      {project.needsScholarshipVolunteers && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-full">
                            <CheckCircle2 size={12} />
                            דרושים מתנדבי מלגה
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const link = `${window.location.origin}/projects/${project.id}/volunteers`;
                              if (navigator?.clipboard?.writeText) {
                                navigator.clipboard.writeText(link).then(() => {
                                  setCopiedProjectId(project.id);
                                  setTimeout(() => setCopiedProjectId(null), 2000);
                                }).catch(() => alert(link));
                              } else {
                                alert(link);
                              }
                            }}
                            className="text-xs underline text-indigo-700 hover:text-indigo-900 font-semibold"
                          >
                            {copiedProjectId === project.id ? "הועתק!" : "העתק קישור לטופס"}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <select
                        value={project.status || STATUS_OPTIONS[1]}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleStatusChange(project.id, e.target.value)}
                        disabled={statusUpdating === project.id}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-gray-500">עדכן סטטוס</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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

function SparklesDot() {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-100 text-indigo-700">✦</span>
  );
}
