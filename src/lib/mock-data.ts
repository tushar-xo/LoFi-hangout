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
        name: 'Chill Beats to Relax/Study To',
        slug: 'chill-beats-to-relax-study-to',
        isPrivate: false,
        members: users,
        queue: tracks.map((t, i) => ({ ...t, id: `track-${i+1}` })),
        imageUrl: 'https://placehold.co/400x200/A892EE/28282B.png'
    },
];

export function getPlayingTrack() {
    return rooms[0].queue.find(t => t.status === 'playing') || null;
}
