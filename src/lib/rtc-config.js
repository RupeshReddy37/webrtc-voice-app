// src/lib/rtc-config.js
// STUN + Oracle Cloud Coturn TURN configuration (unchanged from the legacy app).
// Static-auth TURN requires BOTH username AND credential.

export const RTC_CONFIG = {
  iceServers: [
    // Public STUN backup (Google) + self-hosted STUN (Oracle Cloud)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:144.24.153.201:3478' },

    // Self-hosted Coturn TURN server (Oracle Cloud) - firewall traversal
    {
      urls: [
        'turn:144.24.153.201:3478?transport=udp',
        'turn:144.24.153.201:3478?transport=tcp',
      ],
      username: 'turn0581d5',
      credential: 'BZ27wcunTq7JtwcDIPyggWN',
    },
  ],
};

// Room keys are namespaced client-side so the SAME code entered on
// /audio, /video, or /chat can never collide on the shared signaling
// server. The server treats these as opaque room strings.
export const ROOM_PREFIX = {
  audio: 'audio:',
  video: 'video:',
  chat: 'chat:',
};
