import useWebSocket, { ReadyState } from 'react-use-websocket';
import { useEffect, useState } from 'react';

const WS_URL = 'ws://127.0.0.1:8000';

export function useSocket(username: string | undefined, roomId: string | undefined) {
    const [socketUrl, setSocketUrl] = useState<string | null>(null);

    useEffect(() => {
        console.log('useSocket effect:', { username, roomId });
        if (username && roomId && typeof username === 'string' && typeof roomId === 'string') {
            // Connect to the game manager's WebSocket server
            const url = `${WS_URL}?username=${encodeURIComponent(username)}&roomId=${encodeURIComponent(roomId)}`;
            console.log('Setting socket URL:', url);
            setSocketUrl(url);
        } else {
            console.log('Missing username or roomId:', { username, roomId });
            setSocketUrl(null);
        }
    }, [username, roomId]);

    const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket(
        socketUrl,
        {
            share: false,
            shouldReconnect: () => true,
            retryOnError: true,
            reconnectAttempts: 5,
            reconnectInterval: 3000,
            onMessage: (event) => {
                console.log('useSocket received raw message:', event.data);
            },
            onOpen: () => {
                console.log('useSocket WebSocket opened successfully to:', socketUrl);
            },
            onClose: (event) => {
                console.log('useSocket WebSocket closed:', event.code, event.reason);
            },
            onError: (error) => {
                console.error('useSocket WebSocket error:', error);
            }
        },
    );

    useEffect(() => {
        console.log('WebSocket readyState changed:', readyState, 'for URL:', socketUrl);
        if (readyState === ReadyState.OPEN) {
            console.log('WebSocket connected successfully to game manager');
        } else if (readyState === ReadyState.CLOSED) {
            console.log('WebSocket connection closed');
        } else if (readyState === ReadyState.CONNECTING) {
            console.log('WebSocket connecting...');
        }
    }, [readyState, socketUrl]);

    // Log every message received for debugging
    useEffect(() => {
        if (lastJsonMessage) {
            console.log('useSocket lastJsonMessage updated:', lastJsonMessage);
        }
    }, [lastJsonMessage]);

    // Remove the subscribe message since we're now using the game manager's WebSocket
    // The game manager automatically handles all message types including video sync

    return { sendJsonMessage, lastJsonMessage, readyState };
}