import { RTC_CONFIG } from './config.js';

let peerConnection = null;
let localStream = null;
let remoteDescriptionSet = false;
let pendingIceCandidates = [];

// Capture local microphone track
export async function initLocalStream() {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return localStream;
}

// Initialize RTCPeerConnection instance
export function createPeerConnection(onIceCandidate, onTrack) {
    peerConnection = new RTCPeerConnection(RTC_CONFIG);
    remoteDescriptionSet = false;
    pendingIceCandidates = [];

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            onIceCandidate(event.candidate);
        }
    };

    peerConnection.ontrack = (event) => {
        onTrack(event.streams[0]);
    };

    return peerConnection;
}

// Create WebRTC Offer (Dialer)
export async function createOffer() {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    return offer;
}

// Accept Offer & Create WebRTC Answer (Receiver)
export async function handleOfferAndCreateAnswer(offer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    remoteDescriptionSet = true;
    await flushPendingIceCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
}

// Handle incoming WebRTC Answer
export async function handleAnswer(answer) {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescriptionSet = true;
        await flushPendingIceCandidates();
    }
}

// Add ICE Candidate (queued until remote description is set)
export async function addIceCandidate(candidate) {
    if (!peerConnection) return;
    if (!remoteDescriptionSet) {
        // Queue candidates that arrive before setRemoteDescription
        pendingIceCandidates.push(candidate);
        return;
    }
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

// Flush any queued ICE candidates once remote description is ready
async function flushPendingIceCandidates() {
    while (pendingIceCandidates.length > 0) {
        const candidate = pendingIceCandidates.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.warn('Failed to add queued ICE candidate:', err);
        }
    }
}

// Cleanup WebRTC connection & close microphone hardware
export function stopPeerConnection() {
    if (localStream) { localStream.getTracks().forEach(track => track.stop()); localStream = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    remoteDescriptionSet = false;
    pendingIceCandidates = [];
}


