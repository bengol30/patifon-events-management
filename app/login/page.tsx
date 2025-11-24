"use client";

import { Suspense, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth) {
            setError("Firebase configuration is missing.");
            return;
        }
        try {
            await signInWithEmailAndPassword(auth, email, password);
            if (redirect) {
                router.push(decodeURIComponent(redirect));
            } else {
                router.push("/");
            }
        } catch (err: any) {
            console.error("Login error:", err);
            let errorMessage = "שגיאה בהתחברות: " + err.message;

            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                errorMessage = "האימייל או הסיסמה שגויים.";
            } else if (err.code === 'auth/invalid-email') {
                errorMessage = "כתובת האימייל אינה תקינה.";
            } else if (err.code === 'auth/too-many-requests') {
                errorMessage = "יותר מדי ניסיונות כושלים. נסה שוב מאוחר יותר.";
            } else if (err.code === 'auth/network-request-failed') {
                errorMessage = "שגיאת תקשורת. בדוק את החיבור לאינטרנט.";
            }

            setError(errorMessage);
        }
    };

    return (
        <div className="bg-white p-8 rounded-lg shadow-md w-96">
            <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">התחברות למערכת</h1>
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">אימייל</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">סיסמה</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        required
                    />
                </div>
                <button
                    type="submit"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                    התחבר
                </button>
            </form>
            <p className="text-center text-sm text-gray-600 mt-4">
                אין לך חשבון?{" "}
                <Link href="/signup" className="text-indigo-600 hover:text-indigo-500 font-medium">
                    הירשם כאן
                </Link>
            </p>
        </div>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <Suspense fallback={<div className="text-center">טוען...</div>}>
                <LoginForm />
            </Suspense>
        </div>
    );
}
