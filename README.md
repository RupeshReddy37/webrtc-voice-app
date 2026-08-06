# ARV — Audio or Video

A modern, full-screen, responsive **React + Vite** WebRTC application for
1-on-1 **voice calls**, **video calls**, and **text chat** over the same
signaling server.

## Pages

| Route | Page |
| ----- | ---- |
| `/#/` | Home dashboard (ARV branding + launch cards) |
| `/#/audio` | Audio-only call with live waveform visualizer |
| `/#/video` | Widescreen video stage, floating 16:9 self-view PiP, floating control bar |
| `/#/chat` | Peer-to-peer text chat over a WebRTC data channel |

> Hash-based routing is used on purpose: the backend (`server.js`) is a
> static-only Socket.io server, so `#/...` URLs work on refresh and
> deep-links with zero server changes.

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

- **`server.js`** — untouched Express + Socket.io signaling server
  (join / offer / answer / ice-candidate / hangup, 2-user room capacity).
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

