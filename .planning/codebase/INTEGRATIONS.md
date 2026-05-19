# INTEGRATIONS.md — Live Concert
_Last mapped: 2026-05-19_

## External services

### Google STUN
- **URL:** `stun:stun.l.google.com:19302`
- **Used in:** `public/broadcaster.js` (RTC_CONFIG), `public/viewer.js` (RTC_CONFIG)
- **Purpose:** ICE candidate discovery — tells each browser its public IP/port so WebRTC can traverse NAT
- **Limitation:** No SLA, ToS intended for dev/testing only. Production should use self-hosted Coturn or a managed TURN service.
- **Data sent:** Only the peer's source port/IP during ICE negotiation — no media.

### Google Fonts (CDN)
- **URL:** `https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&family=Montserrat:wght@400;500&display=swap`
- **Used in:** `public/style.css` (@import)
- **Purpose:** Typography — Syne for headings, Montserrat for body
- **Privacy note:** Google receives the viewer's IP on font load.

## No integrations (by design)

| Category | Status | Notes |
|----------|--------|-------|
| Database | None | In-memory state only |
| Auth provider | None | Open access |
| Video API (Vonage etc.) | None | Hand-rolled WebRTC — roadmap item |
| TURN server | None | Roadmap item (Coturn / managed) |
| Analytics | None | — |
| CDN | None | Static files served directly by Express |
| Deployment | Local only | Railway deployment on roadmap |

## Roadmap integrations

| Integration | Purpose | Priority |
|------------|---------|---------|
| TURN server (Coturn) | Support symmetric NAT, cross-network streams | High |
| Railway | Public deployment URL | Medium |
| Vonage Video API | Replace hand-rolled P2P with managed SFU | Medium |
