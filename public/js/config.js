// public/js/config.js
// WebRTC configuration used by the WebRTC modules (webrtc.js & webrtc-video.js).
// STUN + Metered OpenRelay Static Auth TURN Configuration.
// Static Auth TURN requires BOTH username AND credential.

export const RTC_CONFIG = {
    iceServers: [
        // Google STUN Servers (IP Discovery)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },

        // Metered OpenRelay Static Auth TURN Servers (Firewall Traversal)
        // NOTE: Static Auth requires username + credential together.
        {
            urls: 'turn:staticauth.openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayprojectsecret'
        },
        {
            urls: 'turn:staticauth.openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayprojectsecret'
        },
        {
            urls: 'turn:staticauth.openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayprojectsecret'
        }
    ]
};
