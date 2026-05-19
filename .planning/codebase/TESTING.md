# TESTING.md — Live Concert
_Last mapped: 2026-05-19_

## Current state

**No automated tests.** This is a learning/MVP project — manual browser testing only.

## Manual test protocol

The only reliable way to test WebRTC is in a real browser with real network conditions.

### Happy path

1. `npm start`
2. Open `http://localhost:3000` (broadcaster tab) — allow camera/mic
3. Open `http://localhost:3000/watch` (viewer tab)
4. Broadcaster: click **Go Live**
5. Viewer: video appears muted — click **🔇 Cliquer pour activer le son**
6. Verify: audio + video streaming, Live badge visible

### Edge cases to verify manually

| Scenario | Expected behaviour |
|---------|-------------------|
| Viewer opens `/watch` before broadcaster goes live | Viewer shows "En attente du stream..." → stream appears automatically when broadcaster goes live |
| Broadcaster cuts and relaunches live | Viewer resets, new stream appears without page refresh |
| Server restarts | Broadcaster sees "Reconnecté. Relancez le live." + button re-enabled |
| Second broadcaster attempts Go Live | Server rejects with error, UI resets |
| Broadcaster closes tab | All viewers see "Le broadcast est terminé." |

### Console checks (DevTools)

On broadcaster tab: `peers` map should show connected states  
On viewer tab: `Connection state: connected` in console after stream starts  
On server: `Broadcaster ready: xxx`, `Viewer joined: yyy` in terminal logs

## Testing tools for future

| Tool | Use case |
|------|---------|
| `jest` + `socket.io-client` | Unit test signaling logic |
| Playwright | E2E test with fake media streams (`--use-fake-ui-for-media-stream`) |
| Chrome DevTools → WebRTC internals | `chrome://webrtc-internals` — inspect ICE state, codec, bitrate |

## WebRTC-specific debugging

```
chrome://webrtc-internals
```
Shows real-time stats: ICE candidate pairs, codec negotiated, bytes sent/received, packet loss. Invaluable for diagnosing connection failures.
