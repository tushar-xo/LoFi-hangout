'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Music, Users, Vote, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Mobile-First Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container-mobile flex h-14 max-w-screen-2xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Music className="h-6 w-6 text-primary" />
            <span className="font-headline text-lg font-bold">Lo-Fi Lounge</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden sm:flex items-center gap-4">
            <ThemeToggle />
            <Link href="/login">
              <Button className="btn-mobile">
                Launch App <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </nav>
          
          {/* Mobile Menu Button */}
          <button
            className="sm:hidden p-2 rounded-md hover:bg-accent/10 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle mobile menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-border/40 bg-background/95 backdrop-blur">
            <div className="container-mobile py-4 space-y-3">
              <Link href="/login">
                <Button className="w-full btn-mobile">
                  Launch App <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* Hero Section - Mobile First */}
        <section className="relative w-full section-mobile">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10 -z-10"></div>
          <div className="container-mobile">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-12">
              <div className="flex flex-col justify-center space-y-4 text-center lg:text-left">
                <div className="space-y-4">
                  <h1 className="text-mobile-xl font-bold tracking-tighter leading-tight">
                    Watch, Vote, Play. Together.
                  </h1>
                  <p className="text-mobile-base text-muted-foreground max-w-[600px] mx-auto lg:mx-0">
                    A chill, social room where you queue YouTube songs, vote tracks up or down in real-time, and hop into mini-games.
                  </p>
                </div>
                <div className="flex flex-col gap-3 min-[400px]:flex-row justify-center lg:justify-start">
                  <Link href="/login">
                    <Button size="lg" className="w-full min-[400px]:w-auto btn-mobile">
                      Join a Room
                    </Button>
                  </Link>
                </div>
              </div>
              
              {/* Mobile-optimized hero image/illustration */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-full max-w-md">
                  <div className="aspect-square bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl flex items-center justify-center">
                    <Music className="h-32 w-32 text-primary/40" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section - Mobile First */}
        <section id="features" className="w-full section-mobile-sm bg-secondary/50">
          <div className="container-mobile">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-4">
                <div className="inline-block rounded-lg bg-muted px-3 py-1 text-sm">Key Features</div>
                <h2 className="text-mobile-lg font-bold tracking-tighter">Everything you need for a good time</h2>
                <p className="text-mobile-base text-muted-foreground max-w-[900px]">
                  Lo-Fi Lounge combines synced music playback with interactive social features to create the perfect hangout spot.
                </p>
              </div>
            </div>
            
            {/* Mobile-optimized feature grid */}
            <div className="mx-auto grid max-w-5xl items-start gap-6 sm:gap-8 md:gap-12 grid-mobile-3 mt-12">
              <Card className="card-mobile glassmorphism hover:shadow-mobile transition-all duration-300">
                <CardContent className="p-4 sm:p-6 grid gap-4">
                  <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto sm:mx-0">
                    <Music className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-headline text-lg sm:text-xl font-bold text-center sm:text-left">Synced Playback</h3>
                  <p className="text-muted-foreground text-sm sm:text-base text-center sm:text-left">Paste any YouTube link and the video plays for everyone in the room, perfectly in sync.</p>
                </CardContent>
              </Card>
              
              <Card className="card-mobile glassmorphism hover:shadow-mobile transition-all duration-300">
                <CardContent className="p-4 sm:p-6 grid gap-4">
                  <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto sm:mx-0">
                    <Vote className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-headline text-lg sm:text-xl font-bold text-center sm:text-left">Vote-Driven Queue</h3>
                  <p className="text-muted-foreground text-sm sm:text-base text-center sm:text-left">Everyone gets a say. Upvote tracks to the top or downvote them into oblivion. The best song plays next.</p>
                </CardContent>
              </Card>
              
              <Card className="card-mobile glassmorphism hover:shadow-mobile transition-all duration-300">
                <CardContent className="p-4 sm:p-6 grid gap-4">
                  <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto sm:mx-0">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-headline text-lg sm:text-xl font-bold text-center sm:text-left">Realtime Social Hub</h3>
                  <p className="text-muted-foreground text-sm sm:text-base text-center sm:text-left">See who's in the room, chat with friends, and react to the music. It's a party in your browser.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
      
      {/* Mobile-optimized footer */}
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center container-mobile border-t border-border/40">
        <p className="text-xs text-muted-foreground text-center sm:text-left">&copy; 2024 Lo-Fi Lounge. All rights reserved.</p>
      </footer>
    </div>
  );
}
