import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCXfJ1ZOzHDpvgAjsWiTGeBLMwJKLQh7P4",
  authDomain: "patifon-events.firebaseapp.com",
  projectId: "patifon-events",
  storageBucket: "patifon-events.appspot.com",
  messagingSenderId: "61725615268",
  appId: "1:61725615268:web:922c1a8b73eaff31143231",
};

// Initialize Firebase
let app;
let auth: any;
let db: any;
let storage: any;

// Check if we're in the browser (not during build)
if (typeof window !== 'undefined') {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

export { app, auth, db, storage };
