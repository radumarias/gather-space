import React, { useState, useEffect, useRef, useCallback } from 'react';
import Konva from 'konva';
import { Stage, Layer, Rect, Circle, Text, Group, Image as KonvaImage } from 'react-konva';
import { UserProfile, Room } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, collection, onSnapshot, query, where, updateDoc } from 'firebase/firestore';
import throttle from 'lodash/throttle';
import useImage from 'use-image';

const GRID_SIZE = 50;
const PLAYER_SIZE = 30;
const MOVE_SPEED = 10;
const PROXIMITY_RADIUS = 150;

const ROOMS: Room[] = [
  {
    id: 'main',
    name: 'Main Hall',
    type: 'public',
    layout: { width: 2000, height: 2000, walls: [], desks: [], privacyZones: [] }
  },
  {
    id: 'meeting-a',
    name: 'Meeting Room A',
    type: 'private',
    layout: {
      width: 300,
      height: 200,
      walls: [],
      desks: [],
      privacyZones: [{ x: 100, y: 100, width: 300, height: 200, id: 'meeting-a-zone' }]
    }
  },
  {
    id: 'lounge',
    name: 'Lounge',
    type: 'public',
    layout: {
      width: 300,
      height: 200,
      walls: [],
      desks: [],
      privacyZones: [{ x: 500, y: 100, width: 300, height: 200, id: 'lounge-zone' }]
    }
  },
  {
    id: 'desk-1',
    name: 'Engineering Desk',
    type: 'desk',
    layout: {
      width: 150,
      height: 100,
      walls: [],
      desks: [],
      privacyZones: [{ x: 100, y: 400, width: 150, height: 100, id: 'desk-1-zone' }]
    }
  }
];

interface VirtualWorkspaceProps {
  user: UserProfile;
  allUsers: UserProfile[];
}

