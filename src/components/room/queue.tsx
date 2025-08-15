
'use client';

import { useState, useMemo, memo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Track } from "@/lib/types";
import { addTrackToQueue } from '@/lib/firebase-client-service';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Loader2 } from "lucide-react";
import QueueItem from "./queue-item";

interface QueueProps {
  roomId: string;
  queue: Track[];
  isOwner: boolean;
}

// Memoize the Queue component to prevent unnecessary re-renders
const Queue = memo(function Queue({ roomId, queue, isOwner }: QueueProps) {
  const [youTubeUrl, setYouTubeUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Memoize expensive computations to prevent recalculation on every render
  const { sortedQueue, playingTrack, upcomingTracks } = useMemo(() => {
    // Sort tracks purely by score (upvotes - downvotes) - no manual ordering
    const sorted = [...queue].sort((a, b) => {
      const scoreA = a.upvotes.length - a.downvotes.length;
      const scoreB = b.upvotes.length - b.downvotes.length;
      return scoreB - scoreA; // Higher scores first
    });

    const playing = sorted.find(t => t.status === 'playing');
    const upcoming = sorted.filter(t => t.status === 'queued');

    return { sortedQueue: sorted, playingTrack: playing, upcomingTracks: upcoming };
  }, [queue]); // Only recalculate when queue changes

  // Memoize the user ID to prevent unnecessary re-renders
  const userId = useMemo(() => user?.uid, [user?.uid]);

  // Only log when actually debugging (remove in production)
  if (process.env.NODE_ENV === 'development') {
    console.log('Queue component - isOwner:', isOwner, 'user:', userId);
    console.log('Queue tracks - playing:', playingTrack?.title, 'upcoming:', upcomingTracks.length);
  }

  const handleAddTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youTubeUrl || !user) return;

    setIsAdding(true);
    try {
      await addTrackToQueue(roomId, youTubeUrl, user.uid);
      setYouTubeUrl('');
      toast({
        title: "Song Added!",
        description: "The song has been added to the queue.",
      });
    } catch (error: any) {
      console.error("Error adding track:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Could not add the song. Please check the link.",
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Song Form */}
      <form onSubmit={handleAddTrack} className="flex w-full items-center space-x-2">
        <Input 
          type="text" 
          placeholder="Paste a YouTube link..." 
          className="flex-1 bg-background/70 border-2 border-border/50 focus:border-primary/50 transition-colors text-sm"
          value={youTubeUrl}
          onChange={(e) => setYouTubeUrl(e.target.value)}
          disabled={isAdding}
        />
        <Button type="submit" size="icon" disabled={isAdding || !youTubeUrl} className="h-10 w-10">
          {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
        </Button>
      </form>

      {/* Now Playing */}
      {playingTrack && (
        <div>
            <h3 className="font-headline text-lg font-bold mb-3 text-foreground">Now Playing</h3>
            <QueueItem roomId={roomId} track={playingTrack} isPlaying={true} isOwner={isOwner} />
        </div>
      )}

      {/* Upcoming Queue */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-headline text-lg font-bold text-foreground">Up Next ({upcomingTracks.length})</h3>
          <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
            <span><span className="text-green-500 font-semibold">↑</span> <span className="text-red-500 font-semibold">↓</span> Vote to Reorder!</span>
          </div>
        </div>
        <ScrollArea className="h-96">
          <div className="space-y-3">
            {upcomingTracks.map((track) => (
              <QueueItem 
                key={track.id} 
                roomId={roomId} 
                track={track} 
                isPlaying={false} 
                isOwner={isOwner} 
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
});

export default Queue;
