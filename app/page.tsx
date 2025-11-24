"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Plus, Calendar, CheckSquare } from "lucide-react";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) return <div className="p-8 text-center">טוען...</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">שלום, {user.displayName || user.email}</h1>
          <p className="text-gray-500">ברוך הבא למערכת ניהול האירועים של פטיפון</p>
        </div>
        <Link
          href="/events/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition"
        >
          <Plus size={20} />
          אירוע חדש
        </Link>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* My Tasks Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare className="text-indigo-600" />
            <h2 className="text-xl font-semibold">המשימות שלי</h2>
          </div>
          <div className="text-gray-500 text-center py-8">
            אין משימות פתוחות כרגע.
          </div>
        </div>

        {/* Active Events Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="text-indigo-600" />
            <h2 className="text-xl font-semibold">אירועים פעילים</h2>
          </div>
          <div className="text-gray-500 text-center py-8">
            אין אירועים פעילים.
          </div>
        </div>
      </div>
    </div>
  );
}
