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
const messages = new Map(); // Store messages with their IDs
let messageIdCounter = 1;

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

function generateMessageId() {
  return `msg_${Date.now()}_${messageIdCounter++}`;
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

  // Handle message editing
  socket.on('editMessage', (data) => {
    const { messageId, newContent } = data;
    const message = messages.get(messageId);
    
    if (message && message.username === username) {
      message.content = newContent;
      message.edited = true;
      io.emit('messageUpdated', message);
    }
  });

  // Handle message deletion
  socket.on('deleteMessage', (messageId) => {
    const message = messages.get(messageId);
    
    if (message && message.username === username) {
      messages.delete(messageId);
      io.emit('messageDeleted', messageId);
    }
  });

  // Handle message reactions
  socket.on('addReaction', (data) => {
    const { messageId, reaction } = data;
    const message = messages.get(messageId);
    
    if (message) {
      if (!message.reactions.has(reaction)) {
        message.reactions.set(reaction, new Set());
      }
      message.reactions.get(reaction).add(username);
      io.emit('reactionUpdated', {
        messageId,
        reactions: Array.from(message.reactions.entries()).map(([emoji, users]) => ({
          emoji,
          users: Array.from(users)
        }))
      });
    }
  });

  // Handle removing reactions
  socket.on('removeReaction', (data) => {
    const { messageId, reaction } = data;
    const message = messages.get(messageId);
    
    if (message && message.reactions.has(reaction)) {
      message.reactions.get(reaction).delete(username);
      if (message.reactions.get(reaction).size === 0) {
        message.reactions.delete(reaction);
      }
      io.emit('reactionUpdated', {
        messageId,
        reactions: Array.from(message.reactions.entries()).map(([emoji, users]) => ({
          emoji,
          users: Array.from(users)
        }))
      });
    }
  });

  // Handle read receipts
  socket.on('messageRead', (messageId) => {
    const message = messages.get(messageId);
    if (message) {
      message.readBy.add(username);
      io.emit('readReceiptUpdated', {
        messageId,
        readBy: Array.from(message.readBy)
      });
    }
  });

  // Handle voice messages
  socket.on('voiceMessage', (data) => {
    const messageId = generateMessageId();
    const messageData = {
      id: messageId,
      username: username,
      content: data.audioUrl,
      timestamp: Date.now(),
      type: 'voice',
      reactions: new Map(),
      readBy: new Set([username])
    };
    
    messages.set(messageId, messageData);
    io.emit('message', messageData);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 