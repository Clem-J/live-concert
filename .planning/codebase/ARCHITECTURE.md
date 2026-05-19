# ARCHITECTURE.md — Live Concert
_Last mapped: 2026-05-19_

## Pattern

**Signaling server + pure P2P media.** The Node.js server handles only WebSocket signaling — it never touches the video/audio stream. Once the WebRTC handshake completes, media flows directly browser-to-browser.

```
┌─────────────────────┐         ┌─────────────────────┐
│   Broadcaster tab   │         │    Viewer tab(s)     │
│                     │         │                      │
│  getUserMedia()     │         │  <video> srcObject   │
│  RTCPeerConnection  │◄───────►│  RTCPeerConnection   │
│  broadcaster.js     │  P2P    │  viewer.js           │
└────────┬────────────┘  media  └──────────┬───────────┘
         │                                  │
         │  Socket.io (signaling only)       │
         └──────────────┬───────────────────┘
                        │
               ┌────────▼────────┐
               │   server.js     │
               │  Express +      │
               │  Socket.io      │
               │                 │
               │  State:         │
               │  broadcasterSocketId│
               └─────────────────┘
```

## WebRTC handshake flow

```
Broadcaster                    Server                    Viewer
    │── broadcaster-ready ────▶│                            │
    │                          │── broadcaster-ready ──────▶│
    │                          │◀── viewer-joined ──────────│
    │◀── viewer-joined(id) ────│                            │
    │  addTrack()              │                            │
    │  createOffer()           │                            │
    │  setLocalDescription()   │                            │
    │── signal(offer) ────────▶│── signal(offer) ──────────▶│
    │                          │    setRemoteDescription()  │
    │                          │    createAnswer()          │
    │                          │    setLocalDescription()   │
    │◀─ signal(answer) ────────│◀── signal(answer) ─────────│
    │  setRemoteDescription()  │                            │
    │  [ICE trickle both ways via signal]                   │
    │◀══════════════ P2P video/audio ═══════════════════════▶│
```

## Layers

| Layer | File | Responsibility |
|-------|------|---------------|
| HTTP + Static | `server.js` | Serve `public/` files, `/watch` route |
| Signaling | `server.js` (Socket.io) | Register broadcaster, match viewers, relay signals |
| Broadcaster client | `public/broadcaster.js` | `getUserMedia`, `RTCPeerConnection` (offerer), UI |
| Viewer client | `public/viewer.js` | `RTCPeerConnection` (answerer), `ontrack`, UI |
| Styles | `public/style.css` | Global layout + visual identity |

## State management

**Server-side (in-memory):**
```js
let broadcasterSocketId = null;  // server.js:19
```
Single variable. Resets on broadcaster disconnect. Lost on server restart.

**Broadcaster client:**
```js
window._localStream   // MediaStream from getUserMedia
const peers = {}      // Map of viewerId → RTCPeerConnection
```

**Viewer client:**
```js
let pc            = null   // single RTCPeerConnection
let from          = null   // broadcaster's socket id
let iceCandidates = []     // buffer before setRemoteDescription
let remoteDescSet = false  // gate for ICE buffering
```

## Entry points

| Entry point | URL | File |
|------------|-----|------|
| Broadcaster | `http://localhost:3000/` | `public/index.html` → `broadcaster.js` |
| Viewer | `http://localhost:3000/watch` | `public/watch.html` → `viewer.js` |
| Signaling | WS upgrade on any route | `server.js` (Socket.io) |

## Key architectural decisions

| Decision | Rationale |
|----------|-----------|
| No rooms | MVP scope — one global stream |
| One broadcaster at a time | Enforced server-side with `broadcasterSocketId` |
| Generic `signal` event | Relay SDP + ICE without the server needing to understand either |
| `peers` map on broadcaster | Supports N concurrent viewers from a single broadcaster |
| ICE candidate buffering on viewer | Race condition: candidates can arrive before `setRemoteDescription` completes |
| Muted autoplay + unmute button | Chrome autoplay policy blocks audio without user gesture |
