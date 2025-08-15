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
        <div className="flex flex-col h-full p-3 sm:p-4 space-y-3 sm:space-y-4">
            <h3 className="font-headline text-base sm:text-lg font-semibold px-2">Live Chat</h3>
            <ScrollArea className="flex-grow pr-2 sm:pr-4" ref={scrollAreaRef}>
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-3 sm:space-y-4">
                        {messages.map((msg) => (
                            <div key={msg.id} className="flex items-start space-x-2 sm:space-x-3">
                                <Avatar className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0">
                                    <AvatarImage src={msg.user.avatarUrl} alt={msg.user.name} data-ai-hint="avatar person" />
                                    <AvatarFallback className="text-xs sm:text-sm">{msg.user.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                                        <p className="text-xs sm:text-sm font-semibold truncate">{msg.user.name}</p>
                                        <p className="text-xs text-muted-foreground flex-shrink-0">
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
                                                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                }
                                            })()}
                                        </p>
                                    </div>
                                    <p className="text-sm sm:text-base break-words">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
            
            {/* Mobile-optimized message input */}
            <form onSubmit={handleSendMessage} className="flex items-center space-x-2 sm:space-x-3 pt-2">
                <Input
                    type="text"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 text-sm sm:text-base bg-background/70 border-2 border-border/50 focus:border-primary/50 transition-colors"
                    disabled={!user}
                />
                <Button 
                    type="submit" 
                    size="icon" 
                    disabled={newMessage.trim() === "" || !user}
                    className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
                >
                    <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
            </form>
        </div>
    );
}
