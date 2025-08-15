
"use client";

import { Button } from "@/components/ui/button";
import type { Track } from "@/lib/types";
import { voteOnTrackInQueue, removeTrackFromQueue } from "@/lib/firebase-client-service";
import { ThumbsDown, ThumbsUp, Play, Trash } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface QueueItemProps {
    roomId: string;
    track: Track;
    isPlaying: boolean;
    isOwner: boolean;
}

export default function QueueItem({ roomId, track, isPlaying, isOwner }: QueueItemProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    
    if (!user) return null;

    const userVote = track.upvotes.includes(user.uid) ? 'up' : track.downvotes.includes(user.uid) ? 'down' : null;
    const score = track.upvotes.length - track.downvotes.length;

    const handleVote = async (newVote: 'up' | 'down') => {
        try {
            await voteOnTrackInQueue(roomId, track.id, user.uid, newVote);
        } catch (error: any) {
            console.error('Error voting on track:', error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to vote on track. Please try again.",
            });
        }
    };

    const handleRemove = async () => {
        try {
            await removeTrackFromQueue(roomId, track.id);
            toast({
                title: "Track Removed",
                description: "The track has been removed from the queue.",
            });
        } catch (error: any) {
            console.error('Error removing track:', error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to remove track. Please try again.",
            });
        }
    };

    if (isPlaying) {
        // Now Playing - Just thumbnail and title below it, NO score
        return (
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 rounded-2xl p-6 shadow-2xl">
                <div className="flex flex-col items-center gap-4">
                    {/* Large thumbnail */}
                    <div className="relative">
                        <Image
                            src={track.thumbnailUrl}
                            alt={track.title || track.artist}
                            width={240}
                            height={135}
                            className="rounded-xl aspect-video object-cover shadow-xl"
                        />
                        <div className="absolute inset-0 bg-black/20 rounded-xl flex items-center justify-center">
                            <div className="bg-primary rounded-full p-3 shadow-lg">
                                <Play className="h-6 w-6 text-primary-foreground" />
                            </div>
                        </div>
                    </div>
                    
                    {/* Title below thumbnail - FULL TEXT, no truncation */}
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-foreground leading-tight mb-2">
                            {track.title || 'Unknown Title'}
                        </h3>
                        <p className="text-lg text-muted-foreground">
                            {track.artist || 'Unknown Artist'}
                        </p>
                    </div>
                    
                    {/* Delete button for admin - small and red */}
                    {isOwner && (
                        <div className="mt-2">
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                className="h-8 w-8 hover:bg-red-600 hover:scale-110 transition-all duration-200" 
                                onClick={handleRemove}
                                title="Remove track"
                            >
                                <Trash className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Up Next items - NEW LAYOUT: Thumbnail + Voting in one line, title below
    return (
        <div className="bg-card/50 hover:bg-card/80 border border-border/50 rounded-xl p-4 transition-all duration-200 hover:shadow-md">
            <div className="flex flex-col gap-3">
                {/* First row: Thumbnail and Voting controls in one horizontal line */}
                <div className="flex items-center justify-between">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0">
                        <Image
                            src={track.thumbnailUrl}
                            alt={track.title || track.artist}
                            width={80}
                            height={45}
                            className="rounded-lg aspect-video object-cover shadow-md"
                        />
                    </div>
                    
                    {/* Voting controls - on the right side */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={`h-8 w-8 p-0 hover:bg-green-500/10 ${
                                userVote === 'up' ? 'text-green-500 bg-green-500/20' : 'text-muted-foreground'
                            }`}
                            onClick={() => handleVote('up')}
                            title="Upvote"
                        >
                            <ThumbsUp className="h-4 w-4" />
                        </Button>
                        
                        <span className="text-sm font-bold w-8 text-center text-foreground">{score}</span>
                        
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={`h-8 w-8 p-0 hover:bg-red-500/10 ${
                                userVote === 'down' ? 'text-red-500 bg-red-500/20' : 'text-muted-foreground'
                            }`}
                            onClick={() => handleVote('down')}
                            title="Downvote"
                        >
                            <ThumbsDown className="h-4 w-4" />
                        </Button>
                        
                        {/* Delete button for admin - small and red */}
                        {isOwner && (
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                className="h-8 w-8 p-0 hover:bg-red-600 hover:scale-110 transition-all duration-200" 
                                onClick={handleRemove}
                                title="Remove track"
                            >
                                <Trash className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
                
                {/* Second row: Title below thumbnail and voting controls */}
                <div className="ml-0">
                    <h4 className="font-semibold text-foreground leading-tight text-sm">
                        {track.title || 'Unknown Title'}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                        {track.artist || 'Unknown Artist'}
                    </p>
                </div>
            </div>
        </div>
    );
}