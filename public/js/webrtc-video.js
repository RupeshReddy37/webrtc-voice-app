// public/js/webrtc-video.js
// Reusable WebRTC Video Module - single-responsibility helper functions
import { RTC_CONFIG } from './config.js';

// Track ICE candidate queueing state per peer connection.
// ICE candidates arriving before setRemoteDescription must be queued,
// otherwise addIceCandidate() throws and the connection fails.
const pendingCandidates = new WeakMap();

/**
 * 1. Captures local camera and microphone
 * @param {HTMLVideoElement} localVideoElement The video element to show the local preview.
 * @returns {Promise<MediaStream>} The captured local media stream.
 */
export async function startCamera(localVideoElement) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
    });
    if (localVideoElement) {
        localVideoElement.srcObject = stream;
    }
    return stream;
}

/**
 * 2. Creates an RTCPeerConnection and binds audio/video tracks
 * @param {MediaStream} localStream The local media stream.
 * @param {Function} onIceCandidate Callback for discovered ICE candidates.
 * @param {Function} onRemoteStream Callback for the incoming remote stream.
 * @returns {RTCPeerConnection} The configured peer connection.
 */
export function createPeerConnection(localStream, onIceCandidate, onRemoteStream) {
    // Explicit ICE configuration for reliable cross-network traversal.
    // - iceTransportPolicy: 'all' allows host, srflx, AND relay candidates.
    // - bundlePolicy: 'max-bundle' reduces transports to a single one.
    // - iceCandidatePoolSize: pre-gathers candidates to speed up connection.
    const pc = new RTCPeerConnection({
        ...RTC_CONFIG,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        iceCandidatePoolSize: 10
    });

    // Initialize ICE candidate queue state for this connection
    pendingCandidates.set(pc, { remoteDescriptionSet: false, queue: [] });

    // Attach local camera & audio tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // Handle network candidate discovery
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // Log candidate type to help diagnose relay gathering issues
            console.log(`[ICE] New candidate type=${event.candidate.type} protocol=${event.candidate.protocol} address=${event.candidate.address}`);
            onIceCandidate(event.candidate);
        }
    };

    // Log ICE gathering state changes (helps detect 401 / relay failures)
    pc.onicegatheringstatechange = () => {
        console.log(`[ICE] Gathering state: ${pc.iceGatheringState}`);
    };

    // Log ICE connection state changes (checking -> connected / failed)
    pc.oniceconnectionstatechange = () => {
        console.log(`[ICE] Connection state: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
            console.error('[ICE] Connection FAILED - no usable candidate path found.');
        }
    };

    // Handle incoming remote video track
    pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            onRemoteStream(event.streams[0]);
        }
    };

    return pc;
}


/**
 * 3. Creates WebRTC SDP Offer (Dialer)
 * @param {RTCPeerConnection} peerConnection The active peer connection.
 * @returns {Promise<RTCSessionDescription>} The created offer.
 */
export async function generateOffer(peerConnection) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    return offer;
}

/**
 * 4. Processes Remote Offer & Creates SDP Answer (Receiver)
 * @param {RTCPeerConnection} peerConnection The active peer connection.
 * @param {RTCSessionDescription} remoteOfferSdp The received offer SDP.
 * @returns {Promise<RTCSessionDescription>} The created answer.
 */
export async function generateAnswer(peerConnection, remoteOfferSdp) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(remoteOfferSdp));
    markRemoteDescriptionSet(peerConnection);
    await flushPendingIceCandidates(peerConnection);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
}

/**
 * 5. Applies Answer SDP to Dialer
 * @param {RTCPeerConnection} peerConnection The active peer connection.
 * @param {RTCSessionDescription} remoteAnswerSdp The received answer SDP.
 */
export async function applyAnswer(peerConnection, remoteAnswerSdp) {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(remoteAnswerSdp));
        markRemoteDescriptionSet(peerConnection);
        await flushPendingIceCandidates(peerConnection);
    }
}

/**
 * 6. Adds ICE Candidate (queued until remote description is set)
 * @param {RTCPeerConnection} peerConnection The active peer connection.
 * @param {RTCIceCandidate} candidate The received ICE candidate.
 */
export async function applyIceCandidate(peerConnection, candidate) {
    if (!peerConnection) return;

    const state = pendingCandidates.get(peerConnection);
    if (!state) {
        // No state tracked (connection not created via this module) - add directly
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        return;
    }

    if (!state.remoteDescriptionSet) {
        // Queue candidates that arrive before setRemoteDescription
        state.queue.push(candidate);
        return;
    }

    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

// Mark that the remote description has been set for a connection
function markRemoteDescriptionSet(peerConnection) {
    const state = pendingCandidates.get(peerConnection);
    if (state) {
        state.remoteDescriptionSet = true;
    }
}

// Flush any queued ICE candidates once remote description is ready
async function flushPendingIceCandidates(peerConnection) {
    const state = pendingCandidates.get(peerConnection);
    if (!state) return;

    while (state.queue.length > 0) {
        const candidate = state.queue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.warn('Failed to add queued ICE candidate:', err);
        }
    }
}

/**
 * 7. Clean Teardown: Stops camera tracks and closes connection
 * @param {RTCPeerConnection} peerConnection The active peer connection.
 * @param {MediaStream} localStream The local media stream.
 * @param {HTMLVideoElement} localVideoEl The local video element.
 * @param {HTMLVideoElement} remoteVideoEl The remote video element.
 */
export function stopVideoCall(peerConnection, localStream, localVideoEl, remoteVideoEl) {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
        pendingCandidates.delete(peerConnection);
    }
    if (localVideoEl) localVideoEl.srcObject = null;
    if (remoteVideoEl) remoteVideoEl.srcObject = null;
}
