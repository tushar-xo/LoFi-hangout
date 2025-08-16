# Lo-Fi Lobby

Lo-Fi Lobby is a social application designed for users to create shared music experiences. Users can create rooms, collectively build a music queue from YouTube, and interact with each other in real-time.

## Features

### User Authentication
- OAuth login with Google
- User profiles with display name and avatar

### Room Management
- Create new rooms with custom names
- Public/Private room options
- Real-time user presence

### Music Queue & Playback
- Add songs from YouTube URLs
- Synchronized playback for all users
- Vote-driven queue system
- Persistent mini-controller for playback control

### Real-time Communication
- Live chat in rooms
- Instantaneous updates for all users

### AI DJ
- Intelligent song selection when room is inactive
- Analyzes room's song history to maintain the vibe

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Firebase account

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/lofi-lobby.git
cd lofi-lobby
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
Create a `.env.local` file with your Firebase configuration:
```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
GEMINI_API_KEY=your-gemini-api-key
```

4. Run the development server
```bash
npm run dev
```

5. Open [http://localhost:9002](http://localhost:9002) in your browser

## Technologies Used

- Next.js 15
- React 18
- Firebase (Authentication, Firestore)
- Tailwind CSS
- Radix UI
- GenKit AI (for AI DJ feature)