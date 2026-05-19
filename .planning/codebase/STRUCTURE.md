# STRUCTURE.md — Live Concert
_Last mapped: 2026-05-19_

## Directory layout

```
live-concert/
├── server.js              # Node.js entry point — Express + Socket.io
├── package.json           # Dependencies and scripts
├── package-lock.json      # Lockfile
├── .gitignore             # node_modules/, .env
├── README.md              # Full project documentation + roadmap
├── node_modules/          # (gitignored)
└── public/                # Static files served by Express
    ├── index.html         # Broadcaster page
    ├── watch.html         # Viewer page
    ├── broadcaster.js     # Broadcaster WebRTC logic
    ├── viewer.js          # Viewer WebRTC logic
    └── style.css          # Shared styles
```

## Key file locations

| What | Where |
|------|-------|
| Server entry point | `server.js` |
| Signaling logic | `server.js:19–54` |
| Static root | `public/` |
| Broadcaster UI + WebRTC | `public/broadcaster.js` |
| Viewer WebRTC + autoplay fix | `public/viewer.js` |
| Visual identity (CSS vars) | `public/style.css:1–11` |
| RTC config (STUN) | `public/broadcaster.js:55–57`, `public/viewer.js:18–20` |
| ICE candidate buffer | `public/viewer.js:28–31`, `public/viewer.js:92–100` |

## Naming conventions

| Convention | Example |
|-----------|---------|
| kebab-case filenames | `broadcaster.js`, `watch.html` |
| camelCase JS variables | `broadcasterSocketId`, `remoteDescSet` |
| kebab-case socket events | `broadcaster-ready`, `viewer-joined`, `broadcaster-left` |
| CSS custom properties | `--bg`, `--gold`, `--text`, `--muted`, `--surface` |
| CSS classes | kebab-case — `.btn-live`, `.live-badge`, `.share-link` |

## Routes

| Route | Handler | Serves |
|-------|---------|--------|
| `GET /` | Express static | `public/index.html` |
| `GET /watch` | `server.js:14–16` | `public/watch.html` |
| `GET /socket.io/*` | Socket.io auto | Client socket library |
| `GET /broadcaster.js` | Express static | `public/broadcaster.js` |
| `GET /viewer.js` | Express static | `public/viewer.js` |
| `GET /style.css` | Express static | `public/style.css` |
| `WS upgrade` | Socket.io | Signaling channel |

## Script tags loading order

**index.html (broadcaster):**
```html
<script src="/socket.io/socket.io.js"></script>  <!-- must be first -->
<script src="broadcaster.js"></script>
```

**watch.html (viewer):**
```html
<script src="/socket.io/socket.io.js"></script>  <!-- must be first -->
<script src="viewer.js"></script>
```
