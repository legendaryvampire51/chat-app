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
const connectedUsers = new Map();
const typingUsers = new Map(); // Changed to Map to store timeout IDs
const messageHistory = new Map(); // messageId -> message
let messageIdCounter = 1;

// Helper function to get active users list
function getActiveUsers() {
  return Array.from(connectedUsers.values());
}

function broadcastUserList() {
  io.emit('userList', getActiveUsers());
  console.log('Broadcasting user list:', getActiveUsers()); // Debug log
}

function addToHistory(message) {
  // Keep only last 50 messages
  const maxHistory = 50;
  if (messageHistory.size >= maxHistory) {
    const oldestKey = Array.from(messageHistory.keys())[0];
    messageHistory.delete(oldestKey);
  }
  messageHistory.set(message.id, message);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id); // Debug log

  socket.on('join', (username) => {
    console.log('User joining:', username); // Debug log
    
    // Store user
    connectedUsers.set(socket.id, username);
    
    // Send message history
    const messages = Array.from(messageHistory.values());
    socket.emit('messageHistory', messages);
    console.log('Sent message history:', messages); // Debug log
    
    // Broadcast user joined message
    const joinMessage = {
      id: messageIdCounter++,
      type: 'system',
      content: `${username} joined the chat`,
      timestamp: Date.now()
    };
    io.emit('message', joinMessage);
    addToHistory(joinMessage);
    
    // Update user list for all clients
    broadcastUserList();
  });

  socket.on('message', (content) => {
    const username = connectedUsers.get(socket.id);
    if (!username) {
      console.error('Message from unknown user:', socket.id);
      return;
    }

    console.log('Message received:', { username, content }); // Debug log
    
    const message = {
      id: messageIdCounter++,
      type: 'text',
      username,
      content,
      timestamp: Date.now()
    };
    
    io.emit('message', message);
    addToHistory(message);
    
    // Clear typing status
    if (typingUsers.has(socket.id)) {
      clearTimeout(typingUsers.get(socket.id));
      typingUsers.delete(socket.id);
      io.emit('typing', getActiveUsers().filter(user => typingUsers.has(user)));
    }
  });

  socket.on('typing', () => {
    const username = connectedUsers.get(socket.id);
    if (!username) return;

    // Clear existing timeout
    if (typingUsers.has(socket.id)) {
      clearTimeout(typingUsers.get(socket.id));
    }

    // Set new timeout
    typingUsers.set(socket.id, setTimeout(() => {
      typingUsers.delete(socket.id);
      io.emit('typing', Array.from(typingUsers.keys())
        .map(id => connectedUsers.get(id))
        .filter(Boolean));
    }, 3000));

    // Broadcast typing users
    io.emit('typing', Array.from(typingUsers.keys())
      .map(id => connectedUsers.get(id))
      .filter(Boolean));
  });

  socket.on('disconnect', () => {
    const username = connectedUsers.get(socket.id);
    if (username) {
      console.log('User disconnected:', username); // Debug log
      
      // Remove user
      connectedUsers.delete(socket.id);
      
      // Clear typing status
      if (typingUsers.has(socket.id)) {
        clearTimeout(typingUsers.get(socket.id));
        typingUsers.delete(socket.id);
      }
      
      // Broadcast user left message
      const leaveMessage = {
        id: messageIdCounter++,
        type: 'system',
        content: `${username} left the chat`,
        timestamp: Date.now()
      };
      io.emit('message', leaveMessage);
      addToHistory(leaveMessage);
      
      // Update user list
      broadcastUserList();
    }
  });

  // Handle message editing
  socket.on('editMessage', (data) => {
    const { messageId, newContent } = data;
    const message = messageHistory.get(messageId);
    
    if (message && message.username === username) {
      message.content = newContent;
      message.edited = true;
      io.emit('messageUpdated', {
        ...message,
        reactions: Array.from(message.reactions.entries()).map(([emoji, users]) => ({
          emoji,
          users: Array.from(users)
        })),
        readBy: Array.from(message.readBy)
      });
    }
  });

  // Handle message deletion
  socket.on('deleteMessage', (messageId) => {
    const message = messageHistory.get(messageId);
    
    if (message && message.username === username) {
      messageHistory.delete(messageId);
      io.emit('messageDeleted', messageId);
    }
  });

  // Handle message reactions
  socket.on('addReaction', (data) => {
    const { messageId, reaction } = data;
    const message = messageHistory.get(messageId);
    
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

  // Handle read receipts
  socket.on('messageRead', (messageId) => {
    const message = messageHistory.get(messageId);
    if (message) {
      message.readBy.add(username);
      io.emit('readReceiptUpdated', {
        messageId,
        readBy: Array.from(message.readBy)
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 