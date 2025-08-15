import WebSocket from 'ws';

interface GameState {
    [key: string]: any;
}

interface TicTacToeState {
    board: (string | null)[];
    player: 'X' | 'O';
    winner: 'X' | 'O' | 'Tie' | null;
    players: string[];
}

interface ConnectFourState {
    board: (string | null)[][];
    player: 'Red' | 'Yellow';
    winner: 'Red' | 'Yellow' | 'Tie' | null;
    players: string[];
}

export class GameManager {
    private rooms: { [key: string]: { [key: string]: WebSocket } } = {};
    private gameStates: { [key: string]: GameState } = {};
    private gameInvites: { [key: string]: { from: string, gameId: string, timestamp: number, roomId: string } } = {};
    private pendingInvites: { [key: string]: { [gameId: string]: string[] } } = {}; // Track who's been invited for each game

    constructor() {}

    handleMessage(message: any, uuid: string) {
        console.log(`Game manager received message:`, message);
        
        // Handle video sync messages separately - but don't broadcast since WebSocket server handles it
        if (message.type === 'playbackState' || message.type === 'seekTo' || message.type === 'play' || message.type === 'pause') {
            // Video sync messages are now handled by WebSocket server, just log here
            console.log(`Video sync message handled by WebSocket server:`, message.type);
            return;
        }
        
        const roomId = this.getRoomId(uuid);
        if (!roomId) return;

        switch (message.type) {
            case 'joinQueue':
                this.handleJoinQueue(roomId, uuid, message.gameId);
                break;
            case 'acceptInvite':
                this.handleAcceptInvite(roomId, message.gameId, uuid, message.from);
                break;
            case 'rejectInvite':
                this.handleRejectInvite(roomId, message.gameId, uuid, message.from);
                break;
            case 'cancelInvites':
                this.handleCancelInvites(roomId, message.gameId, uuid);
                break;
            case 'move':
                if (message.gameId === 'tic-tac-toe') {
                    this.handleTicTacToeMove(roomId, message.index, uuid);
                } else if (message.gameId === 'connect-four') {
                    this.handleConnectFourMove(roomId, message.col, uuid);
                }
                break;
            case 'reset':
                if (message.gameId === 'tic-tac-toe') {
                    this.resetTicTacToe(roomId);
                } else if (message.gameId === 'connect-four') {
                    this.resetConnectFour(roomId);
                }
                break;
        }
    }

    addPlayer(roomId: string, userId: string, ws: WebSocket) {
        if (!this.rooms[roomId]) {
            this.rooms[roomId] = {};
        }
        this.rooms[roomId][userId] = ws;
    }

    removePlayer(roomId: string, userId: string) {
        if (this.rooms[roomId]) {
            delete this.rooms[roomId][userId];
        }
    }

    private handleInvite(roomId: string, from: string, to: string) {
        const inviteId = `${roomId}-${from}-${to}`;
        this.gameInvites[inviteId] = { 
            from, 
            gameId: 'default', 
            timestamp: Date.now(),
            roomId 
        };
        this.broadcastGameInvite(roomId, 'gameInvite', { from, to, inviteId });
    }

    private handleJoinQueue(roomId: string, userId: string, gameId: string) {
        console.log(`handleJoinQueue called:`, { roomId, userId, gameId });
        console.log(`Current rooms:`, this.rooms);
        console.log(`Room ${roomId} members:`, this.rooms[roomId]);
        
        // Initialize pending invites for this room/game if not exists
        if (!this.pendingInvites[roomId]) {
            this.pendingInvites[roomId] = {};
        }
        if (!this.pendingInvites[roomId][gameId]) {
            this.pendingInvites[roomId][gameId] = [];
        }

        // Get all room members except the one who initiated the request
        const roomMembers = Object.keys(this.rooms[roomId] || {}).filter(id => id !== userId);
        console.log(`Room members (excluding initiator):`, roomMembers);
        
        if (roomMembers.length === 0) {
            // No other members in the room
            console.log(`No other members in room ${roomId}`);
            return;
        }

        // Create invitation for each room member
        roomMembers.forEach(memberId => {
            const inviteId = `${roomId}-${gameId}-${userId}-${memberId}`;
            this.gameInvites[inviteId] = { 
                from: userId, 
                gameId, 
                timestamp: Date.now(),
                roomId
            };
            
            console.log(`Sending invitation to ${memberId}:`, { inviteId, from: userId, gameId });
            
            // Send invitation to this specific member
            this.sendToPlayer(roomId, memberId, {
                type: 'gameInvite',
                from: userId,
                gameId,
                inviteId,
                timestamp: Date.now()
            });
        });

        // Track who's been invited
        this.pendingInvites[roomId][gameId] = [...roomMembers];
        
        // Send confirmation to the initiator
        this.sendToPlayer(roomId, userId, {
            type: 'inviteSent',
            gameId,
            message: `Game invitations sent to ${roomMembers.length} room members`
        });
        
        console.log(`Invitations sent successfully to ${roomMembers.length} members`);
    }

