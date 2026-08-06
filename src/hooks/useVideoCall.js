// src/hooks/useVideoCall.js
// Video WebRTC call logic, ported 1:1 from public/js/video-app.js.
// Preserves: strict init order, 1280x720 camera capture, ICE queue,
// ICE restart, and the ontrack track-swallow fix (remote stream attached
// via the exposed `remoteStream` state). Rooms are namespaced with the
// `video:` prefix so codes never collide with /audio or /chat rooms.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { RTC_CONFIG, ROOM_PREFIX } from '../lib/rtc-config';

const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: 'user',
};

export function useVideoCall() {
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const incomingOfferRef = useRef(null);
  const iceQueueRef = useRef([]);
  const iceRestartInProgressRef = useRef(false);
  const roomKeyRef = useRef(null); // e.g. "video:1234"
  const peerJoinedRef = useRef(false);
  const phaseRef = useRef('idle');
  const mutedRef = useRef(false);
  const cameraOnRef = useRef(true);

  const [socketConnected, setSocketConnected] = useState(false);
  const [phase, setPhaseState] = useState('idle');
  const [status, setStatus] = useState('Enter a room ID to start.');
  const [roomCode, setRoomCode] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMutedState] = useState(false);
  const [cameraOn, setCameraOnState] = useState(true);
  const [error, setError] = useState(null);

  const setPhase = useCallback((p) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // ------------------------------------------------------------
  // ICE queue
  // ------------------------------------------------------------
  const flushIce = useCallback(async () => {
    const queue = iceQueueRef.current;
    if (queue.length === 0) return;
    console.log(`Flushing ${queue.length} queued ICE candidates...`);
    while (queue.length > 0) {
      const candidate = queue.shift();
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('✅ Injected queued ICE candidate.');
      } catch (err) {
        console.error('❌ Error adding queued ICE candidate:', err);
      }
    }
  }, []);

  // ------------------------------------------------------------
  // Teardown
  // ------------------------------------------------------------
  const teardown = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {
        /* ignore */
      }
      pcRef.current = null;
    }
    incomingOfferRef.current = null;
    iceQueueRef.current = [];
    mutedRef.current = false;
    setMutedState(false);
    cameraOnRef.current = true;
    setCameraOnState(true);
    setRemoteStream(null);
  }, []);

  // ------------------------------------------------------------
  // ICE restart on network drop
  // ------------------------------------------------------------
  const handleIceRestart = useCallback(async () => {
    if (iceRestartInProgressRef.current) return;
    if (!pcRef.current || !roomKeyRef.current) return;

    iceRestartInProgressRef.current = true;
    console.log('🔄 Network drop detected. Initiating ICE restart...');
    try {
      const offer = await pcRef.current.createOffer({ iceRestart: true });
      await pcRef.current.setLocalDescription(offer);
      socketRef.current.emit('offer', { roomId: roomKeyRef.current, sdp: offer });
      console.log('🔄 ICE restart offer sent.');
    } catch (err) {
      console.error('❌ ICE restart failed:', err);
    } finally {
      setTimeout(() => {
        iceRestartInProgressRef.current = false;
      }, 3000);
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Handle ICE candidate discovery -> send to peer via socket
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          roomId: roomKeyRef.current,
          candidate: event.candidate,
        });
      }
    };

    // Handle incoming remote stream (track-swallow fix)
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        console.log('Remote stream received:', event.streams[0]);
        setRemoteStream(event.streams[0]);
      }
    };

    // Log state changes + trigger ICE restart on network drop
    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE] Connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected') {
        setPhase('in-call');
        setStatus('Connected');
      }
      if (
        pc.iceConnectionState === 'disconnected' ||
        pc.iceConnectionState === 'failed'
      ) {
        console.log('⚠️ Network drop detected. Triggering ICE restart...');
        handleIceRestart();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [handleIceRestart, setPhase]);

  const restorePhase = useCallback(() => {
    setPhase(peerJoinedRef.current ? 'ready' : 'waiting');
    setStatus(
      peerJoinedRef.current
        ? 'Peer joined room. Ready to call.'
        : 'Waiting for a peer to join the room...'
    );
  }, [setPhase]);

  // ------------------------------------------------------------
  // Join a room
  // ------------------------------------------------------------
  const joinRoom = useCallback((code) => {
    const room = (code || '').trim();
    setError(null);
    if (!room) {
      setError('Please enter a Room ID.');
      return;
    }
    if (!socketRef.current?.connected) {
      setError('Connecting to server... try again in a moment.');
      return;
    }

    roomKeyRef.current = ROOM_PREFIX.video + room;
    setRoomCode(room);
    socketRef.current.emit('join', roomKeyRef.current);
    setPhase('waiting');
    setStatus(`Waiting for peer in Room ${room}...`);
  }, [setPhase]);

  // ------------------------------------------------------------
  // Dial call (Caller)
  // ------------------------------------------------------------
  const startCall = useCallback(async () => {
    setError(null);
    if (!socketRef.current?.connected) {
      setError('Connection lost. Please wait for reconnection.');
      return;
    }
    if (!roomKeyRef.current) {
      setError('Please join a room first.');
      return;
    }
    if (pcRef.current) {
      console.warn('A call is already in progress.');
      return;
    }

    setPhase('calling');
    setStatus('Calling...');

    try {
      // STEP 1: Await getUserMedia (audio + video)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: VIDEO_CONSTRAINTS,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      cameraOnRef.current = true;
      setCameraOnState(true);

      // STEP 2: Initialize RTCPeerConnection (only now, stream is ready)
      const pc = createPeerConnection();

      // STEP 3: Add local camera + audio tracks to the peer connection
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // STEP 4: Create and emit the Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit('offer', { roomId: roomKeyRef.current, sdp: offer });
      console.log('📤 Offer sent.');
    } catch (err) {
      console.error('❌ startCall failed:', err);
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera / microphone permission denied.'
          : err.name === 'NotFoundError'
            ? 'No camera or microphone found on this device.'
            : err.message || 'Could not start the call.'
      );
      teardown();
      restorePhase();
    }
  }, [createPeerConnection, restorePhase, setPhase, teardown]);

  // ------------------------------------------------------------
  // Answer an incoming call (Callee)
  // ------------------------------------------------------------
  const answerCall = useCallback(async () => {
    setError(null);
    const offer = incomingOfferRef.current;
    if (!offer) return;
    if (!socketRef.current?.connected) {
      setError('Connection lost. Please wait for reconnection.');
      return;
    }

    setPhase('calling');
    setStatus('Connecting...');

    try {
      // STEP 1: Await getUserMedia (audio + video)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: VIDEO_CONSTRAINTS,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      cameraOnRef.current = true;
      setCameraOnState(true);

      // STEP 2: Initialize RTCPeerConnection
      const pc = createPeerConnection();

      // STEP 3: Add local camera + audio tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // STEP 4: Set remote description from the incoming offer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // FLUSH the queue now that remote description is set!
      await flushIce();

      // STEP 5: Create and emit the Answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit('answer', { roomId: roomKeyRef.current, sdp: answer });
      console.log('📤 Answer sent.');
    } catch (err) {
      console.error('❌ answerCall failed:', err);
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera / microphone permission denied.'
          : err.message || 'Could not answer the call.'
      );
      teardown();
      restorePhase();
    }
  }, [createPeerConnection, flushIce, restorePhase, setPhase, teardown]);

  // ------------------------------------------------------------
  // Decline an incoming call
  // ------------------------------------------------------------
  const declineCall = useCallback(() => {
    if (roomKeyRef.current) {
      socketRef.current?.emit('hangup', { roomId: roomKeyRef.current });
    }
    incomingOfferRef.current = null;
    restorePhase();
  }, [restorePhase]);

  // ------------------------------------------------------------
  // End the call
  // ------------------------------------------------------------
  const endCall = useCallback(() => {
    if (roomKeyRef.current) {
      socketRef.current?.emit('hangup', { roomId: roomKeyRef.current });
    }
    teardown();
    if (roomKeyRef.current) {
      restorePhase();
    } else {
      setPhase('idle');
      setStatus('Disconnected');
    }
  }, [restorePhase, setPhase, teardown]);

  // ------------------------------------------------------------
  // Leave the room entirely
  // ------------------------------------------------------------
  const leaveRoom = useCallback(() => {
    if (roomKeyRef.current) {
      socketRef.current?.emit('hangup', { roomId: roomKeyRef.current });
    }
    teardown();
    roomKeyRef.current = null;
    peerJoinedRef.current = false;
    setRoomCode('');
    setPhase('idle');
    setStatus('Enter a room ID to start.');
  }, [setPhase, teardown]);

  // ------------------------------------------------------------
  // Mute / unmute the microphone
  // ------------------------------------------------------------
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !mutedRef.current;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    mutedRef.current = next;
    setMutedState(next);
  }, []);

  // ------------------------------------------------------------
  // Turn the local camera on / off
  // ------------------------------------------------------------
  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOnRef.current;
    stream.getVideoTracks().forEach((t) => (t.enabled = next));
    cameraOnRef.current = next;
    setCameraOnState(next);
  }, []);

  // ------------------------------------------------------------
  // Socket wiring
  // ------------------------------------------------------------
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => {
      setSocketConnected(false);
      setStatus('Server connection lost. Reconnecting...');
    });

    socket.on('room-full', () => {
      setError('Room is full! Maximum 2 participants allowed.');
      teardown();
      roomKeyRef.current = null;
      peerJoinedRef.current = false;
      setRoomCode('');
      setPhase('idle');
      setStatus('Disconnected');
    });

    socket.on('peer-joined', () => {
      peerJoinedRef.current = true;
      setStatus('Peer joined room. Ready to call.');
      if (phaseRef.current === 'waiting') setPhase('ready');
    });

    socket.on('peer-left', () => {
      peerJoinedRef.current = false;
      teardown();
      if (roomKeyRef.current) {
        setPhase('waiting');
        setStatus('Peer left the room. Waiting for a peer...');
      } else {
        setPhase('idle');
        setStatus('Disconnected');
      }
    });

    socket.on('offer', async (data) => {
      // ICE restart offer (network switch) while already connected
      if (pcRef.current && pcRef.current.remoteDescription) {
        console.log('🔄 Received ICE restart offer. Applying new remote description...');
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await flushIce();
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          socketRef.current.emit('answer', { roomId: roomKeyRef.current, sdp: answer });
          console.log('🔄 ICE restart answer sent.');
        } catch (err) {
          console.error('❌ Failed to handle ICE restart offer:', err);
        }
        return;
      }

      // Glare guard: we already dialed, ignore the simultaneous offer
      if (pcRef.current) {
        console.warn('⚠️ Glare detected - ignoring incoming offer (already dialing).');
        return;
      }

      // Brand-new incoming call
      incomingOfferRef.current = data.sdp;
      setPhase('incoming');
      setStatus('Incoming call...');
    });

    socket.on('answer', async (data) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushIce();
      } catch (err) {
        console.error('❌ Failed to apply answer:', err);
      }
    });

    socket.on('ice-candidate', async (data) => {
      const pc = pcRef.current;
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('❌ Failed to inject ICE candidate:', err);
        }
      } else {
        iceQueueRef.current.push(data.candidate);
      }
    });

    socket.on('hangup', () => {
      teardown();
      if (roomKeyRef.current) {
        restorePhase();
      } else {
        setPhase('idle');
        setStatus('Disconnected');
      }
    });

    return () => {
      teardown();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [flushIce, restorePhase, setPhase, teardown]);

  return {
    socketConnected,
    phase,
    status,
    roomCode,
    localStream,
    remoteStream,
    muted,
    cameraOn,
    error,
    joinRoom,
    leaveRoom,
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
  };
}
