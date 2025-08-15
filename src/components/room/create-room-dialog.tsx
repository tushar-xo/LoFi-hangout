'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle, Music, Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { createRoom } from "@/lib/server-actions";
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/lib/types";

interface CreateRoomDialogProps {
  user: User | null;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function CreateRoomDialog({ user, disabled, children }: CreateRoomDialogProps) {
  const [open, setOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { toast } = useToast();

  const handleCreateRoom = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to create a room.",
        variant: "destructive"
      });
      return;
    }

    if (!roomName.trim()) {
      setError('Please enter a room name');
      return;
    }

    if (isPrivate && !password.trim()) {
      setError('Please enter a password for private room');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Create room directly using client-side Firebase
      const slug = roomName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      const roomData: any = {
        name: roomName,
        slug: slug,
        isPrivate: isPrivate,
        imageUrl: '',
        members: [{
          id: user.id,
          name: user.name,
          avatarUrl: user.avatarUrl
        }],
        queue: [],
        ownerId: user.id,
        totalMembers: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Only add password if room is private
      if (isPrivate && password.trim()) {
        roomData.password = password;
      }

      const docRef = await addDoc(collection(db, 'rooms'), roomData);
      
      toast({
        title: "Room created!",
        description: `Your room "${roomName}" is ready to rock!`,
      });
      setOpen(false);
      setRoomName('');
      setIsPrivate(false);
      setPassword('');
      router.push(`/rooms/${slug}`);
    } catch (error) {
      console.error("Error creating room:", error);
      setError('Failed to create room. Please try again.');
      toast({
        title: "Error",
        description: "Failed to create room. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button disabled={disabled} className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium px-6 py-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
            <PlusCircle className="mr-2 h-5 w-5" />
            Create Room
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 shadow-2xl rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white flex items-center">
            <Music className="h-6 w-6 mr-2 text-purple-400" />
            Create a New Room
          </DialogTitle>
          <div>
            <DialogDescription className="text-gray-400">
              Set up your music room and invite friends to join the party!
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-white">
              Room Name
            </Label>
            <Input
              id="name"
              placeholder="Enter an awesome room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white focus:ring-purple-500 focus:border-purple-500"
            />
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="private"
              checked={isPrivate}
              onCheckedChange={(checked) => setIsPrivate(checked === true)}
            />
            <Label htmlFor="private" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-white">
              <Lock className="inline w-4 h-4 mr-1" />
              Make room private
            </Label>
          </div>
          
          {isPrivate && (
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">Room Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter room password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white focus:ring-purple-500 focus:border-purple-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button 
            onClick={handleCreateRoom} 
            disabled={isLoading || !roomName.trim() || (isPrivate && !password.trim())}
            className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium py-2 rounded-full shadow-lg transition-all duration-300"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Room'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}