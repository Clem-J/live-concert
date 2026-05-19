# Live Concert

Browser-to-browser live streaming built from scratch with WebRTC — no OBS, no plugins, no framework.

A broadcaster opens the app, hits **Go Live**, shares the link. Viewers join and watch the stream in real time, directly peer-to-peer.

Built as a learning project to understand WebRTC internals before working with a managed Video API.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML / CSS / JavaScript |
| Backend | Node.js + Express |
| Signaling | Socket.io |
| Media | WebRTC (`RTCPeerConnection`, `getUserMedia`) |
| NAT traversal | STUN (`stun.l.google.com`) |

No frontend framework — intentional. WebRTC is easier to understand without abstraction layers.

---

## How to run

```bash
npm install
npm start
# → http://localhost:3000
```

Open two browser tabs:

- `http://localhost:3000` → broadcaster (allow camera + mic, click **Go Live**)
- `http://localhost:3000/watch` → viewer

To test across two devices on the same network, replace `localhost` with your local IP (`192.168.x.x`).  
To test across different networks, expose the server with `ngrok http 3000`.

---

## Project structure

```
live-concert/
├── server.js              # Express + Socket.io signaling server
├── package.json
└── public/
    ├── index.html         # Broadcaster page
    ├── watch.html         # Viewer page
    ├── broadcaster.js     # WebRTC offerer — getUserMedia, createOffer, addTrack
    ├── viewer.js          # WebRTC answerer — createAnswer, ontrack
    └── style.css          # Dark theme UI (gold accent, Syne + Montserrat)
```

---

## How it works

### The WebRTC handshake

WebRTC is peer-to-peer, but peers still need a server to find each other before the direct connection is established. This is called **signaling**.

```
Broadcaster                    Server (Socket.io)             Viewer
    │── broadcaster-ready ────▶│                                │
    │                          │──── broadcaster-ready ────────▶│
    │                          │◀─── viewer-joined ─────────────│
    │◀─── viewer-joined(id) ───│                                │
    │                          │                                │
    │  createOffer()           │                                │
    │  setLocalDescription()   │                                │
    │── signal(offer) ────────▶│──── signal(offer) ────────────▶│
    │                          │         setRemoteDescription() │
    │                          │         createAnswer()         │
    │                          │         setLocalDescription()  │
    │◀─ signal(answer) ────────│◀─── signal(answer) ────────────│
    │  setRemoteDescription()  │                                │
    │                          │                                │
    │  [ICE candidates trickle in both directions via signal]   │
    │                          │                                │
    │◀══════════════ P2P video stream (direct) ════════════════▶│
```

Once the handshake completes, the signaling server is out of the media path. Video and audio flow directly between the two browsers.

---

### Step by step

**1. `getUserMedia` — access camera and mic**

```js
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
localVideo.srcObject = stream;
```

`getUserMedia()` returns a `MediaStream` — a live container of tracks (one video track, one audio track). We pipe it into a `<video>` element for the local preview. No upload, no server involved at this stage.

**2. Signaling — the matchmaker**

WebRTC paradox: two peers need an intermediary to find each other *before* they can connect directly. The signaling server (Socket.io) handles three events:

- `broadcaster-ready` — broadcaster registers its socket ID
- `viewer-joined` — server forwards the viewer's socket ID to the broadcaster
- `signal` — generic relay for SDP and ICE payloads (server never inspects the content)

The server holds no state beyond `broadcasterSocketId`. In production, this would live in Redis to support horizontal scaling.

**3. SDP — the capability menu**

Before sending video, both peers negotiate a common format via **SDP (Session Description Protocol)** — a text document listing supported codecs, bandwidth, media directions.

```js
// Broadcaster
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);      // starts ICE gathering
socket.emit('signal', { to: viewerId, data: { type: 'offer', sdp: offer } });

// Viewer
await pc.setRemoteDescription(offer);
const answer = await pc.createAnswer();   // intersection of both capabilities
await pc.setLocalDescription(answer);
socket.emit('signal', { to: broadcasterId, data: { type: 'answer', sdp: answer } });
```

After the offer/answer exchange, both sides have agreed on codec and media direction.

**4. ICE candidates — finding the path**

Browsers sit behind NAT routers and don't have a stable public IP. ICE (Interactive Connectivity Establishment) solves this by collecting all possible network addresses (*candidates*) and testing each one:

- Local IP (`192.168.x.x`) — works on the same network
- Public IP via STUN — works across networks with standard NAT
- TURN relay — fallback for symmetric NAT (all traffic relayed through a server)

Candidates are sent via signaling as they're discovered ("trickle ICE"):

```js
pc.onicecandidate = ({ candidate }) => {
  if (candidate) socket.emit('signal', { to: peerId, data: { type: 'ice', candidate } });
};
```

One subtlety: ICE candidates can arrive at the viewer *before* the offer is fully processed. We buffer them and flush once `setRemoteDescription()` completes.

**5. The stream flows**

Once ICE negotiation succeeds, the browser selects the best path and opens the P2P channel. The viewer's `ontrack` fires:

```js
pc.ontrack = ({ streams }) => {
  remoteVideo.srcObject = streams[0]; // full MediaStream, not just one track
};
```

`streams[0]` is the complete `MediaStream` the broadcaster passed to `addTrack()` — video and audio together. Assigning it to `srcObject` plays both automatically.

---

## Architecture: P2P vs SFU vs Vonage

This project uses **pure P2P**: broadcaster and viewer exchange media directly, the server never touches the video.

| Architecture | How it works | Broadcaster uploads | Use case |
|-------------|-------------|-------------------|---------|
| **P2P** (this project) | Direct browser-to-browser | Once per viewer | 2–3 peers, learning, demos |
| **SFU** (Selective Forwarding Unit) | Server receives one stream, redistributes to N viewers | Once | Live streaming, video calls at scale |
| **MCU** (Multipoint Control Unit) | Server decodes, mixes, re-encodes | Once | Legacy conferencing, low-bandwidth clients |

With 50 viewers in P2P, the broadcaster uploads the stream 50 times. A managed **Video API** receives it once and handles redistribution, TURN servers, codec adaptation, and room management — abstracting everything built manually here.

---

## Limitations (by design)

- **One broadcaster at a time** — single global stream, no rooms
- **Local only** — no TURN server, symmetric NAT not supported
- **No auth** — open access
- **In-memory state** — server restart drops all sessions

These are intentional constraints for a learning project. Each one maps to a concrete production problem worth knowing.

---

## Git history

The commit history follows the WebRTC learning curve:

```
feat: STUN server, error handling, reconnection, pedagogical comments
fix:  buffer ICE candidates before remote description is set
feat: SDP offer/answer exchange
feat: signaling server — broadcaster-ready, viewer-joined, signal relay
feat: getUserMedia and broadcaster UI
chore: init project — Express + Socket.io
```

Each commit is a working snapshot. Run `git show <hash>` on any commit to see exactly what changed and why.
