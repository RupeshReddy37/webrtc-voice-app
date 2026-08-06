// src/hooks/useChat.js
// P2P text chat over a WebRTC data channel, ported from public/js/chat-app.js.
// Preserves: no-media RTCPeerConnection, data-channel-before-offer for the
// caller, ondatachannel for the callee, bulletproof ICE queue, and strict
// reset on connection loss. Rooms are namespaced with the `chat:` prefix
// so chat codes can never collide with /audio or /video room codes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { RTC_CONFIG, ROOM_PREFIX } from '../lib/rtc-config';

export function useChat() {
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const incomingOfferRef = useRef(null);
  const iceQueueRef = useRef([]);
  const roomKeyRef = useRef(null); // e.g. "chat:1234"
  const idRef = useRef(0);

  const [socketConnected, setSocketConnected] = useState(false);
  const [status, setStatus] = useState('Enter a room ID to start.');
  const [roomCode, setRoomCode] = useState('');
  const [messages, setMessages] = useState([]);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const appendMessage = useCallback((sender, text) => {
    idRef.current += 1;
    setMessages((prev) => [...prev, { id: idRef.current, sender, text }]);
  }, []);

  // ------------------------------------------------------------
  // Data channel setup
  // ------------------------------------------------------------
  const setupDataChannel = useCallback(
    (channel) => {
      dcRef.current = channel;

      channel.onopen = () => {
        console.log('💬 Data channel open.');
        setConnected(true);
        setStatus('Chat connected - type a message!');
      };

      channel.onclose = () => {
        console.log('💬 Data channel closed.');
        setConnected(false);
        setStatus('Chat disconnected.');
      };

      channel.onmessage = (event) => {
        console.log('💬 Message received:', event.data);
        appendMessage('Peer', event.data);
      };

      channel.onerror = (error) => {
        console.error('💬 Data channel error:', error);
      };
    },
    [appendMessage]
  );

  // ------------------------------------------------------------
  // Bulletproof ICE queue
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
  // Build a peer connection (no media - data channel only)
  // ------------------------------------------------------------
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

    // Callee listens for the incoming data channel
    pc.ondatachannel = (event) => {
      console.log('💬 Received data channel from peer.');
      setupDataChannel(event.channel);
    };

    // Strict reset on connection loss
    pc.onconnectionstatechange = () => {
      console.log(`[CONNECTION] State: ${pc.connectionState}`);
      if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      ) {
        console.log('⚠️ Connection lost.');
        setConnected(false);
        setStatus(
          roomKeyRef.current
            ? 'Peer disconnected. Press Connect Chat to retry.'
            : 'Disconnected'
        );
      }
    };

    pcRef.current = pc;
    return pc;
  }, [setupDataChannel]);

  // ------------------------------------------------------------
  // Strict reset
  // ------------------------------------------------------------
  const resetChat = useCallback(() => {
    setMessages([]);
    if (dcRef.current) {
      try {
        dcRef.current.close();
      } catch (e) {
        /* ignore */
      }
      dcRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {
        /* ignore */
      }
      pcRef.current = null;
    }
    roomKeyRef.current = null;
    incomingOfferRef.current = null;
    iceQueueRef.current = [];
    setRoomCode('');
    setJoined(false);
    setConnected(false);
    setStatus('Enter a room ID to start.');
  }, []);

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

    roomKeyRef.current = ROOM_PREFIX.chat + room;
    setRoomCode(room);
    setJoined(true);
    socketRef.current.emit('join', roomKeyRef.current);
    setStatus(`Waiting for peer in Room ${room}...`);
  }, []);

  // ------------------------------------------------------------
  // Connect chat (Caller) - data channel created BEFORE the offer
  // ------------------------------------------------------------
  const connectChat = useCallback(async () => {
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
      console.warn('Chat connection already in progress.');
      return;
    }

    setStatus('Connecting chat...');

    // STEP 1: Initialize RTCPeerConnection (NO media)
    const pc = createPeerConnection();

    // STEP 2: CRITICAL - create the data channel BEFORE the offer
    // so the SDP includes the data channel.
    const channel = pc.createDataChannel('chat');

    // STEP 3: Bind channel events
    setupDataChannel(channel);

    try {
      // STEP 4: Create the Offer, set local description, and emit it
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit('offer', { roomId: roomKeyRef.current, sdp: offer });
      console.log('📤 Offer sent.');
    } catch (err) {
      console.error('❌ Could not create offer:', err);
      setError(err.message || 'Could not start chat connection.');
      resetChat();
    }
  }, [createPeerConnection, resetChat, setupDataChannel]);

  // ------------------------------------------------------------
  // Send a message
  // ------------------------------------------------------------
  const sendMessage = useCallback(
    (text) => {
      const msg = (text || '').trim();
      if (!msg) return;

      const dc = dcRef.current;
      if (!dc || dc.readyState !== 'open') {
        setError('Chat is not connected yet.');
        return;
      }

      dc.send(msg);
      appendMessage('You', msg);
    },
    [appendMessage]
  );

  // ------------------------------------------------------------
  // Leave the chat room entirely
  // ------------------------------------------------------------
  const leaveChat = useCallback(() => {
    if (roomKeyRef.current) {
      socketRef.current?.emit('hangup', { roomId: roomKeyRef.current });
    }
    resetChat();
  }, [resetChat]);

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
      resetChat();
    });

    socket.on('peer-joined', () => {
      setStatus('Peer joined room. Press Connect Chat to start.');
    });

    socket.on('peer-left', () => {
      setConnected(false);
      setStatus(
        roomKeyRef.current
          ? 'Peer left the room. Waiting for a peer...'
          : 'Disconnected'
      );
    });

    socket.on('offer', async (data) => {
      // ICE restart offer while already connected
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

      // Glare guard
      if (pcRef.current) {
        console.warn('⚠️ Glare detected - ignoring incoming offer (already connecting).');
        return;
      }

      // Act as the Callee - listen for the incoming data channel
      incomingOfferRef.current = data.sdp;
      setStatus('Incoming chat connection...');

      const pc = createPeerConnection();
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current.emit('answer', { roomId: roomKeyRef.current, sdp: answer });
        console.log('📤 Answer sent.');
      } catch (err) {
        console.error('❌ Could not answer chat connection:', err);
        setError(err.message || 'Could not answer the chat connection.');
        setConnected(false);
        pcRef.current = null;
        incomingOfferRef.current = null;
      }
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
      setConnected(false);
      setStatus(
        roomKeyRef.current
          ? 'Peer ended the chat. Press Connect Chat to retry.'
          : 'Disconnected'
      );
    });

    return () => {
      resetChat();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [createPeerConnection, flushIce, resetChat]);

  return {
    socketConnected,
    status,
    roomCode,
    messages,
    joined,
    connected,
    error,
    joinRoom,
    connectChat,
    sendMessage,
    leaveChat,
  };
}
