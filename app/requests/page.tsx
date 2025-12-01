"use client";

import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Link from "next/link";
import { useState } from "react";
import { FileEdit, Loader2, Upload, Send } from "lucide-react";

const ADMIN_EMAIL = "bengo0469@gmail.com";

export default function RequestFormPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [contact, setContact] = useState(user?.email || "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) {
      setError("Firebase לא מאותחל.");
      return;
    }
    if (!message.trim()) {
      setError("אנא הסבר את הבקשה.");
      return;
    }
    setError(null);
    setSuccess(false);
    setUploading(true);
    let imageUrl: string | null = null;

    try {
      if (file && storage) {
        const storageRef = ref(storage, `edit_requests/${Date.now()}-${file.name}`);
        await uploadBytes(storageRef, file);
        imageUrl = await getDownloadURL(storageRef);
      }

      await addDoc(collection(db, "edit_requests"), {
        title: title.trim() || "בקשת עריכה",
        message: message.trim(),
        contact: contact.trim(),
        imageUrl,
        createdAt: serverTimestamp(),
        status: "UNREAD",
        createdBy: user?.uid || null,
        createdByEmail: user?.email || null,
        notifyEmail: ADMIN_EMAIL,
      });

      setSuccess(true);
      setMessage("");
      setTitle("");
      setContact(user?.email || "");
      setFile(null);
    } catch (err) {
      console.error("Failed submitting request", err);
      setError("שגיאה בשליחת הבקשה. נסה שוב.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--patifon-cream)" }}>
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl vinyl-shadow" style={{ border: "2px solid var(--patifon-cream-dark)" }}>
        <div className="flex items-center gap-2 mb-4">
          <FileEdit style={{ color: "var(--patifon-red)" }} />
          <h1 className="text-2xl font-bold" style={{ color: "var(--patifon-burgundy)" }}>בקשות לעריכה / פיצ'רים</h1>
        </div>
        <p className="text-sm text-gray-700 mb-4">
          ספרו לנו על תיקונים, שיפורים או פיצ'רים שהייתם רוצים לראות במערכת. אפשר לצרף תמונת מסך כדי שנבין טוב יותר.
        </p>

        {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        {success && <div className="mb-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">הבקשה נשלחה! תודה.</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">כותרת קצרה</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: שדה חיפוש חדש ברשימת אירועים"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תיאור / הסבר</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="מה תרצה לשפר או להוסיף? למה זה חשוב? "
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">דוא\"ל ליצירת קשר (אופציונלי)</label>
            <input
              type="email"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="your@email.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">צרף תמונה (אופציונלי)</label>
            <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 cursor-pointer hover:border-indigo-400">
              <Upload size={16} />
              <span>{file ? file.name : "בחר קובץ או גרור לכאן"}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              שלח בקשה
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
