import admin from 'firebase-admin';
import fs from 'fs';

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;

const initWithServiceAccount = (serviceAccount: Record<string, string>) => {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
    adminDb = admin.firestore();
    adminAuth = admin.auth();
};

if (!admin.apps.length) {
    try {
        // Try using base64 encoded service account first
        const base64ServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

        if (base64ServiceAccount) {
            const serviceAccount = JSON.parse(
                Buffer.from(base64ServiceAccount, 'base64').toString('utf-8')
            );
            initWithServiceAccount(serviceAccount);
            console.log('Firebase Admin initialized successfully with base64 credentials');
        } else {
            // Fallback to individual environment variables
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

            if (projectId && clientEmail && privateKey) {
                initWithServiceAccount({ projectId, clientEmail, privateKey });
                console.log('Firebase Admin initialized successfully with individual credentials');
            } else {
                // Local fallback for Ben/OpenClaw workspace dev flows
                const localVaultPath = '/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json';
                const projectLocalPath = process.cwd() + '/patifon-events-firebase-adminsdk-fbsvc-793c956bf4.json';

                if (fs.existsSync(localVaultPath)) {
                    const serviceAccount = JSON.parse(fs.readFileSync(localVaultPath, 'utf8'));
                    initWithServiceAccount(serviceAccount);
                    console.log('Firebase Admin initialized successfully with local vault credentials');
                } else if (fs.existsSync(projectLocalPath)) {
                    const serviceAccount = JSON.parse(fs.readFileSync(projectLocalPath, 'utf8'));
                    initWithServiceAccount(serviceAccount);
                    console.log('Firebase Admin initialized successfully with project local credentials');
                } else {
                    console.warn('Firebase Admin credentials not configured - some features may not work');
                }
            }
        }
    } catch (error) {
        console.error('Firebase admin initialization error:', error);
    }
}

export { adminDb, adminAuth };
export default admin;
