
"use client";

import { memo, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import type { Track } from "@/lib/types";
import { voteOnTrackInQueue, removeTrackFromQueue } from "@/lib/firebase-client-service";
import { ThumbsDown, ThumbsUp, Play, Trash, ArrowUp, ArrowDown, Heart, HeartCrack } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface QueueItemProps {
    roomId: string;
    track: Track;
    isPlaying: boolean;
    isOwner: boolean;
}

// Memoize the QueueItem component to prevent unnecessary re-renders
const QueueItem = memo(function QueueItem({ roomId, track, isPlaying, isOwner }: QueueItemProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    
    if (!user) return null;

    // Memoize expensive computations
    const { userVote, score, scoreText } = useMemo(() => {
        const vote = track.upvotes.includes(user.uid) ? 'up' : track.downvotes.includes(user.uid) ? 'down' : null;
        const trackScore = track.upvotes.length - track.downvotes.length;
        const upvotes = track.upvotes.length;
        const downvotes = track.downvotes.length;
        
        let displayText = '';
        if (trackScore > 0) {
            displayText = `+${upvotes} ups!`;
        } else if (trackScore < 0) {
            displayText = `-${downvotes} downs!`;
        } else {
            displayText = upvotes > 0 ? `${upvotes} ups` : 'No votes';
        }
        
        return { userVote: vote, score: trackScore, scoreText: displayText };
    }, [track.upvotes, track.downvotes, user.uid]);

    // Memoize callback functions to prevent unnecessary re-renders
    const handleVote = useCallback(async (newVote: 'up' | 'down') => {
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
    }, [roomId, track.id, user.uid, toast]);

    const handleRemove = useCallback(async () => {
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
    }, [roomId, track.id, toast]);

    if (isPlaying) {
        // Now Playing - Mobile-optimized layout
        return (
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg sm:shadow-2xl">
                <div className="flex flex-col items-center gap-3 sm:gap-4">
                    {/* Mobile-optimized thumbnail */}
                    <div className="relative w-full max-w-[280px] sm:max-w-[320px]">
                        <Image
                            src={track.thumbnailUrl}
                            alt={track.title || track.artist}
                            width={280}
                            height={158}
                            className="w-full h-auto rounded-lg sm:rounded-xl aspect-video object-cover shadow-lg sm:shadow-xl"
                        />
                        <div className="absolute inset-0 bg-black/20 rounded-lg sm:rounded-xl flex items-center justify-center">
                            <div className="bg-primary rounded-full p-2 sm:p-3 shadow-lg">
                                <Play className="h-4 w-4 sm:h-6 sm:w-6 text-primary-foreground" />
                            </div>
                        </div>
                    </div>
                    
                    {/* Mobile-optimized title */}
                    <div className="text-center w-full">
                        <h3 className="text-lg sm:text-xl font-bold text-foreground leading-tight mb-1 sm:mb-2 px-2">
                            {track.title || 'Unknown Title'}
                        </h3>
                        <p className="text-base sm:text-lg text-muted-foreground px-2">
                            {track.artist || 'Unknown Artist'}
                        </p>
                    </div>
                    
                    {/* Mobile-optimized delete button */}
                    {isOwner && (
                        <div className="mt-2">
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-red-600 hover:scale-110 transition-all duration-200" 
                                onClick={handleRemove}
                                title="Remove track"
                            >
                                <Trash className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Queue Item - Improved layout with bigger thumbnails
    return (
        <div className="bg-card border border-border/50 rounded-lg p-4 hover:shadow-lg transition-all duration-200">
            <div className="space-y-3">
                {/* Top row: Bigger thumbnail, voting buttons, and admin delete on same horizontal line */}
                <div className="flex items-center gap-3">
                    {/* Bigger thumbnail */}
                    <div className="flex-shrink-0">
                        <Image
                            src={track.thumbnailUrl}
                            alt={track.title || track.artist}
                            width={120}
                            height={68}
                            className="w-28 h-16 sm:w-32 sm:h-18 rounded-md aspect-video object-cover shadow-sm"
                        />
                    </div>
                    
                    {/* Score display */}
                    <div className="flex-1 flex justify-center">
                        <span className="text-sm font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
                            {scoreText}
                        </span>
                    </div>
                    
                    {/* Vote buttons and admin delete */}
                    <div className="flex items-center gap-1">
                        <Button
                            variant={userVote === 'up' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleVote('up')}
                            className="h-9 w-9 p-0"
                            title={`Upvote (${track.upvotes.length})`}
                        >
                            <ArrowUp className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground font-medium min-w-[16px] text-center">
                            {track.upvotes.length}
                        </span>
                        
                        <Button
                            variant={userVote === 'down' ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => handleVote('down')}
                            className="h-9 w-9 p-0"
                            title={`Downvote (${track.downvotes.length})`}
                        >
                            <ArrowDown className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground font-medium min-w-[16px] text-center">
                            {track.downvotes.length}
                        </span>
                        
                        {/* Admin delete button */}
                        {isOwner && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleRemove}
                                className="h-9 w-9 p-0 text-destructive hover:bg-destructive/10 ml-2"
                                title="Remove track"
                            >
                                <Trash className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
                
                {/* Bottom row: Title and artist (can be long) */}
                <div className="space-y-1">
                    <h4 className="font-semibold text-sm text-foreground leading-tight">
                        {track.title || 'Unknown Title'}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                        {track.artist || 'Unknown Artist'}
                    </p>
                </div>
            </div>
        </div>
    );
});

export default QueueItem;