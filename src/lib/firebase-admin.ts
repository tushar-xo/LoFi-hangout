import admin from 'firebase-admin';

let adminDb: admin.firestore.Firestore;

if (!admin.apps.length) {
    try {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        
        if (!projectId) {
            throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is required');
        }

        // Check if we have service account credentials (for production)
        if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            try {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    projectId: projectId,
                    storageBucket: `${projectId}.appspot.com`
                });
                console.log('Firebase Admin initialized with service account');
            } catch (parseError) {
                console.warn('Failed to parse service account, falling back to default credentials');
                admin.initializeApp({
                    projectId: projectId,
                    storageBucket: `${projectId}.appspot.com`
                });
            }
        } else {
            // Fallback to default credentials (for development)
            admin.initializeApp({
                projectId: projectId,
                storageBucket: `${projectId}.appspot.com`
            });
            console.log('Firebase Admin initialized with default credentials');
        }
        
        adminDb = admin.firestore();
        console.log('Firebase Admin initialized successfully with project:', projectId);
        
    } catch (error) {
        console.error('Firebase admin initialization failed:', error);
        // Don't throw here, let the app continue
        adminDb = null as any;
    }
} else {
    adminDb = admin.firestore();
}

export { adminDb };
export { admin };

// Server-side function to remove a member from the room
export async function removeMemberFromRoomAdmin(roomId: string, userId: string): Promise<void> {
    try {
        if (!adminDb) {
            console.warn('Firebase Admin not initialized, skipping member removal');
            return;
        }
        
        const roomRef = adminDb.collection('rooms').doc(roomId);
        const roomDoc = await roomRef.get();
        
        if (!roomDoc.exists) return;
        
        const roomData = roomDoc.data() as any;
        const updatedMembers = roomData.members.filter((member: any) => member.id !== userId);
        const newTotalMembers = Math.max(0, roomData.totalMembers - 1);
        
        await roomRef.update({
            members: updatedMembers,
            totalMembers: newTotalMembers
        });
        
        console.log(`Removed member ${userId} from room ${roomId}`);
        
        // Check if admin needs to be transferred
        await checkAndHandleAdminTransferAdmin(roomId);
    } catch (error) {
        console.error('Error removing member from room:', error);
    }
}

// Server-side function to check and handle admin transfer if needed
export async function checkAndHandleAdminTransferAdmin(roomId: string): Promise<void> {
    try {
        if (!adminDb) {
            console.warn('Firebase Admin not initialized, skipping admin transfer');
            return;
        }
        
        const roomRef = adminDb.collection('rooms').doc(roomId);
        const roomDoc = await roomRef.get();
        
        if (!roomDoc.exists) return;
        
        const roomData = roomDoc.data() as any;
        const currentAdminId = roomData.ownerId;
        
        // Check if current admin is still in the room
        if (currentAdminId && !roomData.members.some((m: any) => m.id === currentAdminId)) {
            // Admin is not in the room, transfer to first available member
            const newAdmin = roomData.members[0];
            if (newAdmin) {
                await roomRef.update({ ownerId: newAdmin.id });
                console.log(`Admin transferred to ${newAdmin.name} (${newAdmin.id})`);
            }
        }
    } catch (error) {
        console.error('Error handling admin transfer:', error);
    }
}