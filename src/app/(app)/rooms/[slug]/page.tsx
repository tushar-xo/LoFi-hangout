
'use client';

import { useEffect, useState, use, useMemo, useCallback } from "react";
import { notFound, useRouter } from "next/navigation";
import { listenToRoom } from "@/lib/firebase-client";
import type { Room } from "@/lib/types";
import { Loader2, Menu, X, ArrowLeft } from "lucide-react";
import AiDjPanel from "@/components/room/ai-dj";
import Chat from "@/components/room/chat";
import Presence from "@/components/room/presence";
import Queue from "@/components/room/queue";
import VideoPlayer from "@/components/room/video-player";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { doc, updateDoc, arrayUnion, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import Notifications from '@/components/room/notifications';
import { useSocket } from '@/hooks/use-socket';
import { ReadyState } from 'react-use-websocket';
import GameLobby from '@/components/room/game-lobby';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

export default function RoomPage({ params: paramsPromise }: { params: Promise<{ slug: string }> }) {
    const params = use(paramsPromise);
    const [room, setRoom] = useState<Room | null>(null); // Re-added room state
    const [loading, setLoading] = useState(true); // Re-added loading state
    const [activeGame, setActiveGame] = useState<{ gameId: string; players: string[] } | null>(null); // Re-added activeGame state
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('video');
    const [socialView, setSocialView] = useState<'ai-dj' | 'chat'>('ai-dj');
    const [desktopView, setDesktopView] = useState<'queue' | 'members' | 'games'>('queue');

    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    
    // Ensure room.id is available before passing to useSocket
    const socketRoomId = room?.id; 
    const { readyState, lastJsonMessage, sendJsonMessage } = useSocket(
        user?.uid, 
        socketRoomId || undefined // Changed from null to undefined
    );

    const connectionStatus = {
        [ReadyState.CONNECTING]: 'Connecting',
        [ReadyState.OPEN]: 'Open',
        [ReadyState.CLOSING]: 'Closing',
        [ReadyState.CLOSED]: 'Closed',
        [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
    }[readyState];

    // Memoize derived values to prevent unnecessary recalculations and re-renders
    const { playingTrack, roomHistory, isOwner } = useMemo(() => {
        if (!room || !user) {
            return { playingTrack: null, roomHistory: [], isOwner: false };
        }

        const playing = room.queue.find(t => t.status === 'playing') || null;
        const history = room.queue
            .filter(t => t.status === 'played')
            .map(track => ({
                videoId: track.videoId,
                title: track.title,
                upvotes: track.upvotes.length,
                downvotes: track.downvotes.length,
            }));
        const owner = user.uid === room.ownerId;

        return { playingTrack: playing, roomHistory: history, isOwner: owner };
    }, [room, user?.uid]); // Only recalculate when room or user.uid changes

    // Memoize callback functions to prevent unnecessary re-renders
    const handleGameStart = useCallback((gameId: string) => {
        setActiveGame({ gameId, players: [] });
    }, []);

    const handleMobileMenuToggle = useCallback(() => {
        setMobileMenuOpen(prev => !prev);
    }, []);

    const handleTabChange = useCallback((value: string) => {
        setActiveTab(value);
    }, []);

    const handleSocialViewChange = useCallback((view: 'ai-dj' | 'chat') => {
        setSocialView(view);
    }, []);

    const handleDesktopViewChange = useCallback((view: 'queue' | 'members' | 'games') => {
        setDesktopView(view);
    }, []);

    const handleBackToRooms = useCallback(() => {
        router.push('/rooms');
    }, [router]);

    // Memoize WebSocket message handling to prevent unnecessary re-renders
    const handleWebSocketMessage = useCallback((message: any) => {
        if (message.type === 'gameInvite') {
            const { from, gameId, inviteId } = message;
            toast({
                title: 'Game Invite!',
                description: `${from} has invited you to a game of ${gameId}.`,
                action: (
                    <div className="flex gap-2">
                        <Button size="sm" className="h-8 px-3 text-sm"
                            onClick={() => sendJsonMessage({ type: 'acceptInvite', gameId, from })}>
                            Accept
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-3 text-sm"
                            onClick={() => sendJsonMessage({ type: 'rejectInvite', gameId, from })}>
                            Reject
                        </Button>
                    </div>
                ),
            });
        } else if (message.type === 'gameStart') {
            console.log('Game starting message received:', message);
            toast({
                title: 'Game Starting!',
                description: message.message,
            });
            // Set the active game
            if (message.players) {
                console.log('Setting active game:', { gameId: message.gameId, players: message.players });
                setActiveGame({ gameId: message.gameId, players: message.players });
            }
        } else if (message.type === 'gameUpdate') {
            // Handle game state updates
            console.log('Game update received:', message);
        } else if (message.type === 'gameReset') {
            setActiveGame(null);
            toast({
                title: 'Game Reset',
                description: 'Game has been reset. You can start a new game.',
            });
        }
    }, [sendJsonMessage, toast]);

    // Handle WebSocket messages with memoized handler
    useEffect(() => {
        if (lastJsonMessage) {
            handleWebSocketMessage(lastJsonMessage as any);
        }
    }, [lastJsonMessage, handleWebSocketMessage]);

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            router.push('/login');
            return;
        }

        // Add timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
            console.log('⏰ Room loading timeout reached');
            setLoading(false);
        }, 10000); // 10 second timeout

        // First, find the room by slug to get the room ID
        const findRoomBySlug = async () => {
            try {
                console.log('🔍 Searching for room with slug:', params.slug);
                const q = query(collection(db, 'rooms'), where('slug', '==', params.slug));
                const querySnapshot = await getDocs(q);
                
                console.log('📋 Query result:', querySnapshot.size, 'rooms found');

                if (querySnapshot.empty) {
                    console.log('❌ Room not found with slug:', params.slug);
                    setLoading(false);
                    clearTimeout(timeoutId);
                    return;
                }
                
                const roomDoc = querySnapshot.docs[0];
                const roomData = { id: roomDoc.id, ...roomDoc.data() } as Room;
                console.log('✅ Room found:', roomData.name, 'ID:', roomData.id);
                
                // Add user to members if not already present
                const isMember = roomData.members.some(m => m.id === user.uid);
                console.log('👤 User membership check:', isMember ? 'Already member' : 'Adding user to room');

                if (!isMember) {
                    const userProfile = { 
                        id: user.uid, 
                        name: user.displayName || 'Anonymous', 
                        avatarUrl: user.photoURL || '' 
                    };
                    
                    const roomRef = doc(db, 'rooms', roomData.id);
                    await updateDoc(roomRef, { 
                        members: arrayUnion(userProfile),
                        totalMembers: roomData.totalMembers + 1 
                    });
                    
                    // Update local room data
                    roomData.members.push(userProfile);
                    roomData.totalMembers += 1;
                    console.log('✅ User added to room');
                }
                
                setRoom(roomData);
                setLoading(false);
                clearTimeout(timeoutId);
                console.log('🎉 Room loaded successfully, setting up real-time listener');
                
                // Now set up real-time listener with the room ID
                const unsubscribe = listenToRoom(roomData.id, (updatedRoom) => {
                    console.log('🔄 Room updated via real-time listener');
                     setRoom(updatedRoom);
                });

                return unsubscribe;
            } catch (error) {
                console.error('❌ Error finding room:', error);
                setLoading(false);
                clearTimeout(timeoutId);
            }
        };
        
        findRoomBySlug();
        
        // Periodic cleanup - ensure user is properly registered in the room
        const cleanupInterval = setInterval(() => {
            if (room && user && !authLoading) {
                const isMember = room.members.some(m => m.id === user.uid);
                if (!isMember) {
                    console.log('🔧 User not in members list, re-adding...');
                    const userProfile = { 
                        id: user.uid, 
                        name: user.displayName || 'Anonymous', 
                        avatarUrl: user.photoURL || '' 
                    };
                    
                    const roomRef = doc(db, 'rooms', room.id);
                    updateDoc(roomRef, { 
                        members: arrayUnion(userProfile)
                    }).catch(error => {
                        console.warn('Error re-adding user to room:', error);
                    });
                }
            }
        }, 30000); // Check every 30 seconds
        
        // Handle browser close/refresh
        const handleBeforeUnload = () => {
            if (room && user) {
                // Use sendBeacon for reliable cleanup on page unload
                navigator.sendBeacon(`/api/leave-room?roomId=${room.id}&userId=${user.uid}`);
            }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        
        return () => {
            clearTimeout(timeoutId);
            clearInterval(cleanupInterval);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            
            // Clean up when leaving the room
            if (room && user) {
                console.log('🚪 User leaving room, cleaning up...');
                // Remove user from room members when component unmounts
                import('@/lib/firebase-client-service').then(({ removeMemberFromRoom }) => {
                    removeMemberFromRoom(room.id, user.uid).catch(error => {
                        console.warn('Error removing member on cleanup:', error);
                    });
                });
            }
        };
    }, [params.slug, user, authLoading, router]);

    if (loading || authLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-muted-foreground">Loading room...</p>
                    <p className="text-xs text-muted-foreground">Room: {params.slug}</p>
                    {authLoading && <p className="text-xs text-muted-foreground">Authenticating...</p>}
                    {loading && !authLoading && <p className="text-xs text-muted-foreground">Connecting to room...</p>}
                </div>
            </div>
        );
    }

    if (!room) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center space-y-4">
                    <h1 className="text-2xl font-bold text-foreground">Room Not Found</h1>
                    <p className="text-muted-foreground">The room "{params.slug}" could not be found.</p>
                    <Button onClick={handleBackToRooms}>
                        Back to Rooms
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Mobile-First Header */}
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container-mobile flex h-14 items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleBackToRooms}
                            className="p-2 h-8 w-8"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex flex-col">
                            <h1 className="font-headline text-sm font-semibold leading-tight">{room.name}</h1>
                            <p className="text-xs text-muted-foreground">{room.members.length} members</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {/* Mobile Menu Button */}
                        <button
                            className="sm:hidden p-2 rounded-md hover:bg-accent/10 transition-colors"
                            onClick={handleMobileMenuToggle}
                            aria-label="Toggle mobile menu"
                        >
                            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </button>
                    </div>
                </div>
                
                {/* Mobile Menu */}
                {mobileMenuOpen && (
                    <div className="sm:hidden border-t border-border/40 bg-background/95 backdrop-blur">
                        <div className="container-mobile py-4 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={activeTab === 'video' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => handleTabChange('video')}
                                    className="w-full"
                                >
                                    Video
                                </Button>
                                <Button
                                    variant={activeTab === 'queue' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => handleTabChange('queue')}
                                    className="w-full"
                                >
                                    Queue
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={activeTab === 'social' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => handleTabChange('social')}
                                    className="w-full"
                                >
                                    Social
                                </Button>
                                <Button
                                    variant={activeTab === 'games' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => handleTabChange('games')}
                                    className="w-full"
                                >
                                    Games
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </header>

            {/* Mobile-First Content Layout */}
            <div className="container-mobile py-4">
                {/* Desktop Layout - Grid */} 
                <div className="hidden lg:grid lg:grid-cols-[2fr_1fr] lg:gap-8 min-h-[calc(100vh-theme(spacing.14))]">
                                            {/* Left Column: Video Player, In The Room, and Social Toggle */} 
                        <div className="flex flex-col space-y-4">
                            {/* Video Player Component */}
                                                         <VideoPlayer 
                                 roomId={room.id} 
                                 track={playingTrack || undefined} 
                                 isOwner={isOwner} 
                                 queue={room.queue}
                             />
                        {/* In The Room (Presence) component, always visible below video player */}
                        <Presence members={room.members} totalMembers={room.totalMembers} roomId={room.id} ownerId={room.ownerId} />

                        {/* Desktop Social Hub Toggle */}
                        <div className="space-y-4 pt-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-headline text-lg font-semibold">Social Hub</h3>
                                <div className="flex items-center gap-2 rounded-full border border-primary/20 p-1">
                                    <button
                                        onClick={() => handleSocialViewChange('ai-dj')}
                                        className={`px-3 py-1 text-xs rounded-full transition-colors font-medium ${
                                            socialView === 'ai-dj' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/30'
                                        }`}
                                    >
                                        AI DJ
                                    </button>
                                    <button
                                        onClick={() => handleSocialViewChange('chat')}
                                        className={`px-3 py-1 text-xs rounded-full transition-colors font-medium ${
                                            socialView === 'chat' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/30'
                                        }`}
                                    >
                                        Chat
                                    </button>
                                </div>
                            </div>
                            
                            {/* Conditional rendering based on social view */}
                            {socialView === 'ai-dj' ? (
                                <div className="space-y-4">
                                    <AiDjPanel 
                                        roomHistory={roomHistory} 
                                        currentTrack={playingTrack || undefined} // Pass undefined instead of null
                                        roomId={room.id} 
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <Chat roomId={room.id} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Dynamic Content (Queue, Members, Games) */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="font-headline text-lg font-semibold">Room Content</h3>
                            <div className="flex items-center gap-2 rounded-full border border-primary/20 p-1">
                                <button
                                    onClick={() => handleDesktopViewChange('queue')}
                                    className={`px-3 py-1 text-xs rounded-full transition-colors font-medium ${
                                        desktopView === 'queue' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/30'
                                    }`}
                                >
                                    Queue
                                </button>
                                <button
                                    onClick={() => handleDesktopViewChange('members')}
                                    className={`px-3 py-1 text-xs rounded-full transition-colors font-medium ${
                                        desktopView === 'members' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/30'
                                    }`}
                                >
                                    Members
                                </button>
                                <button
                                    onClick={() => handleDesktopViewChange('games')}
                                    className={`px-3 py-1 text-xs rounded-full transition-colors font-medium ${
                                        desktopView === 'games' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/30'
                                    }`}
                                >
                                    Games
                                </button>
                            </div>
                        </div>

                        {/* Conditional rendering based on desktop view */}
                        {desktopView === 'queue' && (
                            <Queue roomId={room.id} queue={room.queue} isOwner={isOwner} />
                        )}
                        {desktopView === 'members' && (
                            <Presence members={room.members} totalMembers={room.totalMembers} roomId={room.id} ownerId={room.ownerId} />
                        )}
                        {desktopView === 'games' && (
                            <GameLobby 
                                roomId={room.id} 
                                activeGame={activeGame}
                                onGameStart={handleGameStart} 
                            />
                        )}
                    </div>
                </div>

                {/* Mobile Layout - Tab-based */}
                <div className="lg:hidden space-y-4">
                    {/* Mobile Tabs */}
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                        <TabsList className="grid w-full grid-cols-4 tabs-mobile">
                            <TabsTrigger value="video" className="text-xs">Video</TabsTrigger>
                            <TabsTrigger value="queue" className="text-xs">Queue</TabsTrigger>
                            <TabsTrigger value="social" className="text-xs">Social</TabsTrigger>
                            <TabsTrigger value="games" className="text-xs">Games</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="video" className="space-y-4 mt-4">
                            <VideoPlayer 
                                roomId={room.id} 
                                track={playingTrack || undefined} 
                                isOwner={isOwner} 
                                queue={room.queue}
                            />
                          </TabsContent>
                        
                        <TabsContent value="queue" className="mt-4">
                            <Queue roomId={room.id} queue={room.queue} isOwner={isOwner} />
                          </TabsContent>
                        
                        <TabsContent value="social" className="mt-4">
                            {/* AI DJ and Chat Toggle - FIXED to actually work */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-headline text-lg font-semibold">Social Hub</h3>
                                    <div className="flex items-center gap-2 rounded-full border border-primary/20 p-1">
                                        <button
                                            onClick={() => handleSocialViewChange('ai-dj')}
                                            className={`px-3 py-1 text-xs rounded-full transition-colors font-medium ${
                                                socialView === 'ai-dj' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/30'
                                            }`}
                                        >
                                            AI DJ
                                        </button>
                                        <button
                                            onClick={() => handleSocialViewChange('chat')}
                                            className={`px-3 py-1 text-xs rounded-full transition-colors font-medium ${
                                            socialView === 'chat' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/30'
                                            }`}
                                        >
                                            Chat
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Conditional rendering based on social view - FIXED */}
                                {socialView === 'ai-dj' ? (
                                    <div className="space-y-4">
                              <AiDjPanel 
                                roomHistory={roomHistory} 
                                            currentTrack={playingTrack || undefined} // Pass undefined instead of null
                                roomId={room.id} 
                              />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <Chat roomId={room.id} />
                                    </div>
                                )}
                            </div>
                          </TabsContent>
                        
                        <TabsContent value="games" className="mt-4">
                              <GameLobby 
                                roomId={room.id} 
                                activeGame={activeGame} 
                                onGameStart={handleGameStart} // Corrected type for setActiveGame
                              />
                          </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Notifications */}
            <Notifications roomId={room.id} />
        </div>
    );
}
