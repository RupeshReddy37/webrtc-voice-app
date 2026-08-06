// src/hooks/useSocketStatus.js
// Lightweight singleton Socket.io connection used by the Top Navbar
// connection indicator. It never joins rooms - it only reports
// Connected / Disconnected against the signaling server.
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

let sharedSocket = null;

export function useSocketStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sharedSocket) {
      sharedSocket = io({ reconnectionAttempts: 5 });
    }
    const socket = sharedSocket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return connected;
}
