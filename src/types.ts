export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  status: 'online' | 'offline' | 'away';
  statusMessage?: string;
  x: number;
  y: number;
  room: string;
  lastSeen: number;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing?: boolean;
  peerId?: string;
  focusArea?: { x: number; y: number; width: number; height: number; } | null;
  ping?: { timestamp: number, fromName: string, fromUid: string };
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  room: string;
}

export interface Room {
  id: string;
  name: string;
  type: 'public' | 'private' | 'desk';
  layout: {
    width: number;
    height: number;
    walls: { x: number; y: number; width: number; height: number }[];
    desks: { x: number; y: number; width: number; height: number; ownerId?: string }[];
    privacyZones: { x: number; y: number; width: number; height: number; id: string }[];
  };
}
