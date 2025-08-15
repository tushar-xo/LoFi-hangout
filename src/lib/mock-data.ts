// This file is no longer the primary source of data, but is kept for type reference and potential fallback logic.
// The app now uses the real-time Firestore database. See `src/lib/firebase-service.ts`.

import type { Room, User, Track } from './types';

const users: User[] = [
    { id: 'user-1', name: 'Alex', avatarUrl: 'https://placehold.co/100x100/A892EE/44337A.png' },
    { id: 'user-2', name: 'Mia', avatarUrl: 'https://placehold.co/100x100/6CBDB6/2A5F5A.png' },
    { id: 'user-3', name: 'Sam', avatarUrl: 'https://placehold.co/100x100/FACC15/E0A82E.png' },
    { id: 'user-4', name: 'Chloe', avatarUrl: 'https://placehold.co/100x100/F472B6/C75D91.png' },
    { id: 'user-5', name: 'David', avatarUrl: 'https://placehold.co/100x100/3B82F6/1E40AF.png' },
];

const tracks: Omit<Track, 'id'>[] = [
    { videoId: '5qap5aO4i9A', title: 'Lofi Hip Hop Radio', artist: 'Lofi Girl', durationSec: 10800, upvotes: [], downvotes: [], status: 'playing', thumbnailUrl: 'https://placehold.co/400x400.png' },
    { videoId: 'DWcJFNfaw9c', title: '1 A.M Study Session', artist: 'Lofi Girl', durationSec: 3600, upvotes: [], downvotes: [], status: 'queued', thumbnailUrl: 'https://placehold.co/400x400.png' },
    { videoId: '7NOSDKb0HlU', title: 'Synthwave Radio', artist: 'Odysseus', durationSec: 7200, upvotes: [], downvotes: [], status: 'queued', thumbnailUrl: 'https://placehold.co/400x400.png' },
];

const rooms: Room[] = [
    {
        id: 'room-1',
        name: 'Lo-Fi Chill Vibes',
        slug: 'lofi-chill-vibes',
        isPrivate: false,
        members: [
            { id: 'user-1', name: 'Alex', avatarUrl: 'https://placehold.co/100x100/6366F1/FFFFFF.png' },
            { id: 'user-2', name: 'Sam', avatarUrl: 'https://placehold.co/100x100/8B5CF6/FFFFFF.png' },
            { id: 'user-3', name: 'Jordan', avatarUrl: 'https://placehold.co/100x100/EC4899/FFFFFF.png' }
        ],
        queue: [
            {
                id: 'track-1',
                videoId: 'jfKfPfyJRdk',
                title: 'lofi hip hop radio 📚 - beats to relax/study to',
                artist: 'Lofi Girl',
                durationSec: 0,
                thumbnailUrl: 'https://placehold.co/120x90/6366F1/FFFFFF.png',
                upvotes: ['user-1', 'user-2'],
                downvotes: [],
                status: 'playing' as const,
                addedBy: 'user-1'
            }
        ],
        imageUrl: 'https://placehold.co/400x200/A892EE/28282B.png',
        ownerId: 'user-1',
        totalMembers: 3
    },
];

export function getPlayingTrack() {
    return rooms[0].queue.find(t => t.status === 'playing') || null;
}
