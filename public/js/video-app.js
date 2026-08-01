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
    await WebRTCVideo.applyAnswer(peerConnection, data.sdp);
    setUIState('connected');
});

socket.on('ice-candidate', async (data) => {
    await WebRTCVideo.applyIceCandidate(peerConnection, data.candidate);
});

socket.on('hangup', () => endCall(false));

// Call Actions
async function startCall() {
    setUIState('calling');
    localStream = await WebRTCVideo.startCamera(localVideo);

    peerConnection = WebRTCVideo.createPeerConnection(
        localStream,
        (candidate) => socket.emit('ice-candidate', { roomId: currentRoom, candidate }),
        (stream) => { remoteVideo.srcObject = stream; }
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
        (stream) => { remoteVideo.srcObject = stream; }
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
