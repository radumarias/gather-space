# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

GatherSpace — a virtual office for remote teams (Gather.town-style): users move avatars around a 2D canvas and get proximity-based voice, video, screen share, and text chat. It's a Google AI Studio applet exported as a Vite + React 19 + TypeScript app, with Firebase (Google Auth + Firestore) for state and PeerJS (WebRTC) for media.

## Commands

- `npm run dev` — dev server on port 3000 (host 0.0.0.0)
- `npm run build` — production build (Vite)
- `npm run lint` — typecheck via `tsc --noEmit` (no ESLint configured)
- `npm run preview` — serve the built app

There are no tests. Requires `.env.local` with `GEMINI_API_KEY` (see `.env.example`); AI Studio injects it in production. `@google/genai` is a dependency and the key is wired through Vite `define` as `process.env.GEMINI_API_KEY`, but nothing in `src/` consumes it yet.

Do not modify the `server.hmr` setting in `vite.config.ts` — AI Studio disables HMR/file-watching via `DISABLE_HMR` to prevent flicker during agent edits.

## Architecture

### Firestore user docs are the realtime bus

All shared state lives in `users/{uid}` documents (`UserProfile` in `src/types.ts`): position (`x`, `y`), `room`, `status`, `isMuted`/`isVideoOff`/`isScreenSharing`, `statusMessage`, `peerId`, `focusArea`, and `ping`. Every feature works the same way: write your own doc with `setDoc(..., { merge: true })`, and everyone else receives it through the `onSnapshot` subscription in `App.tsx` (`where('status', '==', 'online')`). There is no server; the only cross-user write is the "knock" feature, which sets the `ping` field on another user's doc.

Data flow: `App.tsx` owns auth + the `user`/`allUsers` snapshots and passes them down; `VirtualWorkspace.tsx` (react-konva canvas) handles movement and writes position; `AudioVideoProvider.tsx` manages PeerJS calls and exposes streams via context; `MediaRenderer.tsx` renders remote audio/video; `Chat.tsx` reads/writes the `messages` collection scoped to the current room.

### WebRTC is a full mesh; proximity only affects volume

`AudioVideoProvider` creates a PeerJS peer, publishes its `peerId` into the user's Firestore doc (that's the signaling channel), and connects to **all** online users — the peer with the lexicographically smaller UID initiates each call to avoid duplicates. Proximity does not gate connections: `MediaRenderer` sets per-user `<audio>` volume — distance-based fade within 150px in the `main` room, full volume when both users are in the same private room, zero otherwise.

### Rooms are derived from position, and hard-coded

The `ROOMS` array in `VirtualWorkspace.tsx` defines all rooms/zones; `checkRoom(x, y)` maps a position to a room id by testing `privacyZones` rectangles, and the result is written to the user doc. The Firestore `rooms` collection exists in the rules and blueprint but the app doesn't read it. The "am I nearby?" rule — same room AND (distance < 150 OR room isn't `main`) — is duplicated in `App.tsx` (`NearbyCount`, `PeopleList`), `MediaRenderer.tsx`, and the 150px radius in `VirtualWorkspace.tsx`; keep them in sync if you change it.

### Movement

Local position lives in refs (`localPosRef`/`targetPosRef`) and renders through Konva on a `requestAnimationFrame` loop — not React state per frame. WASD/arrows and click-to-move both feed it. Firestore position writes are throttled to 100ms (`lodash/throttle`).

### Schema changes touch three files

`UserProfile`/`Message`/`Room` shapes are enforced in `firestore.rules` (`isValidUser`, `isValidMessage` — with size limits and per-field type checks) and mirrored in `firebase-blueprint.json`. Adding or changing a field in `src/types.ts` without updating the rules will make writes fail at runtime. The rules also encode the knock permission: non-owners may update only the `ping` key on another user's doc.

### Error handling

Route all Firestore errors through `handleFirestoreError(err, OperationType, path)` from `src/firebase.ts` — it logs a structured JSON payload (including auth state) and rethrows. Existing code attaches it to both `onSnapshot` error callbacks and write `.catch()`es.

### Misc

- Firebase config is imported from `firebase-applet-config.json` (checked in, not secret); note the non-default Firestore database id passed to `getFirestore`.
- Path alias `@/*` resolves to the repo root (not `src/`).
- Chat queries `messages` with `where('room') + orderBy('timestamp')`, which requires a Firestore composite index.
- Styling is Tailwind CSS 4 (via `@tailwindcss/vite`), dark zinc palette with emerald accents; icons from `lucide-react`; animations from `motion` (`motion/react`).
