import { NextRequest, NextResponse } from 'next/server';
import { removeMemberFromRoom } from '@/lib/firebase-client-service';

export async function POST(request: NextRequest) {
    try {
        const { roomId, userId } = await request.json();
        
        if (!roomId || !userId) {
            return NextResponse.json({ error: 'Missing roomId or userId' }, { status: 400 });
        }
        
        await removeMemberFromRoom(roomId, userId);
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in leave-room API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get('roomId');
        const userId = searchParams.get('userId');
        
        if (!roomId || !userId) {
            return NextResponse.json({ error: 'Missing roomId or userId' }, { status: 400 });
        }
        
        await removeMemberFromRoom(roomId, userId);
        
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in leave-room API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
