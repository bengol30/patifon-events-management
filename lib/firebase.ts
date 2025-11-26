import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signInAnonymously,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCXfJ1ZOzHDpvgAjsWiTGeBLMwJKLQh7P4",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "patifon-events.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "patifon-events",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "patifon-events.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "61725615268",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:61725615268:web:922c1a8b73eaff31143231",
};

const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
const enableAnonAuth = process.env.NEXT_PUBLIC_ENABLE_ANON_AUTH === "true";
const devEmail = process.env.NEXT_PUBLIC_DEV_EMAIL;
const devPassword = process.env.NEXT_PUBLIC_DEV_PASSWORD;

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;
let emulatorsConnected = false;

const parseHost = (value: string | undefined, fallback: string, fallbackPort: number) => {
  const [host, portString] = (value ?? fallback).split(":");
  return {
    host,
    port: Number.isNaN(Number(portString)) ? fallbackPort : Number(portString),
  };
};

const connectEmulators = () => {
  if (emulatorsConnected || !auth || !db || !storage) return;

  const authHost = parseHost(
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
    "localhost:9099",
    9099,
  );
  const firestoreHost = parseHost(
    process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST,
    "localhost:8080",
    8080,
  );
  const storageHost = parseHost(
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST,
    "localhost:9199",
    9199,
  );

  connectAuthEmulator(auth, `http://${authHost.host}:${authHost.port}`);
  connectFirestoreEmulator(db, firestoreHost.host, firestoreHost.port);
  connectStorageEmulator(storage, storageHost.host, storageHost.port);
  emulatorsConnected = true;
};

// Check if we're in the browser (not during build)
if (typeof window !== "undefined") {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    if (useEmulators) {
      connectEmulators();
      console.log("Firebase emulators connected");
    } else {
      console.log("Firebase initialized successfully");
    }

    // In dev, make sure Storage rules see an authenticated user (helps avoid 403s)
    if (auth && !auth.currentUser && process.env.NODE_ENV !== "production") {
      if (devEmail && devPassword) {
        signInWithEmailAndPassword(auth, devEmail, devPassword).catch((error) => {
          console.warn("Dev email/password sign-in failed (check NEXT_PUBLIC_DEV_EMAIL/NEXT_PUBLIC_DEV_PASSWORD):", error);
        });
      } else if (enableAnonAuth) {
        signInAnonymously(auth).catch((error) => {
          console.warn("Anonymous auth failed (check Firebase console settings):", error);
        });
      }
    }
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

export { app, auth, db, storage };
