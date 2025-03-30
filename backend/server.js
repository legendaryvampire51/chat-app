const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
  // Generate a unique message ID if not present
  if (!messageData.id) {
    messageData.id = uuidv4();
  }
  
  // Add timestamp if not present
  if (!messageData.timestamp) {
    messageData.timestamp = new Date().toISOString();
  }
  
  messageHistory.push(messageData);
  if (messageHistory.length > MAX_HISTORY) {
    messageHistory.shift(); // Remove oldest message if exceeding limit
  }
  return messageData;
}

// Find message by ID
function findMessageById(messageId) {
  return messageHistory.findIndex(msg => msg.id === messageId);
}

io.on('connection', (socket) => {
  console.log('New client connected');
  let username = null;

  // Handle user joining
  socket.on('join', (userData) => {
    username = userData.username;
    users.set(socket.id, username);
    
    // Send current user list to the new user
    socket.emit('userList', getActiveUsers());
    
    // Send message history to new user
    socket.emit('messageHistory', messageHistory);
    
    // Broadcast the new user joined
    const joinMessage = {
      id: uuidv4(),
      type: 'system',
      text: `${username} has joined the chat`,
      timestamp: new Date().toISOString()
    };
    
    addToHistory(joinMessage);
    io.emit('message', joinMessage);
    
    // Update user list for all users
    io.emit('userList', getActiveUsers());
  });

  // Handle chat messages
  socket.on('sendMessage', (messageData) => {
    if (username) {
      const message = {
        id: uuidv4(),
        sender: username,
        text: messageData.text,
        timestamp: new Date().toISOString(),
        type: 'user'
      };
      
      const savedMessage = addToHistory(message);
      io.emit('message', savedMessage);
    }
  });

  // Edit message
  socket.on('editMessage', (editData) => {
    if (username) {
      const messageIndex = findMessageById(editData.messageId);
      
      if (messageIndex !== -1 && messageHistory[messageIndex].sender === username) {
        // Only allow editing if it's the sender
        messageHistory[messageIndex].text = editData.newText;
        messageHistory[messageIndex].edited = true;
        
        // Broadcast the edited message
        io.emit('messageEdited', {
          id: editData.messageId,
          text: editData.newText,
          edited: true
        });
      }
    }
  });

  // Delete message
  socket.on('deleteMessage', (deleteData) => {
    if (username) {
      const messageIndex = findMessageById(deleteData.messageId);
      
      if (messageIndex !== -1 && messageHistory[messageIndex].sender === username) {
        // Only allow deletion if it's the sender
        messageHistory[messageIndex].deleted = true;
        messageHistory[messageIndex].text = 'This message has been deleted';
        
        // Broadcast the deleted message
        io.emit('messageDeleted', {
          id: deleteData.messageId
        });
      }
    }
  });

  // Handle typing status
  socket.on('typing', (isTyping) => {
    if (!username) return;
    
    // Clear existing timeout
    if (typingUsers.has(socket.id)) {
      clearTimeout(typingUsers.get(socket.id));
    }
    
    if (isTyping) {
      // Set timeout to clear typing status after 2 seconds
      const timeoutId = setTimeout(() => {
        typingUsers.delete(socket.id);
        broadcastTypingUsers();
      }, 2000);
      
      typingUsers.set(socket.id, timeoutId);
    } else {
      typingUsers.delete(socket.id);
    }
    
    broadcastTypingUsers();
  });

  // Broadcast typing users
  function broadcastTypingUsers() {
    const typingUsernames = [];
    for (const [socketId, _] of typingUsers) {
      if (users.has(socketId)) {
        typingUsernames.push(users.get(socketId));
      }
    }
    
    io.emit('typingStatus', {
      users: typingUsernames
    });
  }

  // Handle disconnection
  socket.on('disconnect', () => {
    if (username) {
      console.log(`Client disconnected: ${username}`);
      
      // Clear typing timeout if exists
      if (typingUsers.has(socket.id)) {
        clearTimeout(typingUsers.get(socket.id));
        typingUsers.delete(socket.id);
        broadcastTypingUsers();
      }
      
      users.delete(socket.id);
      
      // Broadcast user left message
      const leaveMessage = {
        id: uuidv4(),
        type: 'system',
        text: `${username} has left the chat`,
        timestamp: new Date().toISOString()
      };
      
      addToHistory(leaveMessage);
      io.emit('message', leaveMessage);
      
      // Update user list for all clients
      io.emit('userList', getActiveUsers());
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 