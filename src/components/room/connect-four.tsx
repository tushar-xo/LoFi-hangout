"use client";

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Trophy, RefreshCw, Circle } from 'lucide-react';

export default function ConnectFour() {
    const { user } = useAuth();
    const { sendJsonMessage, lastJsonMessage } = useSocket(user?.uid || 'Anonymous', 'connect-four');
    const [board, setBoard] = useState(Array(6).fill(Array(7).fill(null)));
    const [player, setPlayer] = useState('Red');
    const [winner, setWinner] = useState<string | null>(null);
    const [isMyTurn, setIsMyTurn] = useState(false);

    useEffect(() => {
        if (lastJsonMessage) {
            const message = lastJsonMessage as any;
            if (message.type === 'gameState' && message.gameId === 'connect-four') {
                setBoard(message.board);
                setPlayer(message.player);
                setWinner(message.winner);
                setIsMyTurn(message.currentPlayer === user?.uid);
            }
        }
    }, [lastJsonMessage, user?.uid]);

    const handleClick = (col: number) => {
        if (winner || !isMyTurn) return;
        sendJsonMessage({ type: 'move', gameId: 'connect-four', col });
    };

    const handleReset = () => {
        sendJsonMessage({ type: 'reset', gameId: 'connect-four' });
    };

    const renderSquare = (row: number, col: number) => {
        const value = board[row][col];
        return (
            <div
                key={`${row}-${col}`}
                className={`w-14 h-14 border-2 border-primary/30 rounded-full flex items-center justify-center transition-all duration-200 hover:bg-primary/5 ${
                    value ? 'bg-primary/10' : ''
                }`}
                onClick={() => handleClick(col)}
            >
                {value && (
                    <div 
                        className={`w-12 h-12 rounded-full shadow-lg transition-all duration-300 ${
                            value === 'Red' 
                                ? 'bg-gradient-to-br from-red-400 to-red-600 shadow-red-500/50' 
                                : 'bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-yellow-500/50'
                        }`}
                    />
                )}
            </div>
        );
    };

    const getStatusMessage = () => {
        if (winner === 'Tie') return "It's a tie!";
        if (winner) return `Player ${winner} wins! 🎉`;
        if (!isMyTurn) return "Waiting for opponent...";
        return `Your turn (${player})`;
    };

    return (
        <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
                <Trophy className="w-8 h-8 text-yellow-500" />
                <h3 className="font-headline text-2xl font-bold">Connect Four</h3>
                <Trophy className="w-8 h-8 text-yellow-500" />
            </div>
            
            <div className="mb-6">
                <p className={`text-lg font-medium ${winner ? 'text-green-600' : isMyTurn ? 'text-primary' : 'text-muted-foreground'}`}>
                    {getStatusMessage()}
                </p>
            </div>

            <div className="bg-blue-600/20 p-4 rounded-2xl border-2 border-blue-500/30 max-w-fit mx-auto">
                <div className="grid grid-cols-7 gap-1">
                    {board.map((row, r) => row.map((_, c) => renderSquare(r, c)))}
                </div>
            </div>

            {winner && (
                <div className="mt-6 space-y-4">
                    <Button 
                        onClick={handleReset} 
                        className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 px-8 py-3 text-lg font-semibold"
                    >
                        <RefreshCw className="w-5 h-5 mr-2" />
                        Play Again
                    </Button>
                </div>
            )}
        </div>
    );
}