// server.js
// Express/Socket.io signaling server for Verge (Audio or Video).
//  - Serves the built React frontend (Vite build.outDir = "public")
//  - Handles WebRTC signaling (join, offer, answer, ice-candidate)
//    with a strict 2-user room capacity.

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Absolute path to the built frontend (works regardless of CWD).
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');

// Self-healing startup: if the frontend has not been built yet
// (e.g. the platform runs `node server.js` directly without a build
// step, or the build output was not committed), build it now so the
// server always has an index.html to serve.
if (!fs.existsSync(INDEX_HTML)) {
  console.log('[server] Frontend build not found - running `npm run build`...');
  try {
    execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
    console.log('[server] Frontend build complete.');
  } catch (err) {
    console.error('[server] Frontend build failed:', err.message);
  }
}

// Create the Express app
const app = express();

// Serve the built React static files (JS/CSS bundles, etc.)
app.use(express.static(PUBLIC_DIR));

// SPA catch-all: any non-file route falls back to index.html so
// client-side routing (HashRouter) and deep links work seamlessly.
// (Socket.io requests under /socket.io are handled by engine.io on the
// HTTP server and never reach Express, so this cannot shadow them.)
app.get('*', (req, res) => {
  // If the request looks like a missing file/asset (has an extension),
  // return a real 404 instead of HTML.
  if (/\.[a-zA-Z0-9]+$/i.test(req.path)) {
    return res.status(404).end();
  }
  res.sendFile(INDEX_HTML, (err) => {
    if (err) {
      res.status(200).send('Frontend not built yet. Run `npm run build` and restart the server.');
    }
  });
});

// Create a standard Node.js HTTP server using Express
const server = http.createServer(app);

// Attach Socket.io to the HTTP server
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Use process.env.PORT assigned by Render, or fallback to 3000 locally
const PORT = process.env.PORT || 3000;

// Track the number of participants in each room
// roomId -> count of connected sockets
const roomParticipants = {};

// Handle a new socket connection
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // --- Room logic with strict 2-user capacity ---
  socket.on('join', (roomId) => {
    // Initialize room count if it doesn't exist
    if (!roomParticipants[roomId]) {
      roomParticipants[roomId] = 0;
    }

    // If the room already has 2 participants, reject the join
    if (roomParticipants[roomId] >= 2) {
      socket.emit('room-full', { roomId });
      console.log(`Room ${roomId} is full. Rejected ${socket.id}`);
      return;
    }

    // Join the socket to the room
    socket.join(roomId);
    roomParticipants[roomId] += 1;
    console.log(`${socket.id} joined room ${roomId} (${roomParticipants[roomId]}/2)`);

    // If this is the 2nd user joining, notify the room that a peer is ready
    if (roomParticipants[roomId] === 2) {
      socket.to(roomId).emit('peer-joined', { roomId });
      console.log(`Peer joined room ${roomId}. Notifying existing user.`);
    }
  });

  // --- Relay WebRTC signaling events verbatim between peers ---
  socket.on('offer', (data) => {
    // Forward the offer to everyone else in the same room
    socket.to(data.roomId).emit('offer', data);
  });

  socket.on('answer', (data) => {
    // Forward the answer to everyone else in the same room
    socket.to(data.roomId).emit('answer', data);
  });

  socket.on('ice-candidate', (data) => {
    // Forward the ICE candidate to everyone else in the same room
    socket.to(data.roomId).emit('ice-candidate', data);
  });

  socket.on('hangup', (data) => {
    // Forward the hangup signal to everyone else in the same room
    socket.to(data.roomId).emit('hangup', data);
  });

  // --- Handle disconnection ---
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    // Find which room this socket belonged to
    const rooms = Array.from(socket.rooms);
    // socket.rooms includes the socket's own id, so filter it out
    const joinedRooms = rooms.filter((room) => room !== socket.id);

    joinedRooms.forEach((roomId) => {
      // Notify the remaining peer that this user left
      socket.to(roomId).emit('peer-left', { roomId });

      // Decrement the participant count for this room
      if (roomParticipants[roomId]) {
        roomParticipants[roomId] -= 1;

        // Cleanup room state when 0 participants remain
        if (roomParticipants[roomId] <= 0) {
          delete roomParticipants[roomId];
          console.log(`Room ${roomId} cleaned up (0 participants).`);
        }
      }
    });
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
