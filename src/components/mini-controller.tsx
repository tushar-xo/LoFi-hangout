"use client";

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import type { Track, Room } from '@/lib/types';
import { db } from '@/lib/firebase-client';
import { doc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

// Define YouTube Player API types
declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
  
  namespace YT {
    interface Player {
      playVideo(): void;
      pauseVideo(): void;
      seekTo(seconds: number, allowSeekAhead?: boolean): void;
      getCurrentTime(): number;
      getDuration(): number;
      getPlayerState(): number;
      setVolume(volume: number): void;
      mute(): void;
      unMute(): void;
      isMuted(): boolean;
      destroy(): void;
    }
    
    interface PlayerOptions {
      height?: string | number;
      width?: string | number;
      videoId?: string;
      playerVars?: {
        autoplay?: 0 | 1;
        controls?: 0 | 1;
        disablekb?: 0 | 1;
        enablejsapi?: 0 | 1;
        fs?: 0 | 1;
        modestbranding?: 0 | 1;
        playsinline?: 0 | 1;
        rel?: 0 | 1;
        showinfo?: 0 | 1;
        start?: number;
        origin?: string;
      };
      events?: {
        onReady?: (event: { target: Player }) => void;
        onStateChange?: (event: { data: number; target: Player }) => void;
        onPlaybackQualityChange?: (event: { data: string; target: Player }) => void;
        onPlaybackRateChange?: (event: { data: number; target: Player }) => void;
        onError?: (event: { data: number; target: Player }) => void;
        onApiChange?: (event: { target: Player }) => void;
      };
    }
    
    interface PlayerConstructor {
      new (elementId: string, options: PlayerOptions): Player;
    }
    
    const Player: PlayerConstructor;
    const PlayerState: {
      UNSTARTED: -1;
      ENDED: 0;
      PLAYING: 1;
      PAUSED: 2;
      BUFFERING: 3;
      CUED: 5;
    };
  }
}

export default function MiniController() {
    const [isPlaying, setIsPlaying] = useState(true);
    const [volume, setVolume] = useState(50);
    const [isMuted, setIsMuted] = useState(false);
    const [track, setTrack] = useState<Track | null>(null);
    const [progress, setProgress] = useState(0); // Percentage
    const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const playerRef = useRef<YT.Player | null>(null);
    const pathname = usePathname();
    const { user } = useAuth();
    
    // Extract room slug from pathname if in a room
    const roomSlug = pathname.startsWith('/rooms/') ? pathname.split('/')[2] : null;
    
    // Listen for the current room if in a room page
    useEffect(() => {
        if (!roomSlug || !user) return;
        
        const fetchRoomId = async () => {
            try {
                const q = query(collection(db, 'rooms'), where('slug', '==', roomSlug));
                const querySnapshot = await getDocs(q);
                
                if (!querySnapshot.empty) {
                    const roomDoc = querySnapshot.docs[0];
                    const roomId = roomDoc.id;
                    
                    // Set up listener for this room
                    const unsubscribe = onSnapshot(doc(db, 'rooms', roomId), (doc) => {
                        if (doc.exists()) {
                            const roomData = doc.data() as Room;
                            setCurrentRoom(roomData);
                            const playingTrack = roomData.queue.find(t => t.status === 'playing');
                            setTrack(playingTrack || null);
                            
                            // Update current time if available
                            if (roomData.currentPlayback?.currentTime) {
                                setCurrentTime(roomData.currentPlayback.currentTime);
                                if (track) {
                                    setProgress((roomData.currentPlayback.currentTime / track.durationSec) * 100);
                                }
                            }
                        }
                    });
                    
                    return unsubscribe;
                }
            } catch (error) {
                console.error('Error fetching room:', error);
            }
        };
        
        const unsubscribe = fetchRoomId();
        return () => {
            if (unsubscribe) unsubscribe;
        };
    }, [roomSlug, user]);

    // Update progress based on current time
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isPlaying && track) {
            timer = setInterval(() => {
                setCurrentTime(prev => {
                    const newTime = prev + 1;
                    if (newTime >= track.durationSec) {
                        return 0;
                    }
                    // Update progress percentage
                    setProgress((newTime / track.durationSec) * 100);
                    return newTime;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [isPlaying, track]);
    
    const togglePlay = async () => {
        if (!currentRoom || !track) return;
        
        setIsPlaying(!isPlaying);
        
        // Update playback state in Firestore
        try {
            const roomRef = doc(db, 'rooms', currentRoom.id);
            await updateDoc(roomRef, {
                'currentPlayback.isPlaying': !isPlaying
            });
        } catch (error) {
            console.error('Error updating playback state:', error);
        }
    };
    
    const skipTrack = async () => {
        if (!currentRoom || !track) return;
        
        // Mark current track as skipped and trigger next track
        try {
            const roomRef = doc(db, 'rooms', currentRoom.id);
            await updateDoc(roomRef, {
                'currentPlayback.ended': true,
                'queue': currentRoom.queue.map(t => 
                    t.id === track.id ? {...t, status: 'skipped'} : t
                )
            });
        } catch (error) {
            console.error('Error skipping track:', error);
        }
    };

    const handleVolumeChange = (value: number[]) => {
        setVolume(value[0]);
        if (value[0] === 0) {
            setIsMuted(true);
        } else if (isMuted) {
            setIsMuted(false);
        }
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
        setVolume(isMuted ? 50 : 0);
    };
    
    if (!track) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 w-[350px]">
            <Card className="glassmorphism overflow-hidden shadow-2xl">
                <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                        <Image
                            src={track.thumbnailUrl}
                            alt={track.title}
                            width={56}
                            height={56}
                            className="rounded-md aspect-square object-cover"
                            data-ai-hint="song album"
                        />
                        <div className="flex-1 overflow-hidden">
                            <p className="font-bold truncate text-foreground">{track.title}</p>
                            <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                        <Button variant="ghost" size="icon">
                            <SkipBack className="h-5 w-5" />
                        </Button>
                        <Button size="icon" className="h-10 w-10 rounded-full bg-primary hover:bg-primary/90" onClick={togglePlay}>
                            {isPlaying ? <Pause className="h-6 w-6 text-primary-foreground" /> : <Play className="h-6 w-6 text-primary-foreground" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={skipTrack}>
                            <SkipForward className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <Slider value={[progress]} max={100} step={1} onValueChange={(val) => setProgress(val[0])}/>
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{new Date(progress / 100 * track.durationSec * 1000).toISOString().substr(14, 5)}</span>
                            <span>{new Date(track.durationSec * 1000).toISOString().substr(14, 5)}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={toggleMute}>
                            {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                        </Button>
                        <Slider value={[isMuted ? 0 : volume]} max={100} step={1} onValueChange={handleVolumeChange} />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
