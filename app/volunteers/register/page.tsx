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

  const renderInput = (
    label: string,
    key: keyof typeof form,
    options?: { type?: string; placeholder?: string; required?: boolean; minLength?: number }
  ) => (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-gray-800">{label}{options?.required ? " *" : ""}</label>
      <input
        type={options?.type || "text"}
        required={options?.required}
        minLength={options?.minLength}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-400"
        placeholder={options?.placeholder}
        disabled={submitting}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed,_#ffffff_50%,_#eef2ff_100%)] px-4 py-5 md:px-6 md:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <section className="grid gap-6 overflow-hidden rounded-[28px] border border-orange-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] lg:grid-cols-[1fr_0.85fr]">
          <div className="p-5 md:p-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
              <Handshake size={16} />
              פתיחת חשבון מתנדב
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">הרשמה פשוטה, ואז ישר לאזור האישי</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 md:text-base">
              ממלאים פרטים פעם אחת, בוחרים סיסמה, והמערכת מעבירה אותך אוטומטית למסך המשימות.
              מרגע זה אפשר לבחור משימות, לשלוח ביצוע לאישור ולעקוב אחרי שעות שהתעדכנו.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
                <div className="font-semibold">1. פתיחת חשבון</div>
                <div className="mt-1 text-indigo-800">שומרים פרטים בסיסיים וסיסמה.</div>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-semibold">2. כניסה אוטומטית</div>
                <div className="mt-1 text-amber-800">החשבון נשמר מקומית ומוכן לעבודה.</div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-semibold">3. בחירת משימות</div>
                <div className="mt-1 text-emerald-800">עוברים ישר למשימות הפתוחות.</div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 bg-gray-50 p-5 lg:border-r lg:border-t-0 md:p-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">כבר יש לך חשבון?</p>
                <p className="mt-1 text-sm text-gray-600">אפשר לחזור מיד לפורטל ולהתחבר.</p>
              </div>
              <Link
                href="/volunteers/events"
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                לפורטל המתנדבים
                <ExternalLink size={16} />
              </Link>
            </div>

            <div className="mt-5 space-y-3 text-sm text-gray-600">
              <div className="rounded-2xl bg-white p-4">האימייל והסיסמה שתגדיר/י כאן ישמשו גם להתחברות עתידית.</div>
              <div className="rounded-2xl bg-white p-4">אפשר לעדכן משימות, לצבור שעות ולבקש אישור ביצוע מתוך האזור האישי.</div>
              <div className="rounded-2xl bg-white p-4">ההרשמה הזו מיועדת לחשבון מתנדב כללי שאינו תלוי רק באירוע אחד.</div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm md:p-8">
          {submitted ? (
            <div className="rounded-[24px] border border-green-200 bg-green-50 p-8 text-center">
              <CheckCircle className="mx-auto mb-3 text-green-600" size={52} />
              <h2 className="text-2xl font-bold text-green-900">נרשמת בהצלחה</h2>
              <p className="mt-2 text-green-700">מעביר אותך עכשיו לפורטל המתנדבים כדי לבחור את המשימה הראשונה שלך.</p>
              <Link
                href="/volunteers/events"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                מעבר לאזור האישי
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {renderInput("שם פרטי", "firstName", { required: true, placeholder: "לדוגמה: רוני" })}
                {renderInput("שם משפחה", "lastName", { required: true, placeholder: "לדוגמה: כהן" })}
                {renderInput("תעודת זהות", "idNumber", { required: true, placeholder: "123456789" })}
                {renderInput("נייד", "phone", { type: "tel", required: true, placeholder: "050-0000000" })}
                {renderInput("מייל", "email", { type: "email", required: true, placeholder: "you@example.com" })}
                {renderInput("חוג", "program", { placeholder: "לדוגמה: הנדסת תוכנה" })}
                {renderInput("שנת לימודים", "year", { placeholder: "לדוגמה: שנה ב'" })}
                {renderInput("סיסמה", "password", { type: "password", required: true, minLength: 6, placeholder: "לפחות 6 תווים" })}
                <div className="md:col-span-2">
                  {renderInput("אימות סיסמה", "confirmPassword", { type: "password", required: true, minLength: 6, placeholder: "הקלד/י שוב לאימות" })}
                </div>
              </div>

              {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
                אחרי השליחה החשבון שלך יישמר, ותועבר/י אוטומטית לפורטל המתנדבים עם התחברות מוכנה.
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-t-2 border-white"></div>
                    שולח...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    יצירת חשבון ומעבר לפורטל
                  </>
                )}
              </button>
              <p className="text-center text-xs text-gray-500">פרטי ההרשמה נשמרים לצורך הפעלת אזור המשימות למתנדבים.</p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
