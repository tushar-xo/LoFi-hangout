export interface User {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface Track {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  durationSec: number;
  thumbnailUrl: string;
  upvotes: string[]; // Array of user IDs
  downvotes: string[]; // Array of user IDs
  status: 'playing' | 'queued' | 'played' | 'skipped';
  addedBy?: string; // User ID
}

export interface CurrentPlayback {
  currentTime: number;
  updatedAt: Date;
  ended: boolean;
  isPlaying: boolean;
}

export interface Room {
  id: string;
  name: string;
  slug: string;
  isPrivate: boolean;
  password?: string; // Optional password for private rooms
  imageUrl: string;
  members: User[];
  queue: Track[];
  currentPlayback?: CurrentPlayback;
  ownerId: string;
  totalMembers: number;
}

export interface Message {
    id: string;
    user: User;
    text: string;
    timestamp: any;
}

export interface ChatMessage {
    id: string;
    user: Pick<User, 'name' | 'avatarUrl'>;
    text: string;
    timestamp: Date;
}

export interface PlaybackStateMessage {
  type: 'playbackState';
  isPlaying: boolean;
  currentTime: number;
  adminId?: string; // ID of the admin sending the message
}

export interface SeekToMessage {
  type: 'seekTo';
  currentTime: number;
  adminId?: string; // ID of the admin sending the message
}

export interface RequestStateMessage {
  type: 'requestState';
}

export interface TrackEndedMessage {
  type: 'trackEnded';
  message: string;
  adminId?: string;
}

export type WebSocketMessage = PlaybackStateMessage | SeekToMessage | RequestStateMessage | TrackEndedMessage | { type: string; [key: string]: any };
