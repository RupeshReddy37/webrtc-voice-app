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
    // Explicit ICE configuration for reliable cross-network traversal.
    // - iceTransportPolicy: 'all' allows host, srflx, AND relay candidates.
    // - bundlePolicy: 'max-bundle' reduces transports to a single one.
    // - iceCandidatePoolSize: pre-gathers candidates to speed up connection.
    peerConnection = new RTCPeerConnection({
        ...RTC_CONFIG,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        iceCandidatePoolSize: 10
    });
    remoteDescriptionSet = false;
    pendingIceCandidates = [];

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            // Log candidate type to help diagnose relay gathering issues
            console.log(`[ICE] New candidate type=${event.candidate.type} protocol=${event.candidate.protocol} address=${event.candidate.address}`);
            onIceCandidate(event.candidate);
        }
    };

    // Log ICE gathering state changes (helps detect 401 / relay failures)
    peerConnection.onicegatheringstatechange = () => {
        console.log(`[ICE] Gathering state: ${peerConnection.iceGatheringState}`);
    };

    // Log ICE connection state changes (checking -> connected / failed)
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`[ICE] Connection state: ${peerConnection.iceConnectionState}`);
        if (peerConnection.iceConnectionState === 'failed') {
            console.error('[ICE] Connection FAILED - no usable candidate path found.');
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


