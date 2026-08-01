// server.js
// 1-on-1 WebRTC voice calling app - Server logic

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Create the Express app
const app = express();

// Serve static files from the "public" directory
app.use(express.static('public'));

// Create a standard Node.js HTTP server using Express
const server = http.createServer(app);

// Attach Socket.io to the HTTP server
const io = new Server(server);

// Port the server will listen on
const PORT = 3000;

// Track the number of participants in each room
// roomId -> count of connected sockets
const roomParticipants = {};

// Handle a new socket connection
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // --- Room logic with strict 2-user capacity ---
  socket.on('join-room', (roomId) => {
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
    // (iterate over rooms the socket was in)
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