export default function VirtualWorkspace({ user, allUsers }: VirtualWorkspaceProps) {
  const [dimensions, setDimensions] = useState({ width: window.innerWidth - 320, height: window.innerHeight - 64 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number, y: number } | null>(null);
  const [currentTempArea, setCurrentTempArea] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

  const otherUsers = allUsers.filter(u => u.uid !== user.uid);

  const localPosRef = useRef({ x: user.x, y: user.y });
  const targetPosRef = useRef<{ x: number, y: number } | null>(null);
  const [, setRenderTick] = useState(0);

  // Throttle Firestore updates for movement and room changes
  const updatePosition = useCallback(
    throttle((uid: string, x: number, y: number, room: string) => {
      setDoc(doc(db, 'users', uid), { x, y, room, lastSeen: Date.now() }, { merge: true })
        .catch(err => handleFirestoreError(err, OperationType.UPDATE, 'users'));
    }, 100),
    []
  );

  const checkRoom = (x: number, y: number): string => {
    for (const room of ROOMS) {
      if (room.layout.privacyZones.length > 0) {
        const zone = room.layout.privacyZones[0];
        if (x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) {
          return room.id;
        }
      }
    }
    return 'main';
  };

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      const target = targetPosRef.current;
      if (target) {
        const dx = target.x - localPosRef.current.x;
        const dy = target.y - localPosRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const moveStep = 3; // Smooth walking speed
        
        if (dist <= moveStep) {
          localPosRef.current.x = target.x;
          localPosRef.current.y = target.y;
          targetPosRef.current = null;
        } else {
          localPosRef.current.x += (dx / dist) * moveStep;
          localPosRef.current.y += (dy / dist) * moveStep;
        }

        localPosRef.current.x = Math.max(PLAYER_SIZE, Math.min(dimensions.width - PLAYER_SIZE, localPosRef.current.x));
        localPosRef.current.y = Math.max(PLAYER_SIZE, Math.min(dimensions.height - PLAYER_SIZE, localPosRef.current.y));

        setRenderTick(t => t + 1);

        const newRoom = checkRoom(localPosRef.current.x, localPosRef.current.y);
        updatePosition(user.uid, localPosRef.current.x, localPosRef.current.y, newRoom);
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [dimensions, user.uid, updatePosition]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      targetPosRef.current = null; // stop auto-move on key press
      
      let newX = localPosRef.current.x;
      let newY = localPosRef.current.y;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          newY -= MOVE_SPEED;
          break;
        case 'ArrowDown':
        case 's':
          newY += MOVE_SPEED;
          break;
        case 'ArrowLeft':
        case 'a':
          newX -= MOVE_SPEED;
          break;
        case 'ArrowRight':
        case 'd':
          newX += MOVE_SPEED;
          break;
        default:
          return;
      }

      // Boundary checks
      newX = Math.max(PLAYER_SIZE, Math.min(dimensions.width - PLAYER_SIZE, newX));
      newY = Math.max(PLAYER_SIZE, Math.min(dimensions.height - PLAYER_SIZE, newY));

      localPosRef.current.x = newX;
      localPosRef.current.y = newY;
      setRenderTick(t => t + 1);

      const newRoom = checkRoom(newX, newY);
      updatePosition(user.uid, newX, newY, newRoom);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dimensions, user.uid, updatePosition]);

  const handlePointerDown = (e: any) => {
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;
    
    if (isDrawing) {
      setDrawStart(pointerPosition);
      setCurrentTempArea({ x: pointerPosition.x, y: pointerPosition.y, width: 0, height: 0 });
    } else {
      targetPosRef.current = { x: pointerPosition.x, y: pointerPosition.y };
    }
  };

  const handlePointerMove = (e: any) => {
    if (!isDrawing || !drawStart || !currentTempArea) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    setCurrentTempArea({
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      width: Math.abs(pos.x - drawStart.x),
      height: Math.abs(pos.y - drawStart.y),
    });
  };

  const handlePointerUp = () => {
    if (isDrawing && currentTempArea) {
      if (currentTempArea.width > 20 && currentTempArea.height > 20) {
        setDoc(doc(db, 'users', user.uid), { focusArea: currentTempArea }, { merge: true });
      }
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentTempArea(null);
    }
  };

  const clearFocusArea = () => {
    updateDoc(doc(db, 'users', user.uid), { focusArea: null });
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-zinc-900 overflow-hidden relative">
      {/* HUD for Focus Area */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={() => setIsDrawing(!isDrawing)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-lg ${isDrawing ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
        >
          {isDrawing ? 'Cancel Drawing' : 'Draw Focus Area'}
        </button>
        {user.focusArea && (
          <button
            onClick={clearFocusArea}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 text-red-400 hover:bg-zinc-700 transition-colors shadow-lg"
          >
            Clear My Area
          </button>
        )}
      </div>

      <Stage 
        width={dimensions.width} 
        height={dimensions.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <Layer>
          {/* Grid Background */}
          {Array.from({ length: Math.ceil(dimensions.width / GRID_SIZE) }).map((_, i) => (
            <Rect
              key={`v-${i}`}
              x={i * GRID_SIZE}
              y={0}
              width={1}
              height={dimensions.height}
              fill="#18181b"
            />
          ))}
          {Array.from({ length: Math.ceil(dimensions.height / GRID_SIZE) }).map((_, i) => (
            <Rect
              key={`h-${i}`}
              x={0}
              y={i * GRID_SIZE}
              width={dimensions.width}
              height={1}
              fill="#18181b"
            />
          ))}

          {/* Office Layout */}
          {ROOMS.map(room => {
            if (room.id === 'main') return null;
            const zone = room.layout.privacyZones[0];
            const currentUserRoom = checkRoom(localPosRef.current.x, localPosRef.current.y);
            const isActive = currentUserRoom === room.id;
            
            return (
              <Group key={room.id}>
                <Rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.width}
                  height={zone.height}
                  fill={isActive ? "#10b98110" : "#27272a"}
                  cornerRadius={8}
                  stroke={isActive ? "#10b981" : "#3f3f46"}
                  strokeWidth={2}
                />
                <Text
                  x={zone.x + 10}
                  y={zone.y + 10}
                  text={room.name}
                  fill={isActive ? "#10b981" : "#71717a"}
                  fontSize={12}
                  fontStyle="bold"
                />
                {room.type === 'private' && (
                  <Text
                    x={zone.x + 10}
                    y={zone.y + zone.height - 20}
                    text="🔒 Private Zone"
                    fill="#ef4444"
                    fontSize={10}
                  />
                )}
              </Group>
            );
          })}

          {/* Other Users */}
          {otherUsers.map(u => {
            const distance = Math.sqrt(Math.pow(u.x - localPosRef.current.x, 2) + Math.pow(u.y - localPosRef.current.y, 2));
            const currentUserRoom = checkRoom(localPosRef.current.x, localPosRef.current.y);
            const canHear = (u.room === currentUserRoom) && (distance < PROXIMITY_RADIUS || currentUserRoom !== 'main');
            
            return (
              <Group key={u.uid}>
                {u.focusArea && (
                  <Group>
                    <Rect
                      x={u.focusArea.x}
                      y={u.focusArea.y}
                      width={u.focusArea.width}
                      height={u.focusArea.height}
                      fill="#8b5cf610"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dash={[5, 5]}
                      cornerRadius={8}
                    />
                    <Text
                      x={u.focusArea.x + 5}
                      y={u.focusArea.y - 15}
                      text={`${u.displayName}'s Focus Area`}
                      fill="#a78bfa"
                      fontSize={10}
                      fontStyle="bold"
                    />
                  </Group>
                )}
                <UserAvatar 
                  user={u} 
                  isSelf={false} 
                  canHear={canHear}
                  distance={distance}
                  currentUser={user}
                  allUsers={allUsers}
                />
              </Group>
            );
          })}

          {/* Current User */}
          {user.focusArea && (
            <Group>
              <Rect
                x={user.focusArea.x}
                y={user.focusArea.y}
                width={user.focusArea.width}
                height={user.focusArea.height}
                fill="#10b98110"
                stroke="#10b981"
                strokeWidth={2}
                dash={[5, 5]}
                cornerRadius={8}
              />
              <Text
                x={user.focusArea.x + 5}
                y={user.focusArea.y - 15}
                text="Your Focus Area"
                fill="#34d399"
                fontSize={10}
                fontStyle="bold"
              />
            </Group>
          )}

          {currentTempArea && isDrawing && (
            <Rect
              x={currentTempArea.x}
              y={currentTempArea.y}
              width={currentTempArea.width}
              height={currentTempArea.height}
              fill="#10b98120"
              stroke="#10b981"
              strokeWidth={2}
              dash={[5, 5]}
            />
          )}

          <UserAvatar 
            user={{ ...user, x: localPosRef.current.x, y: localPosRef.current.y, room: checkRoom(localPosRef.current.x, localPosRef.current.y) }} 
            isSelf={true} 
            canHear={true} 
            distance={0} 
            currentUser={user}
            allUsers={allUsers}
          />
        </Layer>
      </Stage>
    </div>
  );
}

function UserAvatar({ user, isSelf, canHear, distance, currentUser, allUsers }: { user: UserProfile; isSelf: boolean; canHear: boolean; distance: number; currentUser: UserProfile; allUsers: UserProfile[] }) {
  const [image] = useImage(user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`);
  const rippleRef = useRef<any>(null);
  const [showPing, setShowPing] = useState(false);
  const [pingData, setPingData] = useState<{name: string, isSender: boolean} | null>(null);

  useEffect(() => {
    // Check if this user recently RECEIVED a ping
    const receivedPing = user.ping && (Date.now() - user.ping.timestamp < 5000);
    // Check if this user recently SENT a ping to the current user
    const sentPingToMe = currentUser.ping && currentUser.ping.fromUid === user.uid && (Date.now() - currentUser.ping.timestamp < 5000);
    
    // Check if this user recently SENT a ping to ANYONE
    const anyonePingedByThisUser = allUsers.find(u => u.ping && u.ping.fromUid === user.uid && (Date.now() - u.ping.timestamp < 5000));
    
    // Determine the active ping relationship we want to show for this avatar
    let activePing = null;
    
    if (sentPingToMe) {
        // This avatar is the SENDER of a knock pinging the current user
        activePing = { name: "Knocking you!", isSender: true };
    } else if (anyonePingedByThisUser) {
        // This avatar is the SENDER of a knock pinging SOMEONE ELSE
        activePing = { name: `Knocking ${anyonePingedByThisUser.displayName}...`, isSender: true };
    } else if (receivedPing) {
        // This avatar RECEIVED a knock
        activePing = { name: `Knock from ${user.ping!.fromName}`, isSender: false };
    }

    if (activePing) {
      setShowPing(true);
      setPingData(activePing);
      
      let isAnimating = true;
      const playRipple = () => {
        const node = rippleRef.current;
        if (node && isAnimating) {
          node.radius(PLAYER_SIZE / 2);
          node.opacity(0.8);
          node.to({
            radius: PLAYER_SIZE * 2.5,
            opacity: 0,
            duration: 1.2,
            easing: Konva.Easings.EaseOut,
            onFinish: () => {
               if (isAnimating) playRipple();
            }
          });
        }
      };

      const initTimer = setTimeout(playRipple, 50);

      const timer = setTimeout(() => {
        isAnimating = false;
        setShowPing(false);
      }, 5000);

      return () => {
        isAnimating = false;
        clearTimeout(initTimer);
        clearTimeout(timer);
      };
    }
  }, [user.ping?.timestamp, currentUser.ping?.timestamp, allUsers]);
  
  return (
    <Group x={user.x} y={user.y}>
      {/* Ripple */}
      {showPing && pingData && (
        <Group>
          <Circle ref={rippleRef} fill="transparent" stroke={pingData.isSender ? "#ef4444" : "#f59e0b"} strokeWidth={3} />
          <Text text={pingData.name} fill={pingData.isSender ? "#ef4444" : "#f59e0b"} fontSize={12} fontStyle="bold" x={-60} y={-40} width={120} align="center" />
        </Group>
      )}
      
      {/* Proximity Ring */}
      {isSelf && (
        <Circle
          radius={PROXIMITY_RADIUS}
          stroke="#10b981"
          strokeWidth={1}
          dash={[5, 5]}
          opacity={0.1}
        />
      )}
      
      {/* Avatar Circle */}
      <Circle
        radius={PLAYER_SIZE / 2 + 4}
        fill={isSelf ? "#10b981" : (canHear ? "#34d399" : "#3f3f46")}
        shadowBlur={canHear ? 15 : 5}
        shadowColor={canHear ? "#10b981" : "#000"}
        shadowOpacity={0.5}
        opacity={canHear ? 1 : 0.5}
      />
      
      {image && (
        <Group clipFunc={(ctx) => ctx.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2)}>
          <KonvaImage
            image={image}
            x={-PLAYER_SIZE / 2}
            y={-PLAYER_SIZE / 2}
            width={PLAYER_SIZE}
            height={PLAYER_SIZE}
          />
        </Group>
      )}

      {/* Name Tag */}
      <Group y={PLAYER_SIZE / 2 + 15}>
        <Rect
          x={-40}
          y={-10}
          width={80}
          height={20}
          fill="#09090b"
          cornerRadius={4}
          opacity={0.8}
        />
        <Text
          text={user.displayName}
          fill="#fff"
          fontSize={10}
          width={80}
          align="center"
          x={-40}
          y={-5}
        />
      </Group>

      {/* Status Indicators */}
      {user.isScreenSharing && (
        <Group x={-PLAYER_SIZE / 2 - 12} y={-PLAYER_SIZE / 2}>
          <Circle radius={8} fill="#10b981" />
          <Text text="🖥" fill="#fff" fontSize={10} x={-5} y={-4} />
        </Group>
      )}
      {(user.isMuted || user.isVideoOff) && (
        <Group x={PLAYER_SIZE / 2} y={-PLAYER_SIZE / 2}>
          <Circle radius={6} fill="#ef4444" />
          <Text text="!" fill="#fff" fontSize={8} x={-2} y={-4} fontStyle="bold" />
        </Group>
      )}
    </Group>
  );
}
