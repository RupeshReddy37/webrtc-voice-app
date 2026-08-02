// public/js/video-app.js
// Video Call UI Controller - manages socket events and UI state
// using the reusable webrtc-video.js helper functions.

import * as WebRTCVideo from './webrtc-video.js';

const socket = io();

// DOM Elements
const roomIdInput = document.getElementById('roomIdInput');
const joinBtn = document.getElementById('joinBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const dialBtn = document.getElementById('dialBtn');
const answerBtn = document.getElementById('answerBtn');
const endBtn = document.getElementById('endBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let currentRoom = null;
let peerConnection = null;
let localStream = null;
let incomingOffer = null;
let iceCandidatesQueue = [];

// This function frees the hostage candidates and injects them into the connection
async function processIceCandidatesQueue() {
    console.log(`Flushing ${iceCandidatesQueue.length} queued ICE candidates...`);
    
    while (iceCandidatesQueue.length > 0) {
        const candidate = iceCandidatesQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("✅ Successfully injected queued ICE candidate.");
        } catch (error) {
            console.error("❌ Error adding ICE candidate from queue:", error);
        }
    }
}


// Event Listeners

joinBtn.addEventListener('click', joinRoom);
dialBtn.addEventListener('click', startCall);
answerBtn.addEventListener('click', answerCall);
endBtn.addEventListener('click', () => endCall(true));

// Allow joining via the Enter key
roomIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
});

function joinRoom() {
    const room = roomIdInput.value.trim();
    if (!room) return alert('Please enter a Room ID');
    currentRoom = room;
    socket.emit('join-room', room);
    statusText.innerText = `Waiting for peer in Room ${room}...`;
}

// Socket Events
socket.on('room-full', () => {
    alert('Room is full! Maximum 2 participants allowed.');
    statusText.innerText = 'Disconnected';
    currentRoom = null;
});

socket.on('peer-joined', () => {
    statusText.innerText = 'Peer joined room. Ready to call.';
    dialBtn.disabled = false;
});

socket.on('peer-left', () => {
    statusText.innerText = 'Peer left the room.';
    dialBtn.disabled = true;
    endCall(false);
});

socket.on('offer', (data) => {
    incomingOffer = data.sdp;
    setUIState('incoming');
});

socket.on('answer', async (data) => {
    console.log("Received Answer, setting remote description...");
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    
    // THE CRITICAL LINE: Flush the queue now that the description is set!
    await processIceCandidatesQueue();
    setUIState('connected');
});

socket.on('ice-candidate', async (data) => {
    console.log("📥 ICE Candidate arrived from socket:", data.candidate.candidate);
    
    // Check if the connection is ready to accept candidates
    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log("✅ Injected ICE candidate directly.");
        } catch(e) {
            console.error("❌ Failed to inject direct candidate:", e);
        }
    } else {
        // Connection not ready yet, take it hostage in the queue
        console.log("⏸️ Connection not ready. Queueing candidate.");
        iceCandidatesQueue.push(data.candidate);
    }
});




socket.on('hangup', () => endCall(false));

// Function to handle incoming remote stream and force playback.
// NOTE: ontrack fires once per media track (audio AND video), so this
// callback runs twice. We must NOT re-assign srcObject on the second call,
// otherwise the video element is reset mid-playback and throws an AbortError.
function handleRemoteStream(stream) {
    console.log("Remote stream received:", stream);

    // Guard: only assign srcObject once (first track arrival).
    // The second track (audio or video) is added to the SAME stream object,
    // so the browser renders it automatically without re-assignment.
    if (remoteVideo.srcObject === stream) {
        console.log("Stream already attached. Skipping re-assignment to avoid AbortError.");
        return;
    }

    remoteVideo.srcObject = stream;

    // Force playback and handle browser autoplay policy blocks
    const playPromise = remoteVideo.play();
    if (playPromise !== undefined) {
        playPromise.catch((error) => {
            // Ignore AbortError (play interrupted by a new load request) - harmless.
            if (error.name === 'AbortError') {
                console.warn("Playback interrupted (AbortError) - ignoring.");
                return;
            }
            console.warn("Autoplay blocked by browser policy. Retrying muted playback:", error);
            // Fallback: Mute remote video temporarily so browser allows video frames to render
            remoteVideo.muted = true;
            remoteVideo.play();
        });
    }
}


// Call Actions
async function startCall() {
    // Guard against dialing while the WebSocket is disconnected
    // (mobile browsers may drop the socket when the app is backgrounded)
    if (!socket.connected) {
        alert('Connection lost. Please wait for reconnection.');
        return;
    }
    if (!currentRoom) {
        alert('Please join a room first.');
        return;
    }

    setUIState('calling');
    localStream = await WebRTCVideo.startCamera(localVideo);


    peerConnection = WebRTCVideo.createPeerConnection(
        localStream,
        (candidate) => socket.emit('ice-candidate', { roomId: currentRoom, candidate }),
        (stream) => handleRemoteStream(stream) // 👈 Updated callback
    );

    const offer = await WebRTCVideo.generateOffer(peerConnection);
    socket.emit('offer', { roomId: currentRoom, sdp: offer });
}

async function answerCall() {
    setUIState('connected');
    localStream = await WebRTCVideo.startCamera(localVideo);

    peerConnection = WebRTCVideo.createPeerConnection(
        localStream,
        (candidate) => socket.emit('ice-candidate', { roomId: currentRoom, candidate }),
        (stream) => handleRemoteStream(stream) // 👈 Updated callback
    );

    const answer = await WebRTCVideo.generateAnswer(peerConnection, incomingOffer);
    socket.emit('answer', { roomId: currentRoom, sdp: answer });
}


function endCall(emitHangup = true) {
    if (emitHangup && currentRoom) {
        socket.emit('hangup', { roomId: currentRoom });
    }
    WebRTCVideo.stopVideoCall(peerConnection, localStream, localVideo, remoteVideo);
    peerConnection = null;
    localStream = null;
    incomingOffer = null;
    setUIState('idle');
}

// UI State Switcher
function setUIState(state) {
    statusDot.className = 'status-dot';
    dialBtn.classList.add('hidden');
    answerBtn.classList.add('hidden');
    endBtn.classList.add('hidden');

    if (state === 'idle') {
        statusDot.classList.add('idle');
        statusText.innerText = currentRoom ? 'Peer in room. Ready.' : 'Disconnected';
        dialBtn.classList.remove('hidden');
        dialBtn.disabled = !currentRoom;
    } else if (state === 'calling') {
        statusDot.classList.add('calling');
        statusText.innerText = 'Calling with Video...';
        endBtn.classList.remove('hidden');
    } else if (state === 'incoming') {
        statusDot.classList.add('calling');
        statusText.innerText = 'Incoming Video Call...';
        answerBtn.classList.remove('hidden');
        endBtn.classList.remove('hidden');
    } else if (state === 'connected') {
        statusDot.classList.add('connected');
        statusText.innerText = 'Video Call Connected';
        endBtn.classList.remove('hidden');
    }
}
