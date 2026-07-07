import React, { useEffect, useRef, useState } from 'react';
import { useAudioVideo } from './AudioVideoProvider';
import { UserProfile } from '../types';

export default function MediaRenderer({ currentUser, allUsers, isDeafened = false }: { currentUser: UserProfile, allUsers: UserProfile[], isDeafened?: boolean }) {
  const { remoteStreams } = useAudioVideo();

  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
      {Object.entries(remoteStreams).map(([peerId, stream]) => {
        const user = allUsers.find(u => u.peerId === peerId);
        if (!user || user.uid === currentUser.uid) return null;

        return (
           <RemoteMedia 
             key={peerId} 
             stream={stream} 
             currentUser={currentUser} 
             peerUser={user} 
             isDeafened={isDeafened}
           />
        );
      })}
    </div>
  );
}

function RemoteMedia({ stream, currentUser, peerUser, isDeafened }: { stream: MediaStream, currentUser: UserProfile, peerUser: UserProfile, isDeafened: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Calculate distance
  const distance = Math.sqrt(Math.pow(peerUser.x - currentUser.x, 2) + Math.pow(peerUser.y - currentUser.y, 2));
  const inRoom = currentUser.room === peerUser.room;
  
  // They are in range if they are in the same room AND (they are in a private/desk room OR they are within PROXIMITY_RADIUS)
  // Let's use 150 as proximity radius (same as VirtualWorkspace)
  const isNearby = inRoom && (distance < 150 || currentUser.room !== 'main');

  // Set volume based on proximity
  useEffect(() => {
    if (audioRef.current) {
        if (isDeafened || !isNearby || peerUser.isMuted) {
            audioRef.current.volume = 0;
        } else if (currentUser.room !== 'main') {
            audioRef.current.volume = 1; // Full volume in private rooms
        } else {
            // Fade out in public room based on distance
            const targetVol = Math.max(0, 1 - (distance / 150));
            audioRef.current.volume = targetVol;
        }
    }
  }, [distance, inRoom, currentUser.room, isNearby, isDeafened, peerUser.isMuted]);

  useEffect(() => {
    if (videoRef.current && stream && stream.getVideoTracks().length > 0) {
      videoRef.current.srcObject = stream;
    }
    if (audioRef.current && stream && stream.getAudioTracks().length > 0) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream.getVideoTracks().length > 0;

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline />
      {/* If sharing screen or video and nearby, snap a small video pip on screen */}
      {hasVideo && isNearby && (
         <div 
           className="absolute bg-zinc-900 border-2 rounded-xl overflow-hidden shadow-xl"
           style={{
             borderColor: peerUser.isScreenSharing ? '#10b981' : '#3f3f46',
             width: peerUser.isScreenSharing ? 400 : 150,
             left: peerUser.isScreenSharing ? '50%' : peerUser.x + 20,
             top: peerUser.isScreenSharing ? '15%' : peerUser.y - 80,
             transform: peerUser.isScreenSharing ? 'translate(-50%, 0)' : 'none',
             transition: 'all 0.3s ease'
           }}
         >
            <div className="bg-zinc-950 px-2 py-1 text-[10px] text-zinc-400 font-semibold flex justify-between items-center">
              <span>{peerUser.displayName}</span>
              {peerUser.isScreenSharing && <span className="text-emerald-500">Screen</span>}
            </div>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className={`w-full h-full ${peerUser.isScreenSharing ? 'object-contain' : 'object-cover'}`} 
              style={{ maxHeight: peerUser.isScreenSharing ? 300 : 100 }}
            />
         </div>
      )}
    </>
  );
}