    private handleAcceptInvite(roomId: string, gameId: string, acceptorId: string, inviterId: string) {
        console.log(`handleAcceptInvite called:`, { roomId, gameId, acceptorId, inviterId });
        const inviteId = `${roomId}-${gameId}-${inviterId}-${acceptorId}`;
        console.log(`Looking for invite with ID:`, inviteId);
        console.log(`Available invites:`, Object.keys(this.gameInvites));
        
        // Check if invitation still exists and is valid
        if (this.gameInvites[inviteId] && 
            this.gameInvites[inviteId].from === inviterId && 
            this.gameInvites[inviteId].gameId === gameId) {
            
            console.log(`Invite found and valid, starting game...`);
            
            // Remove all invitations for this game in this room
            this.clearGameInvites(roomId, gameId);
            
            // Start the game
            const players = [inviterId, acceptorId];
            console.log(`Creating game state for players:`, players);
            
            if (gameId === 'tic-tac-toe') {
                this.gameStates[`${roomId}-${gameId}`] = this.createInitialTicTacToeState(players);
                console.log(`Tic-tac-toe game state created:`, this.gameStates[`${roomId}-${gameId}`]);
            } else if (gameId === 'connect-four') {
                this.gameStates[`${roomId}-${gameId}`] = this.createInitialConnectFourState(players);
                console.log(`Connect-four game state created:`, this.gameStates[`${roomId}-${gameId}`]);
            }
            
            // Broadcast game start to all room members
            console.log(`Broadcasting game start to room ${roomId}`);
            this.broadcastGameUpdate(roomId, gameId, { 
                type: 'gameStart', 
                message: `Game starting for ${gameId}`,
                players 
            });
            this.broadcastGameState(`${roomId}-${gameId}`, gameId);
            console.log(`Game start broadcast completed`);
        } else {
            console.log(`Invite not found or invalid:`, {
                inviteExists: !!this.gameInvites[inviteId],
                inviteData: this.gameInvites[inviteId],
                expectedFrom: inviterId,
                expectedGameId: gameId
            });
        }
    }

    private handleRejectInvite(roomId: string, gameId: string, rejectorId: string, inviterId: string) {
        const inviteId = `${roomId}-${gameId}-${inviterId}-${rejectorId}`;
        
        // Remove this specific invitation
        delete this.gameInvites[inviteId];
        
        // Notify the inviter that this person rejected
        this.sendToPlayer(roomId, inviterId, {
            type: 'inviteRejected',
            gameId,
            from: rejectorId,
            message: `${rejectorId} rejected your game invitation`
        });
        
        // Notify the rejector
        this.sendToPlayer(roomId, rejectorId, {
            type: 'inviteRejected',
            gameId,
            message: 'You rejected the game invitation'
        });
        
        // Check if we should clear all invitations (if no one accepted)
        this.checkAndClearInvites(roomId, gameId);
    }

    private handleCancelInvites(roomId: string, gameId: string, initiatorId: string) {
        // Remove all invitations for this game in this room
        this.clearGameInvites(roomId, gameId);

        // Notify all pending invitees that the invitation was cancelled
        const pendingInvitees = this.pendingInvites[roomId]?.[gameId] || [];
        pendingInvitees.forEach(inviteeId => {
            this.sendToPlayer(roomId, inviteeId, {
                type: 'inviteCancelled',
                gameId,
                from: initiatorId,
                message: `Game invitation for ${gameId} cancelled by ${initiatorId}`
            });
        });

        // Clear pending invites for this game in this room
        if (this.pendingInvites[roomId]) {
            delete this.pendingInvites[roomId][gameId];
        }

        // Notify the initiator that no one accepted
        const initiatorWs = this.rooms[roomId]?.[initiatorId];
        if (initiatorWs) {
            initiatorWs.send(JSON.stringify({
                type: 'noAcceptances',
                gameId,
                message: 'Game invitation cancelled'
            }));
        }
    }

