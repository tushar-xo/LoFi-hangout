import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/hooks/use-socket";
import { useAuth } from "@/hooks/use-auth";
import { transferAdminToMember } from "@/lib/firebase-client-service";
import { useToast } from "@/hooks/use-toast";
import { Crown, UserCheck } from "lucide-react";

interface PresenceProps {
    members: User[];
    totalMembers: number;
    roomId: string;
    ownerId?: string; // Add ownerId prop
}

export default function Presence({ members, totalMembers, roomId, ownerId }: PresenceProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const { sendJsonMessage } = useSocket(user?.uid || 'Anonymous', roomId);
    const isCurrentUserAdmin = user?.uid === ownerId;

    const handleInvite = (to: string) => {
        sendJsonMessage({ type: 'invite', to });
    };

    const handleTransferAdmin = async (newAdminId: string, newAdminName: string) => {
        if (!isCurrentUserAdmin) {
            toast({
                title: "Permission Denied",
                description: "Only the admin can transfer admin status.",
                variant: "destructive"
            });
            return;
        }

        try {
            await transferAdminToMember(roomId, newAdminId);
            toast({
                title: "Admin Transferred",
                description: `${newAdminName} is now the room admin.`,
            });
        } catch (error) {
            console.error('Error transferring admin:', error);
            toast({
                title: "Transfer Failed",
                description: "Failed to transfer admin status. Please try again.",
                variant: "destructive"
            });
        }
    };

    return (
        <div className="p-3 sm:p-4 rounded-lg glassmorphism">
            <h3 className="font-headline text-base sm:text-lg font-semibold mb-3 sm:mb-4">In The Room ({members?.length || 0} / {totalMembers || 0})</h3>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                <TooltipProvider delayDuration={0}>
                    {members?.map(member => {
                        const isAdmin = member.id === ownerId;
                        return (
                            <Tooltip key={member.id}>
                                <TooltipTrigger asChild>
                                    <div className="relative">
                                        <Avatar className="h-8 w-8 sm:h-12 sm:w-12 border-2 border-primary/50 hover:border-primary/70 transition-colors cursor-pointer">
                                            <AvatarImage src={member.avatarUrl} alt={member.name} data-ai-hint="avatar person" />
                                            <AvatarFallback className="text-xs sm:text-sm">{member.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        {isAdmin && (
                                            <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-1">
                                                <Crown className="h-3 w-3 text-white" />
                                            </div>
                                        )}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent className="bg-popover border border-border/50 p-2 rounded-lg">
                                    <div className="text-center space-y-2">
                                        <div>
                                            <p className="font-medium text-sm">{member.name}</p>
                                            {isAdmin && (
                                                <p className="text-xs text-yellow-600 font-medium">
                                                    <Crown className="h-3 w-3 inline mr-1" />
                                                    Admin
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            {user?.uid !== member.id && (
                                                <Button 
                                                    onClick={() => handleInvite(member.id)} 
                                                    size="sm" 
                                                    className="h-7 px-2 text-xs"
                                                    variant="outline"
                                                >
                                                    Challenge
                                                </Button>
                                            )}
                                            {isCurrentUserAdmin && user?.uid !== member.id && (
                                                <Button 
                                                    onClick={() => handleTransferAdmin(member.id, member.name)} 
                                                    size="sm" 
                                                    className="h-7 px-2 text-xs bg-yellow-600 hover:bg-yellow-700"
                                                >
                                                    <UserCheck className="h-3 w-3 mr-1" />
                                                    Make Admin
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </TooltipProvider>
            </div>
        </div>
    );
}
