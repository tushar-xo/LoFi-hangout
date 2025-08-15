'use client';

import { doc, updateDoc, arrayUnion, getDoc, collection, addDoc, deleteDoc } from 'firebase/firestore';
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
    
    // Get video metadata from YouTube with fallback
    let title = 'Unknown Title';
    let artist = 'Unknown Artist';
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    try {
        const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oEmbedUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });
        
        if (response.ok) {
            const oEmbedData = await response.json();
            title = oEmbedData.title || title;
            artist = oEmbedData.author_name || artist;
            thumbnailUrl = oEmbedData.thumbnail_url || thumbnailUrl;
        }
    } catch (error) {
        console.warn('Failed to fetch video metadata, using defaults:', error);
        // Continue with defaults - don't throw error
    }

    const newTrack: Track = {
        id: `${videoId}-${Date.now()}`,
        videoId,
        title,
        artist,
        durationSec: 0, // This will be updated by the player
        thumbnailUrl,
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
            // Sort by score
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
        
        // Send notification only if there was a next track
        await sendNotificationToRoom(roomId, `Now playing: ${nextTrack.title}`);
    } else {
        // No more tracks to play
        console.log('No more tracks in queue');
        await updateDoc(roomRef, { 
            queue: queue, 
            currentPlayback: null 
        });
        
        // Send appropriate notification when queue is empty
        await sendNotificationToRoom(roomId, "Queue is empty. Add some tracks to keep the music going!");
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

// Function to remove a member from the room
export async function removeMemberFromRoom(roomId: string, userId: string): Promise<void> {
    try {
        const roomRef = doc(db, 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);
        
        if (!roomDoc.exists()) return;
        
        const roomData = roomDoc.data() as any;
        const updatedMembers = roomData.members.filter((member: any) => member.id !== userId);
        const newTotalMembers = Math.max(0, roomData.totalMembers - 1);
        
        await updateDoc(roomRef, {
            members: updatedMembers,
            totalMembers: newTotalMembers
        });
        
        console.log(`Removed member ${userId} from room ${roomId}`);
        
        // Check if admin needs to be transferred
        await checkAndHandleAdminTransfer(roomId);
    } catch (error) {
        console.error('Error removing member from room:', error);
    }
}

// Function to check and handle admin transfer if needed
export async function checkAndHandleAdminTransfer(roomId: string): Promise<void> {
    try {
        const roomRef = doc(db, 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);
        
        if (!roomDoc.exists()) return;
        
        const roomData = roomDoc.data() as any;
        const currentAdminId = roomData.ownerId;
        
        // Check if current admin is still in the room
        const isAdminStillPresent = currentAdminId && roomData.members.some((m: any) => m.id === currentAdminId);
        
        if (!isAdminStillPresent && roomData.members.length > 0) {
            // Admin is not in the room, transfer to first available member
            const newAdmin = roomData.members[0];
            console.log(`Admin ${currentAdminId} not found in room, transferring to ${newAdmin.name} (${newAdmin.id})`);
            
            await updateDoc(roomRef, {
                ownerId: newAdmin.id
            });
            
            // Send notification about admin transfer
            await sendNotificationToRoom(roomId, `${newAdmin.name} is now the room admin!`);
            
            console.log(`Admin transferred successfully to ${newAdmin.name} (${newAdmin.id})`);
        } else if (roomData.members.length === 0) {
            // No members left, room should be cleaned up or marked for deletion
            console.log(`Room ${roomId} has no members left`);
            // Optionally delete the room if it's empty
            // await deleteDoc(roomRef);
        }
    } catch (error) {
        console.error('Error handling admin transfer:', error);
    }
} 

// Function to delete a room (only admin can delete)
export async function deleteRoom(roomId: string, currentUserId: string): Promise<void> {
    try {
        const roomRef = doc(db, 'rooms', roomId);
        const roomDoc = await getDoc(roomRef);
        
        if (!roomDoc.exists()) {
            throw new Error('Room not found');
        }
        
        const roomData = roomDoc.data() as any;
        
        // Check if current user is the admin/owner OR is the special admin user
        const isOwner = roomData.ownerId === currentUserId;
        const isSpecialAdmin = currentUserId === 'NUkGPIe8H8XlyKfYmtcpTPBlO7H3';
        
        if (!isOwner && !isSpecialAdmin) {
            throw new Error('Only the room admin can delete the room');
        }
        
        // Delete the room document
        await deleteDoc(roomRef);
        
        console.log(`Room ${roomId} deleted successfully by ${isSpecialAdmin ? 'special admin' : 'room owner'}`);
    } catch (error) {
        console.error('Error deleting room:', error);
        throw error;
    }
}