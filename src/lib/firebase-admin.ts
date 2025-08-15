import admin from 'firebase-admin';

let adminDb: admin.firestore.Firestore;

if (!admin.apps.length) {
    try {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        
        if (!projectId) {
            throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is required');
        }

        // Simple initialization with just project ID
        admin.initializeApp({
            projectId: projectId,
            storageBucket: `${projectId}.appspot.com`
        });
        
        adminDb = admin.firestore();
        console.log('Firebase Admin initialized successfully with project:', projectId);
        
    } catch (error) {
        console.error('Firebase admin initialization failed:', error);
        throw new Error('Firebase Admin SDK could not be initialized');
    }
} else {
    adminDb = admin.firestore();
}

export { adminDb };
export { admin };