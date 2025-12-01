"use client";

import { db } from "@/lib/firebase";
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, where, query } from "firebase/firestore";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Users } from "lucide-react";

interface ProjectMeta {
  name?: string;
  needsScholarshipVolunteers?: boolean;
  id?: string;
}

const ALLOWED_EMAIL = "bengo0469@gmail.com";

export default function VolunteersFormPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectsOptions, setProjectsOptions] = useState<ProjectMeta[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    idNumber: "",
    phone: "",
    email: "",
    program: "",
    year: "",
  });

  useEffect(() => {
    const loadProject = async () => {
      if (!db || !projectId) return;
      setLoadingProject(true);
      try {
        const snap = await getDoc(doc(db, "projects", projectId));
        if (!snap.exists()) {
          setError("הפרויקט לא נמצא");
          return;
        }
        const data = snap.data() as any;
        setProject({ id: projectId, name: data.name || "פרויקט", needsScholarshipVolunteers: data.needsScholarshipVolunteers });
        if (!data.needsScholarshipVolunteers) {
          setError("פרויקט זה לא דורש מתנדבים למסלול מלגה כרגע.");
        }
        setSelectedProjectId(projectId);

        // load other projects (only owner projects)
        const ownerQuery = query(collection(db, "projects"), where("ownerEmail", "==", ALLOWED_EMAIL));
        const optsSnap = await getDocs(ownerQuery);
        const options: ProjectMeta[] = [];
        optsSnap.forEach((d) => {
          const pd = d.data() as any;
          options.push({
            id: d.id,
            name: pd.name || "פרויקט",
            needsScholarshipVolunteers: pd.needsScholarshipVolunteers,
          });
        });
        const filtered = options.filter((p) => p.needsScholarshipVolunteers);
        if (filtered.every((p) => p.id !== projectId)) {
          filtered.unshift({ id: projectId, name: data.name || "פרויקט", needsScholarshipVolunteers: data.needsScholarshipVolunteers });
        }
        setProjectsOptions(filtered);
      } catch (err) {
        console.error("Failed loading project for volunteers", err);
        setError("שגיאה בטעינת הפרויקט.");
      } finally {
        setLoadingProject(false);
      }
    };
    loadProject();
  }, [projectId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!db || !selectedProjectId) {
      setError("יש לבחור פרויקט.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await addDoc(collection(db, "projects", selectedProjectId, "volunteers"), {
        ...form,
        createdAt: serverTimestamp(),
      });
      setSuccess(true);
      setForm({ firstName: "", lastName: "", idNumber: "", phone: "", email: "", program: "", year: "" });
    } catch (err) {
      console.error("Failed saving volunteer", err);
      setError("לא הצלחנו לשמור את ההרשמה. נסה שוב בעוד רגע.");
    } finally {
      setSaving(false);
    }
  };

  if (loadingProject) {
    return <div className="p-6 text-center">טוען...</div>;
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--patifon-cream)" }}>
      <header className="mb-8">
        <h1 className="text-3xl font-bold leading-tight" style={{ color: "var(--patifon-burgundy)" }}>
          הרשמת מתנדבי מלגה
        </h1>
        <p className="text-gray-700 text-sm">
          {project?.name ? `לפרויקט: ${project.name}` : "לפרויקט לא מזוהה"}
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle2 size={16} />
          ההרשמה נשלחה! נחזור אליך בהקדם.
        </div>
      )}

      <div className="bg-white p-6 rounded-xl vinyl-shadow max-w-3xl" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Users style={{ color: "var(--patifon-orange)" }} />
          <h2 className="text-xl font-semibold" style={{ color: "var(--patifon-burgundy)" }}>פרטי מתנדב</h2>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="בחר פרויקט" required>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              required
            >
              <option value="">בחר פרויקט</option>
              {projectsOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="שם פרטי" required>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              required
            />
          </Field>
          <Field label="שם משפחה" required>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
              required
            />
          </Field>
          <Field label="תעודת זהות" required>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.idNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, idNumber: e.target.value }))}
              required
            />
          </Field>
          <Field label="נייד" required>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              required
            />
          </Field>
          <Field label="מייל" required>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
          </Field>
          <Field label="חוג">
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.program}
              onChange={(e) => setForm((prev) => ({ ...prev, program: e.target.value }))}
            />
          </Field>
          <Field label="שנת לימודים">
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.year}
              onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
            />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              שלח הרשמה
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, required = false }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gray-800">
      <span className="font-medium">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