    private clearGameInvites(roomId: string, gameId: string) {
        // Remove all invitations for this game in this room
        Object.keys(this.gameInvites).forEach(inviteId => {
            if (inviteId.startsWith(`${roomId}-${gameId}-`)) {
                delete this.gameInvites[inviteId];
            }
        });
        
        // Clear pending invites
        if (this.pendingInvites[roomId] && this.pendingInvites[roomId][gameId]) {
            delete this.pendingInvites[roomId][gameId];
        }
    }

    private checkAndClearInvites(roomId: string, gameId: string) {
        // Check if there are any remaining valid invitations for this game
        const remainingInvites = Object.values(this.gameInvites).filter(
            invite => invite.roomId === roomId && invite.gameId === gameId
        );
        
        if (remainingInvites.length === 0) {
            // No more invitations, clear pending invites
            if (this.pendingInvites[roomId] && this.pendingInvites[roomId][gameId]) {
                delete this.pendingInvites[roomId][gameId];
            }
            
            // Notify the initiator that no one accepted
            const initiatorId = this.pendingInvites[roomId]?.[gameId]?.[0];
            if (initiatorId) {
                this.sendToPlayer(roomId, initiatorId, {
                    type: 'noAcceptances',
                    gameId,
                    message: 'No one accepted your game invitation'
                });
            }
        }
    }

    private sendToPlayer(roomId: string, playerId: string, message: any) {
        console.log(`sendToPlayer called:`, { roomId, playerId, message });
        const playerWs = this.rooms[roomId]?.[playerId];
        console.log(`Player WebSocket found:`, !!playerWs);
        if (playerWs) {
            try {
                const messageStr = JSON.stringify(message);
                console.log(`Sending message to ${playerId}:`, messageStr);
                playerWs.send(messageStr);
                console.log(`Message sent successfully to ${playerId}`);
            } catch (error) {
                console.error(`Error sending message to ${playerId}:`, error);
            }
        } else {
            console.warn(`Player ${playerId} not found in room ${roomId}`);
        }
    }

    private handleTicTacToeMove(roomId: string, index: number, uuid: string) {
        const gameId = 'tic-tac-toe';
        const gameState = this.gameStates[`${roomId}-${gameId}`] as TicTacToeState;
        if (gameState && gameState.players.includes(uuid) && gameState.player === (gameState.players.indexOf(uuid) === 0 ? 'X' : 'O') && !gameState.board[index] && !gameState.winner) {
            gameState.board[index] = gameState.player;
            gameState.player = gameState.player === 'X' ? 'O' : 'X';
            this.checkWinner(`${roomId}-${gameId}`);
            this.broadcastGameState(`${roomId}-${gameId}`, gameId);
        }
    }

    private resetTicTacToe(roomId: string) {
        const gameId = 'tic-tac-toe';
        const gameState = this.gameStates[`${roomId}-${gameId}`] as TicTacToeState;
        if(gameState){
            this.gameStates[`${roomId}-${gameId}`] = this.createInitialTicTacToeState(gameState.players);
            this.broadcastGameState(`${roomId}-${gameId}`, gameId);
        }
    }

    private createInitialTicTacToeState(players: string[]): TicTacToeState {
        return {
            board: Array(9).fill(null),
            player: 'X',
            winner: null,
            players,
        };
    }

    private handleConnectFourMove(roomId: string, col: number, uuid: string) {
        const gameId = 'connect-four';
        const gameState = this.gameStates[`${roomId}-${gameId}`] as ConnectFourState;
        if (gameState && gameState.players.includes(uuid) && gameState.player === (gameState.players.indexOf(uuid) === 0 ? 'Red' : 'Yellow') && !gameState.winner) {
            for (let r = 5; r >= 0; r--) {
                if (!gameState.board[r][col]) {
                    gameState.board[r][col] = gameState.player;
                    gameState.player = gameState.player === 'Red' ? 'Yellow' : 'Red';
                    this.checkConnectFourWinner(`${roomId}-${gameId}`);
                    this.broadcastGameState(`${roomId}-${gameId}`, gameId);
                    return;
                }
            }
        }
    }

    private resetConnectFour(roomId: string) {
        const gameId = 'connect-four';
        const gameState = this.gameStates[`${roomId}-${gameId}`] as ConnectFourState;
        if (gameState) {
            this.gameStates[`${roomId}-${gameId}`] = this.createInitialConnectFourState(gameState.players);
            this.broadcastGameState(`${roomId}-${gameId}`, gameId);
        }
    }

    private createInitialConnectFourState(players: string[]): ConnectFourState {
        return {
            board: Array(6).fill(Array(7).fill(null)),
            player: 'Red',
            winner: null,
            players,
        };
    }

