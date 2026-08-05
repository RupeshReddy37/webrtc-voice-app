// public/js/chat-app.js
// P2P Text Chat WebRTC logic (chat.html)
// Vanilla JS + Socket.io
// NO MEDIA - data channel only.
// Mirrors the reliable "Dial Call" flow: the user explicitly clicks
// "Connect Chat" to start the Offer/Answer handshake as the Caller.
// Includes: waterfall ICE config, bulletproof ICE queue, data channel
// setup, and strict reset logic.

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
const statusText = document.getElementById('statusText');
const joinControls = document.getElementById('joinControls');
const chatUI = document.getElementById('chatUI');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const connectChatBtn = document.getElementById('connectChatBtn');
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

    channel.onopen = () => {
        console.log("💬 Data channel open.");
        // Enable the input and Send button ONLY once the channel is open
        document.getElementById('chatInput').disabled = false;
        document.getElementById('sendBtn').disabled = false;
        document.getElementById('statusText').innerHTML = "🟢 Chat Connected - Type a message!";
        // Hide the Connect Chat button once connected
        document.getElementById('connectChatBtn').style.display = 'none';
        document.getElementById('chatInput').focus();
    };

    channel.onclose = () => {
        console.log("💬 Data channel closed.");
        // Re-disable inputs and show the Connect Chat button again
        document.getElementById('chatInput').disabled = true;
        document.getElementById('sendBtn').disabled = true;
        document.getElementById('connectChatBtn').style.display = 'block';
    };

    channel.onmessage = (event) => {
        console.log("💬 Message received:", event.data);
        appendMessage('Peer', event.data);
    };

    channel.onerror = (error) => {
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

    // Re-disable inputs and reset the Connect Chat button
    chatInput.disabled = true;
    sendBtn.disabled = true;
    connectChatBtn.style.display = 'block';

    setStatus('🔴 Disconnected');
}

// ============================================================
// STRICT INITIALIZATION (NO MEDIA)
// Create the RTCPeerConnection with the waterfall config.
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
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
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
// START CHAT CONNECTION (Caller)
// Mirrors the "Dial Call" logic. The user explicitly clicks
// "Connect Chat" to initiate the Offer/Answer handshake.
// ============================================================
async function startChatConnection() {
    if (!socket.connected) {
        alert('Connection lost. Please wait for reconnection.');
        return;
    }
    if (!currentRoom) {
        alert('Please join a room first.');
        return;
    }

    setStatus('📤 Connecting chat...');

    // STEP 1: Initialize RTCPeerConnection (NO media)
    peerConnection = new RTCPeerConnection(rtcConfig);

    // STEP 2: CRITICAL - Create the data channel BEFORE the offer
    // so the SDP includes the data channel.
    dataChannel = peerConnection.createDataChannel("chat");

    // STEP 3: Bind channel events
    setupDataChannel(dataChannel);

    // Handle ICE candidate discovery -> send to peer via socket
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId: currentRoom, candidate: event.candidate });
        }
    };

    // Callee listens for the incoming data channel
    peerConnection.ondatachannel = (event) => {
        console.log("💬 Received data channel from peer.");
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
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

    // STEP 4: Create the Offer, set local description, and emit it
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { roomId: currentRoom, sdp: offer });
    console.log("📤 Offer sent.");
}

// ============================================================
// Join a room
// ============================================================
function joinRoom() {
    const room = roomIdInput.value.trim();
    if (!room) return alert('Please enter a Room ID');
    currentRoom = room;

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
    setStatus('🟢 Peer joined room. Click "Connect Chat" to start.');
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

    // Otherwise, this is a brand-new incoming connection.
    // Act as the Callee.
    incomingOffer = data.sdp;
    setStatus('📥 Incoming chat connection...');

    // STEP 1: Initialize RTCPeerConnection (NO media)
    peerConnection = new RTCPeerConnection(rtcConfig);

    // STEP 2: CRITICAL - DO NOT create a data channel here.
    // Listen for the incoming channel instead.
    peerConnection.ondatachannel = (event) => {
        console.log("💬 Received data channel from peer.");
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
    };

    // Handle ICE candidate discovery -> send to peer via socket
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { roomId: currentRoom, candidate: event.candidate });
        }
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

    // STEP 3: Set the remote description from the incoming offer
    await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));

    // FLUSH the queue now that remote description is set!
    await flushIceCandidatesQueue();

    // STEP 4: Create and emit the Answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { roomId: currentRoom, sdp: answer });
    console.log("📤 Answer sent.");
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
connectChatBtn.addEventListener('click', startChatConnection);
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
