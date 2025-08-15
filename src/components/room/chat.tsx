"use client";

import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase-client";
import type { Message, User } from "@/lib/types";

interface ChatProps {
    roomId: string;
}

export default function Chat({ roomId }: ChatProps) {
    const { user: firebaseUser } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const user: User | null = firebaseUser ? {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'Anonymous',
        avatarUrl: firebaseUser.photoURL || 'https://placehold.co/100x100.png'
    } : null;

    useEffect(() => {
        const messagesRef = collection(db, "rooms", roomId, "messages");
        const q = query(messagesRef, orderBy("timestamp", "asc"));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const msgs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
            setMessages(msgs);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [roomId]);

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() === "" || !user) return;

        const messagesRef = collection(db, "rooms", roomId, "messages");
        await addDoc(messagesRef, {
            text: newMessage,
            timestamp: serverTimestamp(),
            user: {
                id: user.id,
                name: user.name,
                avatarUrl: user.avatarUrl
            }
        });

        setNewMessage("");
    };

    return (
        <div className="flex flex-col h-full p-4 space-y-4">
            <h3 className="font-headline text-lg font-semibold px-2">Live Chat</h3>
            <ScrollArea className="flex-grow pr-4" ref={scrollAreaRef}>
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {messages.map((msg) => (
                            <div key={msg.id} className="flex items-start space-x-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={msg.user.avatarUrl} alt={msg.user.name} data-ai-hint="avatar person" />
                                    <AvatarFallback>{msg.user.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-sm font-semibold">{msg.user.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {(() => {
                                                const date = msg.timestamp?.toDate();
                                                if (!date) return 'Just now';
                                                
                                                const now = new Date();
                                                const isToday = date.toDateString() === now.toDateString();
                                                const isYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === date.toDateString();
                                                
                                                if (isToday) {
                                                    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                                } else if (isYesterday) {
                                                    return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                                } else {
                                                    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                                }
                                            })()}
                                        </p>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
            <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2 p-2">
                <Input
                    type="text"
                    placeholder="Say something nice..."
                    className="flex-1"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={!user}
                />
                <Button type="submit" size="icon" disabled={!user || newMessage.trim() === ""}>
                    <Send className="h-4 w-4" />
                </Button>
            </form>
        </div>
    );
}
