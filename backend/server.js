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
const typingUsers = new Map(); // Changed to Map to store timeout IDs
const messageHistory = []; // Store message history
const MAX_HISTORY = 50; // Maximum number of messages to store

// Helper function to get active users list
function getActiveUsers() {
  return Array.from(users.values());
}

// Helper function to add message to history
function addToHistory(messageData) {
  messageHistory.push(messageData);
  if (messageHistory.length > MAX_HISTORY) {
    messageHistory.shift(); // Remove oldest message if exceeding limit
  }
}

io.on('connection', (socket) => {
  console.log('New client connected');

  // Handle user joining
  socket.on('join', (username) => {
    users.set(socket.id, username);
    
    // Broadcast user joined message
    const joinMessage = {
      type: 'system',
      username: username,
      message: `${username} has joined the chat`,
      timestamp: new Date().toISOString()
    };
    addToHistory(joinMessage);
    io.emit('userJoined', joinMessage);

    // Send message history to the newly joined user
    socket.emit('messageHistory', messageHistory);

    // Send updated user list to all clients
    io.emit('userList', {
      users: getActiveUsers(),
      count: users.size
    });
  });

  // Handle chat messages
  socket.on('message', (message) => {
    const username = users.get(socket.id);
    const messageData = {
      type: 'message',
      username: username,
      message: message,
      timestamp: new Date().toISOString()
    };
    addToHistory(messageData);
    io.emit('message', messageData);
  });

  // Handle typing status
  socket.on('typing', (isTyping) => {
    const username = users.get(socket.id);
    if (!username) return;

    // Clear existing timeout for this user if it exists
    if (typingUsers.has(socket.id)) {
      clearTimeout(typingUsers.get(socket.id));
    }

    if (isTyping) {
      // Set new timeout
      const timeoutId = setTimeout(() => {
        typingUsers.delete(socket.id);
        socket.broadcast.emit('typingStatus', {
          users: Array.from(typingUsers.keys()).map(id => users.get(id))
        });
      }, 2000); // Timeout after 2 seconds of no typing

      typingUsers.set(socket.id, timeoutId);
    } else {
      typingUsers.delete(socket.id);
    }

    // Broadcast current typing status
    socket.broadcast.emit('typingStatus', {
      users: Array.from(typingUsers.keys()).map(id => users.get(id))
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const username = users.get(socket.id);
    if (username) {
      users.delete(socket.id);
      
      // Clear typing status
      if (typingUsers.has(socket.id)) {
        clearTimeout(typingUsers.get(socket.id));
        typingUsers.delete(socket.id);
      }
      
      const leaveMessage = {
        type: 'system',
        username: username,
        message: `${username} has left the chat`,
        timestamp: new Date().toISOString()
      };
      addToHistory(leaveMessage);
      io.emit('userLeft', leaveMessage);

      // Send updated user list
      io.emit('userList', {
        users: getActiveUsers(),
        count: users.size
      });

      // Update typing status for remaining users
      socket.broadcast.emit('typingStatus', {
        users: Array.from(typingUsers.keys()).map(id => users.get(id))
      });
    }
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 