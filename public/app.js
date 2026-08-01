import * as WebRTC from './webrtc.js';
import * as Visualizer from './visualizer.js';
import { showToast } from './toast.js';

const socket = io();

// UI Elements
const roomIdInput = document.getElementById('roomIdInput');
const joinBtn = document.getElementById('joinBtn');
const copyInviteBtn = document.getElementById('copyInviteBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const callTimer = document.getElementById('callTimer');
const dialBtn = document.getElementById('dialBtn');
const incomingCallActions = document.getElementById('incomingCallActions');
const answerBtn = document.getElementById('answerBtn');
const declineBtn = document.getElementById('declineBtn');
const endBtn = document.getElementById('endBtn');
const remoteAudio = document.getElementById('remoteAudio');
const visualizerContainer = document.getElementById('visualizer-container');

let currentRoom = null;
let savedOffer = null;
let callTimerInterval = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        roomIdInput.value = roomFromUrl;
        joinRoom();
    }
});

// --- Event Listeners ---
joinBtn.addEventListener('click', joinRoom);
copyInviteBtn.addEventListener('click', copyInviteLink);
dialBtn.addEventListener('click', startCall);
answerBtn.addEventListener('click', answerCall);
declineBtn.addEventListener('click', () => hangupCall(true));
endBtn.addEventListener('click', () => hangupCall(true));

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !dialBtn.disabled) {
        joinBtn.click();
        dialBtn.click();
    }
    if (e.key === 'Escape' && !endBtn.classList.contains('hidden')) {
        endBtn.click();
    }
});

async function joinRoom() {
    const room = roomIdInput.value.trim();
    if (!room) {
        showToast('Please enter a Room ID.', 'error');
        return;
    }

    setButtonLoading(joinBtn, true);
    currentRoom = room;
    socket.emit('join-room', room);
    statusText.innerText = `Waiting for peer in Room ${room}...`;
    updateUrlForRoom(room);
}

function copyInviteLink() {
    if (!currentRoom) {
        showToast('Join a room first to get an invite link.', 'info');
        return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoom);
    navigator.clipboard.writeText(url.toString()).then(() => {
        showToast('Invite link copied to clipboard!', 'success');
    });
    navigator.vibrate?.(100);
}

// --- Socket.io Handlers ---
socket.on('room-full', () => {
    setButtonLoading(joinBtn, false);
    showToast('This room is full. Try another Room ID.', 'error');
    statusText.innerText = 'Disconnected';
    currentRoom = null;
});

socket.on('peer-joined', () => {
    setButtonLoading(joinBtn, false);
    statusText.innerText = 'Peer in room. Ready to call.';
    dialBtn.disabled = false;
});

socket.on('peer-left', () => {
    showToast('Peer left the room.', 'info');
    dialBtn.disabled = true;
    hangupCall(false);
});

socket.on('offer', (data) => {
    savedOffer = data.sdp;
    updatePageTitle(true);
    setUIState('incoming');
    navigator.vibrate?.([200, 100, 200]);
});

socket.on('answer', async (data) => {
    await WebRTC.handleAnswer(data.sdp);
});

socket.on('ice-candidate', async (data) => {
    await WebRTC.addIceCandidate(data.candidate);
});

socket.on('connect', () => setUIState('idle'));
socket.on('disconnect', () => showToast('Reconnecting...', 'error'));

socket.on('hangup', () => {
    showToast('Call ended by peer.', 'info');
    hangupCall(false);
});

// --- Call Logic ---
async function startCall() {
    setUIState('calling');
    const localStream = await WebRTC.initLocalStream();
    Visualizer.initVisualizer(localStream);
    setupPeer();
    const offer = await WebRTC.createOffer();
    socket.emit('offer', { room: currentRoom, sdp: offer });
}

async function answerCall() {
    const localStream = await WebRTC.initLocalStream();
    Visualizer.initVisualizer(localStream);
    setupPeer();
    const answer = await WebRTC.handleOfferAndCreateAnswer(savedOffer);
    socket.emit('answer', { room: currentRoom, sdp: answer });
    navigator.vibrate?.(100);
}

function setupPeer() {
    WebRTC.createPeerConnection(
        (candidate) => socket.emit('ice-candidate', { room: currentRoom, candidate }),
        (stream) => {
            remoteAudio.srcObject = stream;
            setUIState('connected');
        }
    );
}

function hangupCall(emitEvent = true) {
    if (emitEvent && currentRoom) {
        socket.emit('hangup', { room: currentRoom });
    }
    stopCallTimer();
    WebRTC.stopPeerConnection();
    Visualizer.stopVisualizer();
    remoteAudio.srcObject = null;
    setUIState('idle');
    updatePageTitle(false);
    navigator.vibrate?.(50);
}

// --- UI & UX Helpers ---

// --- UI State Management ---
function setUIState(state) {
    statusDot.className = 'status-dot';
    dialBtn.classList.add('hidden');
    incomingCallActions.classList.add('hidden');
    endBtn.classList.add('hidden');
    visualizerContainer.classList.add('hidden');

    if (state === 'idle') {
        statusDot.classList.add('idle');
        statusText.innerText = currentRoom ? 'Peer in room. Ready to call.' : 'Disconnected';
        dialBtn.classList.remove('hidden');
        dialBtn.disabled = !currentRoom || socket.disconnected;
        setButtonLoading(joinBtn, false);
    } else if (state === 'calling') {
        statusDot.classList.add('calling');
        statusText.innerText = 'Calling...';
        endBtn.classList.remove('hidden');
        visualizerContainer.classList.remove('hidden');
    } else if (state === 'incoming') {
        statusDot.classList.add('calling');
        statusText.innerText = 'Incoming Call...';
        incomingCallActions.classList.remove('hidden');
    } else if (state === 'connected') {
        statusDot.classList.add('connected');
        statusText.innerText = 'Call Connected';
        endBtn.classList.remove('hidden');
        visualizerContainer.classList.remove('hidden');
        startCallTimer();
    }
}

function setButtonLoading(button, isLoading) {
    const text = button.querySelector('.btn-text');
    const spinner = button.querySelector('.spinner');
    if (isLoading) {
        button.disabled = true;
        text.classList.add('hidden');
        spinner.classList.remove('hidden');
    } else {
        button.disabled = false;
        text.classList.remove('hidden');
        spinner.classList.add('hidden');
    }
}

function startCallTimer() {
    callTimer.classList.remove('hidden');
    statusText.classList.add('hidden');
    let seconds = 0;
    callTimer.textContent = '00:00';
    callTimerInterval = setInterval(() => {
        seconds++;
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        const time = `${mins}:${secs}`;
        callTimer.textContent = time;
        updatePageTitle(false, `[${time} Live] Voice Call App`);
    }, 1000);
}

function stopCallTimer() {
    clearInterval(callTimerInterval);
    callTimer.classList.add('hidden');
    statusText.classList.remove('hidden');
}

function updateUrlForRoom(room) {
    const url = new URL(window.location);
    url.searchParams.set('room', room);
    window.history.pushState({}, '', url);
}

function updatePageTitle(isIncoming, text = 'Voice Call App') {
    const favicon = document.querySelector("link[rel~='icon']");
    if (isIncoming) {
        document.title = '(1) Incoming Call - Voice Call App';
        favicon.href = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚨</text></svg>";
    } else {
        document.title = text;
        favicon.href = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📞</text></svg>";
    }
}