    private broadcastGameState(gameKey: string, gameId: string) {
        const message = JSON.stringify({ type: 'gameState', gameId, ...this.gameStates[gameKey] });
        const roomId = gameKey.split('-')[0];
        if (this.rooms[roomId]) {
            Object.values(this.rooms[roomId]).forEach(connection => {
                connection.send(message);
            });
        }
    }

    private broadcastVideoSync(roomId: string, message: any, senderId: string) {
        console.log(`broadcastVideoSync called:`, { roomId, messageType: message.type, senderId });
        // Broadcast video sync messages to all players except the sender
        if (this.rooms[roomId]) {
            const players = Object.keys(this.rooms[roomId]);
            console.log(`Broadcasting video sync to ${players.length - 1} players in room ${roomId}`);
            
            Object.entries(this.rooms[roomId]).forEach(([playerId, connection]) => {
                if (playerId !== senderId) {
                    try {
                        const messageStr = JSON.stringify(message);
                        console.log(`Sending video sync to ${playerId}:`, messageStr);
                        connection.send(messageStr);
                        console.log(`Video sync sent successfully to ${playerId}`);
                    } catch (error) {
                        console.error(`Error sending video sync to ${playerId}:`, error);
                    }
                }
            });
        } else {
            console.warn(`Room ${roomId} not found for video sync`);
        }
    }

    private broadcastGameInvite(roomId: string, type: string, payload: any) {
        const message = JSON.stringify({ type, ...payload });
        Object.values(this.rooms[roomId]).forEach(connection => {
            connection.send(message);
        });
    }

    private broadcastGameUpdate(roomId: string, gameId: string, payload: any) {
        console.log(`broadcastGameUpdate called:`, { roomId, gameId, payload });
        const message = JSON.stringify({ type: 'gameUpdate', gameId, ...payload });
        console.log(`Broadcasting message:`, message);
        
        if (this.rooms[roomId]) {
            console.log(`Room ${roomId} has ${Object.keys(this.rooms[roomId]).length} players`);
            Object.values(this.rooms[roomId]).forEach((connection, index) => {
                try {
                    connection.send(message);
                    console.log(`Message sent to player ${index + 1}`);
                } catch (error) {
                    console.error(`Error sending message to player ${index + 1}:`, error);
                }
            });
        } else {
            console.warn(`Room ${roomId} not found in rooms`);
        }
    }

    private getRoomId(uuid: string): string | null {
        for (const [roomId, players] of Object.entries(this.rooms)) {
            if (players[uuid]) {
                return roomId;
            }
        }
        return null;
    }

    private checkWinner(gameKey: string) {
        const gameState = this.gameStates[gameKey] as TicTacToeState;
        const lines = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6],
        ];
        for (let i = 0; i < lines.length; i++) {
            const [a, b, c] = lines[i];
            if (gameState.board[a] && gameState.board[a] === gameState.board[b] && gameState.board[a] === gameState.board[c]) {
                gameState.winner = gameState.board[a] as TicTacToeState['winner'];
                return;
            }
        }
        if (gameState.board.every(square => square !== null)) {
            gameState.winner = 'Tie';
        }
    }

    private checkConnectFourWinner(gameKey: string) {
        const gameState = this.gameStates[gameKey] as ConnectFourState;
        const board = gameState.board;

        // Check horizontal
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c] && board[r][c] === board[r][c + 1] && board[r][c] === board[r][c + 2] && board[r][c] === board[r][c + 3]) {
                    gameState.winner = board[r][c] as ConnectFourState['winner'];
                    return;
                }
            }
        }

        // Check vertical
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 7; c++) {
                if (board[r][c] && board[r][c] === board[r + 1][c] && board[r][c] === board[r + 2][c] && board[r][c] === board[r + 3][c]) {
                    gameState.winner = board[r][c] as ConnectFourState['winner'];
                    return;
                }
            }
        }

        // Check diagonal (down-right)
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c] && board[r][c] === board[r + 1][c + 1] && board[r][c] === board[r + 2][c + 2] && board[r][c] === board[r + 3][c + 3]) {
                    gameState.winner = board[r][c] as ConnectFourState['winner'];
                    return;
                }
            }
        }

        // Check diagonal (up-right)
        for (let r = 3; r < 6; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c] && board[r][c] === board[r - 1][c + 1] && board[r][c] === board[r - 2][c + 2] && board[r][c] === board[r - 3][c + 3]) {
                    gameState.winner = board[r][c] as ConnectFourState['winner'];
                    return;
                }
            }
        }

        if (board.flat().every(square => square !== null)) {
            gameState.winner = 'Tie';
        }
    }
}