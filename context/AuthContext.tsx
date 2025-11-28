"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

interface AuthContextType {
    user: User | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // Ensure user document exists so שאין משתמשים "שקופים" ברשימות
    const ensureUserDoc = async (firebaseUser: User | null) => {
        if (!db || !firebaseUser) return;
        try {
            const ref = doc(db, "users", firebaseUser.uid);
            const snap = await getDoc(ref);
            if (!snap.exists()) {
                await setDoc(ref, {
                    fullName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "משתמש חדש",
                    email: firebaseUser.email || "",
                    onboarded: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
        } catch (err) {
            console.error("ensureUserDoc failed", err);
        }
    };

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            ensureUserDoc(user);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
