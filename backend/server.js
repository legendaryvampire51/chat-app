const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store connected users
const users = new Map();

io.on('connection', (socket) => {
  console.log('New client connected');

  // Handle user joining
  socket.on('join', (username) => {
    users.set(socket.id, username);
    io.emit('userJoined', {
      username: username,
      message: `${username} has joined the chat`
    });
  });

  // Handle chat messages
  socket.on('message', (message) => {
    const username = users.get(socket.id);
    io.emit('message', {
      username: username,
      message: message,
      timestamp: new Date().toISOString()
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const username = users.get(socket.id);
    if (username) {
      users.delete(socket.id);
      io.emit('userLeft', {
        username: username,
        message: `${username} has left the chat`
      });
    }
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 