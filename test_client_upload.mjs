import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import fs from 'fs';
import path from 'path';

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
const storage = getStorage(app);

async function testUpload() {
    console.log("Testing unauthenticated upload to whatsapp_uploads/schedules/client_test.txt...");
    try {
        const storageRef = ref(storage, `whatsapp_uploads/schedules/client_${Date.now()}_test.txt`);
        // Just create a dummy file content bytes array
        const bytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"

        await uploadBytes(storageRef, bytes);
        console.log("SUCCESS! File uploaded.");
        process.exit(0);
    } catch (e) {
        console.error("FAILED! Error uploading file: ", e);
        process.exit(1);
    }
}

testUpload();
