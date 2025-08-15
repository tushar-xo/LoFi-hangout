"use client";

import { useState, useEffect, useRef } from 'react';
import type { AiDjInput, AiDjOutput } from '@/ai/flows/ai-dj';
import { aiDj } from '@/ai/flows/ai-dj';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Bot, ThumbsDown, ThumbsUp, PlusCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { addTrackToQueue } from '@/lib/firebase-client-service';
import Image from 'next/image';

interface AiDjPanelProps {
  roomHistory: AiDjInput['roomHistory'];
  currentTrack?: AiDjInput['currentTrack'];
  roomId: string;
}

type LogEntry = AiDjOutput & { timestamp: string };

export default function AiDjPanel({ roomHistory, currentTrack, roomId }: AiDjPanelProps) {
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastAnalyzedTrackId, setLastAnalyzedTrackId] = useState<string | null>(null);
  const { toast } = useToast();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const runAiDj = async () => {
    if (!currentTrack) return;
    setIsThinking(true);
    try {
      const result = await aiDj({
        roomHistory,
        currentTrack,
      });

      const newLogEntry: LogEntry = {
        ...result,
        timestamp: new Date().toLocaleTimeString(),
      };

      setLog(prevLog => [newLogEntry, ...prevLog]);
      setLastAnalyzedTrackId(currentTrack.videoId);
      toast({
        title: "AI DJ Voted!",
        description: `The AI DJ decided to ${result.vote} "${currentTrack.title}".`,
      });

    } catch (error) {
      console.error("AI DJ Error:", error);
      toast({
        variant: "destructive",
        title: "AI DJ Error",
        description: "Could not get a decision from the AI DJ.",
      });
    } finally {
      setIsThinking(false);
    }
  };

  useEffect(() => {
    if (isAiEnabled && currentTrack && currentTrack.videoId !== lastAnalyzedTrackId) {
      // Run once immediately
      runAiDj();

      // Then set up interval
      intervalRef.current = setInterval(() => {
        runAiDj();
      }, 5 * 60 * 1000); // Run every 5 minutes
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAiEnabled, currentTrack?.videoId, lastAnalyzedTrackId]);

  const handleAddSuggestion = async (song: string) => {
    try {
      // Assuming the suggestion is a YouTube URL or video ID
      await addTrackToQueue(roomId, song, 'ai-dj');
      toast({
        title: "AI Song Added!",
        description: "The AI-generated song has been added to the queue.",
      });
    } catch (error: any) {
      console.error("Error adding AI track:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Could not add the AI song.",
      });
    }
  };

  const getVoteIcon = (vote: AiDjOutput['vote']) => {
    switch (vote) {
      case 'upvote':
        return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'downvote':
        return <ThumbsDown className="h-4 w-4 text-red-500" />;
      default:
        return <Bot className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="ai-dj-switch" className="flex flex-col space-y-1">
          <span className="font-medium">AI DJ</span>
          <span className="font-normal text-xs text-muted-foreground">
            Let the AI vote on the current track.
          </span>
        </Label>
        <Switch
          id="ai-dj-switch"
          checked={isAiEnabled}
          onCheckedChange={setIsAiEnabled}
        />
      </div>

      <div className="flex-grow flex flex-col border rounded-md p-2">
        <h4 className="text-sm font-medium mb-2 px-2">Activity Log</h4>
        <ScrollArea className="flex-grow pr-2">
          <div className="space-y-4">
            {isThinking && (
              <div className="flex items-start space-x-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-2 flex-1">
                   <Skeleton className="h-4 w-1/4" />
                   <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            )}
            {log.length === 0 && !isThinking && (
                <p className="text-sm text-center text-muted-foreground py-8">
                    {isAiEnabled ? 'AI DJ is watching...' : 'Enable AI DJ to see its activity.'}
                </p>
            )}
            {log.map((entry, index) => (
              <div key={index} className="flex items-start space-x-3">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    {getVoteIcon(entry.vote)}
                </span>
                <div className="flex-1">
                  <p className="text-sm">
                    AI decided to <span className="font-bold">{entry.vote}</span>.
                    <span className="text-xs text-muted-foreground ml-2">{entry.timestamp}</span>
                  </p>
                  <p className="text-xs text-muted-foreground italic">"{entry.reasoning}"</p>
                  {entry.songSuggestions && (
                    <div className="mt-2 space-y-2">
                      <h5 className="text-xs font-semibold">Suggestions:</h5>
                      {entry.songSuggestions.map((suggestion, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                          <Image src={suggestion.thumbnail} alt={suggestion.title} width={80} height={80} className="rounded-md aspect-video object-cover" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold truncate">{suggestion.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{suggestion.artist}</p>
                          </div>
                          <Button size="sm" onClick={() => handleAddSuggestion(suggestion.link)}>
                            <PlusCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
