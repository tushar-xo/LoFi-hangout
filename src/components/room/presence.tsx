import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/hooks/use-socket";
import { useAuth } from "@/hooks/use-auth";

interface PresenceProps {
    members: User[];
    totalMembers: number;
    roomId: string;
}

export default function Presence({ members, totalMembers, roomId }: PresenceProps) {
    const { user } = useAuth();
    const { sendJsonMessage } = useSocket(user?.uid || 'Anonymous', roomId);

    const handleInvite = (to: string) => {
        sendJsonMessage({ type: 'invite', to });
    };

    return (
        <div className="p-4 rounded-lg glassmorphism">
            <h3 className="font-headline text-lg font-semibold mb-4">In The Room ({members?.length || 0} / {totalMembers || 0})</h3>
            <div className="flex flex-wrap items-center gap-4">
                <TooltipProvider delayDuration={0}>
                    {members?.map(member => (
                        <Tooltip key={member.id}>
                            <TooltipTrigger asChild>
                                <Avatar className="h-12 w-12 border-2 border-primary/50">
                                    <AvatarImage src={member.avatarUrl} alt={member.name} data-ai-hint="avatar person" />
                                    <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{member.name}</p>
                                {user?.uid !== member.id && <Button onClick={() => handleInvite(member.id)} size="sm" className="mt-2">Challenge</Button>}
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </TooltipProvider>
            </div>
        </div>
    );
}
