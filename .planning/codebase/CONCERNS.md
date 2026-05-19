# CONCERNS.md — Live Concert
_Last mapped: 2026-05-19_

## Known limitations (by design)

These are intentional constraints for the MVP, each mapping to a concrete production problem.

| Limitation | Impact | Roadmap fix |
|-----------|--------|-------------|
| One broadcaster at a time | No multi-room | Room support (Phase N) |
| In-memory state | Lost on restart | Redis adapter |
| No TURN server | Fails across networks with symmetric NAT | Coturn / managed TURN |
| No auth | Anyone with the link can broadcast | Token-based access control |
| P2P only (no SFU) | Broadcaster uploads N times for N viewers | Vonage Video API |
| Local deployment only | No public URL | Railway deployment |

## Technical debt

### `window._localStream` global
- **File:** `public/broadcaster.js:38`
- **Issue:** The `MediaStream` is stored on `window` so `createPeerConnection()` can access it. A module pattern or closure would be cleaner.
- **Risk:** Low — single-page app, no collision risk.

### Google STUN dependency
- **Files:** `public/broadcaster.js:55–57`, `public/viewer.js:18–20`
- **Issue:** No SLA, ToS intended for dev use only. Rate limiting or outage would silently break cross-network streaming.
- **Risk:** Medium for production, Low for demo/local use.

### No error recovery on `addIceCandidate` failure
- **Files:** `public/broadcaster.js:93`, `public/viewer.js:99`
- **Issue:** `addIceCandidate()` is awaited but errors aren't caught. A malformed candidate from a network glitch would throw and break the signal handler.
- **Risk:** Low in practice (candidates come from trusted browser API).

### Broadcaster ICE candidates not buffered
- **File:** `public/broadcaster.js:85–94`
- **Issue:** The broadcaster's `signal` handler calls `addIceCandidate` immediately. If the viewer's answer hasn't arrived yet (i.e. `setRemoteDescription` not yet called on broadcaster), this would fail. In practice the offer/answer round-trip is fast enough that this rarely triggers, but it's asymmetric with the viewer's buffering logic.
- **Risk:** Low — only matters under unusual latency conditions.

## Security

| Concern | Severity | Notes |
|---------|---------|-------|
| No auth on broadcaster slot | Medium | Any visitor can go live by calling `socket.emit('broadcaster-ready')` |
| Signaling in plain text (WS, not WSS) | High for production | SDP + ICE candidates exposed on the network — use HTTPS/WSS in production |
| No input validation on `signal` payload | Low | `{ to, data }` is trusted — a malicious client could emit signals to arbitrary socket IDs |
| Google STUN privacy | Low | Google sees IP/port during ICE negotiation |

## Performance

| Concern | Notes |
|---------|-------|
| P2P upload multiplied by viewer count | 1 viewer = 1x upload, 10 viewers = 10x upload. Becomes a problem beyond ~3–4 viewers on a typical home connection |
| No bitrate adaptation | `RTCPeerConnection` uses browser defaults. No explicit bandwidth constraints set |
| Font CDN on every page load | 2 Google Fonts requests block render slightly — acceptable for a demo |
