// public/js/config.js
// STUN + Metered OpenRelay Static Auth TURN Configuration

export const RTC_CONFIG = {
    iceServers: [
        // Google STUN Servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },

        // Metered OpenRelay Static Auth TURN Servers
        {
            urls: 'turn:staticauth.openrelay.metered.ca:80',
            credential: 'openrelayprojectsecret'
        },
        {
            urls: 'turn:staticauth.openrelay.metered.ca:443',
            credential: 'openrelayprojectsecret'
        },
        {
            urls: 'turn:staticauth.openrelay.metered.ca:443?transport=tcp',
            credential: 'openrelayprojectsecret'
        }
    ]
};
