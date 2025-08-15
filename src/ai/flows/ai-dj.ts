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
    title: z.string().describe('The exact song title'),
    artist: z.string().describe('The artist/band name'),
    link: z.string().describe('The YouTube URL for the song'),
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
  prompt: `You are an AI DJ and music expert. {{#if currentTrack}}I'm watching a video titled "{{currentTrack.title}}" on YouTube.{{else}}No track is currently playing.{{/if}}

Based on the current track and room history, please:

1. **Vote Decision**: Decide whether to upvote, downvote, or do nothing (none) for the current track. Consider the musical style, quality, and how it fits with the room's vibe.

2. **Reasoning**: Provide a brief explanation for your vote decision.

3. **Song Suggestions**: Suggest exactly 3 similar songs that would fit well in this room. For each suggestion, provide:
   - **title**: The exact song title
   - **artist**: The artist/band name  
   - **link**: A valid YouTube URL/link for the song youre recommending! double check it works!

IMPORTANT: 
- Return your response in the exact JSON format specified
- Do NOT include thumbnail URLs or broken image links
- Ensure all YouTube URLs are valid and accessible
- Focus on songs that are similar in style, mood, or genre to the current track

Example output format:
{
  "vote": "upvote",
  "reasoning": "This track has a great vibe that fits the room's energy",
  "songSuggestions": [
    {
      "title": "Song Title Here",
      "artist": "Artist Name",
      "link": "https://www.youtube.com/watch?v=VIDEO_ID"
    }
  ]
}`,
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
