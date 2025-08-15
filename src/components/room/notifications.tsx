"use client";

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp, limit, where } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Notification {
    id: string;
    message: string;
    timestamp: Timestamp;
}

interface NotificationsProps {
    roomId: string;
}

export default function Notifications({ roomId }: NotificationsProps) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        const notificationsRef = collection(db, 'rooms', roomId, 'notifications');
        // Only get recent notifications (last 10 minutes)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const q = query(
            notificationsRef, 
            where('timestamp', '>', Timestamp.fromDate(tenMinutesAgo)),
            orderBy('timestamp', 'desc'),
            limit(5) // Limit to 5 recent notifications
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newNotifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Notification)).filter(notif => !dismissedIds.has(notif.id));
            
            setNotifications(newNotifications);
            
            // Auto-dismiss notifications after 8 seconds
            newNotifications.forEach(notification => {
                setTimeout(() => {
                    setDismissedIds(prev => new Set(prev.add(notification.id)));
                }, 8000);
            });
        });

        return () => unsubscribe();
    }, [roomId, dismissedIds]);

    const dismissNotification = (id: string) => {
        setDismissedIds(prev => new Set(prev.add(id)));
    };

    // Filter out dismissed notifications
    const visibleNotifications = notifications.filter(notif => !dismissedIds.has(notif.id));

    if (visibleNotifications.length === 0) return null;

    return (
        <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm">
            {visibleNotifications.map(notification => (
                <div key={notification.id} className="bg-background border border-border text-foreground p-3 rounded-lg shadow-lg flex items-start justify-between animate-in slide-in-from-right duration-300">
                    <div className="flex items-start">
                        <Bell className="h-4 w-4 mr-2 mt-0.5 text-primary" />
                        <p className="text-sm">{notification.message}</p>
                    </div>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0 ml-2 hover:bg-muted"
                        onClick={() => dismissNotification(notification.id)}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            ))}
        </div>
    );
}