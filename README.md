# Verge — Audio or Video

A modern, full-screen, responsive **React + Vite** WebRTC application for
high-definition 1-on-1 **voice calls**, **video calls**, and **encrypted text
chat** — peer-to-peer, with no data stored on servers.

## Pages

| Route | Page |
| ----- | ---- |
| `/#/` | Home dashboard (Verge branding + launch cards) |
| `/#/audio` | Audio-only call with live waveform visualizer |
| `/#/video` | Widescreen video stage, floating 16:9 self-view PiP, floating control bar |
| `/#/chat` | Peer-to-peer text chat over a WebRTC data channel |

> Hash-based routing is used so the SPA works on any static host, and
> `server.js` also includes an SPA catch-all (`app.get('*')` -> index.html)
> for deep links and future path-based routing.

## Getting started

```bash
npm install
npm run dev     # development: server.js (:3000) + Vite (:5173) with socket.io proxy
npm run build   # production build -> writes the SPA into public/
npm start       # builds, then runs node server.js (serves public/ + signaling)
```

Open `http://localhost:5173` in two browser tabs (or two devices) and use the
same room code on the same page to connect.

## Architecture

- **`server.js`** — Express + Socket.io signaling server
  (join / offer / answer / ice-candidate / hangup, 2-user room capacity).
  Serves the built frontend from `public/`, falls back to `index.html` for
  any non-file route (SPA catch-all), and auto-runs `npm run build` at
  startup if the frontend has not been built yet.
- **`src/`** — React client.
  - `pages/` — `HomePage`, `AudioPage`, `VideoPage`, `ChatPage`.
  - `hooks/` — `useAudioCall`, `useVideoCall`, `useChat` (WebRTC + socket
    logic, ported 1:1 from the legacy vanilla app), `useSocketStatus`.
  - `components/` — `TopNavbar` (fixed top header), `AudioVisualizer`.
  - `lib/rtc-config.js` — STUN/TURN config and room namespaces.
- **Room code isolation** — each page owns its own socket and its room keys
  are prefixed (`audio:`, `video:`, `chat:`) so the same code entered on
  different pages can never collide on the signaling server.
- **Vite** builds straight into `public/`, which `server.js` already serves,
  so production deployment stays `npm start`.

## Kept intact (WebRTC logic)

Bulletproof ICE candidate queueing, ICE restart on network drop, the
track-swallow fix, 2-user room capacity, and strict call teardown. Added on
top: an incoming-call ring screen (Answer / Decline) and a glare guard.

