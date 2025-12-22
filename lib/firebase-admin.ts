import admin from 'firebase-admin';

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;

if (!admin.apps.length) {
    try {
        // Try using base64 encoded service account first
        const base64ServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

        if (base64ServiceAccount) {
            const serviceAccount = JSON.parse(
                Buffer.from(base64ServiceAccount, 'base64').toString('utf-8')
            );

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log('Firebase Admin initialized successfully with base64 credentials');
            adminDb = admin.firestore();
            adminAuth = admin.auth();
        } else {
            // Fallback to individual environment variables
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

            if (projectId && clientEmail && privateKey) {
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId,
                        clientEmail,
                        privateKey,
                    }),
                });
                console.log('Firebase Admin initialized successfully with individual credentials');
                adminDb = admin.firestore();
                adminAuth = admin.auth();
            } else {
                console.warn('Firebase Admin credentials not configured - some features may not work');
            }
        }
    } catch (error) {
        console.error('Firebase admin initialization error:', error);
    }
}

export { adminDb, adminAuth };
export default admin;
