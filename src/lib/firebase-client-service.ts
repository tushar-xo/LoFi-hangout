'use client';

import { doc, updateDoc, arrayUnion, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase-client';
import type { Track } from './types';

// Function to add a track to a room's queue (client-side)
export async function addTrackToQueue(roomId: string, youtubeUrl: string, userId: string): Promise<void> {
    // Basic YouTube URL parsing
    let videoId = '';
    try {
        const url = new URL(youtubeUrl);
        if (url.hostname === 'youtu.be') {
            videoId = url.pathname.substring(1);
        } else if (url.hostname.includes('youtube.com')) {
            videoId = url.searchParams.get('v') || '';
        }
    } catch(e) {
        // Fallback for non-URL strings that might be an ID
        if (youtubeUrl.length === 11 && !youtubeUrl.includes('.')) {
            videoId = youtubeUrl;
        }
    }

    if (!videoId) {
        throw new Error("Invalid YouTube URL. Please provide a valid video link or ID.");
    }
    
    // Get video metadata from YouTube
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oEmbedUrl);
    if (!response.ok) {
        throw new Error("Failed to fetch video information from YouTube");
    }
    
    const oEmbedData = await response.json();

    const newTrack: Track = {
        id: `${videoId}-${Date.now()}`,
        videoId,
        title: oEmbedData.title || 'Unknown Title',
        artist: oEmbedData.author_name || 'Unknown Artist',
        durationSec: 0, // This will be updated by the player
        thumbnailUrl: oEmbedData.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        upvotes: [], // Start with no votes instead of auto-upvoting
        downvotes: [],
        status: 'queued',
        addedBy: userId,
    };
    
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
        queue: arrayUnion(newTrack)
    });
}

// Function to vote on a track (client-side)
export async function voteOnTrackInQueue(roomId: string, trackId: string, userId: string, voteType: 'up' | 'down'): Promise<void> {
    const roomRef = doc(db, 'rooms', roomId);
    
    // Get current room data
    const roomDoc = await getDoc(roomRef);
    if (!roomDoc.exists()) {
        throw new Error("Room does not exist!");
    }

    const roomData = roomDoc.data() as any;
    const queue = [...roomData.queue];
    const trackIndex = queue.findIndex((t: Track) => t.id === trackId);

    if (trackIndex === -1) {
        console.log("Track not found in queue, vote ignored.");
        return;
    }

    const track = queue[trackIndex];
    
    const hasUpvoted = track.upvotes.includes(userId);
    const hasDownvoted = track.downvotes.includes(userId);
    
    // Logic to handle voting
    if (voteType === 'up') {
        track.downvotes = track.downvotes.filter((uid: string) => uid !== userId);
        if(hasUpvoted) {
             track.upvotes = track.upvotes.filter((uid: string) => uid !== userId);
        } else {
             track.upvotes.push(userId);
        }
    } else if (voteType === 'down') {
        track.upvotes = track.upvotes.filter((uid: string) => uid !== userId);
        if(hasDownvoted) {
             track.downvotes = track.downvotes.filter((uid: string) => uid !== userId);
        } else {
            track.downvotes.push(userId);
        }
    }
    
    queue[trackIndex] = track;
    await updateDoc(roomRef, { queue: queue });
}

// Function to remove a track from a room's queue (client-side)
export async function removeTrackFromQueue(roomId: string, trackId: string): Promise<void> {
    const roomRef = doc(db, 'rooms', roomId);
    
    // Get current room data
    const roomDoc = await getDoc(roomRef);
    if (!roomDoc.exists()) {
        throw new Error("Room does not exist!");
    }

    const roomData = roomDoc.data() as any;
    const queue = roomData.queue.filter((t: Track) => t.id !== trackId);

    await updateDoc(roomRef, { queue });
}

// Function to play the next track in the queue (client-side)
export async function playNextTrackInQueue(roomId: string): Promise<void> {
    const roomRef = doc(db, 'rooms', roomId);
    
    // Get current room data
    const roomDoc = await getDoc(roomRef);
    if (!roomDoc.exists()) {
        throw new Error("Room does not exist!");
    }

    const roomData = roomDoc.data() as any;
    const queue = [...roomData.queue];

    // Find and mark the current track as 'played'
    const currentTrackIndex = queue.findIndex((t: Track) => t.status === 'playing');
    if (currentTrackIndex !== -1) {
        queue[currentTrackIndex].status = 'played';
        console.log(`Marked track ${queue[currentTrackIndex].title} as played`);
    }

    // Find the next best track to play (highest score, not played)
    const sortedQueue = queue
        .filter((t: Track) => t.status === 'queued')
        .sort((a: Track, b: Track) => {
            // First sort by admin order if set
            if (a.queueOrder !== undefined && b.queueOrder !== undefined) {
                return a.queueOrder - b.queueOrder;
            }
            // Then by score
            const scoreA = a.upvotes.length - a.downvotes.length;
            const scoreB = b.upvotes.length - b.downvotes.length;
            return scoreB - scoreA;
        });

    if (sortedQueue.length > 0) {
        const nextTrack = sortedQueue[0];
        const nextTrackIndex = queue.findIndex((t: Track) => t.id === nextTrack.id);
        queue[nextTrackIndex].status = 'playing';
        
        console.log(`Playing next track: ${nextTrack.title}`);
        
        await updateDoc(roomRef, { 
            queue: queue,
            'currentPlayback.ended': false // Reset ended flag
        });
    } else {
        // No more tracks to play
        console.log('No more tracks in queue');
        await updateDoc(roomRef, { 
            queue: queue, 
            currentPlayback: null 
        });
    }
}

// Function to send a notification to a room (client-side)
export async function sendNotificationToRoom(roomId: string, message: string): Promise<void> {
    const notificationsRef = collection(db, 'rooms', roomId, 'notifications');
    await addDoc(notificationsRef, {
        message,
        timestamp: new Date(),
    });
}

// Function to transfer admin to another member (client-side)
export async function transferAdminToMember(roomId: string, newAdminId: string): Promise<void> {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, { 
        ownerId: newAdminId 
    });
}

// Function to check and handle admin transfer if needed
export async function checkAndHandleAdminTransfer(roomId: string): Promise<void> {
    const roomRef = doc(db, 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) return;
    
    const roomData = roomDoc.data() as any;
    const currentAdminId = roomData.ownerId;
    
    // Check if current admin is still in the room
    if (currentAdminId && !roomData.members.some((m: any) => m.id === currentAdminId)) {
        // Admin is not in the room, transfer to first available member
        const newAdmin = roomData.members[0];
        if (newAdmin) {
            await transferAdminToMember(roomId, newAdmin.id);
            console.log(`Admin transferred to ${newAdmin.name} (${newAdmin.id})`);
        }
    }
} 