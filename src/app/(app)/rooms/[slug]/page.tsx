
'use client';

import { useEffect, useState, use } from "react";
import { notFound, useRouter } from "next/navigation";
import { listenToRoom } from "@/lib/firebase-client";
import type { Room } from "@/lib/types";
import { Loader2 } from "lucide-react";
import AiDjPanel from "@/components/room/ai-dj";
import Chat from "@/components/room/chat";
import Presence from "@/components/room/presence";
import Queue from "@/components/room/queue";
import VideoPlayer from "@/components/room/video-player";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { doc, updateDoc, arrayUnion, getDocFromServer, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { playNextTrackInQueue } from '@/lib/firebase-client-service';
import Notifications from '@/components/room/notifications';
import { useSocket } from '@/hooks/use-socket';
import { ReadyState } from 'react-use-websocket';
import GameLobby from '@/components/room/game-lobby';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

export default function RoomPage({ params: paramsPromise }: { params: Promise<{ slug: string }> }) {
    const params = use(paramsPromise);
    const [room, setRoom] = useState<Room | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeGame, setActiveGame] = useState<{ gameId: string; players: string[] } | null>(null);
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const { readyState, lastJsonMessage, sendJsonMessage } = useSocket(
        user?.uid, 
        room?.id
    );

    const connectionStatus = {
        [ReadyState.CONNECTING]: 'Connecting',
        [ReadyState.OPEN]: 'Open',
        [ReadyState.CLOSING]: 'Closing',
        [ReadyState.CLOSED]: 'Closed',
        [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
    }[readyState];

    const playingTrack = room?.queue.find(t => t.status === 'playing');
    const roomHistory = room?.queue
        .filter(t => t.status === 'played')
        .map(track => ({
            videoId: track.videoId,
            title: track.title,
            upvotes: track.upvotes.length,
            downvotes: track.downvotes.length,
        })) || [];

    useEffect(() => {
        if (lastJsonMessage) {
            const message = lastJsonMessage as any;
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
                toast({
                    title: 'Game Starting!',
                    description: message.message,
                });
                // Set the active game
                if (message.players) {
                    setActiveGame({ gameId: message.gameId, players: message.players });
                }
            } else if (message.type === 'gameUpdate') {
                // Handle game updates
                if (message.type === 'gameStart' && message.players) {
                    setActiveGame({ gameId: message.gameId, players: message.players });
                    toast({
                        title: 'Game Started!',
                        description: `Game of ${message.gameId} is now active!`,
                    });
                }
            } else if (message.type === 'gameReset') {
                setActiveGame(null);
                toast({
                    title: 'Game Reset',
                    description: 'Game has been reset. You can start a new game.',
                });
            } else if (message.type === 'inviteRejected') {
                if (message.from) {
                    // Someone rejected your invitation
                    toast({
                        title: 'Invitation Rejected',
                        description: message.message,
                    });
                } else {
                    // You rejected an invitation
                    toast({
                        title: 'Invitation Rejected',
                        description: message.message,
                    });
                }
            } else if (message.type === 'noAcceptances') {
                toast({
                    title: 'No Acceptances',
                    description: message.message,
                });
            } else if (message.type === 'inviteCancelled') {
                toast({
                    title: 'Invitation Cancelled',
                    description: message.message,
                });
            }
        }
    }, [lastJsonMessage, user?.uid, sendJsonMessage, toast]);

    useEffect(() => {
        if (room?.id && (!playingTrack && room.queue.length > 0)) {
            playNextTrackInQueue(room.id);
        }
    }, [room?.id, playingTrack, room?.queue.length]);

    useEffect(() => {
        if (room?.currentPlayback?.ended) {
            playNextTrackInQueue(room.id);
        }
    }, [room?.currentPlayback?.ended, room?.id]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // Room ownership transfer removed due to Firebase Admin SDK issues
            // if (user?.uid === room?.ownerId && room.members.length > 1) {
            //     const newOwner = room.members.find(m => m.id !== user.uid);
            //     if (newOwner) {
            //         transferRoomOwnership(room.id, newOwner.id);
            //     }
            // }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [user?.uid, room]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.push('/login');
            return;
        }

        const setupRoom = async () => {
            try {
                // Fetch the initial room data to get the ID
                const q = query(collection(db, 'rooms'), where('slug', '==', params.slug));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    notFound();
                    return;
                }
                const initialRoomDoc = querySnapshot.docs[0];
                const initialRoomId = initialRoomDoc.id;

                // Add user to members list if not already present
                const roomRef = doc(db, 'rooms', initialRoomId);
                const roomSnapshot = await getDocFromServer(roomRef);
                const currentRoomData = roomSnapshot.data() as Room;
                const isMember = currentRoomData.members.some(m => m.id === user.uid);

                if (!isMember) {
                    const userProfile = { id: user.uid, name: user.displayName || 'Anonymous', avatarUrl: user.photoURL || '' };
                    await updateDoc(roomRef, { 
                        members: arrayUnion(userProfile),
                        totalMembers: currentRoomData.totalMembers + 1 
                    });
                }

                // Check if current admin is still in the room, if not, transfer admin to the first member
                if (currentRoomData.ownerId && !currentRoomData.members.some(m => m.id === currentRoomData.ownerId)) {
                    const newAdmin = currentRoomData.members[0];
                    if (newAdmin) {
                        await updateDoc(roomRef, { 
                            ownerId: newAdmin.id 
                        });
                        console.log(`Admin transferred to ${newAdmin.name} (${newAdmin.id})`);
                    }
                }

                const unsubscribe = listenToRoom(initialRoomId, (updatedRoom) => {
                     setRoom(updatedRoom);
                     setLoading(false);
                });

                return () => unsubscribe();
            } catch (error) {
                console.error("Error setting up room:", error);
                setLoading(false);
                notFound();
            }
        };

        setupRoom();
    }, [params.slug, user, authLoading, router]);

    if (loading || authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-theme(height.14))]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Joining room...</p>
            </div>
        )
    }

    if (!room) {
      // This can happen if the room is deleted or there's an error after loading
      return notFound();
    }
    
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 flex-1 relative">
            <Notifications roomId={room.id} />
            <div className="grid grid-cols-1 md:grid-cols-3 md:gap-8 h-full">
                {/* Main Content: Video Player and Presence */}
                <div className="md:col-span-2 flex flex-col gap-6">
                    <div>
                        <h1 className="font-headline text-3xl font-bold">{room.name}</h1>
                        <p className="text-muted-foreground">Welcome to the chill zone. Add a song to get started.</p>
                        <p className="text-sm text-muted-foreground">Connection Status: {connectionStatus}</p>
                    </div>
                    <VideoPlayer track={playingTrack} roomId={room.id} isOwner={user?.uid === room.ownerId} />
                    <Presence members={room.members} totalMembers={room.totalMembers} roomId={room.id} />
                </div>

                {/* Sidebar: Queue, Chat, AI DJ */}
                <div className="md:col-span-1 flex flex-col h-full mt-8 md:mt-0">
                    <Tabs defaultValue="queue" className="flex flex-col flex-grow glassmorphism rounded-lg">
                        <TabsList className="grid w-full grid-cols-4 bg-transparent p-2">
                            <TabsTrigger value="queue">Queue</TabsTrigger>
                            <TabsTrigger value="chat">Chat</TabsTrigger>
                            <TabsTrigger value="ai-dj">AI DJ</TabsTrigger>
                            <TabsTrigger value="game">Game</TabsTrigger>
                        </TabsList>
                        <div className="flex-grow overflow-hidden">
                          <TabsContent value="queue" className="h-full mt-0">
                              <Queue roomId={room.id} queue={room.queue} isOwner={user?.uid === room.ownerId} />
                          </TabsContent>
                          <TabsContent value="chat" className="h-full mt-0">
                              <Chat roomId={room.id} />
                          </TabsContent>
                          <TabsContent value="ai-dj" className="h-full mt-0">
                              <AiDjPanel 
                                roomHistory={roomHistory} 
                                currentTrack={playingTrack ? {
                                    videoId: playingTrack.videoId,
                                    title: playingTrack.title
                                } : undefined} 
                                roomId={room.id} 
                              />
                          </TabsContent>
                          <TabsContent value="game" className="h-full mt-0">
                              <GameLobby 
                                roomId={room.id} 
                                activeGame={activeGame} 
                                onGameStart={(gameId) => setActiveGame({ gameId, players: [] })}
                              />
                          </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
