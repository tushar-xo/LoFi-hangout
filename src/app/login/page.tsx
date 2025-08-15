
'use client';

import { LoginForm } from "@/components/auth/login-form";
import { Music, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user) {
            router.push('/rooms');
        }
    }, [user, loading, router]);

    if (loading || user) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Mobile-optimized header */}
            <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container-mobile flex h-14 items-center">
                    <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="text-sm">Back to Home</span>
                    </Link>
                </div>
            </header>

            <main className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10 -z-10"></div>
                
                {/* Mobile-optimized logo */}
                <Link href="/" className="flex items-center gap-2 mb-6 sm:mb-8 group">
                    <Music className="h-6 w-6 sm:h-8 sm:w-8 text-primary group-hover:scale-110 transition-transform" />
                    <span className="font-headline text-xl sm:text-2xl font-bold">Lo-Fi Lounge</span>
                </Link>
                
                {/* Mobile-optimized form container */}
                <div className="w-full max-w-sm sm:max-w-md">
                    <LoginForm />
                </div>
                
                {/* Mobile-optimized footer text */}
                <div className="mt-8 text-center">
                    <p className="text-xs sm:text-sm text-muted-foreground max-w-sm">
                        Join the chill zone where music brings people together
                    </p>
                </div>
            </main>
        </div>
    );
}
