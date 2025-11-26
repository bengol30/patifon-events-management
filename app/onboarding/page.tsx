"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export default function OnboardingPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [role, setRole] = useState("");
    const [organization, setOrganization] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (user) {
            setEmail(user.email || "");
        }
    }, [user]);

    useEffect(() => {
        const checkExisting = async () => {
            if (!db || !user) return;
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists() && snap.data()?.onboarded) {
                router.push("/");
            } else if (snap.exists()) {
                const data = snap.data() as any;
                setFullName(data.fullName || "");
                setPhone(data.phone || "");
                setRole(data.role || "");
                setOrganization(data.organization || "");
            }
        };
        checkExisting();
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!db || !user) return;
        if (!fullName.trim() || !email.trim() || !phone.trim() || !role.trim()) {
            alert("נא למלא שם מלא, אימייל, טלפון ותפקיד");
            return;
        }
        setSaving(true);
        try {
            await setDoc(doc(db, "users", user.uid), {
                fullName: fullName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                role: role.trim(),
                organization: organization.trim(),
                onboarded: true,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
            }, { merge: true });
            router.push("/");
        } catch (err) {
            console.error("Error saving onboarding:", err);
            alert("שגיאה בשמירת הפרטים");
        } finally {
            setSaving(false);
        }
    };

    if (loading || !user) {
        return <div className="min-h-screen flex items-center justify-center text-gray-600">טוען...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-w-xl w-full p-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">ברוך הבא! רק עוד צעד קצר</h1>
                <p className="text-gray-600 text-center mb-6">ממלאים כמה פרטים כדי שנכיר אותך ונוכל לנהל את המשימות והאירועים עבורך.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
                        <input
                            type="text"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                        <input
                            type="email"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                        <input
                            type="tel"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                            placeholder="05x-xxxxxxx"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד / מסגרת</label>
                            <input
                                type="text"
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                required
                                placeholder="מפיק/ת, שיווק, לוגיסטיקה..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">ארגון / מחלקה (אופציונלי)</label>
                            <input
                                type="text"
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={organization}
                                onChange={(e) => setOrganization(e.target.value)}
                                placeholder="שם ארגון / צוות"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        className={`w-full py-3 rounded-lg text-white font-semibold ${saving ? "bg-gray-300" : "bg-indigo-600 hover:bg-indigo-700"} transition`}
                        disabled={saving}
                    >
                        {saving ? "שומר..." : "שמור והמשך"}
                    </button>
                </form>
            </div>
        </div>
    );
}
