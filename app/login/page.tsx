"use client";

import { Suspense, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Music, Disc3 } from "lucide-react";

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
        <div className="bg-white p-10 rounded-2xl vinyl-shadow w-full max-w-md relative overflow-hidden" style={{ border: '3px solid var(--patifon-orange)' }}>
            {/* Decorative vinyl records */}
            <div className="absolute -top-10 -right-10 opacity-10">
                <Disc3 size={120} style={{ color: 'var(--patifon-burgundy)' }} />
            </div>
            <div className="absolute -bottom-10 -left-10 opacity-10">
                <Disc3 size={100} style={{ color: 'var(--patifon-orange)' }} />
            </div>

            {/* Logo and Title */}
            <div className="text-center mb-8 relative z-10">
                <div className="flex justify-center mb-4">
                    <div className="patifon-gradient p-4 rounded-full">
                        <Music size={40} className="text-white" />
                    </div>
                </div>
                <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--patifon-burgundy)' }}>
                    פטיפון
                </h1>
                <p className="text-sm" style={{ color: 'var(--patifon-orange)' }}>
                    מוזיקה מקורית. קצת אחרת.
                </p>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg" style={{ background: '#fee', border: '2px solid #fcc' }}>
                    <p className="text-red-600 text-sm text-center">{error}</p>
                </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5 relative z-10">
                <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--patifon-burgundy)' }}>
                        אימייל
                    </label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg p-3 text-sm focus:outline-none focus:ring-2 transition"
                        style={{
                            border: '2px solid var(--patifon-cream-dark)',
                            background: 'var(--patifon-cream)',
                            color: 'var(--patifon-burgundy)'
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--patifon-orange)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--patifon-cream-dark)'}
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--patifon-burgundy)' }}>
                        סיסמה
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-lg p-3 text-sm focus:outline-none focus:ring-2 transition"
                        style={{
                            border: '2px solid var(--patifon-cream-dark)',
                            background: 'var(--patifon-cream)',
                            color: 'var(--patifon-burgundy)'
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--patifon-orange)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--patifon-cream-dark)'}
                        required
                    />
                </div>
                <button
                    type="submit"
                    className="w-full py-3 px-4 rounded-lg text-white font-medium hover:opacity-90 transition vinyl-shadow patifon-gradient"
                >
                    התחבר למערכת
                </button>
            </form>

            <p className="text-center text-sm mt-6 relative z-10" style={{ color: 'var(--patifon-burgundy)' }}>
                אין לך חשבון?{" "}
                <Link href="/signup" className="font-bold hover:underline" style={{ color: 'var(--patifon-red)' }}>
                    הירשם כאן
                </Link>
            </p>
        </div>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: 'var(--patifon-cream)' }}>
            {/* Background decorative elements */}
            <div className="absolute inset-0 opacity-5">
                <div className="absolute top-20 left-20">
                    <Disc3 size={200} style={{ color: 'var(--patifon-burgundy)' }} />
                </div>
                <div className="absolute bottom-20 right-20">
                    <Disc3 size={250} style={{ color: 'var(--patifon-orange)' }} />
                </div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <Disc3 size={300} style={{ color: 'var(--patifon-red)' }} />
                </div>
            </div>

            <Suspense fallback={<div className="text-center">טוען...</div>}>
                <LoginForm />
            </Suspense>
        </div>
    );
}
