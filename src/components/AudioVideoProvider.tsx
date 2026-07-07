import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { UserProfile } from '../types';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

interface AudioVideoContextType {
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>; // peerId -> MediaStream
  startMedia: (audio: boolean, video: boolean) => Promise<void>;
  stopMedia: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  peerId: string | null;
}

const AudioVideoContext = createContext<AudioVideoContextType>({
  cameraStream: null,
  screenStream: null,
  remoteStreams: {},
  startMedia: async () => {},
  stopMedia: () => {},
  startScreenShare: async () => {},
  stopScreenShare: () => {},
  peerId: null,
});

export const useAudioVideo = () => useContext(AudioVideoContext);

export function AudioVideoProvider({ children, currentUser, otherUsers }: { children: React.ReactNode, currentUser: UserProfile | null, otherUsers: UserProfile[] }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null); // To replace video track
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [peerId, setPeerId] = useState<string | null>(null);
  
  const peerRef = useRef<Peer | null>(null);
  const callsRef = useRef<Record<string, MediaConnection>>({});

  // Initialize Peer
  useEffect(() => {
    if (!currentUser) return;
    
    const peer = new Peer();
    
    peer.on('open', (id) => {
      setPeerId(id);
      // Update our firestore profile with this peerId
      setDoc(doc(db, 'users', currentUser.uid), { peerId: id }, { merge: true });
    });

    peer.on('call', (call) => {
      // Answer the call with an A/V stream.
      call.answer(localStream || undefined);
      
      call.on('stream', (remoteStream) => {
        setRemoteStreams(prev => ({ ...prev, [call.peer]: remoteStream }));
      });
      
      call.on('close', () => {
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[call.peer];
          return next;
        });
      });
      
      call.on('error', (err) => console.log('Call error', err));
      callsRef.current[call.peer] = call;
    });

    peerRef.current = peer;

    return () => {
      peer.destroy();
      peerRef.current = null;
    };
  }, [currentUser?.uid]); // Only restart peer if user changes completely

  const replaceStreamTracks = (newStream: MediaStream | null) => {
    Object.values(callsRef.current).forEach(call => {
      const senderAudio = call.peerConnection?.getSenders().find(s => s.track?.kind === 'audio');
      const senderVideo = call.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
      
      if (newStream) {
        const newAudio = newStream.getAudioTracks()[0];
        const newVideo = newStream.getVideoTracks()[0];
        if (newAudio && senderAudio) senderAudio.replaceTrack(newAudio);
        if (newVideo && senderVideo) senderVideo.replaceTrack(newVideo);
      }
    });
  };

  const startMedia = async (audio: boolean, video: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
      setLocalStream(stream);
      replaceStreamTracks(stream);
    } catch (err) {
      console.error("Failed to get local stream", err);
    }
  };

  const stopMedia = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenStream(stream);
      
      // Combine screen video with current audio if exists
      const newStream = new MediaStream();
      if (localStream && localStream.getAudioTracks().length > 0) {
        newStream.addTrack(localStream.getAudioTracks()[0]);
      }
      newStream.addTrack(stream.getVideoTracks()[0]);
      
      replaceStreamTracks(newStream);

      // Handle user stopping screen share via browser UI
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
        if (currentUser) {
          setDoc(doc(db, 'users', currentUser.uid), { isScreenSharing: false }, { merge: true });
        }
      };
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        console.warn("Screen share cancelled by user.");
      } else {
        console.error("Failed to share screen", err);
      }
      if (currentUser) {
        setDoc(doc(db, 'users', currentUser.uid), { isScreenSharing: false }, { merge: true });
      }
    }
  };

  const stopScreenShare = () => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      // Revert to camera video if we had it
      replaceStreamTracks(localStream);
    }
  };

  // Manage connections to others
  useEffect(() => {
    if (!peerRef.current || !currentUser) return;
    
    // We should connect to users who are in the same room OR nearby (handled by caller logic if we wanted ambient proximity)
    // For simplicity, let's connect to ALL other users in the workspace who have a peerId.
    // The proximity / room logic can be handled at the audio rendering side by muting them if they are too far.
    // However, to save bandwidth, we could only connect when in range.
    // Let's just connect to everyone for now.
    
    otherUsers.forEach(otherUser => {
      if (otherUser.peerId && otherUser.peerId !== peerId) {
        // To avoid duplicate connections, the peer with smaller UID initiates the call
        if (currentUser.uid < otherUser.uid && !callsRef.current[otherUser.peerId]) {
          const call = peerRef.current.call(otherUser.peerId, localStream || undefined);
          if (call) {
             call.on('stream', (remoteStream) => {
                setRemoteStreams(prev => ({ ...prev, [otherUser.peerId!]: remoteStream }));
             });
             call.on('close', () => {
                setRemoteStreams(prev => {
                  const next = { ...prev };
                  delete next[otherUser.peerId!];
                  return next;
                });
                delete callsRef.current[otherUser.peerId!];
             });
             call.on('error', (err) => console.log('Call error', err));
             callsRef.current[otherUser.peerId] = call;
          }
        }
      }
    });
  }, [otherUsers, currentUser, peerId, localStream]);

  // Clean up dropped users
  useEffect(() => {
    const currentPeerIds = new Set(otherUsers.map(u => u.peerId).filter(Boolean));
    Object.keys(callsRef.current).forEach(peerId => {
      if (!currentPeerIds.has(peerId)) {
        callsRef.current[peerId].close();
        delete callsRef.current[peerId];
      }
    });
  }, [otherUsers]);

  return (
    <AudioVideoContext.Provider value={{ cameraStream: localStream, screenStream, remoteStreams, startMedia, stopMedia, startScreenShare, stopScreenShare, peerId }}>
      {children}
    </AudioVideoContext.Provider>
  );
}
