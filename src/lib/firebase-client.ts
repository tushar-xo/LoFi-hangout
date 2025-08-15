
'use client';

import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, onSnapshot, query, collection, where } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import type { Room } from './types';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Debug Firebase config (only in development)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('🔧 Firebase Config Check:', {
    hasApiKey: !!firebaseConfig.apiKey,
    hasAuthDomain: !!firebaseConfig.authDomain,
    hasProjectId: !!firebaseConfig.projectId,
    hasStorageBucket: !!firebaseConfig.storageBucket,
    hasMessagingSenderId: !!firebaseConfig.messagingSenderId,
    hasAppId: !!firebaseConfig.appId,
    projectId: firebaseConfig.projectId
  });
}

// Initialize Firebase for client-side
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let analytics;
if (typeof window !== 'undefined') {
    isSupported().then(yes => {
        if (yes) {
            analytics = getAnalytics(app);
        }
    });
}

// Helper to convert Firestore doc to a specific type
function docToType<T>(doc: any): T {
    const data = doc.data();
    // Firestore timestamps need to be converted
    const convertTimestamps = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj && typeof obj.toDate === 'function') { // More robust check
            return obj.toDate();
        }

        if (Array.isArray(obj)) {
            return obj.map(convertTimestamps);
        }

        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
             if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = convertTimestamps(obj[key]);
             }
        }
        return newObj;
    };


    return convertTimestamps({
        id: doc.id,
        ...data,
    }) as T;
}

// Listen to real-time updates for a room
export function listenToRoom(roomId: string, callback: (room: Room) => void): () => void {
    const docRef = doc(db, 'rooms', roomId);
    return onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
            callback(docToType<Room>(doc));
        }
    });
}

// Listen to real-time updates for all public rooms
export function listenToPublicRooms(callback: (rooms: Room[]) => void): () => void {
    const q = query(collection(db, 'rooms'), where('isPrivate', '==', false));
    return onSnapshot(q, (querySnapshot) => {
        const rooms = querySnapshot.docs.map(doc => docToType<Room>(doc));
        callback(rooms);
    });
}

export { app, auth, db, googleProvider };
