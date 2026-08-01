// public/js/webrtc-video.js
// Reusable WebRTC Video Module - single-responsibility helper functions

const STUN_CONFIG = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

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
    const pc = new RTCPeerConnection(STUN_CONFIG);

    // Attach local camera & audio tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // Handle network candidate discovery
    pc.onicecandidate = (event) => {
        if (event.candidate) onIceCandidate(event.candidate);
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
    }
}

/**
 * 6. Adds ICE Candidate
 * @param {RTCPeerConnection} peerConnection The active peer connection.
 * @param {RTCIceCandidate} candidate The received ICE candidate.
 */
export async function applyIceCandidate(peerConnection, candidate) {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
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
    }
    if (localVideoEl) localVideoEl.srcObject = null;
    if (remoteVideoEl) remoteVideoEl.srcObject = null;
}
