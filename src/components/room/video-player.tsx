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
    const [apiLoading, setApiLoading] = useState(true);
    const [playerLoading, setPlayerLoading] = useState(false);
    
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
                setApiLoading(false);
                return Promise.resolve();
            }

            if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
                // Script is already loading, wait for it
                return new Promise<void>((resolve) => {
                    const checkAPI = () => {
                        if (window.YT && window.YT.Player) {
                            console.log('YouTube API loaded');
                            isApiReady.current = true;
                            setApiLoading(false);
                            resolve();
                        } else {
                            setTimeout(checkAPI, 100);
                        }
                    };
                    checkAPI();
                });
            }

            // Load the YouTube API script
            return new Promise<void>((resolve, reject) => {
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                tag.async = true;
                
                // Set up global callback BEFORE adding script
                (window as any).onYouTubeIframeAPIReady = () => {
                    console.log('YouTube API ready via callback');
                    isApiReady.current = true;
                    setApiLoading(false);
                    resolve();
                };
                
                tag.onload = () => {
                    console.log('YouTube API script loaded');
                    // Fallback in case callback doesn't fire
                    setTimeout(() => {
                        if (window.YT && window.YT.Player) {
                            console.log('YouTube API ready via fallback');
                            isApiReady.current = true;
                            setApiLoading(false);
                            resolve();
                        }
                    }, 1000);
                };
                
                tag.onerror = () => {
                    console.error('Failed to load YouTube API script');
                    setApiLoading(false);
                    reject(new Error('Failed to load YouTube API'));
                };
                
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
            });
        };

        loadYouTubeAPI().catch(error => {
            console.error('Error loading YouTube API:', error);
        });

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

        // Wait for API to be ready before initializing
        const initializePlayer = async () => {
            console.log('🎬 Initializing player for track:', track.videoId);
            setPlayerLoading(true);
            
            // Set a timeout to prevent infinite loading
            const timeoutId = setTimeout(() => {
                console.warn('⚠️ Player initialization timeout - forcing stop loading');
                setPlayerLoading(false);
                setPlayerReady(false);
            }, 10000); // 10 second timeout
            
            // Wait for API to be ready
            let attempts = 0;
            while (!isApiReady.current && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!isApiReady.current) {
                console.error('❌ YouTube API failed to load after 5 seconds');
                setPlayerLoading(false);
                clearTimeout(timeoutId);
                return;
            }

            if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
                try {
                    // Load new video
                    console.log('🔄 Loading video:', track.videoId);
                    clearTimeout(timeoutId);
                    setPlayerLoading(false); // Stop loading immediately when using existing player
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
                    console.warn('⚠️ Error loading video, recreating player:', error);
                    clearTimeout(timeoutId);
                    // Fallback: recreate player if loadVideoById fails
                    if (playerRef.current) {
                        try {
                            playerRef.current.destroy();
                        } catch (e) {
                            console.warn('Error destroying player:', e);
                        }
                        playerRef.current = null;
                    }
                    // Fall through to create new player
                }
            }

            if (!playerRef.current) {
                console.log('🆕 Creating new YouTube player for video:', track.videoId);
                
                // Ensure the YouTube player container exists
                const playerContainer = document.getElementById('youtube-player');
                if (!playerContainer) {
                    console.error('❌ YouTube player container not found!');
                    setPlayerLoading(false);
                    clearTimeout(timeoutId);
                    return;
                }
                
                // Detect mobile device
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                console.log('📱 Is mobile device:', isMobile);
                
                // Create new player with mobile-optimized settings
                try {
                    console.log('Creating YouTube player with container check...');
                    
                    // Double-check container exists and clear any existing content
                    const container = document.getElementById('youtube-player');
                    if (container) {
                        container.innerHTML = ''; // Clear any existing content
                        console.log('Container cleared and ready');
                    }
                    
                    playerRef.current = new (window as any).YT.Player('youtube-player', {
                        videoId: track.videoId,
                        width: '100%',
                        height: '100%',
                        playerVars: {
                            autoplay: 0, // Never autoplay - requires user interaction on mobile
                            controls: 1, // Always show controls for mobile compatibility
                            modestbranding: 1,
                            rel: 0,
                            showinfo: 0,
                            fs: 1, // Enable fullscreen
                            playsinline: 1, // Critical for mobile - prevents opening in native player
                            iv_load_policy: 3, // Hide annotations
                            color: 'white',
                            enablejsapi: 1,
                            origin: window.location.origin,
                            cc_load_policy: 0, // Disable closed captions by default
                            disablekb: 0, // Enable keyboard controls for accessibility
                            end: undefined,
                            hl: 'en',
                            loop: 0,
                            start: 0,
                            widget_referrer: window.location.origin,
                            // Mobile specific optimizations
                            mute: 0, // Don't mute by default - let user control
                            wmode: 'opaque', // Helps with mobile rendering
                        },
                        events: {
                            onReady: (event: any) => {
                                console.log('🎬 YouTube player ready for video:', track.videoId);
                                clearTimeout(timeoutId); // Clear timeout on success
                                setPlayerReady(true);
                                setPlayerLoading(false);
                                
                                try {
                                    const videoDuration = event.target.getDuration();
                                    const currentTime = event.target.getCurrentTime() || 0;
                                    
                                    console.log('Video details:', { videoDuration, currentTime, isMobile });
                                    
                                    if (videoDuration && videoDuration > 0) {
                                        setDuration(videoDuration);
                                    }
                                    setProgress(currentTime);
                                    
                                    // For desktop admin, try to auto-play
                                    if (isOwner && !isMobile) {
                                        console.log('Desktop admin - attempting auto-play');
                                        event.target.playVideo();
                                        
                                        // Send initial sync
                                        setTimeout(() => {
                                            const syncTime = event.target.getCurrentTime() || 0;
                                            const message = { 
                                                type: 'playbackState', 
                                                isPlaying: true, 
                                                currentTime: syncTime,
                                                adminId: user?.uid 
                                            };
                                            sendJsonMessage(message);
                                            console.log('🔄 Initial sync sent:', message);
                                        }, 500);
                                    } else {
                                        console.log('Mobile/member - waiting for user interaction or admin sync');
                                    }
                                } catch (error) {
                                    console.warn('Error in onReady handler:', error);
                                    setPlayerLoading(false);
                                }
                            },
                            onStateChange: (event: any) => {
                                try {
                                    const playerState = event.data;
                                    const newPlaying = playerState === (window as any).YT.PlayerState.PLAYING;
                                    const newPaused = playerState === (window as any).YT.PlayerState.PAUSED;
                                    const wasPlaying = isPlaying;
                                    
                                    console.log('State change:', { playerState, newPlaying, wasPlaying, isOwner, isMobile });
                                    
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
                            },
                            onError: (event: any) => {
                                console.error('🚨 YouTube player error:', event.data);
                                clearTimeout(timeoutId); // Clear timeout on error
                                setPlayerLoading(false);
                                setPlayerReady(false); // Mark as not ready on error
                                
                                // Handle different error codes
                                switch (event.data) {
                                    case 2:
                                        console.error('Invalid video ID:', track.videoId);
                                        break;
                                    case 5:
                                        console.error('Video cannot be played in HTML5 player');
                                        break;
                                    case 100:
                                        console.error('Video not found or private');
                                        break;
                                    case 101:
                                    case 150:
                                        console.error('Video owner does not allow embedding');
                                        break;
                                    default:
                                        console.error('Unknown YouTube error:', event.data);
                                }
                                
                                // On mobile, sometimes we need to retry
                                if (isMobile) {
                                    console.warn('Mobile error detected, may retry...');
                                }
                            }
                        }
                    });
                } catch (error) {
                    console.error('❌ Error creating YouTube player:', error);
                    clearTimeout(timeoutId);
                    setPlayerLoading(false);
                    
                    // Mobile fallback - show a message with a direct link
                    if (typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                        console.warn('YouTube player failed on mobile, this is often due to mobile restrictions');
                        // Could show a "Open in YouTube" button here as fallback
                    }
                }
            }
        };

        initializePlayer();
    }, [track?.id, roomId, isOwner, user?.uid, sendJsonMessage, isValidTime]);

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

    // Sync function for non-admins - improved for mobile
    const syncWithAdmin = useCallback((targetTime: number, targetPlaying: boolean) => {
        if (!isPlayerReady() || isSyncingRef.current || !isValidTime(targetTime)) {
            console.log('Sync skipped:', { ready: isPlayerReady(), syncing: isSyncingRef.current, valid: isValidTime(targetTime) });
            return;
        }

        // Detect mobile device for sync adjustments
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

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
                threshold: SYNC_THRESHOLD,
                isMobile
            });

            // More aggressive sync threshold for mobile due to potential buffering issues
            const syncThreshold = isMobile ? 1.5 : SYNC_THRESHOLD;
            
            // Only sync if difference is significant or play state is different
            if (timeDiff > syncThreshold || (currentPlaying !== targetPlaying && !memberPaused)) {
                console.log(`Member syncing: ${timeDiff > syncThreshold ? 'TIME' : ''}${currentPlaying !== targetPlaying ? ' PLAY' : ''}`);
                
                // Seek to the correct time first
                if (timeDiff > syncThreshold) {
                    player.seekTo(targetTime, true);
                    setProgress(targetTime); // Update UI immediately
                }

                // Handle play state - but only if member hasn't manually paused
                if (targetPlaying !== currentPlaying && !memberPaused) {
                    // Mobile needs more time to process seek operations
                    const delay = timeDiff > syncThreshold ? (isMobile ? 1000 : 500) : (isMobile ? 300 : 100);
                    
                    setTimeout(() => {
                        try {
                            if (targetPlaying) {
                                console.log('Attempting to play video for sync');
                                player.playVideo();
                            } else {
                                console.log('Attempting to pause video for sync');
                                player.pauseVideo();
                            }
                        } catch (e) {
                            console.warn('Error changing play state:', e);
                        }
                    }, delay);
                }
            } else {
                console.log('Member already in sync');
            }
        } catch (error) {
            console.error('Error during sync:', error);
        } finally {
            // Mobile needs more time to complete sync operations
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const syncDelay = isMobile ? 1500 : 1000;
            
            setTimeout(() => {
                isSyncingRef.current = false;
                setSyncStatus('connected');
            }, syncDelay);
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
                            {/* YouTube player container with proper ID and styling */}
                            <div 
                                id="youtube-player" 
                                className="w-full h-full absolute inset-0"
                                style={{ 
                                    backgroundColor: '#000',
                                    minHeight: '200px', // Ensure minimum height for mobile
                                    width: '100%',
                                    height: '100%',
                                    // Mobile-specific optimizations
                                    WebkitTransform: 'translate3d(0,0,0)', // Force hardware acceleration on mobile
                                    transform: 'translate3d(0,0,0)',
                                    position: 'relative', // Ensure proper positioning
                                    zIndex: 1
                                }}
                            ></div>
                            
                            {/* Loading overlay - only show for API loading, not player loading */}
                            {apiLoading && (
                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                                    <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                                    <div className="text-center space-y-2">
                                        <p className="text-white font-medium">Loading YouTube API...</p>
                                        <p className="text-white/70 text-sm">{track.title}</p>
                                    </div>
                                </div>
                            )}
                            
                            {/* Mobile play button overlay - shown when video needs user interaction */}
                            {(() => {
                                const isMobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                                // Show mobile play button if:
                                // - On mobile device
                                // - API is ready 
                                // - Not currently loading API
                                // - Video is paused or player hasn't started yet
                                const showMobilePlayButton = isMobile && isApiReady.current && !apiLoading && !isPlaying;
                                
                                return showMobilePlayButton && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-15">
                                        <button
                                            onClick={() => {
                                                console.log('Mobile play button tapped - attempting to start video');
                                                if (playerRef.current) {
                                                    try {
                                                        playerRef.current.playVideo();
                                                    } catch (error) {
                                                        console.warn('Error playing video from mobile button:', error);
                                                    }
                                                } else {
                                                    console.warn('Player not ready, forcing player creation...');
                                                    // Force player creation if it doesn't exist
                                                    setPlayerLoading(true);
                                                }
                                            }}
                                            className="bg-primary hover:bg-primary/90 text-white rounded-full p-6 shadow-lg transform hover:scale-105 transition-all"
                                        >
                                            <Play size={48} className="ml-1" />
                                        </button>
                                        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
                                            <p className="text-white text-sm text-center bg-black/70 px-4 py-2 rounded-full">
                                                Tap to play video
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                            
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
                        
                        {/* Mobile debug info - only show in development */}
                        {(() => {
                            const isMobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                            const isDev = process.env.NODE_ENV === 'development';
                            
                            return isMobile && isDev && (
                                <div className="text-center mt-2 space-y-1">
                                    <div className="text-xs bg-blue-500/20 text-blue-200 px-2 py-1 rounded">
                                        📱 API: {isApiReady.current ? '✅' : '❌'} | 
                                        Player: {playerReady ? '✅' : '❌'} | 
                                        Playing: {isPlaying ? '▶️' : '⏸️'}
                                    </div>
                                    {!playerReady && (
                                        <button
                                            onClick={() => {
                                                console.log('🔄 Force refresh player...');
                                                if (playerRef.current) {
                                                    try {
                                                        playerRef.current.destroy();
                                                    } catch (e) {}
                                                    playerRef.current = null;
                                                }
                                                setPlayerReady(false);
                                                setPlayerLoading(true);
                                                // Trigger re-initialization
                                                setTimeout(() => setPlayerLoading(false), 100);
                                            }}
                                            className="text-xs bg-orange-500/20 text-orange-200 px-2 py-1 rounded hover:bg-orange-500/30"
                                        >
                                            🔄 Retry Player
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </CardContent>
        </Card>
    );
});

export default VideoPlayer;
