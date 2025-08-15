// src/ai/flows/ai-dj.ts
'use server';

/**
 * @fileOverview A flow to manage song votes by an AI DJ when no users are present.
 *
 * - aiDj - A function that manages song votes based on room history.
 * - AiDjInput - The input type for the aiDj function.
 * - AiDjOutput - The return type for the aiDj function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AiDjInputSchema = z.object({
  roomHistory: z.array(
    z.object({
      videoId: z.string(),
      title: z.string(),
      upvotes: z.number(),
      downvotes: z.number(),
    })
  ).describe('The history of songs played in the room, including their titles and vote counts.'),
  currentTrack: z.object({
    videoId: z.string(),
    title: z.string(),
  }).optional().describe('The currently playing track.'),
});
export type AiDjInput = z.infer<typeof AiDjInputSchema>;

const AiDjOutputSchema = z.object({
  vote: z.enum(['upvote', 'downvote', 'none']).describe('The AI DJ suggestion to upvote, downvote, or do nothing.'),
  reasoning: z.string().describe('The AI DJ reasoning for the vote suggestion.'),
  songSuggestions: z.array(z.object({
    title: z.string(),
    artist: z.string(),
    thumbnail: z.string(),
    link: z.string(),
  })).optional().describe('Up to three song suggestions based on the current track.'),
});
export type AiDjOutput = z.infer<typeof AiDjOutputSchema>;

export async function aiDj(input: AiDjInput): Promise<AiDjOutput> {
  if (!input.currentTrack) {
    return {
      vote: 'none',
      reasoning: 'No track is currently playing',
      songSuggestions: []
    };
  }
  return aiDjFlow(input);
}

const prompt = ai.definePrompt({
  name: 'aiDjPrompt',
  input: {schema: AiDjInputSchema},
  output: {schema: AiDjOutputSchema},
  prompt: `You are an AI DJ and music expert. {{#if currentTrack}}I'm watching a video titled "{{currentTrack.title}}" on YouTube.{{else}}No track is currently playing.{{/if}} Suggest three similar videos/songs.

For each suggestion, provide:
- The title of the video/song
- The artist
- A thumbnail image URL
- A YouTube link

Return your suggestions as a JSON array.`,
});

const aiDjFlow = ai.defineFlow(
  {
    name: 'aiDjFlow',
    inputSchema: AiDjInputSchema,
    outputSchema: AiDjOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
