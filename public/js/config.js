// public/js/config.js
export const RTC_CONFIG = {
    iceServers: [
        // STUN Servers (IP Discovery)
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun.relay.metered.ca:80" },
        
        // Private TURN Servers (Firewall Traversal)
        {
            urls: "turn:global.relay.metered.ca:80",
            username: "a759448519ca87baa4a012c3",
            credential: "H74evKOmY6AWXGOy",
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "a759448519ca87baa4a012c3",
            credential: "H74evKOmY6AWXGOy",
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: "a759448519ca87baa4a012c3",
            credential: "H74evKOmY6AWXGOy",
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "a759448519ca87baa4a012c3",
            credential: "H74evKOmY6AWXGOy",
        },
    ]
};
