// public/js/audio-app.js
// Voice-only WebRTC calling logic (index.html)
// Vanilla JS + Socket.io
// Includes: strict init, waterfall ICE config, bulletproof ICE queue,
// track bug fix, and ICE restart for network switching.

// ============================================================
// ICE CONFIGURATION (Oracle Cloud Coturn TURN server)
// ============================================================
const rtcConfig = {
    iceServers: [
        // Public STUN backup (Google) + self-hosted STUN (Oracle Cloud)
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:144.24.153.201:3478" },
        {
            // Self-hosted Coturn TURN server (Oracle Cloud)
            urls: [
                "turn:144.24.153.201:3478?transport=udp",
                "turn:144.24.153.201:3478?transport=tcp"
            ],
            username: "turn0581d5",
            credential: "BZ27wcunTq7JtwcDIPyggWN"
        }
    ]
};

// ============================================================
// Socket.io connection
// ============================================================
const socket = io();

// ============================================================
// DOM Elements
// ============================================================
const roomIdInput = document.getElementById('roomIdInput');
const joinBtn = document.getElementById('joinBtn');
const dialBtn = document.getElementById('dialBtn');
const statusText = document.getElementById('statusText');
const voiceToggle = document.getElementById('voiceToggle');
const videoToggle = document.getElementById('videoToggle');
const chatToggle = document.getElementById('chatToggle');


// ============================================================
// State
// ============================================================
let currentRoom = null;
let peerConnection = null;
let localStream = null;
let incomingOffer = null;

// ============================================================
// BULLETPROOF ICE QUEUE
// ICE candidates arriving before setRemoteDescription are held
// here and flushed the exact millisecond the description is set.
// ============================================================
let iceCandidatesQueue = [];

// Flush queued ICE candidates into the peer connection
async function flushIceCandidatesQueue() {
    console.log(`Flushing ${iceCandidatesQueue.length} queued ICE candidates...`);
    while (iceCandidatesQueue.length > 0) {
        const candidate = iceCandidatesQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("✅ Injected queued ICE candidate.");
        } catch (error) {
            console.error("❌ Error adding queued ICE candidate:", error);
        }
    }
}

// ============================================================
// ICE RESTART (Network Switching)
// When the network path breaks (Wi-Fi -> 4G, IP change), the
// ICE connection drops. We trigger an ICE restart by creating a
// new offer with { iceRestart: true }.
// ============================================================
let iceRestartInProgress = false;

async function handleIceRestart() {
    if (iceRestartInProgress) {
        console.log("ICE restart already in progress. Skipping.");
        return;
    }
    if (!peerConnection || !currentRoom) {
        console.log("No active connection to restart.");
        return;
    }

    iceRestartInProgress = true;
    console.log("🔄 Network drop detected. Initiating ICE restart...");

    try {
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { roomId: currentRoom, sdp: offer });
        console.log("🔄 ICE restart offer sent.");
    } catch (error) {
        console.error("❌ ICE restart failed:", error);
    } finally {
        setTimeout(() => { iceRestartInProgress = false; }, 3000);
    }
}

// ============================================================
// UI Helpers
// ============================================================
function setStatus(text) {
    statusText.innerText = text;
}

function setConnectedUI(connected) {
    if (connected) {
        setStatus('🟢 Connected');
        dialBtn.innerText = '📵 End Call';
    } else {
        setStatus('🔴 Disconnected');
        dialBtn.innerText = '📞 Dial Call';
    }
}

// ============================================================
// STRICT INITIALIZATION SEQUENCE
// getUserMedia -> create RTCPeerConnection -> add tracks -> emit offer.
// NEVER create the connection before the local stream is loaded.
// ============================================================
async function startCall() {
    if (!socket.connected) {
        alert('Connection lost. Please wait for reconnection.');
        return;
    }
    if (!currentRoom) {
        alert('Please join a room first.');
        return;
    }

    setStatus('📞 Calling...');

    // STEP 1: Await getUserMedia (audio only)
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
    });

    // STEP 2: Initialize RTCPeerConnection (only now, stream is ready)
    peerConnection = new RTCPeerConnection(rtcConfig);

    // STEP 3: Add local audio track to the peer connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Handle ICE candidate discovery -> send to peer via socket
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId: currentRoom, candidate: event.candidate });
        }
    };

    // Log connection state changes + trigger ICE restart on network drop
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`[ICE] Connection state: ${peerConnection.iceConnectionState}`);
        if (peerConnection.iceConnectionState === 'connected') {
            setConnectedUI(true);
        }
        if (peerConnection.iceConnectionState === 'disconnected' ||
            peerConnection.iceConnectionState === 'failed') {
            console.log("⚠️ Network drop detected. Triggering ICE restart...");
            handleIceRestart();
        }
    };

    // STEP 4: Create and emit the Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { roomId: currentRoom, sdp: offer });
}

