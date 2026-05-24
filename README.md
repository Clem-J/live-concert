# Live Concert

Browser-based live streaming in two modes: hand-rolled WebRTC P2P (`main`) and Vonage Video API SFU (`feature/vonage`).

A broadcaster opens the app, hits **Go Live**, shares the link. Viewers join and watch in real time.

Built to understand WebRTC internals first, then abstract them behind a managed Video API — following the same progression a real product team would take.

---

## Branches

| Branch | Mode | Description |
|--------|------|-------------|
| `main` | P2P | Pure WebRTC — no SDK, full signaling stack hand-rolled |
| `feature/vonage` | SFU | Vonage Video API — adapter pattern, same UI, swappable backend |

Switch adapter at runtime via `.env` — no code change required:

```
SIGNALING_ADAPTER=vonage   # Vonage SFU
SIGNALING_ADAPTER=p2p      # Hand-rolled WebRTC
```

---

## Stack

**Common**

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML / CSS / JavaScript |
| Backend | Node.js + Express |
| UI | Dark theme — Syne + Montserrat, gold accent |

**P2P mode (`main`)**

| Layer | Technology |
|-------|-----------|
| Signaling | Socket.io |
| Media | WebRTC (`RTCPeerConnection`, `getUserMedia`) |
| NAT traversal | STUN (`stun.l.google.com`) |

**Vonage mode (`feature/vonage`)**

| Layer | Technology |
|-------|-----------|
| SDK | OpenTok.js (CDN) + `@vonage/video` (server) |
| Transport | Vonage SFU — ROUTED media mode |
| Auth | JWT RS256 — private key stays server-side |

---

## How to run

```bash
npm install
```

**P2P mode**

```bash
# No .env needed
npm start
```

**Vonage mode**

```bash
# .env
VONAGE_APPLICATION_ID=your-app-id
VONAGE_PRIVATE_KEY=./private.key
SIGNALING_ADAPTER=vonage

npm start
```

Then open two browser tabs:

- `http://localhost:3000` → broadcaster (allow camera + mic, click **Go Live**)
- `http://localhost:3000/watch` → viewer

---

## Project structure

```
live-concert/
├── server.js                    # Express + signaling + Vonage token endpoint
├── .env                         # VONAGE_APPLICATION_ID, VONAGE_PRIVATE_KEY, SIGNALING_ADAPTER
├── private.key                  # RSA key — never committed
└── public/
    ├── index.html               # Broadcaster page
    ├── watch.html               # Viewer page
    ├── broadcaster.js           # UI only — delegates to adapter
    ├── viewer.js                # UI only — delegates to adapter
    ├── style.css
    └── adapters/
        ├── SignalingAdapter.js  # Interface — connect(), disconnect(), onStream(), onStatus()...
        ├── P2PAdapter.js        # Socket.io + RTCPeerConnection
        ├── VonageAdapter.js     # OpenTok.js — session, publish, subscribe
        └── index.js             # Factory — createAdapter() reads /config
```

---

## How it works

### P2P mode

WebRTC is peer-to-peer, but peers need a server to find each other before connecting directly. This is called **signaling**.

```
Broadcaster                    Server (Socket.io)             Viewer
    │── broadcaster-ready ────▶│                                │
    │                          │──── broadcaster-ready ────────▶│
    │                          │◀─── viewer-joined ─────────────│
    │◀─── viewer-joined(id) ───│                                │
    │  createOffer()           │                                │
    │── signal(offer) ────────▶│──── signal(offer) ────────────▶│
    │◀─ signal(answer) ────────│◀─── signal(answer) ────────────│
    │  [ICE candidates trickle in both directions]              │
    │◀══════════════ P2P video (direct) ══════════════════════▶│
```

Once ICE negotiation succeeds, the signaling server is out of the media path. Video and audio flow directly between browsers.

**Key implementation details**

- `addTrack()` must be called before `createOffer()` — without it the SDP has no `m=video` section and no media flows
- ICE candidates can arrive before `setRemoteDescription()` completes — they're buffered and flushed once the remote description is set
- One `RTCPeerConnection` per viewer on the broadcaster side (`peers` map keyed by socket ID)

### Vonage mode

