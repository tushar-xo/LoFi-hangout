"use client";

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { Bell } from 'lucide-react';

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

    useEffect(() => {
        const notificationsRef = collection(db, 'rooms', roomId, 'notifications');
        const q = query(notificationsRef, orderBy('timestamp', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newNotifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Notification));
            setNotifications(newNotifications);
        });

        return () => unsubscribe();
    }, [roomId]);

    return (
        <div className="absolute top-4 right-4">
            {notifications.map(notification => (
                <div key={notification.id} className="bg-gray-800 text-white p-2 rounded-lg shadow-lg mb-2 flex items-center">
                    <Bell className="h-4 w-4 mr-2" />
                    <p>{notification.message}</p>
                </div>
            ))}
        </div>
    );
}