// ============================================================
// Answer an incoming call
// ============================================================
async function answerCall() {
    setStatus('📞 Connecting...');

    // STEP 1: Await getUserMedia (audio only)
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
    });

    // STEP 2: Initialize RTCPeerConnection
    peerConnection = new RTCPeerConnection(rtcConfig);

    // STEP 3: Add local audio track
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Handle ICE candidate discovery
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId: currentRoom, candidate: event.candidate });
        }
    };

    // Log connection state changes + trigger ICE restart on network drop
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`[ICE] Connection state: ${peerConnection.iceConnectionState}`);
        if (peerConnection.iceConnectionState === 'connected') {
            setConnectedUI(true);
        }
        if (peerConnection.iceConnectionState === 'disconnected' ||
            peerConnection.iceConnectionState === 'failed') {
            console.log("⚠️ Network drop detected. Triggering ICE restart...");
            handleIceRestart();
        }
    };

    // Set the remote description from the incoming offer
    await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));

    // FLUSH the queue now that remote description is set!
    await flushIceCandidatesQueue();

    // Create and emit the Answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { roomId: currentRoom, sdp: answer });
}

// ============================================================
// End the call
// ============================================================
function endCall(emitHangup = true) {
    if (emitHangup && currentRoom) {
        socket.emit('hangup', { roomId: currentRoom });
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = null;
    localStream = null;
    incomingOffer = null;
    iceCandidatesQueue = [];

    setConnectedUI(false);
}

// ============================================================
// Join a room
// ============================================================
function joinRoom() {
    const room = roomIdInput.value.trim();
    if (!room) return alert('Please enter a Room ID');
    currentRoom = room;
    socket.emit('join', room);
    setStatus(`Waiting for peer in Room ${room}...`);
}

// ============================================================
// Socket Event Handlers
// ============================================================
socket.on('room-full', () => {
    alert('Room is full! Maximum 2 participants allowed.');
    setStatus('🔴 Disconnected');
    currentRoom = null;
});

socket.on('peer-joined', () => {
    setStatus('🟢 Peer joined room. Ready to call.');
    dialBtn.disabled = false;
});

socket.on('peer-left', () => {
    setStatus('🔴 Peer left the room.');
    dialBtn.disabled = true;
    endCall(false);
});

socket.on('offer', async (data) => {
    // If a call is already active (peerConnection exists), this is an
    // ICE restart offer (network switch). Handle it seamlessly WITHOUT
    // tearing down the media session.
    if (peerConnection && peerConnection.remoteDescription) {
        console.log("🔄 Received ICE restart offer. Applying new remote description...");
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

            // Flush any queued ICE candidates from the restart
            await flushIceCandidatesQueue();

            // Generate and send a new answer
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', { roomId: currentRoom, sdp: answer });
            console.log("🔄 ICE restart answer sent.");
        } catch (error) {
            console.error("❌ Failed to handle ICE restart offer:", error);
        }
        return;
    }

    // Otherwise, this is a brand-new incoming call
    incomingOffer = data.sdp;
    setStatus('📞 Incoming Call...');
    answerCall();
});

socket.on('answer', async (data) => {
    console.log("Received Answer, setting remote description...");
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

    // THE CRITICAL LINE: Flush the queue now that the description is set!
    await flushIceCandidatesQueue();
});

socket.on('ice-candidate', async (data) => {
    // If the connection is ready and remote description is set, apply immediately
    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log("✅ Injected ICE candidate directly.");
        } catch (error) {
            console.error("❌ Failed to inject direct candidate:", error);
        }
    } else {
        // Connection not ready yet, hold it in the queue
        console.log("⏸️ Connection not ready. Queueing candidate.");
        iceCandidatesQueue.push(data.candidate);
    }
});

socket.on('hangup', () => endCall(false));

// ============================================================
// Event Listeners
// ============================================================
joinBtn.addEventListener('click', joinRoom);
dialBtn.addEventListener('click', () => {
    if (peerConnection && peerConnection.iceConnectionState === 'connected') {
        endCall(true);
    } else {
        startCall();
    }
});

// Allow joining via the Enter key
roomIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
});

// Navigation Toggle
videoToggle.addEventListener('click', () => {
    window.location.href = 'video.html';
});
chatToggle.addEventListener('click', () => {
    window.location.href = 'chat.html';
});


