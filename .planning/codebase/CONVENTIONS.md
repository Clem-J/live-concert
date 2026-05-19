# CONVENTIONS.md — Live Concert
_Last mapped: 2026-05-19_

## Code style

- **Module system:** CommonJS on server (`require`/`module.exports`), plain ES5+ globals on frontend (no `import`/`export` — loaded via script tags)
- **Async:** `async/await` throughout — no raw Promise chains
- **Formatting:** 2-space indentation, single quotes, semicolons omitted (server.js uses semicolons implicitly via Node)
- **Line length:** ~80–100 chars, not strictly enforced

## Naming

| Entity | Convention | Example |
|--------|-----------|---------|
| Variables | camelCase | `broadcasterSocketId`, `remoteDescSet` |
| Functions | camelCase | `createPeerConnection()`, `startPreview()`, `showStream()`, `resetState()` |
| Constants | camelCase | `RTC_CONFIG`, `peers` |
| Socket events | kebab-case strings | `'broadcaster-ready'`, `'viewer-joined'` |
| DOM IDs | kebab-case | `local-video`, `btn-live`, `live-badge` |
| CSS classes | kebab-case | `.btn-live`, `.video-wrapper`, `.share-link` |
| CSS variables | `--name` | `--bg`, `--gold`, `--text`, `--muted` |

## Comment style

Comments are pedagogical — they explain the **why** and the WebRTC concept, not just the what:

```js
// addTrack() must be called BEFORE createOffer() so the SDP includes
// the m=video and m=audio sections. Without this, the offer is media-less.

// ICE candidates can arrive before or after the offer — buffer if needed.
```

File-level JSDoc blocks on `broadcaster.js` and `viewer.js` document the full WebRTC flow as a numbered sequence — useful as a reference during interviews.

## Patterns

**Broadcaster — one `RTCPeerConnection` per viewer:**
```js
const peers = {};  // viewerId → RTCPeerConnection
function createPeerConnection(viewerId) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  // addTrack, onicecandidate, onconnectionstatechange
  peers[viewerId] = pc;
  return pc;
}
```

**Viewer — ICE candidate buffer pattern:**
```js
let iceCandidates = [];
let remoteDescSet = false;

// On offer: set remote desc, flush buffer, create answer
// On ice: push to buffer if !remoteDescSet, else addIceCandidate directly
```

**Viewer — muted autoplay + unmute:**
```js
remoteVideo.muted = true;
remoteVideo.play();
btnUnmute.hidden = false;
btnUnmute.onclick = () => { remoteVideo.muted = false; btnUnmute.hidden = true; };
```

**State reset function (viewer):**
```js
function resetState() {
  if (pc) { pc.close(); pc = null; }
  from = null;
  remoteDescSet = false;
  iceCandidates = [];
}
```

## Error handling

| Scenario | Handling |
|---------|---------|
| Camera access denied | `catch` in `startPreview()` → status text update |
| Second broadcaster attempt | Server emits `'error'` event → client resets UI |
| Signaling disconnect | `socket.on('disconnect')` → status text update |
| Signaling reconnect (broadcaster) | `socket.on('connect')` → resets Go Live button if was live |
| P2P disconnected/failed | `onconnectionstatechange` → status text update |
| Autoplay blocked | `.play()` always called on muted video — never blocked by browser |
| Stale peer on viewer refresh | `if (pc) { pc.close(); }` before each new offer |

## Socket.io event contract

| Event | Direction | Payload |
|-------|----------|---------|
| `broadcaster-ready` | client→server | — |
| `broadcaster-ready` | server→viewers | — |
| `viewer-joined` | client→server | — |
| `viewer-joined` | server→broadcaster | `viewerSocketId` (string) |
| `signal` | client→server | `{ to: socketId, data: { type, ... } }` |
| `signal` | server→client | `{ from: socketId, data: { type, ... } }` |
| `broadcaster-left` | server→viewers | — |
| `error` | server→broadcaster | error message (string) |
