// public/js/chat-app.js
// P2P Text Chat WebRTC logic (chat.html)
// Vanilla JS + Socket.io
// NO MEDIA - data channel only.
// Includes: waterfall ICE config, bulletproof ICE queue,
// data channel setup, and strict reset logic.

// ============================================================
// WATERFALL ICE CONFIGURATION (Metered.ca)
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
const statusText = document.getElementById('statusText');
const joinControls = document.getElementById('joinControls');
const chatUI = document.getElementById('chatUI');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const leaveBtn = document.getElementById('leaveBtn');
const voiceToggle = document.getElementById('voiceToggle');
const videoToggle = document.getElementById('videoToggle');

// ============================================================
// State
// ============================================================
let currentRoom = null;
let peerConnection = null;
let dataChannel = null;
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
// DATA CHANNEL SETUP
// ============================================================
function setupDataChannel(channel) {
    dataChannel = channel;

    dataChannel.onopen = () => {
        console.log("💬 Data channel open.");
        setStatus('🟢 Chat Connected - Type a message!');
        showChatUI(true);
        // Enable the input and Send button once the channel is open
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
    };

    dataChannel.onclose = () => {
        console.log("💬 Data channel closed.");
        // Re-disable the inputs when the channel closes
        chatInput.disabled = true;
        sendBtn.disabled = true;
    };


    dataChannel.onmessage = (event) => {
        console.log("💬 Message received:", event.data);
        appendMessage('Peer', event.data);
    };

    dataChannel.onerror = (error) => {
        console.error("💬 Data channel error:", error);
    };
}

// ============================================================
// UI Helpers
// ============================================================
function setStatus(text) {
    statusText.innerText = text;
}

function showChatUI(show) {
    if (show) {
        joinControls.classList.add('hidden');
        chatUI.classList.remove('hidden');
        chatInput.focus();
    } else {
        joinControls.classList.remove('hidden');
        chatUI.classList.add('hidden');
    }
}

function appendMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.innerHTML = `<span class="msg-sender">${sender}:</span> <span class="msg-text">${escapeHtml(text)}</span>`;
    chatMessages.appendChild(msgDiv);
    // Auto-scroll to the newest message
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Escape HTML to prevent XSS from peer messages
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// STRICT RESET LOGIC
// On disconnected/failed/closed: wipe messages, hide chat UI,
// clear room input, close data channel and peer connection.
// ============================================================
function resetChat() {
    // Wipe the message history so no data remains
    chatMessages.innerHTML = '';

    // Hide the active chat UI and show the Room ID input state
    showChatUI(false);

    // Clear the Room ID input field
    roomIdInput.value = '';

    // Close the data channel safely
    if (dataChannel) {
        try { dataChannel.close(); } catch (e) { /* ignore */ }
        dataChannel = null;
    }

    // Close the peer connection safely
    if (peerConnection) {
        try { peerConnection.close(); } catch (e) { /* ignore */ }
        peerConnection = null;
    }

    // Reset state
    currentRoom = null;
    incomingOffer = null;
    iceCandidatesQueue = [];

    setStatus('🔴 Disconnected');
}

// ============================================================
// STRICT INITIALIZATION (NO MEDIA)
// Create the RTCPeerConnection immediately when the user joins.
// ============================================================
function createPeerConnection() {
    // Create RTCPeerConnection with the waterfall config
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Handle ICE candidate discovery -> send to peer via socket
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId: currentRoom, candidate: event.candidate });
        }
    };

    // Callee listens for the incoming data channel
    peerConnection.ondatachannel = (event) => {
        console.log("💬 Received data channel from peer.");
        setupDataChannel(event.channel);
    };

    // STRICT RESET LOGIC: listen to connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log(`[CONNECTION] State: ${peerConnection.connectionState}`);
        if (peerConnection.connectionState === 'disconnected' ||
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'closed') {
            console.log("⚠️ Connection lost. Resetting chat...");
            resetChat();
        }
    };

    return peerConnection;
}

// ============================================================
// AUTO-DIAL LOGIC (Caller)
// The user who was already in the room when the second user
// joins becomes the Caller. They create the data channel and
// emit the offer automatically - no manual dial button needed.
// ============================================================
async function autoDial() {
    if (!peerConnection || !currentRoom) {
        console.log("No peer connection to dial with.");
        return;
    }

    setStatus('🟢 Peer joined. Establishing chat connection...');

    try {
        // Create the Offer (data channel already created in joinRoom)
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { roomId: currentRoom, sdp: offer });
        console.log("📤 Auto-dial offer sent.");
    } catch (error) {
        console.error("❌ Auto-dial failed:", error);
    }
}

// ============================================================
// Join a room (potential Caller)
// ============================================================
function joinRoom() {
    const room = roomIdInput.value.trim();
    if (!room) return alert('Please enter a Room ID');
    currentRoom = room;

    // Create the peer connection immediately (NO media)
    createPeerConnection();

    // Caller creates the data channel BEFORE createOffer so the
    // SDP includes the data channel. This is set up now so that
    // when the second user joins, autoDial() can fire immediately.
    const channel = peerConnection.createDataChannel("chat");
    setupDataChannel(channel);

    // Join the room via socket
    socket.emit('join', room);
    setStatus(`Waiting for peer in Room ${room}...`);
}


// ============================================================
// Send a message
// ============================================================
function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('Chat is not connected yet.');
        return;
    }

    // Send the message over the data channel
    dataChannel.send(text);

    // Append to our own message history
    appendMessage('You', text);

    // Clear the input
    chatInput.value = '';
    chatInput.focus();
}

// ============================================================
// Socket Event Handlers
// ============================================================
socket.on('room-full', () => {
    alert('Room is full! Maximum 2 participants allowed.');
    resetChat();
});

socket.on('peer-joined', () => {
    // The user who was already in the room becomes the Caller.
    // Automatically initiate the Offer/Answer handshake.
    console.log("🟢 Peer joined room. Auto-dialing as Caller...");
    autoDial();
});


socket.on('peer-left', () => {
    setStatus('🔴 Peer left the room.');
    resetChat();
});

socket.on('offer', async (data) => {
    // If a call is already active (peerConnection exists), this is an
    // ICE restart offer. Handle it seamlessly.
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

    // Otherwise, this is a brand-new incoming connection
    incomingOffer = data.sdp;

    // Create the peer connection (NO media) if not already created
    if (!peerConnection) {
        createPeerConnection();
    }

    // Set the remote description from the incoming offer
    await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));

    // FLUSH the queue now that remote description is set!
    await flushIceCandidatesQueue();

    // Create and emit the Answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { roomId: currentRoom, sdp: answer });
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

// ============================================================
// Event Listeners
// ============================================================
joinBtn.addEventListener('click', joinRoom);
sendBtn.addEventListener('click', sendMessage);
leaveBtn.addEventListener('click', () => {
    // Notify the peer we're leaving, then reset
    if (currentRoom) {
        socket.emit('hangup', { roomId: currentRoom });
    }
    resetChat();
});

// Allow sending via the Enter key
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Allow joining via the Enter key
roomIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
});

// Navigation Toggle
voiceToggle.addEventListener('click', () => {
    window.location.href = 'index.html';
});
videoToggle.addEventListener('click', () => {
    window.location.href = 'video.html';
});
