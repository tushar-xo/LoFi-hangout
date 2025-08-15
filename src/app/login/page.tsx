
'use client';

import { LoginForm } from "@/components/auth/login-form";
import { Music } from "lucide-react";
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
                Loading...
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10 -z-10"></div>
            <Link href="/" className="flex items-center gap-2 mb-8">
                <Music className="h-8 w-8 text-primary" />
                <span className="font-headline text-2xl font-bold">Lo-Fi Lounge</span>
            </Link>
            <LoginForm />
        </div>
    );
}