```
Broadcaster              Vonage SFU              Viewer
    │                         │                     │
    │── session.connect() ───▶│                     │
    │── session.publish() ───▶│                     │
    │                         │◀── session.connect()│
    │                         │    streamCreated    │
    │                         │◀── session.subscribe│
    │◀══════════════ media (SFU) ══════════════════▶│
```

The broadcaster uploads once. Vonage distributes to all viewers — broadcaster bandwidth is independent of viewer count.

SDP and ICE are handled internally by the SDK. The application code never sees them.

**Key implementation details**

- `OT.initSession()` is a local constructor — no network call. Attach listeners before `session.connect()`
- The token (JWT RS256) is generated server-side with the private RSA key — the client only ever sees the signed token, never the key
- `session.subscribe(stream, container)` injects a `<video>` element Vonage owns. That element must stay in the DOM — removing it triggers Vonage's pause-detection and freezes the image while audio continues
- Viewer count is derived from `session.connections.length - 1` (subtract self) on each `connectionCreated`/`connectionDestroyed` event

---

## Adapter Pattern

`broadcaster.js` and `viewer.js` program against a common interface — they don't know which adapter is active.

```
.env  SIGNALING_ADAPTER=vonage|p2p
         │
GET /config → { adapter: "vonage" }
         │
createAdapter() → VonageAdapter | P2PAdapter
         │
SignalingAdapter interface
  .onStream(cb)       → HTMLVideoElement (display-ready)
  .onViewerCount(cb)  → number
  .onStatus(cb)       → string
  .onError(cb)        → string
  .connect(role, localStream)
  .disconnect()
```

`onStream` always delivers an `HTMLVideoElement`:
- `P2PAdapter` wraps the WebRTC `MediaStream` in a `<video>` before firing
- `VonageAdapter` passes Vonage's own managed `<video>` element directly

`viewer.js` appends the element only if it's not already in the container — Vonage has already inserted it, P2P's element is new.

---

## P2P vs SFU — the key tradeoff

| | P2P (`main`) | Vonage SFU (`feature/vonage`) |
|---|---|---|
| Broadcaster uploads | Once per viewer | Once regardless of viewer count |
| Server involvement | Signaling only | Full media path |
| Code complexity | SDP, ICE, RTCPeerConnection explicit | SDK handles everything |
| Transparency | Full — you see every packet negotiation | Opaque — SDK internals hidden |
| Dependencies | None (WebRTC is native) | OpenTok.js CDN + Vonage account |
| QoS telemetry | None | ~5 XHR/sec to Vonage (built into SDK) |

---

## Limitations (by design)

- **One broadcaster at a time** — single global stream, no rooms
- **No TURN server** — symmetric NAT not supported in P2P mode
- **No auth** — open access
- **In-memory session** — server restart clears Vonage session ID

These are intentional constraints for a focused demo. Each maps to a concrete production problem.

---

## Git history

The commit history follows the learning curve:

**`main` — P2P from scratch**
```
feat: STUN, error handling, reconnection, pedagogical comments
fix:  buffer ICE candidates before remote description is set
feat: SDP offer/answer exchange
feat: signaling server — broadcaster-ready, viewer-joined, signal relay
feat: getUserMedia and broadcaster UI
chore: init project — Express + Socket.io
```

**`feature/vonage` — Adapter Pattern + Vonage SFU**
```
fix:  let SDK own its video element, unify onStream contract
fix:  mute hidden subscriber container to prevent audio leak
docs: update fiche recap — factory, script order, broadcaster refactor
feat: refactor broadcaster and viewer to use adapter pattern
feat: add adapter factory — runtime selection via /config
feat: add VonageAdapter — OpenTok.js SFU implementation
feat: add P2PAdapter — extract Socket.io + WebRTC signaling
feat: add SignalingAdapter base class
feat: wire up Managed Video API server foundation
```

Each commit is a working snapshot. Run `git show <hash>` to see what changed and why.

---

## Roadmap

- [x] Hand-rolled WebRTC P2P — full signaling stack
- [x] Vonage Video API — adapter pattern, SFU mode
- [ ] Device selector UI — `enumerateDevices()`, choose camera/mic
- [ ] TURN server — symmetric NAT support (Coturn or managed)
- [ ] Deploy — persistent public URL
- [ ] Room support — multiple concurrent broadcasts
- [ ] Auth — token-based access control
