'use server';

import { adminDb } from './firebase-admin';
import type { Room, Track, User } from './types';
import admin from 'firebase-admin';

async function getYouTubeOEmbed(url: string) {
    const response = await fetch(`https://www.youtube.com/oembed?url=${url}&format=json`);
    if (!response.ok) {
        throw new Error('Failed to fetch YouTube oEmbed');
    }
    return response.json();
}

// Helper to convert Firestore doc to a specific type
function docToType<T>(doc: admin.firestore.DocumentSnapshot): T {
    const data = doc.data() as any;
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

// Function to create a slug from a string
function createSlug(name: string) {
    const baseSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${baseSlug}-${randomSuffix}`;
}

// Get all public rooms
export async function getPublicRooms(): Promise<Room[]> {
    const roomsRef = adminDb.collection('rooms');
    const q = roomsRef.where('isPrivate', '==', false);
    const querySnapshot = await q.get();
    return querySnapshot.docs.map(doc => docToType<Room>(doc));
}

// Get a single room by its slug
export async function getRoomBySlug(slug: string): Promise<Room | null> {
    const roomsRef = adminDb.collection('rooms');
    const q = roomsRef.where('slug', '==', slug);
    const querySnapshot = await q.get();
    if (querySnapshot.empty) {
        return null;
    }
    const roomDoc = querySnapshot.docs[0];
    const room = docToType<Room>(roomDoc);
    
    return room;
}

// Create a new room
export async function createRoom(name: string, user: { uid: string, displayName: string | null, photoURL: string | null }): Promise<Room> {
    if (!user) {
        throw new Error("You must be logged in to create a room.");
    }
    
    if (!adminDb) {
        throw new Error("Database connection not available. Please try again later.");
    }
    
    try {
        // Create a simple user object without circular references
        const userProfile: User = {
            id: user.uid,
            name: user.displayName || 'Anonymous',
            avatarUrl: user.photoURL || `https://placehold.co/100x100.png`
        };

        // Create a simple room object without circular references
        const newRoomData = {
            name,
            slug: createSlug(name),
            isPrivate: false,
            imageUrl: `https://placehold.co/400x200/A892EE/28282B.png`,
            members: [userProfile],
            queue: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            currentPlayback: null, // Initialize as null to avoid undefined issues
            ownerId: user.uid,
            totalMembers: 1,
        };
        
        const docRef = await adminDb.collection("rooms").add(newRoomData);

        const newRoomDoc = await docRef.get();
        if (!newRoomDoc.exists) {
            throw new Error("Failed to create room.");
        }

        return docToType<Room>(newRoomDoc);
    } catch (error) {
        console.error('Error creating room:', error);
        if (error instanceof Error) {
            throw new Error(`Failed to create room: ${error.message}`);
        } else {
            throw new Error('Failed to create room. Please try again.');
        }
    }
}

// Function to play the next track in the queue
export async function playNextTrack(roomId: string) {
    const roomRef = adminDb.collection('rooms').doc(roomId);

    await adminDb.runTransaction(async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists) {
            throw new Error("Room does not exist!");
        }

        const roomData = roomDoc.data() as Room;
        const queue = [...roomData.queue];

        // Find and mark the current track as 'played'
        const currentTrackIndex = queue.findIndex(t => t.status === 'playing');
        if (currentTrackIndex !== -1) {
            queue[currentTrackIndex].status = 'played';
        }

        // Find the next best track to play (highest score, not played)
        const sortedQueue = queue
            .filter(t => t.status === 'queued')
            .sort((a, b) => (b.upvotes.length - b.downvotes.length) - (a.upvotes.length - a.downvotes.length));

        if (sortedQueue.length > 0) {
            const nextTrack = sortedQueue[0];
            const nextTrackIndex = queue.findIndex(t => t.id === nextTrack.id);
            queue[nextTrackIndex].status = 'playing';
            
            transaction.update(roomRef, { 
                queue: queue,
                'currentPlayback.ended': false // Reset ended flag
            });
        } else {
            // No more tracks to play
            transaction.update(roomRef, { 
                queue: queue, 
                currentPlayback: null 
            });
        }
    });
}

// Function to send a notification to a room
export async function sendNotification(roomId: string, message: string) {
    const notificationsRef = adminDb.collection('rooms').doc(roomId).collection('notifications');
    await notificationsRef.add({
        message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// Function to update the playback state of a room
export async function updatePlaybackState(roomId: string, playbackState: Partial<Room['currentPlayback']>) {
    const roomRef = adminDb.collection('rooms').doc(roomId);
    await adminDb.runTransaction(async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists) {
            throw "Room does not exist!";
        }

        const currentPlayback = roomDoc.data()?.currentPlayback || {};
        const newPlaybackState = { ...currentPlayback, ...playbackState, updatedAt: admin.firestore.FieldValue.serverTimestamp() };

        transaction.update(roomRef, { currentPlayback: newPlaybackState });
    });
}
