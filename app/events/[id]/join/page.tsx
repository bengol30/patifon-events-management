"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, updateDoc, arrayUnion, getDoc } from "firebase/firestore";
import Link from "next/link";

export default function JoinEventPage() {
    const { id } = useParams();
    const { user, loading } = useAuth();
    const router = useRouter();
    const [status, setStatus] = useState("checking"); // checking, joining, error, success
    const [error, setError] = useState("");

    useEffect(() => {
        if (loading) return;

        if (!user) {
            // Redirect to signup with return URL
            const returnUrl = encodeURIComponent(window.location.pathname);
            router.push(`/signup?redirect=${returnUrl}`);
            return;
        }

        const joinEvent = async () => {
            if (!id || typeof id !== "string") return;

            try {
                setStatus("joining");
                const eventRef = doc(db, "events", id);

                // Check if event exists
                const eventSnap = await getDoc(eventRef);
                if (!eventSnap.exists()) {
                    setError("האירוע לא נמצא");
                    setStatus("error");
                    return;
                }

                // Add user to members and team
                await updateDoc(eventRef, {
                    members: arrayUnion(user.uid),
                    team: arrayUnion({
                        name: user.displayName || user.email?.split('@')[0] || "משתמש",
                        role: "חבר צוות",
                        email: user.email || ""
                    })
                });

                setStatus("success");
                // Redirect to event page
                router.push(`/events/${id}`);
            } catch (err: any) {
                console.error("Error joining event:", err);
                setError("שגיאה בהצטרפות לאירוע: " + err.message);
                setStatus("error");
            }
        };

        joinEvent();
    }, [user, loading, id, router]);

    if (loading || status === "checking" || status === "joining") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">מצרף אותך לאירוע...</p>
                </div>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">שגיאה</h1>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <Link
                        href="/"
                        className="inline-block bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition"
                    >
                        חזרה לדף הבית
                    </Link>
                </div>
            </div>
        );
    }

    return null;
}
