// public/config.js
// STUN + Oracle Cloud Coturn TURN Configuration
// Static Auth TURN requires BOTH username AND credential.

export const RTC_CONFIG = {
    iceServers: [
        // STUN Servers (IP Discovery)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:144.24.153.201:3478' },

        // Oracle Cloud Coturn TURN Server (Firewall Traversal)
        {
            urls: [
                'turn:144.24.153.201:3478?transport=udp',
                'turn:144.24.153.201:3478?transport=tcp'
            ],
            username: 'turn0581d5',
            credential: 'BZ27wcunTq7JtwcDIPyggWN'
        }
    ]
};
