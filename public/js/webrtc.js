import { RTC_CONFIG } from './config.js';

let peerConnection = null;
let localStream = null;

// Capture local microphone track
export async function initLocalStream() {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return localStream;
}

// Initialize RTCPeerConnection instance
export function createPeerConnection(onIceCandidate, onTrack) {
    peerConnection = new RTCPeerConnection(RTC_CONFIG);

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
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
}

// Handle incoming WebRTC Answer
export async function handleAnswer(answer) {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

// Add ICE Candidate
export async function addIceCandidate(candidate) {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

// Cleanup WebRTC connection & close microphone hardware
export function stopPeerConnection() {
    if (localStream) { localStream.getTracks().forEach(track => track.stop()); localStream = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
}