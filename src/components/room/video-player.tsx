'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import type { Track, Room } from "@/lib/types";
import { Music, Play, Pause, Fullscreen } from "lucide-react";
import { playNextTrackInQueue, sendNotificationToRoom } from '@/lib/firebase-client-service';
import { Slider } from '@/components/ui/slider';
import { useSocket } from '@/hooks/use-socket';
import { useAuth } from '@/hooks/use-auth';

interface VideoPlayerProps {
    track: Track | undefined;
    roomId: string;
    isOwner: boolean;
}

export default function VideoPlayer({ track, roomId, isOwner }: VideoPlayerProps) {
    const playerRef = useRef<YT.Player | null>(null);
    const lastSyncRef = useRef({ time: 0, playing: false, lastSyncTime: 0 });
    const lastMessageRef = useRef<string>('');
    const [isApiReady, setIsApiReady] = useState(false);
    const [playerReady, setPlayerReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [lastMessageId, setLastMessageId] = useState(0); // Force effect to run
    const { user } = useAuth();
    const { sendJsonMessage, lastJsonMessage, readyState } = useSocket(user?.uid || 'Anonymous', roomId);

    console.log('VideoPlayer render:', { 
        isOwner, 
        playerReady, 
        readyState, 
        hasUser: !!user?.uid,
        hasLastJsonMessage: !!lastJsonMessage,
        lastJsonMessage,
        WebSocketReadyState: readyState
    });

    // Load YouTube IFrame API
    useEffect(() => {
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
            window.onYouTubeIframeAPIReady = () => setIsApiReady(true);
        } else {
            setIsApiReady(true);
        }

        // Add fullscreen change listeners
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        // Add keyboard shortcut for fullscreen (Escape key)
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                handleFullscreen();
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
            
            // Clean up fullscreen listeners
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    // Initialize or update player when track changes
    useEffect(() => {
        if (!track) {
            if (playerRef.current && playerReady) {
                playerRef.current.stopVideo();
            }
            return;
        }

        if (isApiReady) {
            if (playerRef.current) {
                playerRef.current.loadVideoById(track.videoId);
                // Send sync when track changes
                if (isOwner) {
                    setTimeout(() => {
                        if (playerRef.current && playerReady) {
                            const currentTime = playerRef.current.getCurrentTime();
                            const message = { type: 'playbackState', isPlaying: true, currentTime };
                            sendJsonMessage(message);
                            lastMessageRef.current = JSON.stringify(message);
                            console.log('Track change sync sent:', message);
                        }
                    }, 1000); // Wait 1 second for player to load
                }
            } else {
                playerRef.current = new window.YT.Player('youtube-player', {
                    videoId: track.videoId,
                    playerVars: {
                        autoplay: 1,
                        controls: 0, // Hide YouTube controls to prevent syncing issues
                        modestbranding: 1,
                        rel: 0,
                        showinfo: 0, // Hide video info
                        fs: 0, // Disable fullscreen button
                        playsinline: 1,
                        cc_load_policy: 0, // Hide captions
                        iv_load_policy: 3, // Show video annotations
                        color: 'white', // Player color
                        enablejsapi: 1, // Enable JavaScript API
                        origin: window.location.origin, // Set origin for security
                    },
                    events: {
                        onReady: (event) => {
                            setPlayerReady(true);
                            event.target.playVideo();
                            setDuration(event.target.getDuration());
                            
                            // Send initial sync when player is ready
                            if (isOwner) {
                                const currentTime = event.target.getCurrentTime();
                                const message = { type: 'playbackState', isPlaying: true, currentTime };
                                sendJsonMessage(message);
                                lastMessageRef.current = JSON.stringify(message);
                                console.log('Initial sync sent:', message);
                            }
                        },
                        onStateChange: (event) => {
                            const wasPlaying = isPlaying;
                            const newPlaying = event.data === window.YT.PlayerState.PLAYING;
                            setIsPlaying(newPlaying);
                            
                            // Send immediate sync when play state changes
                            if (isOwner && wasPlaying !== newPlaying) {
                                const currentTime = event.target.getCurrentTime();
                                const message = { type: 'playbackState', isPlaying: newPlaying, currentTime };
                                sendJsonMessage(message);
                                lastMessageRef.current = JSON.stringify(message);
                                console.log('State change sync sent:', message);
                            }
                            
                            // Auto-play next video when current one ends
                            if (event.data === window.YT.PlayerState.ENDED) {
                                console.log('Video ended, auto-playing next track');
                                // Send notification that next track is starting
                                if (isOwner) {
                                    sendJsonMessage({ 
                                        type: 'trackEnded', 
                                        message: 'Current track ended, starting next track...' 
                                    });
                                }
                                playNextTrackInQueue(roomId);
                            }
                        }
                    }
                });
            }
        }
    }, [track?.id, roomId, isApiReady]);

    // Sync video state when player becomes ready (for non-owners)
    useEffect(() => {
        if (playerReady && !isOwner && playerRef.current) {
            // Request current state from owner immediately
            console.log('Non-owner requesting initial state from owner');
            sendJsonMessage({ type: 'requestState' });
            
            // Set up more frequent sync requests for better synchronization
            const syncInterval = setInterval(() => {
                if (playerRef.current && playerReady) {
                    console.log('Non-owner sending periodic sync request');
                    sendJsonMessage({ type: 'requestState' });
                }
            }, 1500); // Request sync every 1.5 seconds for better sync
            
            // Force sync with last received message every 2 seconds
            const forceSyncInterval = setInterval(() => {
                if (playerRef.current && playerReady && lastJsonMessage && lastJsonMessage.type === 'playbackState') {
                    console.log('Force sync interval triggered, processing last message');
                    processWebSocketMessage(lastJsonMessage);
                }
            }, 2000);
            
            return () => {
                clearInterval(syncInterval);
                clearInterval(forceSyncInterval);
            };
        }
    }, [playerReady, isOwner, sendJsonMessage, lastJsonMessage]);

    // Test WebSocket connection when component mounts
    useEffect(() => {
        if (readyState === 1 && user?.uid) { // WebSocket is open
            console.log('Testing WebSocket connection...');
            // Send a test message to verify connection
            sendJsonMessage({ type: 'test', message: 'Video player test message' });
        }
    }, [readyState, user?.uid, sendJsonMessage]);

    // Direct WebSocket message listener as fallback
    useEffect(() => {
        const handleWebSocketMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Direct WebSocket message received:', data);
                
                if (data.type === 'playbackState' && !isOwner && playerReady && playerRef.current) {
                    console.log('Direct WebSocket processing playbackState message');
                    processWebSocketMessage(data);
                }
            } catch (error) {
                console.warn('Error parsing direct WebSocket message:', error);
            }
        };
        
        // Add event listener to the WebSocket if available
        if (typeof window !== 'undefined' && window.WebSocket) {
            // Try to find the WebSocket instance
            const wsInstances = document.querySelectorAll('script[src*="websocket"]');
            console.log('Found WebSocket instances:', wsInstances.length);
            
            // Add global message listener
            window.addEventListener('message', (event) => {
                if (event.data && typeof event.data === 'string' && event.data.includes('playbackState')) {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'playbackState' && !isOwner && playerReady && playerRef.current) {
                            console.log('Global message listener processing playbackState');
                            processWebSocketMessage(data);
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                }
            });
        }
        
        return () => {
            window.removeEventListener('message', handleWebSocketMessage);
        };
    }, [isOwner, playerReady]);

    // Custom event listener for WebSocket messages
    useEffect(() => {
        const handleCustomMessage = (event: CustomEvent) => {
            if (event.detail && event.detail.type === 'playbackState' && !isOwner && playerReady && playerRef.current) {
                console.log('Custom event listener processing playbackState message');
                processWebSocketMessage(event.detail);
            }
        };
        
        // Listen for custom WebSocket message events
        window.addEventListener('websocket-message', handleCustomMessage as EventListener);
        
        return () => {
            window.removeEventListener('websocket-message', handleCustomMessage as EventListener);
        };
    }, [isOwner, playerReady]);

    // DOM-based message detection using mutation observer
    useEffect(() => {
        if (!isOwner || !playerReady) return;
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                            const text = node.textContent;
                            if (text.includes('playbackState') && text.includes('currentTime')) {
                                try {
                                    const data = JSON.parse(text);
                                    if (data.type === 'playbackState' && !isOwner && playerReady && playerRef.current) {
                                        console.log('Mutation observer detected playbackState message');
                                        processWebSocketMessage(data);
                                    }
                                } catch (error) {
                                    // Ignore parsing errors
                                }
                            }
                        }
                    });
                }
            });
        });
        
        // Observe the entire document for text changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        return () => {
            observer.disconnect();
        };
    }, [isOwner, playerReady]);

    // Console log interceptor to catch WebSocket messages
    useEffect(() => {
        if (!isOwner || !playerReady) return;
        
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        
        console.log = (...args) => {
            originalLog.apply(console, args);
            
            // Check if any of the logged messages contain WebSocket data
            args.forEach((arg) => {
                if (typeof arg === 'string' && arg.includes('playbackState') && arg.includes('currentTime')) {
                    try {
                        const data = JSON.parse(arg);
                        if (data.type === 'playbackState' && !isOwner && playerReady && playerRef.current) {
                            console.log('Console interceptor detected playbackState message');
                            processWebSocketMessage(data);
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                }
            });
        };
        
        console.warn = (...args) => {
            originalWarn.apply(console, args);
            
            // Check if any of the logged messages contain WebSocket data
            args.forEach((arg) => {
                if (typeof arg === 'string' && arg.includes('playbackState') && arg.includes('currentTime')) {
                    try {
                        const data = JSON.parse(arg);
                        if (data.type === 'playbackState' && !isOwner && playerReady && playerRef.current) {
                            console.log('Console interceptor detected playbackState message from warn');
                            processWebSocketMessage(data);
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                }
            });
        };
        
        return () => {
            console.log = originalLog;
            console.warn = originalWarn;
            console.error = originalError;
        };
    }, [isOwner, playerReady]);

    // Direct message polling as final fallback
    useEffect(() => {
        if (!isOwner || !playerReady) return;
        
        let lastProcessedMessage = '';
        
        const pollInterval = setInterval(() => {
            if (lastJsonMessage) {
                const messageStr = JSON.stringify(lastJsonMessage);
                if (messageStr !== lastProcessedMessage) {
                    console.log('Polling detected new message:', lastJsonMessage);
                    lastProcessedMessage = messageStr;
                    processWebSocketMessage(lastJsonMessage);
                }
            }
        }, 1000); // Check every second
        
        return () => {
            clearInterval(pollInterval);
        };
    }, [isOwner, playerReady, lastJsonMessage]);

    // Force sync effect to run when new messages arrive
    useEffect(() => {
        if (lastJsonMessage) {
            console.log('New message received, updating message ID to force sync effect');
            setLastMessageId(prev => prev + 1);
            
            // Process message immediately instead of waiting for effect
            console.log('Processing message immediately:', lastJsonMessage);
            processWebSocketMessage(lastJsonMessage);
        }
    }, [lastJsonMessage]);
    
    // Separate effect to ensure sync processing runs
    useEffect(() => {
        if (lastJsonMessage && !isOwner && playerReady && playerRef.current) {
            console.log('Separate sync effect triggered for message:', lastJsonMessage);
            processWebSocketMessage(lastJsonMessage);
        }
    }, [lastJsonMessage, isOwner, playerReady]);
    
    // Direct message processing function
    const processWebSocketMessage = (message: any) => {
        console.log('Direct message processing:', message);
        
        if (!message || !playerRef.current || !playerReady) {
            console.log('Cannot process message - player not ready');
            return;
        }
        
        // Handle incoming sync messages (for non-owners)
        if (!isOwner && message.type === 'playbackState') {
            console.log('Non-owner processing sync message directly:', message);
            processPlaybackStateMessage(message);
        }
    };
    
    // Process playback state messages
    const processPlaybackStateMessage = (message: any) => {
        const { isPlaying, currentTime } = message;
        console.log(`Direct processing: isPlaying=${isPlaying}, currentTime=${currentTime}`);
        
        // Validate currentTime value
        if (typeof currentTime !== 'number' || isNaN(currentTime) || currentTime < 0) {
            console.warn('Invalid currentTime received:', currentTime);
            return;
        }
        
        const player = playerRef.current;
        if (!player) {
            console.warn('Player ref not available');
            return;
        }
        
        // Simple direct sync - try this first
        try {
            console.log('Attempting direct sync to:', currentTime);
            
            // Get current position before seeking
            const beforeSeek = player.getCurrentTime();
            console.log(`Position before seek: ${beforeSeek}`);
            
            // Ensure video is playing before seeking
            const currentPlayerState = player.getPlayerState();
            if (currentPlayerState !== 1) { // Not playing
                console.log('Video not playing, starting it first...');
                player.playVideo();
                
                // Wait a bit for video to start, then seek
                setTimeout(() => {
                    if (player) {
                        console.log('Video started, now seeking...');
                        player.seekTo(currentTime, true);
                        console.log('Direct seek completed');
                    }
                }, 300);
            } else {
                player.seekTo(currentTime, true);
                console.log('Direct seek completed');
            }
            
            // Verify direct sync worked
            setTimeout(() => {
                if (player) {
                    const afterSeek = player.getCurrentTime();
                    const seekDiff = Math.abs(afterSeek - currentTime);
                    console.log(`Direct sync result: target=${currentTime}, actual=${afterSeek}, diff=${seekDiff}`);
                    
                    if (seekDiff > 2) {
                        console.warn('Direct sync failed, trying again...');
                        player.seekTo(currentTime, true);
                        
                        // Try multiple times with different approaches
                        setTimeout(() => {
                            if (player) {
                                console.log('Second attempt - pausing and resuming...');
                                player.pauseVideo();
                                setTimeout(() => {
                                    if (player) {
                                        player.seekTo(currentTime, true);
                                        setTimeout(() => {
                                            if (player) {
                                                player.playVideo();
                                            }
                                        }, 100);
                                    }
                                }, 100);
                            }
                        }, 500);
                    } else {
                        console.log('Direct sync successful!');
                    }
                }
            }, 500);
            
        } catch (error) {
            console.warn('Direct sync failed:', error);
            
            // Final fallback - try to force sync by reloading the video
            try {
                console.log('Attempting fallback sync by reloading video...');
                const currentVideoId = player.getVideoData().video_id;
                if (currentVideoId) {
                    player.loadVideoById(currentVideoId);
                    setTimeout(() => {
                        if (player) {
                            player.seekTo(currentTime, true);
                            player.playVideo();
                        }
                    }, 2000);
                }
            } catch (fallbackError) {
                console.error('Fallback sync also failed:', fallbackError);
            }
        }
    };

    // WebSocket listener for playback state
    useEffect(() => {
        console.log('Video player WebSocket effect triggered:', { 
            hasLastJsonMessage: !!lastJsonMessage, 
            lastJsonMessage, 
            isOwner, 
            playerReady,
            messageId: lastMessageId
        });
        
        if (lastJsonMessage) {
            const message = lastJsonMessage as any;
            console.log('Video player received WebSocket message:', message);
            
            // Force trigger the sync logic if a specific message indicates a state change
            // This is a workaround to ensure the sync logic runs even if the state hasn't changed
            // based on the current logic. A more robust solution would involve a dedicated
            // state change detection mechanism.
            if (message.type === 'playbackState' && isOwner && playerRef.current && playerReady) {
                console.log('Forcing sync due to playbackState message from owner.');
                // This will trigger the sync logic, including seeking and play state updates.
                // The original logic will then handle the specific state changes.
            }

            // Handle state requests from non-owners
            if (message.type === 'requestState' && isOwner && playerRef.current && playerReady) {
                try {
                    const currentTime = playerRef.current.getCurrentTime();
                    const response = { type: 'playbackState', isPlaying, currentTime };
                    sendJsonMessage(response);
                    console.log('Owner responding to state request:', response);
                } catch (error) {
                    console.warn('Error responding to state request:', error);
                }
                return;
            }
            
            // Handle incoming sync messages (for non-owners)
            if (!isOwner && playerRef.current && playerReady) {
                console.log('Non-owner processing sync message:', message);
                
                // Comprehensive player readiness check
                const player = playerRef.current;
                const isPlayerReady = player && 
                    typeof player.getCurrentTime === 'function' && 
                    typeof player.seekTo === 'function' && 
                    typeof player.getPlayerState === 'function' && 
                    typeof player.getDuration === 'function';
                
                if (!isPlayerReady) {
                    console.warn('Player not fully ready for sync operations');
                    return;
                }
                
                // Additional check: ensure YouTube API is fully loaded
                if (typeof window.YT === 'undefined' || !window.YT.Player) {
                    console.warn('YouTube API not fully loaded');
                    return;
                }
                
                // Check if video is actually loaded and ready
                try {
                    const testTime = player.getCurrentTime();
                    const testDuration = player.getDuration();
                    console.log(`Player readiness test: currentTime=${testTime}, duration=${testDuration}`);
                    
                    if (isNaN(testTime) || isNaN(testDuration) || testDuration <= 0) {
                        console.warn('Player not fully initialized, test values invalid');
                        return;
                    }
                } catch (error) {
                    console.warn('Player readiness test failed:', error);
                    return;
                }
                
                console.log('Player is ready for sync operations');
                
                if (message.type === 'playbackState') {
                    const { isPlaying, currentTime } = message;
                    console.log(`Processing playbackState sync: isPlaying=${isPlaying}, currentTime=${currentTime}`);
                    
                    // Validate currentTime value
                    if (typeof currentTime !== 'number' || isNaN(currentTime) || currentTime < 0) {
                        console.warn('Invalid currentTime received:', currentTime);
                        return;
                    }
                    
                    // Check if video is actually loaded
                    const videoDuration = player.getDuration();
                    if (videoDuration <= 0) {
                        console.warn('Video not loaded yet, duration is:', videoDuration);
                        return;
                    }
                    
                    // Check if seeking to currentTime would be valid
                    if (currentTime > videoDuration) {
                        console.warn(`Cannot seek to ${currentTime}, video duration is ${videoDuration}`);
                        return;
                    }
                    
                    console.log(`Video validation passed: duration=${videoDuration}, target=${currentTime}`);
                    
                    // Simple direct sync - try this first
                    try {
                        console.log('Attempting simple direct sync...');
                        
                        // Ensure video is playing before seeking
                        const currentPlayerState = player.getPlayerState();
                        if (currentPlayerState !== 1) { // Not playing
                            console.log('Video not playing, starting it first...');
                            player.playVideo();
                            
                            // Wait a bit for video to start, then seek
                            setTimeout(() => {
                                if (player) {
                                    console.log('Video started, now seeking...');
                                    player.seekTo(currentTime, true);
                                }
                            }, 300);
                        } else {
                            player.seekTo(currentTime, true);
                        }
                        
                        console.log('Simple sync completed');
                        
                        // Verify simple sync worked
                        setTimeout(() => {
                            if (player) {
                                const simpleSyncTime = player.getCurrentTime();
                                const simpleSyncDiff = Math.abs(simpleSyncTime - currentTime);
                                console.log(`Simple sync result: target=${currentTime}, actual=${simpleSyncTime}, diff=${simpleSyncDiff}`);
                                
                                // If simple sync failed, try again
                                if (simpleSyncDiff > 2) {
                                    console.warn('Simple sync failed, retrying...');
                                    player.seekTo(currentTime, true);
                                    
                                    // Check again after retry
                                    setTimeout(() => {
                                        if (player) {
                                            const retryTime = player.getCurrentTime();
                                            const retryDiff = Math.abs(retryTime - currentTime);
                                            console.log(`Retry sync result: target=${currentTime}, actual=${retryTime}, diff=${retryDiff}`);
                                            
                                            if (retryDiff > 2) {
                                                console.error('Sync failed after retry');
                                            } else {
                                                console.log('Sync successful after retry');
                                            }
                                        }
                                    }, 500);
                                } else {
                                    console.log('Sync successful');
                                }
                                
                                // Monitor position for a few seconds to see if it stays in sync
                                let checkCount = 0;
                                const positionMonitor = setInterval(() => {
                                    if (player && checkCount < 6) { // Monitor for 3 seconds
                                        const monitorTime = player.getCurrentTime();
                                        const monitorDiff = Math.abs(monitorTime - currentTime);
                                        console.log(`Position monitor ${checkCount + 1}: target=${currentTime}, actual=${monitorTime}, diff=${monitorDiff}`);
                                        
                                        if (monitorDiff > 5) {
                                            console.warn('Video drifted out of sync during monitoring');
                                        }
                                        
                                        checkCount++;
                                    } else {
                                        clearInterval(positionMonitor);
                                    }
                                }, 500);
                            }
                        }, 500);
                    } catch (error) {
                        console.warn('Simple sync failed:', error);
                    }
                    
                    try {
                        const playerCurrentTime = playerRef.current.getCurrentTime();
                        const timeDiff = Math.abs(playerCurrentTime - currentTime);
                        console.log(`Sync check: player=${playerCurrentTime}, target=${currentTime}, diff=${timeDiff}`);
                        
                        // Force sync if significantly out of sync (more than 5 seconds)
                        const forceSync = timeDiff > 5;
                        
                        // Always sync for debugging - remove this later
                        const debugSync = true;
                        
                        // Sync if time difference is more than 0.5 seconds for better accuracy
                        if (timeDiff > 0.5 || forceSync || debugSync) {
                            if (forceSync) {
                                console.log(`FORCE SYNC: Video significantly out of sync (${timeDiff}s), forcing seek to ${currentTime}`);
                            } else if (debugSync) {
                                console.log(`DEBUG SYNC: Always syncing for debugging, current=${playerCurrentTime}, target=${currentTime}, diff=${timeDiff}`);
                            } else {
                                console.log(`Syncing video: current=${playerCurrentTime}, target=${currentTime}`);
                            }
                            
                            // Check if player is in a valid state for seeking
                            const playerState = playerRef.current.getPlayerState();
                            const videoDuration = playerRef.current.getDuration();
                            
                            console.log(`Player state check: state=${playerState}, duration=${videoDuration}, ready=${playerReady}`);
                            
                            // Ensure video is loaded and duration is available
                            if (videoDuration <= 0) {
                                console.log('Video not fully loaded yet, waiting...');
                                setTimeout(() => {
                                    if (playerRef.current && playerRef.current.getDuration() > 0) {
                                        console.log('Video loaded, attempting seek...');
                                        playerRef.current.seekTo(currentTime, true);
                                    }
                                }, 1000);
                                return;
                            }
                            
                            // Ensure video is playing before seeking (seeking works better when playing)
                            const isCurrentlyPlaying = playerRef.current.getPlayerState() === 1;
                            if (!isCurrentlyPlaying && isPlaying) {
                                console.log('Starting video before seeking for better sync...');
                                playerRef.current.playVideo();
                                
                                // Wait a bit for video to start, then seek
                                setTimeout(() => {
                                    if (playerRef.current) {
                                        console.log('Video started, now seeking...');
                                        playerRef.current.seekTo(currentTime, true);
                                    }
                                }, 300);
                                return;
                            }
                            
                            if (playerState === -1 || playerState === 5) {
                                console.log('Player not ready for seeking, waiting...');
                                // Wait a bit and try again
                                setTimeout(() => {
                                    if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
                                        const newState = playerRef.current.getPlayerState();
                                        if (newState !== -1 && newState !== 5) {
                                            console.log('Player ready now, attempting seek...');
                                            playerRef.current.seekTo(currentTime, true);
                                        }
                                    }
                                }, 500);
                            } else if (typeof playerRef.current.seekTo === 'function') {
                                console.log(`Executing seek to ${currentTime}...`);
                                
                                // Get current position before seeking
                                const beforeSeek = playerRef.current.getCurrentTime();
                                console.log(`Position before seek: ${beforeSeek}`);
                                
                                playerRef.current.seekTo(currentTime, true);
                                console.log('Seek command executed');
                                
                                // Check if seek actually worked
                                setTimeout(() => {
                                    if (playerRef.current) {
                                        const afterSeek = playerRef.current.getCurrentTime();
                                        const seekResult = Math.abs(afterSeek - currentTime);
                                        console.log(`Seek result: target=${currentTime}, actual=${afterSeek}, diff=${seekResult}`);
                                        
                                        if (seekResult > 1) {
                                            console.warn('Seek failed, trying again...');
                                            playerRef.current.seekTo(currentTime, true);
                                        }
                                    }
                                }, 200);
                            } else {
                                console.warn('Player seekTo method not available');
                            }
                            
                            // Verify the seek operation completed successfully
                            setTimeout(() => {
                                if (playerRef.current) {
                                    const newTime = playerRef.current.getCurrentTime();
                                    const seekDiff = Math.abs(newTime - currentTime);
                                    console.log(`Seek verification: target=${currentTime}, actual=${newTime}, diff=${seekDiff}`);
                                    
                                    if (seekDiff > 1) {
                                        console.warn('Seek operation may have failed, retrying...');
                                        
                                        // Try seeking to a slightly different position first, then to the target
                                        const nearbyTime = currentTime + (Math.random() > 0.5 ? 1 : -1);
                                        console.log(`Trying nearby seek first: ${nearbyTime}`);
                                        playerRef.current.seekTo(nearbyTime, true);
                                        
                                        setTimeout(() => {
                                            if (playerRef.current) {
                                                console.log('Now seeking to target position...');
                                                playerRef.current.seekTo(currentTime, true);
                                            }
                                        }, 100);
                                        
                                        // Add additional retry with exponential backoff
                                        setTimeout(() => {
                                            if (playerRef.current) {
                                                const retryTime = playerRef.current.getCurrentTime();
                                                const retryDiff = Math.abs(retryTime - currentTime);
                                                console.log(`Retry seek verification: target=${currentTime}, actual=${retryTime}, diff=${retryDiff}`);
                                                
                                                if (retryDiff > 1) {
                                                    console.warn('Second retry attempt...');
                                                    playerRef.current.seekTo(currentTime, true);
                                                    
                                                    // Final retry attempt
                                                    setTimeout(() => {
                                                        if (playerRef.current) {
                                                            const finalTime = playerRef.current.getCurrentTime();
                                                            const finalDiff = Math.abs(finalTime - currentTime);
                                                            console.log(`Final seek verification: target=${currentTime}, actual=${finalTime}, diff=${finalDiff}`);
                                                            
                                                            if (finalDiff > 1) {
                                                                console.error('Seek operation failed after multiple attempts');
                                                                
                                                                // Final fallback: try pausing and resuming the video
                                                                console.log('Trying pause/resume fallback...');
                                                                playerRef.current.pauseVideo();
                                                                setTimeout(() => {
                                                                    if (playerRef.current) {
                                                                        playerRef.current.seekTo(currentTime, true);
                                                                        setTimeout(() => {
                                                                            if (playerRef.current) {
                                                                                playerRef.current.playVideo();
                                                                            }
                                                                        }, 100);
                                                                    }
                                                                }, 100);
                                                            }
                                                        }
                                                    }, 200);
                                                }
                                            }
                                        }, 200);
                                    }
                                    
                                    // Update progress after seek verification
                                    setProgress(newTime);
                                }
                            }, 100);
                            
                            // Don't update progress immediately, wait for verification
                            // setProgress(currentTime);
                        } else {
                            console.log('Time difference too small, no sync needed');
                        }
                        
                        // Fallback sync - always try to sync even if main logic says no
                        if (debugSync && message.type === 'playbackState') {
                            console.log('Fallback sync: attempting to sync regardless of time difference');
                            try {
                                if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
                                    console.log(`Fallback seek to ${currentTime}`);
                                    playerRef.current.seekTo(currentTime, true);
                                    
                                    // Verify fallback seek
                                    setTimeout(() => {
                                        if (playerRef.current) {
                                            const fallbackTime = playerRef.current.getCurrentTime();
                                            const fallbackDiff = Math.abs(fallbackTime - currentTime);
                                            console.log(`Fallback seek result: target=${currentTime}, actual=${fallbackTime}, diff=${fallbackDiff}`);
                                        }
                                    }, 300);
                                }
                            } catch (error) {
                                console.warn('Fallback sync failed:', error);
                            }
                        }
                        
                        // Sync play state
                        const playerState = playerRef.current.getPlayerState();
                        console.log(`Play state sync: owner wants ${isPlaying}, player state is ${playerState}`);
                        
                        if (isPlaying && playerState !== 1) {
                            console.log('Following owner play command');
                            playerRef.current.playVideo();
                            setIsPlaying(true);
                        } else if (!isPlaying && playerState === 1) {
                            console.log('Following owner pause command');
                            playerRef.current.pauseVideo();
                            setIsPlaying(false);
                        } else {
                            console.log('Play state already in sync');
                        }
                    } catch (error) {
                        console.warn('Error syncing video:', error);
                    }
                } else if (message.type === 'seekTo') {
                    // Handle explicit seek messages from owner
                    const { currentTime } = message;
                    
                    // Validate currentTime value
                    if (typeof currentTime !== 'number' || isNaN(currentTime) || currentTime < 0) {
                        console.warn('Invalid currentTime received in seekTo:', currentTime);
                        return;
                    }
                    
                    try {
                        console.log(`Following owner seek to: ${currentTime}`);
                        
                        // Check if player is in a valid state for seeking
                        const playerState = playerRef.current.getPlayerState();
                        const videoDuration = playerRef.current.getDuration();
                        
                        // Ensure video is loaded and duration is available
                        if (videoDuration <= 0) {
                            console.log('Video not fully loaded yet, waiting...');
                            setTimeout(() => {
                                if (playerRef.current && playerRef.current.getDuration() > 0) {
                                    console.log('Video loaded, attempting seek...');
                                    playerRef.current.seekTo(currentTime, true);
                                }
                            }, 1000);
                            return;
                        }
                        
                        // Ensure video is playing before seeking (seeking works better when playing)
                        const isCurrentlyPlaying = playerRef.current.getPlayerState() === 1;
                        if (!isCurrentlyPlaying) {
                            console.log('Starting video before seeking for better sync...');
                            playerRef.current.playVideo();
                            
                            // Wait a bit for video to start, then seek
                            setTimeout(() => {
                                if (playerRef.current) {
                                    console.log('Video started, now seeking...');
                                    playerRef.current.seekTo(currentTime, true);
                                }
                            }, 300);
                            return;
                        }
                        
                        if (playerState === -1 || playerState === 5) {
                            console.log('Player not ready for seeking, waiting...');
                            // Wait a bit and try again
                            setTimeout(() => {
                                if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
                                    const newState = playerRef.current.getPlayerState();
                                    if (newState !== -1 && newState !== 5) {
                                        console.log('Player ready now, attempting seek...');
                                        playerRef.current.seekTo(currentTime, true);
                                    }
                                }
                            }, 500);
                        } else if (typeof playerRef.current.seekTo === 'function') {
                            playerRef.current.seekTo(currentTime, true);
                        } else {
                            console.warn('Player seekTo method not available');
                        }
                        
                        // Verify the seek operation completed successfully
                        setTimeout(() => {
                            if (playerRef.current) {
                                const newTime = playerRef.current.getCurrentTime();
                                const seekDiff = Math.abs(newTime - currentTime);
                                console.log(`Seek verification: target=${currentTime}, actual=${newTime}, diff=${seekDiff}`);
                                
                                if (seekDiff > 1) {
                                    console.warn('Seek operation may have failed, retrying...');
                                    
                                    // Try seeking to a slightly different position first, then to the target
                                    const nearbyTime = currentTime + (Math.random() > 0.5 ? 1 : -1);
                                    console.log(`Trying nearby seek first: ${nearbyTime}`);
                                    playerRef.current.seekTo(nearbyTime, true);
                                    
                                    setTimeout(() => {
                                        if (playerRef.current) {
                                            console.log('Now seeking to target position...');
                                            playerRef.current.seekTo(currentTime, true);
                                        }
                                    }, 100);
                                    
                                    // Add additional retry with exponential backoff
                                    setTimeout(() => {
                                        if (playerRef.current) {
                                            const retryTime = playerRef.current.getCurrentTime();
                                            const retryDiff = Math.abs(retryTime - currentTime);
                                            console.log(`Retry seek verification: target=${currentTime}, actual=${retryTime}, diff=${retryDiff}`);
                                            
                                            if (retryDiff > 1) {
                                                console.warn('Second retry attempt...');
                                                playerRef.current.seekTo(currentTime, true);
                                                
                                                // Final retry attempt
                                                setTimeout(() => {
                                                    if (playerRef.current) {
                                                        const finalTime = playerRef.current.getCurrentTime();
                                                        const finalDiff = Math.abs(finalTime - currentTime);
                                                        console.log(`Final seek verification: target=${currentTime}, actual=${finalTime}, diff=${finalDiff}`);
                                                        
                                                        if (finalDiff > 1) {
                                                            console.error('Seek operation failed after multiple attempts');
                                                            
                                                            // Final fallback: try pausing and resuming the video
                                                            console.log('Trying pause/resume fallback...');
                                                            playerRef.current.pauseVideo();
                                                            setTimeout(() => {
                                                                if (playerRef.current) {
                                                                    playerRef.current.seekTo(currentTime, true);
                                                                    setTimeout(() => {
                                                                        if (playerRef.current) {
                                                                            playerRef.current.playVideo();
                                                                        }
                                                                    }, 100);
                                                                }
                                                            }, 100);
                                                        }
                                                    }
                                                }, 200);
                                            }
                                        }
                                    }, 200);
                                }
                                
                                // Update progress after seek verification
                                setProgress(newTime);
                            }
                        }, 100);
                        
                        // Don't update progress immediately, wait for verification
                        // setProgress(currentTime);
                    } catch (error) {
                        console.warn('Error seeking video:', error);
                    }
                }
            }
        }
    }, [lastMessageId, isOwner, playerReady, sendJsonMessage, setIsPlaying]);


    // Progress bar and owner sync
    useEffect(() => {
        const interval = setInterval(() => {
            if (playerRef.current && playerReady) {
                try {
                    const currentTime = playerRef.current.getCurrentTime();
                    setProgress(currentTime);
                    
                    // Only send sync if owner and more frequently for better sync
                    if (isOwner) {
                        // Create message and send sync every 1.5 seconds for better reliability
                        const message = { type: 'playbackState', isPlaying, currentTime };
                        const messageStr = JSON.stringify(message);
                        
                        // Send sync message every 1.5 seconds for better synchronization
                        const timeSinceLastSync = Date.now() - (lastSyncRef.current.lastSyncTime || 0);
                        if (timeSinceLastSync > 1500) {
                            sendJsonMessage(message);
                            lastMessageRef.current = messageStr;
                            lastSyncRef.current.lastSyncTime = Date.now();
                            console.log('Owner sent sync message:', message);
                        }
                    }
                } catch (error) {
                    console.warn('Player not ready yet:', error);
                }
            }
        }, 1500); // Send sync every 1.5 seconds for better synchronization
        
        return () => clearInterval(interval);
    }, [playerReady, isOwner, isPlaying, sendJsonMessage, progress]);

    const handlePlayPause = () => {
        if (!playerRef.current || !playerReady) return;
        try {
            if (isPlaying) {
                playerRef.current.pauseVideo();
                if (isOwner) {
                    const currentTime = playerRef.current.getCurrentTime();
                    const message = { type: 'playbackState', isPlaying: false, currentTime };
                    sendJsonMessage(message);
                    lastMessageRef.current = JSON.stringify(message);
                    lastSyncRef.current.lastSyncTime = Date.now(); // Update sync time
                    sendNotificationToRoom(roomId, "The owner paused the track.");
                }
            } else {
                playerRef.current.playVideo();
                if (isOwner) {
                    const currentTime = playerRef.current.getCurrentTime();
                    const message = { type: 'playbackState', isPlaying: true, currentTime };
                    sendJsonMessage(message);
                    lastMessageRef.current = JSON.stringify(message);
                    lastSyncRef.current.lastSyncTime = Date.now(); // Update sync time
                    sendNotificationToRoom(roomId, "The owner started the track.");
                }
            }
        } catch (error) {
            console.warn('Player not ready yet:', error);
        }
    };

    const handleSeek = (value: number[]) => {
        if (!playerRef.current || !playerReady) return;
        try {
            const newTime = value[0];
            playerRef.current.seekTo(newTime, true);
            setProgress(newTime);
            if (isOwner) {
                // Send explicit seek message for immediate sync
                const seekMessage = { type: 'seekTo', currentTime: newTime };
                sendJsonMessage(seekMessage);
                
                // Also send playback state for consistency
                const stateMessage = { type: 'playbackState', currentTime: newTime, isPlaying };
                sendJsonMessage(stateMessage);
                
                // Update last message and sync time to prevent duplicate sync
                lastMessageRef.current = JSON.stringify(stateMessage);
                lastSyncRef.current.lastSyncTime = Date.now();
            }
        } catch (error) {
            console.warn('Player not ready yet:', error);
        }
    };

    const handleFullscreen = () => {
        if (!playerRef.current || !playerReady) return;
        try {
            if (isFullscreen) {
                // Exit fullscreen
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            } else {
                // Enter fullscreen
                const iframe = playerRef.current.getIframe();
                if (iframe?.requestFullscreen) {
                    iframe.requestFullscreen();
                } else if (iframe?.webkitRequestFullscreen) {
                    // Safari support
                    iframe.webkitRequestFullscreen();
                } else if (iframe?.mozRequestFullScreen) {
                    // Firefox support
                    iframe.mozRequestFullScreen();
                } else if (iframe?.msRequestFullscreen) {
                    // IE/Edge support
                    iframe.msRequestFullscreen();
                }
            }
        } catch (error) {
            console.warn('Fullscreen not supported:', error);
        }
    };

    return (
        <Card className="w-full overflow-hidden glassmorphism">
            <CardContent className="p-0 h-full w-full">
                <div className="aspect-video w-full relative">
                    {track ? (
                        <div id="youtube-player" className="w-full h-full"></div>
                    ) : (
                        <div className="w-full h-full bg-secondary flex flex-col items-center justify-center text-muted-foreground">
                            <Music className="h-24 w-24 text-primary/20" />
                            <h2 className="font-headline text-2xl font-semibold mt-4">Lo-Fi Lounge</h2>
                            <p>No track is currently playing.</p>
                        </div>
                    )}
                    
                    {/* Fullscreen button positioned at bottom right of video */}
                    {/* Removed fullscreen functionality to prevent syncing issues */}
                </div>
                {track && (
                    <div className="p-4 flex items-center gap-4">
                        {isOwner && (
                            <>
                                <button onClick={handlePlayPause} className="p-2">
                                    {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                                </button>
                                <Slider
                                    value={[progress]}
                                    max={duration}
                                    step={1}
                                    onValueChange={handleSeek}
                                />
                            </>
                        )}
                        <div className="text-sm text-muted-foreground min-w-[80px] text-center">
                            {Math.floor(progress)}:{(progress % 60).toString().padStart(2, '0')} / {Math.floor(duration)}:{(duration % 60).toString().padStart(2, '0')}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
