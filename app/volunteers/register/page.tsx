"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { Handshake, CheckCircle, Send, ExternalLink } from "lucide-react";

export default function GeneralVolunteerRegister() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    idNumber: "",
    phone: "",
    email: "",
    program: "",
    year: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const hashPassword = async (password: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;
    if (!form.firstName.trim() || !form.lastName.trim() || !form.idNumber.trim() || !form.phone.trim() || !form.email.trim()) {
      setError("יש למלא שם פרטי, שם משפחה, ת.ז, נייד ואימייל");
      return;
    }
    if (!form.password.trim() || form.password.length < 6) {
      setError("יש להזין סיסמה עם לפחות 6 תווים");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("הסיסמאות לא תואמות");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // prevent duplicate email
      const dupSnap = await getDocs(query(collection(db, "general_volunteers"), where("email", "==", form.email.trim())));
      if (!dupSnap.empty) {
        setError("אימייל זה כבר רשום כמתנדב כללי.");
        setSubmitting(false);
        return;
      }

      const passwordHash = await hashPassword(form.password.trim());
      await addDoc(collection(db, "general_volunteers"), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        idNumber: form.idNumber.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        program: form.program.trim(),
        year: form.year.trim(),
        passwordHash,
        createdAt: serverTimestamp(),
        source: "general",
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("volunteerAuthSession", JSON.stringify({ email: form.email.trim(), passwordHash }));
      }

      setSubmitted(true);
      setTimeout(() => router.push("/volunteers/events"), 1000);
    } catch (err) {
      console.error("Error registering general volunteer", err);
      setError("שגיאה בהרשמה, נסה שוב בעוד רגע.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fff7ed] via-white to-[#f5f3ff] p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl border border-orange-100 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 rounded-full">
              <Handshake className="text-indigo-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-indigo-700 font-semibold">הרשמת מתנדב כללי</p>
              <h1 className="text-2xl font-bold text-gray-900">פתיחת חשבון מתנדב</h1>
              <p className="text-gray-600 text-sm mt-1">
                אחרי ההרשמה תוכל/י לבחור משימות למתנדבים, לשריין אותן ולסמן ביצוע. משימות שסומנו כמבוצעות יישלחו לאישור יוצר המשימה.
              </p>
            </div>
          </div>
          <Link
            href="/volunteers/events"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-semibold transition self-start md:self-auto"
          >
            לאזור האישי של המתנדב
            <ExternalLink size={16} />
          </Link>
        </div>

        {submitted ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle className="mx-auto mb-3 text-green-600" size={48} />
            <h2 className="text-xl font-bold text-green-900 mb-2">נרשמת בהצלחה!</h2>
            <p className="text-green-700 mb-4">מנתב אותך לאזור האישי כדי לבחור משימות.</p>
            <Link
              href="/volunteers/events"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold"
            >
              מעבר לאזור האישי
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">שם פרטי *</label>
                <input
                  type="text"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                  placeholder="לדוגמה: רוני"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">שם משפחה *</label>
                <input
                  type="text"
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                  placeholder="לדוגמה: כהן"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">תעודת זהות *</label>
                <input
                  type="text"
                  required
                  value={form.idNumber}
                  onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                  placeholder="לדוגמה: 123456789"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">נייד *</label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                  placeholder="050-0000000"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">מייל *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                  placeholder="you@example.com"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">חוג</label>
                <input
                  type="text"
                  value={form.program}
                  onChange={(e) => setForm({ ...form, program: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                  placeholder="לדוגמה: הנדסת תוכנה"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">שנת לימודים</label>
                <input
                  type="text"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                  placeholder="לדוגמה: שנה ב'"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">סיסמה *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                  placeholder="לפחות 6 תווים"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1">אימות סיסמה *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm"
                  placeholder="הקלד שוב לאימות"
                  disabled={submitting}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                  שולח...
                </>
              ) : (
                <>
                  <Send size={16} />
                  שלח הרשמה ועבור לאזור האישי
                </>
              )}
            </button>
            <p className="text-xs text-gray-500 text-center mt-1">
              פרטי ההרשמה נשמרים לצורך הפעלה במערכת המשימות למתנדבים.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
