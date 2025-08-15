"use client";

import { useState, useEffect } from 'react';
import TicTacToe from './tic-tac-toe';
import ConnectFour from './connect-four';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSocket } from '@/hooks/use-socket';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

const games = [
    { id: 'tic-tac-toe', name: 'Tic-Tac-Toe', component: TicTacToe, players: 2 },
    { id: 'connect-four', name: 'Connect Four', component: ConnectFour, players: 2 },
    // Add more games here
];

interface GameLobbyProps {
    roomId: string;
    activeGame?: { gameId: string; players: string[] } | null;
    onGameStart?: (gameId: string) => void;
}

export default function GameLobby({ roomId, activeGame, onGameStart }: GameLobbyProps) {
    const [selectedGame, setSelectedGame] = useState<string | null>(null);
    const [inviteStatus, setInviteStatus] = useState<{ status: string; gameId: string } | null>(null);
    const { user } = useAuth();
    const { toast } = useToast();
    const { sendJsonMessage, lastJsonMessage } = useSocket(user?.uid || 'anonymous', roomId);

    // Update selected game when activeGame changes
    useEffect(() => {
        if (activeGame) {
            setSelectedGame(activeGame.gameId);
            setInviteStatus(null); // Clear invite status when game starts
        }
    }, [activeGame]);

    // Listen for invitation responses
    useEffect(() => {
        if (lastJsonMessage) {
            const message = lastJsonMessage as any;
            if (message.type === 'inviteSent') {
                setInviteStatus({ status: 'sent', gameId: message.gameId });
                toast({
                    title: "Invitations Sent!",
                    description: message.message,
                });
            } else if (message.type === 'inviteRejected') {
                if (message.from) {
                    // Someone rejected your invitation
                    toast({
                        title: "Invitation Rejected",
                        description: message.message,
                    });
                } else {
                    // You rejected an invitation
                    setInviteStatus(null);
                }
            } else if (message.type === 'noAcceptances') {
                setInviteStatus(null);
                toast({
                    title: "No Acceptances",
                    description: message.message,
                });
            } else if (message.type === 'gameStart') {
                setInviteStatus(null);
                toast({
                    title: "Game Starting!",
                    description: message.message,
                });
            }
        }
    }, [lastJsonMessage, toast]);

    const handleJoinQueue = (gameId: string) => {
        if (inviteStatus?.status === 'sent') {
            // Already sent invitations
            return;
        }
        
        sendJsonMessage({ type: 'joinQueue', gameId });
        setInviteStatus({ status: 'sent', gameId });
        toast({
            title: "Sending Invitations!",
            description: `Sending game invitations to all room members...`,
        });
    };

    const handleCancelInvites = () => {
        if (inviteStatus?.status === 'sent') {
            // Send cancel message to backend
            sendJsonMessage({ type: 'cancelInvites', gameId: inviteStatus.gameId });
            setInviteStatus(null);
            toast({
                title: "Invitations Cancelled",
                description: "Game invitations have been cancelled.",
            });
        }
    };

    const GameComponent = games.find(g => g.id === selectedGame)?.component;

    return (
        <div className="p-4">
            {!selectedGame ? (
                <div>
                    <h3 className="font-headline text-2xl font-bold mb-6 text-center">Game Lobby</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                        {games.map(game => (
                            <Card key={game.id} className="hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/20">
                                <CardHeader className="text-center pb-4">
                                    <CardTitle className="text-xl font-bold">{game.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="text-center">
                                    <div className="flex items-center justify-center gap-2 mb-4">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <p className="text-sm text-muted-foreground">{game.players} players</p>
                                    </div>
                                    {inviteStatus?.status === 'sent' && inviteStatus.gameId === game.id ? (
                                        <div className="mt-4 space-y-3">
                                            <div className="flex items-center justify-center gap-2 text-blue-600">
                                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                                <p className="text-sm font-medium">Invitations sent! Waiting for responses...</p>
                                            </div>
                                            <Button 
                                                variant="outline" 
                                                onClick={handleCancelInvites}
                                                className="w-full">
                                                Cancel Invitations
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button 
                                            onClick={() => handleJoinQueue(game.id)} 
                                            className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all duration-200 shadow-lg hover:shadow-xl"
                                            disabled={inviteStatus?.status === 'sent'}>
                                            🎮 Send Game Invitations
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            ) : (
                <div>
                    <div className="flex justify-between items-center mb-6">
                        <Button 
                            variant="outline" 
                            onClick={() => setSelectedGame(null)}
                            className="flex items-center gap-2">
                            ← Back to Lobby
                        </Button>
                        {activeGame && (
                            <Button 
                                variant="destructive" 
                                onClick={() => {
                                    setSelectedGame(null);
                                    setInviteStatus(null);
                                    // Send reset message to backend
                                    sendJsonMessage({ type: 'reset', gameId: activeGame.gameId });
                                }}
                                className="flex items-center gap-2">
                                Reset Game
                            </Button>
                        )}
                    </div>
                    <div className="bg-muted/20 rounded-lg p-6 border-2 border-primary/10">
                        {GameComponent && <GameComponent />}
                    </div>
                </div>
            )}
        </div>
    );
}