const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add a simple health check endpoint
app.get('/', (req, res) => {
  res.send('Chat server is running');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: false,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  path: '/socket.io',
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
});

// Store connected users with their socket IDs and usernames
const users = new Map();
const typingUsers = new Map(); // Changed to Map to store timeout IDs
const messageHistory = []; // Store message history
const MAX_HISTORY = 50; // Maximum number of messages to store
const messageReadStatus = new Map(); // Track read status of messages by each user

// Store user public keys
const userPublicKeys = new Map();

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
  
  // Initialize read status for this message
  if (messageData.type === 'user') {
    const readStatus = new Map();
    // Message is read by sender
    if (messageData.sender) {
      readStatus.set(messageData.sender, true);
    }
    messageReadStatus.set(messageData.id, readStatus);
  }
  
  messageHistory.push(messageData);
  if (messageHistory.length > MAX_HISTORY) {
    // Remove read status for oldest message if exceeding limit
    if (messageHistory[0].id && messageReadStatus.has(messageHistory[0].id)) {
      messageReadStatus.delete(messageHistory[0].id);
    }
    messageHistory.shift(); // Remove oldest message if exceeding limit
  }
  return messageData;
}

// Find message by ID
function findMessageById(messageId) {
  return messageHistory.findIndex(msg => msg.id === messageId);
}

// Get read status of a message
function getMessageReadStatus(messageId) {
  if (messageReadStatus.has(messageId)) {
    const readByUsers = Array.from(messageReadStatus.get(messageId).keys())
      .filter(username => messageReadStatus.get(messageId).get(username));
    return readByUsers;
  }
  return [];
}

// Update read status for messages
function updateReadStatus(username, messageIds) {
  const updatedMessageIds = [];
  
  messageIds.forEach(messageId => {
    if (messageReadStatus.has(messageId)) {
      const readStatus = messageReadStatus.get(messageId);
      // If the user hasn't read this message yet
      if (!readStatus.has(username) || !readStatus.get(username)) {
        readStatus.set(username, true);
        messageReadStatus.set(messageId, readStatus);
        updatedMessageIds.push(messageId);
      }
    }
  });
  
  return updatedMessageIds;
}

// Handle user joining
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  let username = null;
  let isAuthenticated = false;

  // Handle authentication
  socket.on('authenticate', async (authData) => {
    try {
      console.log('Authentication attempt for:', authData.username);
      
      if (!authData.username || authData.username.trim() === '') {
        throw new Error('Username is required');
      }
      
      // Check if username is already taken
      if (Array.from(users.values()).includes(authData.username)) {
        throw new Error('Username is already taken');
      }
      
      // Store user data
      username = authData.username;
      users.set(socket.id, username);
      isAuthenticated = true;
      
      // Get current user list
      const activeUsers = Array.from(users.values());
      
      // Send authentication success with user list
      socket.emit('authenticated', {
        users: activeUsers,
        username: username
      });
      
      // Send current user list to all users
      io.emit('userList', activeUsers);
      
      // Broadcast the new user joined
      io.emit('userJoined', {
        username: username,
        users: activeUsers
      });
      
      console.log('User successfully authenticated:', username);
      console.log('Current users:', activeUsers);
    } catch (error) {
      console.error('Authentication error:', error);
      socket.emit('authentication_error', { message: error.message });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    if (username && isAuthenticated) {
      users.delete(socket.id);
      const activeUsers = Array.from(users.values());
      
      // Notify all clients about user leaving
      io.emit('userLeft', {
        username: username,
        users: activeUsers
      });
      
      console.log('User disconnected:', username);
      console.log('Current users:', activeUsers);
    }
  });

  // Handle chat messages
  socket.on('sendMessage', (messageData) => {
    if (!username || !isAuthenticated) {
      console.error('Unauthorized message attempt');
      return;
    }

    const message = {
      id: uuidv4(),
      sender: username,
      text: messageData.text,
      timestamp: new Date().toISOString()
    };
    
    console.log('New message:', message);
    io.emit('message', message);
  });

  // Handle read receipts
  socket.on('markAsRead', (data) => {
    if (!username || !data.messageIds || !Array.isArray(data.messageIds)) return;
    
    // Update read status for each message
    const updatedMessageIds = updateReadStatus(username, data.messageIds);
    
    if (updatedMessageIds.length > 0) {
      // Broadcast updated read status to all users
      const readReceipts = {};
      updatedMessageIds.forEach(messageId => {
        readReceipts[messageId] = getMessageReadStatus(messageId);
      });
      
      io.emit('readReceipts', { readReceipts });
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

  // Get updated read receipts
  socket.on('getReadReceipts', () => {
    if (!username) return;
    
    const allReadReceipts = {};
    messageReadStatus.forEach((readStatus, messageId) => {
      allReadReceipts[messageId] = getMessageReadStatus(messageId);
    });
    
    socket.emit('readReceipts', { readReceipts: allReadReceipts });
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

  // Handle public key exchange
  socket.on('exchangePublicKey', async (data) => {
    const { username, publicKey } = data;
    if (!username || !publicKey) return;

    // Store the user's public key
    userPublicKeys.set(username, publicKey);

    // Broadcast the new user's public key to all connected users
    socket.broadcast.emit('userPublicKey', {
      username,
      publicKey
    });

    // Send all existing users' public keys to the new user
    const existingKeys = Array.from(userPublicKeys.entries())
      .filter(([key]) => key !== username)
      .map(([username, key]) => ({ username, publicKey: key }));
    
    socket.emit('existingPublicKeys', existingKeys);
  });

  // Handle encrypted message
  socket.on('sendEncryptedMessage', async (data) => {
    const { text, recipient, encryptedMessage } = data;
    if (!text || !recipient || !encryptedMessage) return;

    const messageData = {
      id: Date.now().toString(),
      text: text,
      sender: socket.username,
      recipient: recipient,
      encryptedMessage: encryptedMessage,
      timestamp: Date.now(),
      type: 'encrypted'
    };

    // Add to message history
    addToHistory(messageData);

    // Emit to sender and recipient
    socket.emit('message', messageData);
    const recipientSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.username === recipient);
    if (recipientSocket) {
      recipientSocket.emit('message', messageData);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 