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

// Store connected users with their socket IDs and usernames
const users = new Map();
const typingUsers = new Set();

// Helper function to get active users list
function getActiveUsers() {
  return Array.from(users.values());
}

io.on('connection', (socket) => {
  console.log('New client connected');

  // Handle user joining
  socket.on('join', (username) => {
    users.set(socket.id, username);
    
    // Broadcast user joined message
    io.emit('userJoined', {
      username: username,
      message: `${username} has joined the chat`
    });

    // Send updated user list to all clients
    io.emit('userList', {
      users: getActiveUsers(),
      count: users.size
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

  // Handle typing status
  socket.on('typing', (isTyping) => {
    const username = users.get(socket.id);
    if (!username) return;

    if (isTyping) {
      typingUsers.add(username);
    } else {
      typingUsers.delete(username);
    }

    // Broadcast typing status to all other users
    socket.broadcast.emit('typingStatus', {
      users: Array.from(typingUsers)
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const username = users.get(socket.id);
    if (username) {
      users.delete(socket.id);
      typingUsers.delete(username);
      
      io.emit('userLeft', {
        username: username,
        message: `${username} has left the chat`
      });

      // Send updated user list
      io.emit('userList', {
        users: getActiveUsers(),
        count: users.size
      });
    }
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 