// public/app.js
// Production-ready 1-on-1 WebRTC Video Calling client logic
// Vanilla JS + Socket.io

// ============================================================
// 4. METERED.CA WATERFALL ICE CONFIGURATION
// Provides STUN + multiple TURN fallbacks (UDP, TCP, TLS).
// The WebRTC engine races all options and automatically selects
// the TLS/TCP route (TURNS on port 443) when UDP is blocked by
// strict NAT/firewalls. TURNS encrypts the DTLS handshake to
// look like standard HTTPS traffic, bypassing the firewall.
// ============================================================
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:relay.metered.ca:80" },
        {
            urls: [
                "turn:global.relay.metered.ca:80",
                "turn:global.relay.metered.ca:80?transport=tcp",
                "turn:global.relay.metered.ca:443",
                "turns:global.relay.metered.ca:443?transport=tcp"
            ],
            username: "a759448519ca87baa4a012c3",
            credential: "H74evKOmY6AWXGOy",
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
const answerBtn = document.getElementById('answerBtn');
const endBtn = document.getElementById('endBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// ============================================================
// State
// ============================================================
let currentRoom = null;
let peerConnection = null;
let localStream = null;
let incomingOffer = null;

// ============================================================
// 3. BULLETPROOF ICE QUEUEING
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
// UI Helpers
// ============================================================
function setStatus(text, state) {
    statusText.innerText = text;
    statusDot.className = 'status-dot ' + state;
}

function setUIState(state) {
    dialBtn.classList.add('hidden');
    answerBtn.classList.add('hidden');
    endBtn.classList.add('hidden');

    if (state === 'idle') {
        dialBtn.classList.remove('hidden');
        dialBtn.disabled = !currentRoom;
    } else if (state === 'calling') {
        endBtn.classList.remove('hidden');
    } else if (state === 'incoming') {
        answerBtn.classList.remove('hidden');
        endBtn.classList.remove('hidden');
    } else if (state === 'connected') {
        endBtn.classList.remove('hidden');
    }
}

// ============================================================
// 5. AUTOPLAY POLICY HANDLING
// Assign remote stream only once to avoid AbortError.
// ============================================================
function handleRemoteStream(stream) {
    console.log("Remote stream received:", stream);

    // Guard: only assign srcObject once (first track arrival).
    // ontrack fires once per track (audio AND video), so re-assigning
    // on the second call resets the element mid-playback -> AbortError.
    if (remoteVideo.srcObject === stream) {
        console.log("Stream already attached. Skipping re-assignment.");
        return;
    }

    remoteVideo.srcObject = stream;

    const playPromise = remoteVideo.play();
    if (playPromise !== undefined) {
        playPromise.catch((error) => {
            if (error.name === 'AbortError') {
                console.warn("Playback interrupted (AbortError) - ignoring.");
                return;
            }
            console.warn("Autoplay blocked. Retrying muted playback:", error);
            remoteVideo.muted = true;
            remoteVideo.play();
        });
    }
}

// ============================================================
// 2. STRICT INITIALIZATION SEQUENCE
// getUserMedia -> attach to DOM -> create RTCPeerConnection
// -> add tracks -> emit offer. NEVER create the connection
// before the local stream is fully loaded.
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

    setUIState('calling');
    setStatus('Calling with Video...', 'calling');

    // STEP 1: Await getUserMedia (blocks until camera/mic ready)
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
    });

    // STEP 2: Attach local stream to the DOM video element
    localVideo.srcObject = localStream;

    // STEP 3: Initialize RTCPeerConnection (only now, stream is ready)
    peerConnection = new RTCPeerConnection(rtcConfig);

    // STEP 4: Add local tracks to the peer connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Handle ICE candidate discovery -> send to peer via socket
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId: currentRoom, candidate: event.candidate });
        }
    };

    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            handleRemoteStream(event.streams[0]);
        }
    };

    // Log connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`[ICE] Connection state: ${peerConnection.iceConnectionState}`);
        if (peerConnection.iceConnectionState === 'connected') {
            setStatus('Video Call Connected', 'connected');
            setUIState('connected');
        }
    };

    // STEP 5: Create and emit the Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { roomId: currentRoom, sdp: offer });
}

// ============================================================
// Answer an incoming call
// ============================================================
async function answerCall() {
    setUIState('connected');
    setStatus('Connecting...', 'calling');

    // STEP 1: Await getUserMedia
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
    });

    // STEP 2: Attach local stream to the DOM
    localVideo.srcObject = localStream;

    // STEP 3: Initialize RTCPeerConnection
    peerConnection = new RTCPeerConnection(rtcConfig);

    // STEP 4: Add local tracks
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Handle ICE candidate discovery
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId: currentRoom, candidate: event.candidate });
        }
    };

    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            handleRemoteStream(event.streams[0]);
        }
    };

    // Log connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`[ICE] Connection state: ${peerConnection.iceConnectionState}`);
        if (peerConnection.iceConnectionState === 'connected') {
            setStatus('Video Call Connected', 'connected');
            setUIState('connected');
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

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    setStatus(currentRoom ? 'Peer in room. Ready.' : 'Disconnected', 'idle');
    setUIState('idle');
}

// ============================================================
// Join a room
// ============================================================
function joinRoom() {
    const room = roomIdInput.value.trim();
    if (!room) return alert('Please enter a Room ID');
    currentRoom = room;
    socket.emit('join-room', room);
    setStatus(`Waiting for peer in Room ${room}...`, 'idle');
}

// ============================================================
// Socket Event Handlers
// ============================================================
socket.on('room-full', () => {
    alert('Room is full! Maximum 2 participants allowed.');
    setStatus('Disconnected', 'idle');
    currentRoom = null;
});

socket.on('peer-joined', () => {
    setStatus('Peer joined room. Ready to call.', 'idle');
    dialBtn.disabled = false;
});

socket.on('peer-left', () => {
    setStatus('Peer left the room.', 'idle');
    dialBtn.disabled = true;
    endCall(false);
});

socket.on('offer', (data) => {
    incomingOffer = data.sdp;
    setStatus('Incoming Video Call...', 'incoming');
    setUIState('incoming');
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
dialBtn.addEventListener('click', startCall);
answerBtn.addEventListener('click', answerCall);
endBtn.addEventListener('click', () => endCall(true));

// Allow joining via the Enter key
roomIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
});
