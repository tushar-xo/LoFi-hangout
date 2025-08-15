"use client";

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { Button } from '@/components/ui/button';

export default function Game() {
    const { sendJsonMessage, lastJsonMessage } = useSocket('game-user');
    const [clickCount, setClickCount] = useState(0);

    useEffect(() => {
        if (lastJsonMessage) {
            const message = lastJsonMessage as any;
            if (message.type === 'click') {
                setClickCount(message.count);
            }
        }
    }, [lastJsonMessage]);

    const handleClick = () => {
        sendJsonMessage({ type: 'click' });
    };

    return (
        <div className="p-4 border rounded-md">
            <h3 className="font-headline text-lg font-semibold mb-2">Clicker Game</h3>
            <p className="text-muted-foreground mb-4">
                Click the button to increase the count for everyone in the room!
            </p>
            <div className="flex items-center gap-4">
                <Button onClick={handleClick}>Click Me</Button>
                <p className="text-2xl font-bold">{clickCount}</p>
            </div>
        </div>
    );
}