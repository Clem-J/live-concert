# STACK.md — Live Concert
_Last mapped: 2026-05-19_

## Runtime

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | v24.8.0 (detected) |
| Package manager | npm | — |
| Language (backend) | JavaScript (CommonJS) | ES2020+ |
| Language (frontend) | Vanilla JavaScript | ES2020+ (async/await, modules via script tags) |

## Backend dependencies

| Package | Version | Role |
|---------|---------|------|
| `express` | ^4.19.2 | HTTP server, static file serving |
| `socket.io` | ^4.7.5 | WebSocket signaling layer |

No build step, no transpiler, no bundler. Node runs `server.js` directly.

## Frontend

No framework, no bundler, no build step. Pure HTML + CSS + JS loaded via `<script src="...">` tags.

| Resource | Source |
|----------|--------|
| Socket.io client | `/socket.io/socket.io.js` (served by the Socket.io server automatically) |
| Fonts | Google Fonts CDN — Syne (700), Montserrat (400, 500) |
| CSS | Single `style.css` with CSS custom properties |

## Browser APIs used

| API | File | Purpose |
|-----|------|---------|
| `navigator.mediaDevices.getUserMedia()` | `public/broadcaster.js` | Camera + mic access |
| `RTCPeerConnection` | `public/broadcaster.js`, `public/viewer.js` | WebRTC P2P connection |
| `RTCSessionDescription` | both | SDP offer/answer wrapping |
| `RTCIceCandidate` | both | ICE candidate wrapping |
| `navigator.clipboard.writeText()` | `public/broadcaster.js` | Copy share link |

## Dev scripts

```json
"start": "node server.js"
"dev":   "node --watch server.js"   // native Node watch mode, no nodemon needed
```

## Configuration

| Config | Value | Location |
|--------|-------|----------|
| Port | `process.env.PORT \|\| 3000` | `server.js:10` |
| Static root | `./public/` | `server.js:12` |
| STUN server | `stun:stun.l.google.com:19302` | `broadcaster.js`, `viewer.js` |

## What's intentionally absent

- No TypeScript — vanilla JS for clarity while learning WebRTC
- No database — in-memory state only (`broadcasterSocketId`)
- No auth — open access by design (MVP scope)
- No TURN server — local/same-network only for now
- No frontend framework — WebRTC easier to understand without abstraction
