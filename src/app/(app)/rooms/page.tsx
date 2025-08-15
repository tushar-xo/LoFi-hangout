'use client';

import { useEffect, useState } from "react";
import { Loader2, Users, Music, Plus, Trash2, MoreVertical, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CreateRoomDialog } from "@/components/room/create-room-dialog";
import { User, Room } from "@/lib/types";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import { deleteRoom } from "@/lib/firebase-client-service";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function RoomsPage() {
    const { user: firebaseUser, loading: authLoading } = useAuth();
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
    const [passwordRoom, setPasswordRoom] = useState<Room | null>(null);
    const [passwordInput, setPasswordInput] = useState('');
    const { toast } = useToast();

    // Convert Firebase user to our app's User type
    const user: User | null = firebaseUser ? {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'Anonymous',
        avatarUrl: firebaseUser.photoURL || 'https://placehold.co/100x100.png'
    } : null;

    const handleRoomClick = (room: Room, e: React.MouseEvent) => {
        e.preventDefault();
        
        if (room.isPrivate && room.password) {
            setPasswordRoom(room);
        } else {
            window.location.href = `/rooms/${room.slug}`;
        }
    };

    const handlePasswordSubmit = () => {
        if (!passwordRoom) return;
        
        if (passwordInput === passwordRoom.password) {
            setPasswordRoom(null);
            setPasswordInput('');
            window.location.href = `/rooms/${passwordRoom.slug}`;
        } else {
            toast({
                title: "Incorrect Password",
                description: "Please enter the correct password to join this room.",
                variant: "destructive"
            });
        }
    };

    const handleDeleteRoom = async (roomId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!user) return;
        
        setDeletingRoomId(roomId);
        
        try {
            await deleteRoom(roomId, user.id);
            toast({
                title: "Room Deleted",
                description: "The room has been deleted successfully.",
            });
        } catch (error: any) {
            toast({
                title: "Delete Failed",
                description: error.message || "Failed to delete room. Please try again.",
                variant: "destructive"
            });
        } finally {
            setDeletingRoomId(null);
        }
    };

    useEffect(() => {
        // Show ALL rooms (both private and public)
        const q = query(collection(db, "rooms"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const roomsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
            setRooms(roomsData);
            setLoadingRooms(false);
        });

        return () => unsubscribe();
    }, []);

    if (authLoading || loadingRooms) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-muted-foreground">Loading rooms...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Mobile-optimized header */}
            <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container-mobile flex h-14 items-center justify-between">
                    <h1 className="font-headline text-lg sm:text-xl font-bold">Lobby</h1>
                    <CreateRoomDialog user={user} disabled={!user || authLoading} />
                </div>
            </header>

            <main className="container-mobile py-4 sm:py-6">
                {/* Mobile-optimized welcome section */}
                {rooms.length === 0 ? (
                    <div className="text-center py-12 sm:py-20 rounded-lg bg-muted/30 border border-border/40">
                        <Music className="h-12 w-12 sm:h-16 sm:w-16 text-primary/40 mx-auto mb-4" />
                        <h3 className="font-headline text-xl sm:text-2xl mb-2">Welcome to the Lounge!</h3>
                        <p className="text-sm sm:text-base text-muted-foreground mb-4">There are no rooms right now.</p>
                        <CreateRoomDialog user={user} disabled={!user || authLoading}>
                            <Button className="btn-mobile">
                                <Plus className="h-4 w-4 mr-2" />
                                Create First Room
                            </Button>
                        </CreateRoomDialog>
                    </div>
                ) : (
                    <div className="space-y-4 sm:space-y-6">
                        {/* Mobile-optimized room grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                            {rooms.map((room) => (
                                <div key={room.id} className="relative group">
                                    <Card className="card-mobile hover:shadow-mobile transition-all duration-300 hover:border-primary/50 cursor-pointer" onClick={(e) => handleRoomClick(room, e)}>
                                        <CardHeader className="p-4 sm:p-6">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <CardTitle className="text-base sm:text-lg font-semibold group-hover:text-primary transition-colors truncate">
                                                            {room.name}
                                                        </CardTitle>
                                                        {room.isPrivate && (
                                                            <Lock className="h-4 w-4 text-yellow-500" title="Private Room" />
                                                        )}
                                                    </div>
                                                    <CardDescription className="text-sm text-muted-foreground mt-1">
                                                        {room.members.length} member{room.members.length !== 1 ? 's' : ''} in the room
                                                    </CardDescription>
                                                </div>
                                                <div className="flex items-center gap-1 text-muted-foreground">
                                                    <Users className="h-4 w-4" />
                                                    <span className="text-xs font-medium">{room.members.length}</span>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        
                                        {/* Mobile-optimized room preview */}
                                        <CardContent className="p-4 sm:p-6 pt-0">
                                            <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
                                                <span className={room.isPrivate ? "text-yellow-600 font-medium" : ""}>
                                                    {room.isPrivate ? "Private Room" : "Public Room"}
                                                </span>
                                                <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs">
                                                    Join
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    
                                    {/* Three-dot menu - only show for room owner or special admin */}
                                    {user && (room.ownerId === user.id || user.id === 'NUkGPIe8H8XlyKfYmtcpTPBlO7H3') && (
                                        <div className="absolute top-3 right-3 z-10">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                        }}
                                                    >
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-32">
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:text-destructive cursor-pointer"
                                                        onClick={(e) => handleDeleteRoom(room.id, e)}
                                                        disabled={deletingRoomId === room.id}
                                                    >
                                                        {deletingRoomId === room.id ? (
                                                            <>
                                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                                Deleting...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Trash2 className="h-4 w-4 mr-2" />
                                                                Delete Room
                                                            </>
                                                        )}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Password Dialog for Private Rooms */}
                {passwordRoom && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-background p-6 rounded-lg max-w-md w-full mx-4">
                            <h3 className="text-lg font-semibold mb-4">Enter Room Password</h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                This room "{passwordRoom.name}" is private. Please enter the password to join.
                            </p>
                            <input
                                type="password"
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                placeholder="Enter password"
                                className="w-full p-3 border border-border rounded-md mb-4"
                                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                            />
                            <div className="flex gap-2">
                                <Button onClick={handlePasswordSubmit} className="flex-1">
                                    Join Room
                                </Button>
                                <Button variant="outline" onClick={() => {setPasswordRoom(null); setPasswordInput('');}} className="flex-1">
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
