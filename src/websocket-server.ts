import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import url from 'url';
import { GameManager } from './lib/game-manager';

const server = http.createServer();
const wsServer = new WebSocketServer({ server });

const port = 8000;
const connections: { [key: string]: WebSocket } = {};
const users: { [key: string]: any } = {};
const gameManager = new GameManager();

wsServer.on('connection', (connection: WebSocket, request) => {
    const query = url.parse(request.url || '', true).query;
    const username = Array.isArray(query.username) ? query.username[0] : query.username;
    const roomId = Array.isArray(query.roomId) ? query.roomId[0] : query.roomId;

    if (!username || !roomId || typeof roomId !== 'string') {
        console.log('Connection rejected:', { username, roomId, url: request.url });
        connection.close(1008, 'Username and roomId are required.');
        return;
    }

    console.log(`${username} connected to room ${roomId}`);
    const uuid = username; // Use the actual user ID instead of generating a new UUID
    connections[uuid] = connection;
    users[uuid] = {
        username,
        roomId,
    };

    gameManager.addPlayer(roomId, uuid, connection);

    connection.on('message', (message: Buffer) => {
        try {
            const parsedMessage = JSON.parse(message.toString());
            console.log('Received message:', parsedMessage);
            
            // Handle video sync messages by broadcasting to all connections in the room
            if (parsedMessage.type === 'playbackState' || parsedMessage.type === 'seekTo' || parsedMessage.type === 'play' || parsedMessage.type === 'pause') {
                const roomId = users[uuid]?.roomId;
                if (roomId) {
                    // Broadcast to all connections in the room
                    Object.entries(connections).forEach(([userId, conn]) => {
                        if (users[userId]?.roomId === roomId) {
                            try {
                                conn.send(JSON.stringify(parsedMessage));
                                console.log(`Broadcasted ${parsedMessage.type} to ${userId}`);
                            } catch (error) {
                                console.error(`Error broadcasting to ${userId}:`, error);
                            }
                        }
                    });
                }
            }
            
            // Handle test messages
            if (parsedMessage.type === 'test') {
                console.log(`Test message received from ${uuid}:`, parsedMessage.message);
                // Send back a test response
                connection.send(JSON.stringify({ type: 'testResponse', message: 'Test response received' }));
            }
            
            // Also handle through game manager for game-specific logic
            gameManager.handleMessage(parsedMessage, uuid);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    connection.on('close', () => {
        console.log(`${username} disconnected from room ${roomId}`);
        gameManager.removePlayer(roomId, uuid);
        delete connections[uuid];
        delete users[uuid];
    });
});

server.listen(port, () => {
    console.log(`WebSocket server is running on port ${port}`);
});