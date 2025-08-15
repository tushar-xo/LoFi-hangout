
'use client';

import { useState } from 'react';
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

export default function Queue({ roomId, queue, isOwner }: QueueProps) {
  const [youTubeUrl, setYouTubeUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  console.log('Queue component - isOwner:', isOwner, 'user:', user?.uid);

  // Sort tracks purely by score (upvotes - downvotes) - no manual ordering
  const sortedQueue = [...queue].sort((a, b) => {
    const scoreA = a.upvotes.length - a.downvotes.length;
    const scoreB = b.upvotes.length - b.downvotes.length;
    return scoreB - scoreA; // Higher scores first
  });

  const playingTrack = sortedQueue.find(t => t.status === 'playing');
  const upcomingTracks = sortedQueue.filter(t => t.status === 'queued');

  console.log('Queue tracks - playing:', playingTrack?.title, 'upcoming:', upcomingTracks.length);

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
    <div className="flex flex-col h-full p-6 space-y-6">
      {/* Add Song Form */}
      <form onSubmit={handleAddTrack} className="flex w-full items-center space-x-3 px-2">
        <Input 
          type="text" 
          placeholder="Paste a YouTube link..." 
          className="flex-1 bg-background/70 border-2 border-border/50 focus:border-primary/50 transition-colors"
          value={youTubeUrl}
          onChange={(e) => setYouTubeUrl(e.target.value)}
          disabled={isAdding}
        />
        <Button type="submit" size="icon" disabled={isAdding || !youTubeUrl} className="h-11 w-11">
          {isAdding ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlusCircle className="h-5 w-5" />}
        </Button>
      </form>

      {/* Now Playing */}
      {playingTrack && (
        <div className="px-2">
            <h3 className="font-headline text-xl font-bold mb-4 text-foreground">Now Playing</h3>
            <QueueItem roomId={roomId} track={playingTrack} isPlaying={true} isOwner={isOwner} />
        </div>
      )}

      {/* Upcoming Queue */}
      <div className="flex-grow flex flex-col min-h-0">
        <div className="flex items-center justify-between px-2 mb-4">
          <h3 className="font-headline text-xl font-bold text-foreground">Up Next ({upcomingTracks.length})</h3>
          <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
            <span><span className="text-green-500 font-semibold">↑</span> <span className="text-red-500 font-semibold">↓</span> Vote to Reorder!</span>
          </div>
        </div>
        <ScrollArea className="flex-grow pr-2">
          <div className="space-y-3">
            {upcomingTracks.map((track) => (
              <QueueItem 
                key={`queue-${track.id}`} 
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
}
