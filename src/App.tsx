import React, { useState, useEffect, useCallback } from 'react';
import { auth, db, googleProvider, signInWithPopup, onAuthStateChanged, handleFirestoreError, OperationType } from './firebase';
import { doc, setDoc, onSnapshot, collection, query, where, orderBy, limit, serverTimestamp, Timestamp } from 'firebase/firestore';
import { UserProfile, Room, Message } from './types';
import { LogIn, LogOut, User, MessageSquare, Video, Mic, MicOff, VideoOff, Settings, Users, Menu, X, Map as MapIcon, MonitorUp, Volume2, VolumeX, BellRing } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import VirtualWorkspace from './components/VirtualWorkspace';
import Chat from './components/Chat';
import { AudioVideoProvider, useAudioVideo } from './components/AudioVideoProvider';
import MediaRenderer from './components/MediaRenderer';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'workspace' | 'chat'>('workspace');
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'workspace' | 'sidebar'>('workspace');

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous profile listener if it exists
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Listen to user profile
        unsubProfile = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUser(snapshot.data() as UserProfile);
          } else {
            // Initialize user profile
            const newUser: UserProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'Anonymous',
              photoURL: firebaseUser.photoURL || undefined,
              status: 'online',
              x: 400,
              y: 300,
              room: 'main',
              lastSeen: Date.now(),
              isMuted: true,
              isVideoOff: true,
              isScreenSharing: false,
            };
            setDoc(userRef, newUser).catch(err => handleFirestoreError(err, OperationType.WRITE, 'users'));
          }
          setLoading(false);
        }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, []);

  useEffect(() => {
    // Rules require auth for reads; subscribing while signed out kills the
    // listener with permission-denied and it never recovers.
    if (!user) {
      setAllUsers([]);
      return;
    }
    const q = query(collection(db, 'users'), where('status', '==', 'online'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data() as UserProfile);
      setAllUsers(users);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    return () => unsubscribe();
  }, [user?.uid]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      if (user) {
        await setDoc(doc(db, 'users', user.uid), { status: 'offline' }, { merge: true });
      }
      await auth.signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const toggleMute = () => {
    if (user) {
      const newState = !user.isMuted;
      setIsMuted(newState);
      setDoc(doc(db, 'users', user.uid), { isMuted: newState }, { merge: true });
    }
  };

  const toggleVideo = () => {
    if (user) {
      const newState = !user.isVideoOff;
      setIsVideoOff(newState);
      setDoc(doc(db, 'users', user.uid), { isVideoOff: newState }, { merge: true });
    }
  };

  const toggleScreenShare = () => {
    if (user) {
      const newState = !user.isScreenSharing;
      setDoc(doc(db, 'users', user.uid), { isScreenSharing: newState }, { merge: true });
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-100 font-sans">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 font-sans p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-2">
            <h1 className="text-5xl font-bold tracking-tight text-emerald-500">GatherSpace</h1>
            <p className="text-zinc-400">Your virtual remote office. Connect, collaborate, and co-work in real-time.</p>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={handleLogin}
              className="flex items-center justify-center gap-3 bg-zinc-100 text-zinc-950 font-semibold py-4 px-6 rounded-2xl hover:bg-zinc-200 transition-all shadow-lg shadow-emerald-500/10"
            >
              <LogIn className="w-5 h-5" />
              Sign in with Google
            </button>
          </div>

          <div className="pt-8 border-t border-zinc-800 grid grid-cols-3 gap-4 text-xs text-zinc-500 uppercase tracking-widest font-semibold">
            <div className="flex flex-col items-center gap-2">
              <Users className="w-4 h-4" />
              <span>Presence</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Video className="w-4 h-4" />
              <span>Video</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span>Chat</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <AudioVideoProvider currentUser={user} otherUsers={allUsers.filter(u => u.uid !== user.uid)}>
      <AppContent user={user} allUsers={allUsers} handleLogout={handleLogout} toggleMute={toggleMute} toggleVideo={toggleVideo} toggleScreenShare={toggleScreenShare} />
    </AudioVideoProvider>
  );
}

function AppContent({ user, allUsers, handleLogout, toggleMute, toggleVideo, toggleScreenShare }: any) {
  const [activeTab, setActiveTab] = useState<'workspace' | 'chat'>('workspace');
  const [mobileView, setMobileView] = useState<'workspace' | 'sidebar'>('workspace');
  const [isDeafened, setIsDeafened] = useState(false);
  const { startMedia, stopMedia, startScreenShare, stopScreenShare, cameraStream, screenStream } = useAudioVideo();

  // Handle stream state changes via UI buttons
  const isMuted = user.isMuted;
  const isVideoOff = user.isVideoOff;
  const isScreenSharing = user.isScreenSharing;

  useEffect(() => {
    // Sync local media when toggled
    if (!isMuted || !isVideoOff) {
       startMedia(!isMuted, !isVideoOff);
    } else {
       stopMedia();
    }
  }, [isMuted, isVideoOff]);

  useEffect(() => {
     if (isScreenSharing) {
        startScreenShare();
     } else {
        stopScreenShare();
     }
  }, [isScreenSharing]);

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-6 shrink-0 bg-zinc-950/50 backdrop-blur-md z-30">
        <div className="flex items-center gap-2 md:gap-4">
          <h1 className="text-lg md:text-xl font-bold text-emerald-500 tracking-tight">GatherSpace</h1>
          <div className="hidden md:block h-4 w-px bg-zinc-800" />
          <div className="hidden md:flex items-center gap-2 text-sm text-zinc-400">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{user.room} Room</span>
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest">
            <Users className="w-3 h-3" />
            <NearbyCount user={user} allUsers={allUsers} />
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex items-center gap-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
            <button
              onClick={() => setIsDeafened(!isDeafened)}
              className={`p-1.5 md:p-2 rounded-lg transition-colors ${isDeafened ? 'text-red-500/80 bg-red-500/10 hover:bg-red-500/20' : 'text-emerald-500 bg-emerald-500/10'}`}
              title="Deafen (Mute All Others)"
            >
              {isDeafened ? <VolumeX className="w-4 h-4 md:w-5 md:h-5" /> : <Volume2 className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
            <div className="w-px h-6 bg-zinc-800 mx-1 hidden md:block" />
            <button
              onClick={toggleMute}
              className={`p-1.5 md:p-2 rounded-lg transition-colors ${!isMuted ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500/80 bg-red-500/10 hover:bg-red-500/20'}`}
            >
              {isMuted ? <MicOff className="w-4 h-4 md:w-5 md:h-5" /> : <Mic className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
            <button
              onClick={toggleVideo}
              className={`p-1.5 md:p-2 rounded-lg transition-colors ${!isVideoOff ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500/80 bg-red-500/10 hover:bg-red-500/20'}`}
            >
              {isVideoOff ? <VideoOff className="w-4 h-4 md:w-5 md:h-5" /> : <Video className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
            <div className="w-px h-6 bg-zinc-800 mx-1 hidden md:block" />
            <button
              onClick={toggleScreenShare}
              className={`p-1.5 md:p-2 rounded-lg transition-colors ${user.isScreenSharing ? 'text-emerald-500 bg-emerald-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
              title="Toggle Screen Share"
            >
              <MonitorUp className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-800 mx-0.5 md:mx-1" />

          <div className="flex items-center gap-2 md:gap-3 pl-1 md:pl-2">
            <div className="text-right hidden lg:block">
              <div className="text-sm font-semibold">{user.displayName}</div>
              <div className="text-xs text-emerald-500">Online</div>
            </div>
            <img
              src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`}
              alt={user.displayName}
              className="w-8 h-8 md:w-10 md:h-10 rounded-xl border border-zinc-800 z-10"
            />
            <button
              onClick={handleLogout}
              className="p-1.5 md:p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        <MediaRenderer currentUser={user} allUsers={allUsers} isDeafened={isDeafened} />
        <div className={`flex-1 relative bg-zinc-900 ${mobileView === 'sidebar' ? 'hidden md:block' : 'block'}`}>
          <VirtualWorkspace user={user} allUsers={allUsers} />
          <LocalMedia cameraStream={cameraStream} screenStream={screenStream} isScreenSharing={isScreenSharing} />
        </div>

        {/* Sidebar / Chat */}
        <aside className={`
          ${mobileView === 'sidebar' ? 'flex' : 'hidden md:flex'}
          w-full md:w-80 border-l border-zinc-800 bg-zinc-950 flex-col shrink-0 z-10
        `}>
          <div className="flex border-b border-zinc-800">
            <button
              onClick={() => setActiveTab('workspace')}
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'workspace' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              People
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'chat' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Chat
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === 'workspace' ? (
              <PeopleList currentUser={user} allUsers={allUsers} />
            ) : (
              <Chat user={user} />
            )}
          </div>
        </aside>


        {/* Mobile Navigation */}
        <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 p-2 rounded-2xl shadow-2xl z-30">
          <button
            onClick={() => setMobileView('workspace')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${mobileView === 'workspace' ? 'bg-emerald-500 text-white font-bold' : 'text-zinc-400 hover:bg-zinc-900'}`}
          >
            <MapIcon className="w-5 h-5" />
            <span className="text-xs uppercase tracking-widest">Office</span>
          </button>
          <div className="w-px h-6 bg-zinc-800" />
          <button
            onClick={() => setMobileView('sidebar')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${mobileView === 'sidebar' ? 'bg-emerald-500 text-white font-bold' : 'text-zinc-400 hover:bg-zinc-900'}`}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-xs uppercase tracking-widest">Social</span>
          </button>
        </div>
      </main>
    </div>
  );
}

function NearbyCount({ user, allUsers }: { user: UserProfile, allUsers: UserProfile[] }) {
  const nearby = allUsers.filter(u => {
    if (u.uid === user.uid) return false;
    const distance = Math.sqrt(Math.pow(u.x - user.x, 2) + Math.pow(u.y - user.y, 2));
    return (u.room === user.room) && (distance < 150 || user.room !== 'main');
  });

  return <span>{nearby.length} Nearby</span>;
}

function DraggableVideo({ 
  stream, 
  title, 
  isScreen, 
  initialPosition 
}: { 
  stream: MediaStream, 
  title: string, 
  isScreen?: boolean,
  initialPosition: { right: number, bottom: number }
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  
  React.useEffect(() => {
    if (videoRef.current && stream && stream.getVideoTracks().length > 0) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream || stream.getVideoTracks().length === 0) return null;

  return (
    <motion.div 
      drag
      dragMomentum={false}
      initial={{ x: 0, y: 0 }}
      className={`absolute rounded-xl overflow-hidden shadow-2xl border-2 border-zinc-800 z-50 bg-zinc-900 group cursor-move ${isScreen ? 'w-80' : 'w-48'}`}
      style={{ right: initialPosition.right, bottom: initialPosition.bottom }}
    >
      <div className="absolute inset-x-0 top-0 bg-zinc-950/80 px-2 py-1 text-[10px] text-zinc-400 font-semibold z-10 flex justify-between pointer-events-none">
        <span>{title}</span>
        {isScreen && <span className="text-emerald-500">Screen</span>}
      </div>
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className={`w-full h-full bg-zinc-950 pointer-events-none select-none ${isScreen ? 'object-contain aspect-video' : 'object-cover aspect-square'}`} 
        draggable={false}
      />
    </motion.div>
  );
}

function LocalMedia({ cameraStream, screenStream, isScreenSharing }: { cameraStream: MediaStream | null, screenStream: MediaStream | null, isScreenSharing: boolean }) {
  return (
    <>
      {cameraStream && cameraStream.getVideoTracks().length > 0 && (
        <DraggableVideo 
          stream={cameraStream} 
          title="You" 
          initialPosition={{ right: 16, bottom: isScreenSharing && screenStream ? 220 : 16 }} 
        />
      )}
      {screenStream && screenStream.getVideoTracks().length > 0 && (
        <DraggableVideo 
          stream={screenStream} 
          title="You" 
          isScreen={true} 
          initialPosition={{ right: 16, bottom: 16 }} 
        />
      )}
    </>
  );
}

function PeopleList({ currentUser, allUsers }: { currentUser: UserProfile, allUsers: UserProfile[] }) {
  const [statusInput, setStatusInput] = useState(currentUser.statusMessage || '');
  const [isEditingStatus, setIsEditingStatus] = useState(false);


  const handleStatusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDoc(doc(db, 'users', currentUser.uid), { statusMessage: statusInput }, { merge: true })
      .catch(err => handleFirestoreError(err, OperationType.UPDATE, 'users'));
    setIsEditingStatus(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-zinc-800 shrink-0">
        {isEditingStatus ? (
          <form onSubmit={handleStatusSubmit} className="flex gap-2">
            <input
              type="text"
              value={statusInput}
              onChange={(e) => setStatusInput(e.target.value)}
              placeholder="What's your status?"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              autoFocus
              maxLength={100}
            />
            <button type="submit" className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors">
              Save
            </button>
          </form>
        ) : (
          <button 
            onClick={() => setIsEditingStatus(true)}
            className="w-full text-left bg-zinc-900 hover:bg-zinc-800 transition-colors border border-zinc-800 rounded-lg px-3 py-2 text-xs flex items-center justify-between group"
          >
            <span className={`truncate mr-2 ${currentUser.statusMessage ? 'text-zinc-300' : 'text-zinc-500 italic'}`}>
              {currentUser.statusMessage || 'Set a status... (e.g. Focus time)'}
            </span>
            <MessageSquare className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        {allUsers.filter(u => u.uid !== currentUser.uid).map(person => {
          const distance = Math.sqrt(Math.pow(person.x - currentUser.x, 2) + Math.pow(person.y - currentUser.y, 2));
          const isNearby = (person.room === currentUser.room) && (distance < 150 || currentUser.room !== 'main');

          const handleKnock = (e: React.MouseEvent) => {
            e.stopPropagation();
            setDoc(doc(db, 'users', person.uid), {
              ping: { timestamp: Date.now(), fromName: currentUser.displayName, fromUid: currentUser.uid }
            }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.UPDATE, 'users'));
          };

          return (
          <div key={person.uid} className={`flex items-center gap-3 p-2 rounded-xl transition-colors group ${isNearby ? 'bg-zinc-800/50 hover:bg-zinc-800' : 'hover:bg-zinc-900'}`}>
            <div className="relative shrink-0">
              <img
                src={person.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${person.uid}`}
                alt={person.displayName}
                className={`w-10 h-10 rounded-xl border ${isNearby ? 'border-emerald-500/50' : 'border-zinc-800'}`}
              />
              <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-zinc-950 ${person.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate flex items-center gap-2">
                {person.displayName}
                {isNearby && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold tracking-wider uppercase">Nearby</span>}
              </div>
              <div className="text-xs text-zinc-500 truncate">{person.room} Room</div>
              {person.statusMessage && (
                <div className="text-[10px] text-zinc-400 truncate mt-0.5 flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
                  <span className="truncate">{person.statusMessage}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0 items-center">
              <button 
                onClick={handleKnock}
                className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-500 transition-colors"
                title="Knock"
              >
                <BellRing className="w-3.5 h-3.5" />
              </button>
              <div className="flex gap-1 ml-1 items-center">
                {person.isScreenSharing && <MonitorUp className="w-3 h-3 text-emerald-500" />}
                {person.isMuted && <MicOff className="w-3 h-3 text-red-500" />}
                {person.isVideoOff && <VideoOff className="w-3 h-3 text-red-500" />}
              </div>
            </div>
          </div>
        )})}
      </div>
    </div>
  );
}
