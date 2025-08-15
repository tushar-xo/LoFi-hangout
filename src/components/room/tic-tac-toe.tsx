"use client";

import { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Trophy, RefreshCw, X, Circle } from 'lucide-react';

export default function TicTacToe() {
    const { user } = useAuth();
    const { sendJsonMessage, lastJsonMessage } = useSocket(user?.uid || 'Anonymous', 'tic-tac-toe');
    const [board, setBoard] = useState(Array(9).fill(null));
    const [player, setPlayer] = useState('X');
    const [winner, setWinner] = useState<string | null>(null);
    const [isMyTurn, setIsMyTurn] = useState(false);

    useEffect(() => {
        if (lastJsonMessage) {
            const message = lastJsonMessage as any;
            if (message.type === 'gameState') {
                setBoard(message.board);
                setPlayer(message.player);
                setWinner(message.winner);
                setIsMyTurn(message.currentPlayer === user?.uid);
            }
        }
    }, [lastJsonMessage, user?.uid]);

    const handleClick = (index: number) => {
        if (board[index] || winner || !isMyTurn) return;
        sendJsonMessage({ type: 'move', index });
    };

    const handleReset = () => {
        sendJsonMessage({ type: 'reset', gameId: 'tic-tac-toe' });
    };

    const renderSquare = (index: number) => {
        const value = board[index];
        const isWinningSquare = winner && winner !== 'Tie' && 
            (index === 0 || index === 1 || index === 2 || index === 3 || index === 4 || index === 5 || index === 6 || index === 7 || index === 8);
        
        return (
            <button
                key={index}
                className={`w-20 h-20 border-2 border-primary/30 rounded-lg flex items-center justify-center text-3xl font-bold transition-all duration-200 hover:bg-primary/10 ${
                    value ? 'bg-primary/20' : 'hover:bg-primary/5'
                } ${isWinningSquare ? 'bg-green-500/20 border-green-500' : ''}`}
                onClick={() => handleClick(index)}
                disabled={!isMyTurn || !!winner}
            >
                {value === 'X' ? (
                    <X className="w-10 h-10 text-red-500" />
                ) : value === 'O' ? (
                    <Circle className="w-10 h-10 text-blue-500" />
                ) : null}
            </button>
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
                <h3 className="font-headline text-2xl font-bold">Tic-Tac-Toe</h3>
                <Trophy className="w-8 h-8 text-yellow-500" />
            </div>
            
            <div className="mb-6">
                <p className={`text-lg font-medium ${winner ? 'text-green-600' : isMyTurn ? 'text-primary' : 'text-muted-foreground'}`}>
                    {getStatusMessage()}
                </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6 max-w-fit mx-auto">
                {Array.from({ length: 9 }).map((_, i) => renderSquare(i))}
            </div>

            {winner && (
                <div className="space-y-4">
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