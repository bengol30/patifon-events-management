"use client";

import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, FileEdit, Loader2, Trash2, Download } from "lucide-react";
import Link from "next/link";

const ADMIN_EMAIL = "bengo0469@gmail.com";

interface EditRequest {
  id: string;
  title?: string;
  message: string;
  contact?: string;
  imageUrl?: string;
  status?: string;
  createdAt?: any;
}

export default function RequestsInboxPage() {
  const { user, loading } = useAuth();
  const [requests, setRequests] = useState<EditRequest[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = (user?.email || "").toLowerCase() === ADMIN_EMAIL;

  useEffect(() => {
    if (loading) return;
    if (!user || !isAdmin) return;
    const load = async () => {
      if (!db) return;
      setLoadingList(true);
      setError(null);
      try {
        const snap = await getDocs(query(collection(db, "edit_requests"), orderBy("createdAt", "desc")));
        const data: EditRequest[] = [];
        snap.forEach((d) => {
          data.push({ id: d.id, ...(d.data() as any) });
        });
        setRequests(data);
      } catch (err) {
        console.error("Failed loading requests", err);
        setError("שגיאה בטעינת בקשות.");
      } finally {
        setLoadingList(false);
      }
    };
    load();
  }, [loading, user, isAdmin]);

  const handleMarkRead = async (id: string) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, "edit_requests", id), { status: "READ" });
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "READ" } : r)));
    } catch (err) {
      console.error("Failed to mark read", err);
      setError("לא הצלחנו לעדכן סטטוס.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!db) return;
    if (!confirm("למחוק את הבקשה?")) return;
    try {
      await deleteDoc(doc(db, "edit_requests", id));
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Failed deleting request", err);
      setError("לא הצלחנו למחוק את הבקשה.");
    }
  };

  if (loading) return <div className="p-6 text-center">טוען...</div>;
  if (!isAdmin) return <div className="p-6 text-center text-gray-700">גישה רק לאדמין.</div>;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--patifon-cream)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileEdit style={{ color: "var(--patifon-red)" }} />
            <h1 className="text-2xl font-bold" style={{ color: "var(--patifon-burgundy)" }}>בקשות לעריכה - אדמין</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900">
              <ArrowRight size={16} className="rotate-180" />
              חזרה ללוח הבית
            </Link>
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition text-sm"
            >
              מסך הבית
            </Link>
          </div>
        </div>

        {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        {loadingList ? (
          <div className="flex items-center gap-2 text-gray-600">
            <Loader2 size={16} className="animate-spin" />
            טוען בקשות...
          </div>
        ) : requests.length === 0 ? (
          <div className="text-gray-700 text-sm">אין בקשות כרגע.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {requests.map((req) => (
              <div key={req.id} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-gray-900">{req.title || "בקשה"}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${req.status === "READ" ? "bg-gray-50 text-gray-700 border-gray-200" : "bg-green-50 text-green-800 border-green-200"}`}>
                    {req.status === "READ" ? "נקרא" : "חדש"}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{req.message}</p>
                {req.imageUrl && (
                  <div className="flex items-center gap-2 mb-2">
                    <img src={req.imageUrl} alt="קובץ מצורף" className="h-16 w-16 object-cover rounded border border-gray-200" />
                    <a
                      href={req.imageUrl}
                      download
                      className="inline-flex items-center gap-1 text-xs text-indigo-700 underline"
                    >
                      <Download size={14} />
                      הורד תמונה
                    </a>
                  </div>
                )}
                <div className="text-xs text-gray-600 space-y-1">
                  {req.contact && <p>דוא"ל ליצירת קשר: {req.contact}</p>}
                  {req.createdAt?.seconds && (
                    <p>נשלח: {new Date(req.createdAt.seconds * 1000).toLocaleString("he-IL")}</p>
                  )}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  {req.status !== "READ" && (
                    <button
                      onClick={() => handleMarkRead(req.id)}
                      className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      <CheckCircle2 size={14} />
                      סמן כנקרא
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(req.id)}
                    className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
