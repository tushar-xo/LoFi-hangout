'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Track } from "@/lib/types";
import { Music, Play, Pause, Maximize, Minimize, PlayCircle, Loader2 } from "lucide-react";
import { playNextTrackInQueue, sendNotificationToRoom } from '@/lib/firebase-client-service';
import { Slider } from '@/components/ui/slider';
import { useSocket } from '@/hooks/use-socket';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

interface VideoPlayerProps {
    track: Track | undefined;
    roomId: string;
    isOwner: boolean;
    queue?: Track[]; // Add queue prop to check for available tracks
}

// Constants for video synchronization
const SYNC_THRESHOLD = 2.0; // 2 seconds - sync if difference is greater than this
const SYNC_INTERVAL = 2000; // 2 seconds - how often admin sends sync messages
const STATE_REQUEST_INTERVAL = 3000; // 3 seconds - how often non-admins request state

const VideoPlayer = memo(function VideoPlayer({ track, roomId, isOwner, queue = [] }: VideoPlayerProps) {
    // Refs for YouTube player and sync management
    const playerRef = useRef<any | null>(null); // YouTube player type
    const lastSyncTimeRef = useRef<number>(0);
    const isApiReady = useRef<boolean>(false);
    const isSyncingRef = useRef<boolean>(false);
    const prevIsOwnerRef = useRef<boolean>(isOwner);
    
    // Component state
    const [playerReady, setPlayerReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [syncStatus, setSyncStatus] = useState<'connected' | 'syncing' | 'disconnected'>('disconnected');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [memberPaused, setMemberPaused] = useState(false); // Track if member manually paused
    
    const { user } = useAuth();
    const { sendJsonMessage, lastJsonMessage, readyState } = useSocket(user?.uid || 'Anonymous', roomId);
    const { toast } = useToast();

    // Update sync status based on WebSocket connection
    useEffect(() => {
        if (readyState === 1) {
            setSyncStatus('connected');
        } else {
            setSyncStatus('disconnected');
        }
    }, [readyState]);

    // Fullscreen event listeners
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    // Utility function to validate currentTime
    const isValidTime = useCallback((time: number): boolean => {
        return typeof time === 'number' && !isNaN(time) && isFinite(time) && time >= 0;
    }, []);

    // Utility function to check if player is ready for operations
    const isPlayerReady = useCallback((): boolean => {
        return !!(
            playerRef.current &&
            playerReady &&
            typeof playerRef.current.getCurrentTime === 'function' &&
            typeof playerRef.current.seekTo === 'function' &&
            typeof playerRef.current.getPlayerState === 'function' &&
            typeof playerRef.current.getDuration === 'function'
        );
    }, [playerReady]);

    // Load YouTube IFrame API
    useEffect(() => {
        const loadYouTubeAPI = () => {
            if (window.YT && window.YT.Player) {
                console.log('YouTube API already loaded');
                isApiReady.current = true;
                return;
            }

            if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
                // Script is already loading, wait for it
                const checkAPI = () => {
                    if (window.YT && window.YT.Player) {
                        console.log('YouTube API loaded');
                        isApiReady.current = true;
                    } else {
                        setTimeout(checkAPI, 100);
                    }
                };
                checkAPI();
                return;
            }

            // Load the YouTube API script
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            tag.async = true;
            
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
            
            // Set up global callback
            (window as any).onYouTubeIframeAPIReady = () => {
                console.log('YouTube API ready via callback');
                isApiReady.current = true;
            };
            
            // Fallback polling in case callback doesn't fire
            const checkAPI = () => {
                if (window.YT && window.YT.Player) {
                    console.log('YouTube API ready via polling');
                    isApiReady.current = true;
                } else {
                    setTimeout(checkAPI, 100);
                }
            };
            setTimeout(checkAPI, 1000);
        };

        loadYouTubeAPI();

        return () => {
            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                    console.log('Player destroyed on cleanup');
                } catch (e) {
                    console.warn('Error destroying player:', e);
                }
                playerRef.current = null;
            }
        };
    }, []);

    // Initialize or update player when track changes
    useEffect(() => {
        // Reset member pause state when track changes
        setMemberPaused(false);
        
        if (!track) {
            if (playerRef.current && playerReady) {
                try {
                    playerRef.current.stopVideo();
                } catch (e) {
                    console.warn('Error stopping video:', e);
                }
            }
            return;
        }

        if (isApiReady.current) {
            if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
                try {
                    // Load new video
                    playerRef.current.loadVideoById(track.videoId);
                    
                    // Admin sends initial sync when track changes
                    if (isOwner) {
                        setTimeout(() => {
                            if (isPlayerReady()) {
                                const currentTime = playerRef.current!.getCurrentTime();
                                const message = { 
                                    type: 'playbackState', 
                                    isPlaying: true, 
                                    currentTime,
                                    adminId: user?.uid 
                                };
                                sendJsonMessage(message);
                                console.log('Track change sync sent:', message);
                            }
                        }, 1000);
                    }
                } catch (error) {
                    console.warn('Error loading video:', error);
                    // Fallback: recreate player if loadVideoById fails
                    playerRef.current = null;
                }
            } else {
                // Create new player
                playerRef.current = new (window as any).YT.Player('youtube-player', {
                    videoId: track.videoId,
                    width: '100%',
                    height: '100%',
                    playerVars: {
                        autoplay: isOwner ? 1 : 0, // Only auto-play for admin
                        controls: isOwner ? 1 : 0, // Show YouTube controls only for admin
                        modestbranding: 1,
                        rel: 0,
                        showinfo: 0,
                        fs: 1, // Enable fullscreen
                        playsinline: 1, // Important for mobile
                        iv_load_policy: 3,
                        color: 'white',
                        enablejsapi: 1,
                        origin: window.location.origin,
                        // Mobile-specific parameters
                        cc_load_policy: 0, // Disable closed captions by default
                        disablekb: 0, // Enable keyboard controls
                        end: undefined, // Don't set an end time
                        hl: 'en', // Set interface language
                        loop: 0, // Don't loop
                        start: 0, // Start from beginning
                        widget_referrer: window.location.origin
                    },
                    events: {
                        onReady: (event: any) => {
                            setPlayerReady(true);
                            setDuration(event.target.getDuration());
                            setProgress(event.target.getCurrentTime() || 0);
                            
                            if (isOwner) {
                                // Auto-play for admin
                                event.target.playVideo();
                                
                                // Send initial sync
                                setTimeout(() => {
                                    const currentTime = event.target.getCurrentTime();
                                    const message = { 
                                        type: 'playbackState', 
                                        isPlaying: true, 
                                        currentTime,
                                        adminId: user?.uid 
                                    };
                                    sendJsonMessage(message);
                                }, 500);
                            }
                        },
                        onStateChange: (event: any) => {
                            try {
                                const playerState = event.data;
                                const newPlaying = playerState === (window as any).YT.PlayerState.PLAYING;
                                const newPaused = playerState === (window as any).YT.PlayerState.PAUSED;
                                const wasPlaying = isPlaying;
                                
                                console.log('State change:', { playerState, newPlaying, wasPlaying, isOwner });
                                
                                // Always update the playing state immediately
                                setIsPlaying(newPlaying);
                                
                                // Update progress and duration when state changes
                                if (event.target && typeof event.target.getCurrentTime === 'function') {
                                    const currentTime = event.target.getCurrentTime();
                                    const videoDuration = event.target.getDuration();
                                    
                                    if (isValidTime(currentTime)) {
                                        setProgress(currentTime);
                                    }
                                    if (videoDuration && videoDuration > 0 && isValidTime(videoDuration)) {
                                        setDuration(videoDuration);
                                    }
                                }
                                
                                // Handle member manual pause/play detection (non-admin only)
                                if (!isOwner && !isSyncingRef.current) {
                                    if (newPaused && wasPlaying) {
                                        console.log('Member manually paused video');
                                        setMemberPaused(true);
                                    } else if (newPlaying && !wasPlaying && memberPaused) {
                                        console.log('Member manually resumed video, syncing back to admin');
                                        setMemberPaused(false);
                                        sendJsonMessage({ type: 'requestState', from: user?.uid });
                                    }
                                }
                                
                                // ADMIN: Send sync for ALL state changes (including YouTube control usage)
                                if (isOwner) {
                                    if (event.target && typeof event.target.getCurrentTime === 'function') {
                                        const currentTime = event.target.getCurrentTime();
                                        const message = { 
                                            type: 'playbackState', 
                                            isPlaying: newPlaying, 
                                            currentTime,
                                            adminId: user?.uid,
                                            timestamp: Date.now(),
                                            source: 'stateChange'
                                        };
                                        sendJsonMessage(message);
                                        console.log('Admin sync sent:', message);
                                        lastSyncTimeRef.current = Date.now();
                                    }
                                }
                                
                                // Auto-play next video when current one ends (admin only)
                                if (playerState === (window as any).YT.PlayerState.ENDED && isOwner) {
                                    console.log('Video ended, auto-playing next track');
                                    sendJsonMessage({ 
                                        type: 'trackEnded', 
                                        message: 'Current track ended, starting next track...',
                                        adminId: user?.uid 
                                    });
                                    playNextTrackInQueue(roomId);
                                }
                            } catch (error) {
                                console.error('Error in onStateChange:', error);
                            }
                        }
                    }
                });
            }
        }
    }, [track?.id, roomId, isOwner, user?.uid, sendJsonMessage]);

    // Handle admin control transfer - reinitialize YouTube player when isOwner changes
    useEffect(() => {
        // Only proceed if isOwner has actually changed (not on initial mount)
        if (prevIsOwnerRef.current === isOwner) {
            prevIsOwnerRef.current = isOwner;
            return;
        }

        prevIsOwnerRef.current = isOwner;

        if (!isApiReady.current || !track?.videoId || !playerRef.current) return;

        console.log('Admin control transfer detected, reinitializing player with controls:', isOwner);

        const player = playerRef.current;
        let currentTime = 0;
        let isCurrentlyPlaying = false;

        try {
            // Safely get current state
            if (typeof player.getCurrentTime === 'function' && typeof player.getPlayerState === 'function') {
                currentTime = player.getCurrentTime() || 0;
                isCurrentlyPlaying = player.getPlayerState() === (window as any).YT.PlayerState.PLAYING;
            }
        } catch (error) {
            console.warn('Error getting player state during transfer:', error);
        }

        // Destroy and recreate player with new controls
        try {
            player.destroy();
        } catch (error) {
            console.warn('Error destroying player:', error);
        }
        
        setPlayerReady(false); // Mark as not ready during transfer
        
        // Small delay to ensure player is properly destroyed
        setTimeout(() => {
            playerRef.current = new (window as any).YT.Player('youtube-player', {
                videoId: track.videoId,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 0, // Don't auto-play during control transfer
                    controls: isOwner ? 1 : 0, // Show YouTube controls only for new admin
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                    fs: 1,
                    playsinline: 1,
                    iv_load_policy: 3,
                    color: 'white',
                    enablejsapi: 1,
                    origin: window.location.origin,
                    cc_load_policy: 0,
                    disablekb: 0,
                    end: undefined,
                    hl: 'en',
                    loop: 0,
                    start: Math.floor(currentTime), // Resume from current position
                    widget_referrer: window.location.origin
                },
                events: {
                    onReady: (event: any) => {
                        setPlayerReady(true);
                        setDuration(event.target.getDuration());
                        
                        // Seek to the correct time and restore playback state
                        event.target.seekTo(currentTime, true);
                        if (isCurrentlyPlaying) {
                            event.target.playVideo();
                        } else {
                            event.target.pauseVideo();
                        }
                        
                        setProgress(currentTime);
                        
                        // Send sync message if new admin
                        if (isOwner) {
                            setTimeout(() => {
                                const message = { 
                                    type: 'playbackState', 
                                    isPlaying: isCurrentlyPlaying, 
                                    currentTime,
                                    adminId: user?.uid,
                                    timestamp: Date.now(),
                                    source: 'adminTransfer'
                                };
                                sendJsonMessage(message);
                                console.log('Admin transfer sync sent:', message);
                            }, 500);
                        }
                    },
                    onStateChange: (event: any) => {
                        const playerState = event.data;
                        const currentTime = event.target.getCurrentTime();
                        
                        try {
                            // Update progress for all users
                            if (isValidTime(currentTime)) {
                                setProgress(currentTime);
                            }

                            // Only admin should send sync messages
                            if (isOwner) {
                                const isCurrentlyPlaying = playerState === (window as any).YT.PlayerState.PLAYING;
                                setIsPlaying(isCurrentlyPlaying);
                                
                                // Send sync message for state changes
                                if (user?.uid) {
                                    const message = { 
                                        type: 'playbackState', 
                                        isPlaying: isCurrentlyPlaying, 
                                        currentTime,
                                        adminId: user?.uid,
                                        timestamp: Date.now(),
                                        source: 'stateChange'
                                    };
                                    sendJsonMessage(message);
                                    lastSyncTimeRef.current = Date.now();
                                }
                            }
                            
                            // Auto-play next video when current one ends (admin only)
                            if (playerState === (window as any).YT.PlayerState.ENDED && isOwner) {
                                sendJsonMessage({ 
                                    type: 'trackEnded', 
                                    message: 'Current track ended, starting next track...',
                                    adminId: user?.uid 
                                });
                                playNextTrackInQueue(roomId);
                            }
                        } catch (error) {
                            console.error('Error in onStateChange after transfer:', error);
                        }
                    }
                }
            });
        }, 100);
    }, [isOwner]); // Only trigger when isOwner changes

    // Sync function for non-admins
    const syncWithAdmin = useCallback((targetTime: number, targetPlaying: boolean) => {
        if (!isPlayerReady() || isSyncingRef.current || !isValidTime(targetTime)) {
            console.log('Sync skipped:', { ready: isPlayerReady(), syncing: isSyncingRef.current, valid: isValidTime(targetTime) });
            return;
        }

        try {
            isSyncingRef.current = true;
            setSyncStatus('syncing');
            const player = playerRef.current!;
            const currentTime = player.getCurrentTime();
            const currentState = player.getPlayerState();
            const currentPlaying = currentState === 1;
            const timeDiff = Math.abs(currentTime - targetTime);

            console.log('Member sync check:', { 
                currentTime: currentTime.toFixed(1), 
                targetTime: targetTime.toFixed(1), 
                timeDiff: timeDiff.toFixed(1), 
                currentPlaying, 
                targetPlaying,
                memberPaused,
                threshold: SYNC_THRESHOLD
            });

            // Only sync if difference is significant (> 2 seconds) or play state is different
            if (timeDiff > SYNC_THRESHOLD || (currentPlaying !== targetPlaying && !memberPaused)) {
                console.log(`Member syncing: ${timeDiff > SYNC_THRESHOLD ? 'TIME' : ''}${currentPlaying !== targetPlaying ? ' PLAY' : ''}`);
                
                // Seek to the correct time first
                if (timeDiff > SYNC_THRESHOLD) {
                    player.seekTo(targetTime, true);
                    setProgress(targetTime); // Update UI immediately
                }

                // Then handle play state - but only if member hasn't manually paused
                if (targetPlaying !== currentPlaying && !memberPaused) {
                    setTimeout(() => {
                        try {
                            if (targetPlaying) {
                                player.playVideo();
                            } else {
                                player.pauseVideo();
                            }
                        } catch (e) {
                            console.warn('Error changing play state:', e);
                        }
                    }, timeDiff > SYNC_THRESHOLD ? 500 : 100); // Wait longer if we also seeked
                }
            } else {
                console.log('Member already in sync');
            }
        } catch (error) {
            console.error('Error during sync:', error);
        } finally {
            setTimeout(() => {
                isSyncingRef.current = false;
                setSyncStatus('connected');
            }, 1000);
        }
    }, [isPlayerReady, isValidTime, memberPaused]);

    // Handle WebSocket messages
    useEffect(() => {
        if (!lastJsonMessage) return;

        const message = lastJsonMessage as any;
        console.log('Received message:', message);

        // Only process messages from the admin
        if (message.adminId && !isOwner) {
            if (message.type === 'playbackState') {
                const { isPlaying: targetPlaying, currentTime: targetTime } = message;
                if (isValidTime(targetTime)) {
                    syncWithAdmin(targetTime, targetPlaying);
                }
            } else if (message.type === 'seekTo') {
                const { currentTime: targetTime } = message;
                if (isValidTime(targetTime)) {
                    syncWithAdmin(targetTime, isPlaying);
                }
            }
        }

        // Handle state requests (admin responds)
        if (message.type === 'requestState' && isOwner && isPlayerReady()) {
            try {
                const currentTime = playerRef.current!.getCurrentTime();
                const response = { 
                    type: 'playbackState', 
                    isPlaying, 
                    currentTime,
                    adminId: user?.uid 
                };
                sendJsonMessage(response);
                console.log('Admin responding to state request:', response);
            } catch (error) {
                console.warn('Error responding to state request:', error);
            }
        }
    }, [lastJsonMessage, isOwner, isPlaying, user?.uid, sendJsonMessage, syncWithAdmin, isValidTime]);

    // Admin periodic sync broadcasting
    useEffect(() => {
        if (!isOwner || !isPlayerReady()) return;

        let lastBroadcastTime = 0;

        const interval = setInterval(() => {
            try {
                const currentTime = playerRef.current!.getCurrentTime();
                const currentState = playerRef.current!.getPlayerState();
                const currentlyPlaying = currentState === 1;
                
                // Detect if admin seeked (big time jump)
                const timeDiff = Math.abs(currentTime - lastBroadcastTime);
                const isSeek = timeDiff > SYNC_THRESHOLD && lastBroadcastTime > 0;
                
                // Always send sync to keep members in sync
                if (isValidTime(currentTime)) {
                    const message = { 
                        type: 'playbackState', 
                        isPlaying: currentlyPlaying, 
                        currentTime,
                        adminId: user?.uid,
                        timestamp: Date.now(),
                        source: isSeek ? 'periodicSeek' : 'periodic'
                    };
                    sendJsonMessage(message);
                    console.log(`Admin ${isSeek ? 'SEEK' : 'sync'} broadcast:`, { currentlyPlaying, currentTime: currentTime.toFixed(1) });
                    lastSyncTimeRef.current = Date.now();
                }
                
                lastBroadcastTime = currentTime;
            } catch (error) {
                console.warn('Error in admin sync interval:', error);
            }
        }, SYNC_INTERVAL);

        return () => clearInterval(interval);
    }, [isOwner, user?.uid, sendJsonMessage, isValidTime]); // Add proper dependencies

    // Non-admin periodic state requests
    useEffect(() => {
        if (isOwner || !isPlayerReady()) return;

        // Request initial state
        sendJsonMessage({ type: 'requestState' });

        const interval = setInterval(() => {
            sendJsonMessage({ type: 'requestState' });
        }, STATE_REQUEST_INTERVAL);

        return () => clearInterval(interval);
    }, [isOwner, sendJsonMessage]);

    // Progress tracking
    useEffect(() => {
        if (!playerReady || !playerRef.current) {
            return;
        }

        const interval = setInterval(() => {
            try {
                if (!playerRef.current) {
                    return;
                }

                const currentTime = playerRef.current.getCurrentTime();
                const videoDuration = playerRef.current.getDuration();
                const playerState = playerRef.current.getPlayerState();
                const isCurrentlyPlaying = playerState === 1; // 1 = playing
                
                // Always update progress for smooth UI if valid
                if (isValidTime(currentTime) && currentTime >= 0) {
                    setProgress(currentTime);
                }
                
                // Update duration if it has changed and is valid
                if (videoDuration && videoDuration > 0 && isValidTime(videoDuration) && Math.abs(videoDuration - duration) > 0.1) {
                    console.log('Setting video duration:', videoDuration);
                    setDuration(videoDuration);
                }
                
                // Update playing state if changed
                if (isCurrentlyPlaying !== isPlaying) {
                    setIsPlaying(isCurrentlyPlaying);
                }
                
            } catch (error) {
                console.warn('Error updating progress:', error);
            }
        }, 500); // Update every 500ms for smoother progress

        return () => {
            clearInterval(interval);
        };
    }, [playerReady, isValidTime]); // Remove duration dependency to prevent loops

    // Format time for display
    const formatTime = useCallback((seconds: number) => {
        if (!isValidTime(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }, [isValidTime]);

    // Fullscreen handler
    const handleFullscreen = useCallback(() => {
        const videoContainer = document.getElementById('youtube-player');
        if (!videoContainer) return;

        try {
            if (isFullscreen) {
                // Exit fullscreen
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            } else {
                // Enter fullscreen
                if (videoContainer.requestFullscreen) {
                    videoContainer.requestFullscreen();
                } else if ((videoContainer as any).webkitRequestFullscreen) {
                    (videoContainer as any).webkitRequestFullscreen();
                } else if ((videoContainer as any).mozRequestFullScreen) {
                    (videoContainer as any).mozRequestFullScreen();
                } else if ((videoContainer as any).msRequestFullscreen) {
                    (videoContainer as any).msRequestFullscreen();
                }
            }
        } catch (error) {
            console.warn('Fullscreen not supported:', error);
        }
    }, [isFullscreen]);

    // Start Jam handler - starts playing the first track in queue
    const handleStartJam = useCallback(async () => {
        if (!isOwner) return;

        const queuedTracks = queue.filter(t => t.status === 'queued');
        
        if (queuedTracks.length === 0) {
            toast({
                title: "Add Videos to Queue",
                description: "Add some videos to the queue before starting the jam!",
                variant: "destructive"
            });
            return;
        }

        try {
            await playNextTrackInQueue(roomId);
            await sendNotificationToRoom(roomId, "🎵 The jam has started! Let's vibe together!");
            toast({
                title: "Jam Started!",
                description: "The music is now playing. Enjoy the vibes!",
            });
        } catch (error) {
            console.error('Error starting jam:', error);
            toast({
                title: "Error",
                description: "Failed to start the jam. Please try again.",
                variant: "destructive"
            });
        }
    }, [isOwner, queue, roomId, toast]);

    return (
        <Card className="w-full overflow-hidden glassmorphism">
            <CardContent className="p-0 h-full w-full">
                <div className="aspect-video w-full relative bg-black/10">
                    {track ? (
                        <div className="relative w-full h-full bg-black">
                            {/* YouTube player container */}
                            <div 
                                id="youtube-player" 
                                className="w-full h-full absolute inset-0"
                                style={{ backgroundColor: '#000' }}
                            ></div>
                            
                            {/* Fullscreen button overlay */}
                            <button 
                                onClick={handleFullscreen}
                                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-lg transition-colors z-10"
                                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                            >
                                {isFullscreen ? <Minimize size={20} className="text-white" /> : <Maximize size={20} className="text-white" />}
                            </button>
                        </div>
                    ) : (
                        <div className="w-full h-full bg-secondary flex flex-col items-center justify-center text-muted-foreground">
                            <Music className="h-24 w-24 text-primary/20 mb-4" />
                            <h2 className="font-headline text-2xl font-semibold mb-2">Lo-Fi Lounge</h2>
                            <p className="mb-6 text-center">No track is currently playing.</p>
                            
                            {/* Show Start Jam button for room owner */}
                            {isOwner && (
                                <Button 
                                    onClick={handleStartJam}
                                    size="lg"
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-3 rounded-full shadow-lg transition-all transform hover:scale-105"
                                >
                                    <PlayCircle className="h-5 w-5 mr-2" />
                                    Start Jam!
                                </Button>
                            )}
                            
                            {/* Show message for non-owners */}
                            {!isOwner && (
                                <p className="text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-full">
                                    Waiting for the room admin to start the jam...
                                </p>
                            )}
                        </div>
                    )}
                </div>
                
                {track && (
                    <div className="p-4 space-y-3">
                        {/* Time display for everyone */}
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <div className="flex items-center gap-3">
                                {/* Sync status for non-owners - moved to left */}
                                {!isOwner && (
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${
                                            memberPaused ? 'bg-blue-500' :
                                            syncStatus === 'connected' ? 'bg-green-500' :
                                            syncStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' :
                                            'bg-red-500'
                                        }`} />
                                        <span className="text-xs">
                                            {memberPaused ? 'Paused' :
                                             syncStatus === 'connected' ? 'Synced' :
                                             syncStatus === 'syncing' ? 'Syncing...' :
                                             'Disconnected'}
                                        </span>
                                    </div>
                                )}
                                {/* Admin indicator */}
                                {isOwner && (
                                    <div className="text-xs text-primary bg-primary/10 px-2 py-1 rounded-full">
                                        Admin
                                    </div>
                                )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {formatTime(progress)} / {formatTime(duration || 0)}
                            </div>
                        </div>
                        
                        {/* Note for members */}
                        {!isOwner && (
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground bg-muted/30 px-3 py-1 rounded-full inline-block">
                                    Synced with room admin
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
});

export default VideoPlayer;
