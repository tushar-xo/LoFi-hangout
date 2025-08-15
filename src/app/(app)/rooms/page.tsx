
'use client';

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CreateRoomDialog } from "@/components/room/create-room-dialog";
import { User, Room } from "@/lib/types";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function RoomsPage() {
    const { user: firebaseUser, loading: authLoading } = useAuth();
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loadingRooms, setLoadingRooms] = useState(true);

    // Convert Firebase user to our app's User type
    const user: User | null = firebaseUser ? {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'Anonymous',
        avatarUrl: firebaseUser.photoURL || 'https://placehold.co/100x100.png'
    } : null;

    useEffect(() => {
        const q = query(collection(db, "rooms"), where("isPrivate", "==", false));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const roomsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
            setRooms(roomsData);
            setLoadingRooms(false);
        });

        return () => unsubscribe();
    }, []);

    if (authLoading || loadingRooms) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-theme(height.14))]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Loading...</p>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <div className="flex items-center justify-between mb-8">
                <h1 className="font-headline text-4xl font-bold">Lobby</h1>
                <CreateRoomDialog user={user} disabled={!user || authLoading} />
            </div>

            {rooms.length === 0 ? (
                <div className="text-center text-muted-foreground py-20 rounded-lg bg-muted/30">
                    <h3 className="font-headline text-2xl mb-2">Welcome to the Lounge!</h3>
                    <p className="text-lg">There are no public rooms right now.</p>
                    <p>Click the button above to create a new room and get the party started.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {rooms.map((room) => (
                        <Link href={`/rooms/${room.slug}`} key={room.id}>
                            <Card className="hover:border-primary transition-colors">
                                <CardHeader>
                                    <CardTitle>{room.name}</CardTitle>
                                    <CardDescription>{room.members.length} member(s) in the room</CardDescription>
                                </CardHeader>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
