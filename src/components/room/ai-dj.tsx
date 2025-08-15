"use client";

import { useState, useEffect, useRef } from 'react';
import type { AiDjInput, AiDjOutput } from '@/ai/flows/ai-dj';
import { aiDj } from '@/ai/flows/ai-dj';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Bot, ThumbsDown, ThumbsUp, PlusCircle, Copy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { addTrackToQueue } from '@/lib/firebase-client-service';
import { useAuth } from '@/hooks/use-auth';
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
  const { user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Function to validate YouTube URL
  const isValidYouTubeUrl = (url: string): boolean => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
    return youtubeRegex.test(url);
  };

  // Function to extract video ID from YouTube URL
  const extractVideoId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // Function to add suggestion to queue
  const addSuggestionToQueue = async (suggestion: any) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to add tracks.",
        variant: "destructive"
      });
      return;
    }

    if (!isValidYouTubeUrl(suggestion.link)) {
      toast({
        title: "Invalid URL",
        description: "This YouTube URL appears to be invalid. Please check the link.",
        variant: "destructive"
      });
      return;
    }

    try {
      await addTrackToQueue(roomId, suggestion.link, user.uid);
      toast({
        title: "Track Added!",
        description: `"${suggestion.title}" by ${suggestion.artist} has been added to the queue.`,
      });
    } catch (error) {
      console.error('Error adding track:', error);
      toast({
        title: "Error",
        description: "Failed to add track to queue. The URL might be invalid.",
        variant: "destructive"
      });
    }
  };

  const runAiDj = async () => {
    if (!currentTrack) return;
    setIsThinking(true);
    try {
      const result = await aiDj({
        roomHistory,
        currentTrack,
      });

      // Validate result structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid AI response structure');
      }

      const newLogEntry: LogEntry = {
        vote: result.vote || 'no-vote',
        reasoning: result.reasoning || 'No reasoning provided',
        songSuggestions: result.songSuggestions || [],
        timestamp: new Date().toLocaleTimeString(),
      };

      setLog(prevLog => [newLogEntry, ...prevLog]);
      setLastAnalyzedTrackId(currentTrack.videoId);
      
      const voteText = result.vote === 'upvote' ? 'upvote' : result.vote === 'downvote' ? 'downvote' : 'analyze';
      toast({
        title: "AI DJ Voted!",
        description: `The AI DJ decided to ${voteText} "${currentTrack.title}".`,
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
    <div className="flex flex-col h-full p-3 sm:p-4 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="ai-dj-switch" className="flex flex-col space-y-1">
          <span className="font-medium text-sm sm:text-base">AI DJ</span>
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

      <div className="flex-grow flex flex-col border rounded-md p-2 sm:p-3">
        <h4 className="text-xs sm:text-sm font-medium mb-2 px-2">Activity Log</h4>
        <ScrollArea className="flex-grow pr-2">
          <div className="space-y-3 sm:space-y-4">
            {isThinking && (
              <div className="flex items-start space-x-2 sm:space-x-3">
                <Skeleton className="h-6 w-6 sm:h-8 sm:w-8 rounded-full" />
                <div className="space-y-2 flex-1">
                   <Skeleton className="h-3 w-1/4 sm:h-4" />
                   <Skeleton className="h-3 w-3/4 sm:h-4" />
                </div>
              </div>
            )}
            
            {log.map((entry, index) => (
              <div key={index} className="flex items-start space-x-2 sm:space-x-3 p-2 rounded-lg bg-muted/30">
                <div className="flex-shrink-0 mt-1">
                  {getVoteIcon(entry.vote)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                    {entry.timestamp}
                  </p>
                  <p className="text-xs sm:text-sm font-medium mb-1">
                    {entry.vote === 'upvote' ? 'Upvoted' : entry.vote === 'downvote' ? 'Downvoted' : 'No vote'} track
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-3">
                    {entry.reasoning}
                  </p>
                  
                  {/* NEW: Structured Song Suggestions with Copy Buttons */}
                  {entry.songSuggestions && entry.songSuggestions.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-primary">🎵 Song Suggestions:</p>
                      {entry.songSuggestions.map((suggestion, idx) => (
                        <div key={idx} className="bg-card/50 border border-border/30 rounded-lg p-3 space-y-2">
                          {/* Song Title - Bold */}
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-foreground">
                              {suggestion.title}
                            </h4>
                            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
                              #{idx + 1}
                            </span>
                          </div>
                          
                          {/* Artist - Italic */}
                          <p className="text-sm text-muted-foreground italic">
                            {suggestion.artist}
                          </p>
                          
                          {/* YouTube URL with Copy and Add Buttons */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-primary font-mono truncate">
                                {suggestion.link}
                              </p>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  navigator.clipboard.writeText(suggestion.link);
                                  toast({
                                    title: "Link Copied!",
                                    description: "YouTube URL copied to clipboard",
                                  });
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 px-2 text-xs bg-primary hover:bg-primary/90"
                                onClick={() => addSuggestionToQueue(suggestion)}
                                disabled={!isValidYouTubeUrl(suggestion.link)}
                                title={isValidYouTubeUrl(suggestion.link) ? "Add to queue" : "Invalid YouTube URL"}
                              >
                                <PlusCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          
                          {/* URL validation indicator */}
                          {!isValidYouTubeUrl(suggestion.link) && (
                            <p className="text-xs text-red-500 mt-1">
                              ⚠️ Invalid YouTube URL - AI generated an incorrect link
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {log.length === 0 && !isThinking && (
              <div className="text-center py-4">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Enable AI DJ to see activity here
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
