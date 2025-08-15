import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Music, Users, Vote } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Music className="h-6 w-6 text-primary" />
            <span className="font-headline text-lg font-bold">Lo-Fi Lounge</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/login">
              <Button>
                Launch App <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="relative w-full py-20 md:py-32 lg:py-40">
           <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10 -z-10"></div>
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-12">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <h1 className="font-headline text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                    Watch, Vote, Play. Together.
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    A chill, social room where you queue YouTube songs, vote tracks up or down in real-time, and hop into mini-games.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                   <Link href="/login">
                    <Button size="lg" className="w-full min-[400px]:w-auto">
                      Join a Room
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="w-full py-12 md:py-24 lg:py-32 bg-secondary/50">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-muted px-3 py-1 text-sm">Key Features</div>
                <h2 className="font-headline text-3xl font-bold tracking-tighter sm:text-5xl">Everything you need for a good time</h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Lo-Fi Lounge combines synced music playback with interactive social features to create the perfect hangout spot.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:gap-12 lg:grid-cols-3 mt-12">
              <Card className="glassmorphism">
                <CardContent className="p-6 grid gap-4">
                    <div className="bg-primary/10 p-3 rounded-full w-fit">
                        <Music className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-headline text-xl font-bold">Synced Playback</h3>
                    <p className="text-muted-foreground">Paste any YouTube link and the video plays for everyone in the room, perfectly in sync.</p>
                </CardContent>
              </Card>
              <Card className="glassmorphism">
                <CardContent className="p-6 grid gap-4">
                    <div className="bg-primary/10 p-3 rounded-full w-fit">
                        <Vote className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-headline text-xl font-bold">Vote-Driven Queue</h3>
                    <p className="text-muted-foreground">Everyone gets a say. Upvote tracks to the top or downvote them into oblivion. The best song plays next.</p>
                </CardContent>
              </Card>
               <Card className="glassmorphism">
                <CardContent className="p-6 grid gap-4">
                    <div className="bg-primary/10 p-3 rounded-full w-fit">
                        <Users className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-headline text-xl font-bold">Realtime Social Hub</h3>
                    <p className="text-muted-foreground">See who's in the room, chat with friends, and react to the music. It's a party in your browser.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">&copy; 2024 Lo-Fi Lounge. All rights reserved.</p>
      </footer>
    </div>
  );
}
