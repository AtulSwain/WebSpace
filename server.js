const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static frontend files from the public folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// Keep an in-memory map of connected users and their room assignments.
// This is only for runtime signaling and does not persist any data.
const users = {};

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // When a user joins a room, store their username and room.
  // Then tell existing participants about the new user.
  socket.on('join-room', async ({ roomId, username }) => {
    users[socket.id] = { roomId, username };
    socket.join(roomId);

    const existingSockets = await io.in(roomId).fetchSockets();
    const participants = existingSockets
      .filter((s) => s.id !== socket.id)
      .map((s) => ({ socketId: s.id, username: users[s.id]?.username || 'Guest' }));

    // Send the new user the list of current room participants.
    socket.emit('room-users', participants);

    // Notify room members that a new user joined.
    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      username,
    });
  });

  // Relay SDP offers between peers.
  socket.on('offer', ({ targetSocketId, offer }) => {
    if (io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('offer', {
        fromSocketId: socket.id,
        offer,
      });
    }
  });

  // Relay SDP answers between peers.
  socket.on('answer', ({ targetSocketId, answer }) => {
    if (io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('answer', {
        fromSocketId: socket.id,
        answer,
      });
    }
  });

  // Relay ICE candidates between peers.
  socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
    if (io.sockets.sockets.get(targetSocketId)) {
      io.to(targetSocketId).emit('ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    }
  });

  // Handle chat messages inside the room.
  socket.on('message', ({ roomId, username, text }) => {
    socket.to(roomId).emit('message', {
      username,
      text,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle typing indicator events.
  socket.on('typing', ({ roomId, username, isTyping }) => {
    socket.to(roomId).emit('typing', {
      username,
      isTyping,
    });
  });

  // When a user disconnects, clean up and notify the room.
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      const { roomId, username } = user;
      socket.to(roomId).emit('user-disconnected', {
        socketId: socket.id,
        username,
      });
      delete users[socket.id];
    }
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const BASE_PORT = parseInt(process.env.PORT || '3000', 10);
let currentPort = BASE_PORT;

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.warn(`Port ${currentPort} is in use. Trying port ${currentPort + 1}...`);
    currentPort += 1;
    server.listen(currentPort);
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
});

server.listen(currentPort, () => {
  console.log(`Server is running on http://localhost:${currentPort}`);
});
