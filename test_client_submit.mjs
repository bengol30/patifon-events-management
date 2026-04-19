import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import fs from 'fs';
import path from 'path';

// Read firebase settings from .env.local if needed or just hardcode if we know them.
// Let's parse .env.local to get the firebase config.
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

const getEnvParam = (key) => {
    const match = envContent.match(new RegExp(`${key}=([^\\n]+)`));
    return match ? match[1].trim().replace(/^"|"$/g, '') : null;
};

const firebaseConfig = {
    apiKey: getEnvParam('NEXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: getEnvParam('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnvParam('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: getEnvParam('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnvParam('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnvParam('NEXT_PUBLIC_FIREBASE_APP_ID')
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testSubmit() {
    console.log("Testing unauthenticated submit to whatsapp_list_schedules...");
    try {
        const datetimeStr = `2027-05-15T08:00:00`;
        const scheduledAt = new Date(datetimeStr).toISOString();

        const docRef = await addDoc(collection(db, "whatsapp_list_schedules"), {
            listId: "test_list_id",
            listName: "test_list",
            sendMode: "custom",
            messageText: "test message",
            scheduleType: "once",
            scheduledAt,
            status: "pending_client",
            nextRunAt: scheduledAt,
            createdAt: new Date(),
            isClientSubmitted: true,
        });
        console.log("SUCCESS! Document written with ID: ", docRef.id);
        process.exit(0);
    } catch (e) {
        console.error("FAILED! Error adding document: ", e);
        process.exit(1);
    }
}

testSubmit();
