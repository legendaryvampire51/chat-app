// Import encryption utility
import encryption from './encryption.js';

// Get the backend URL from environment variable or use localhost as fallback
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000'
  : 'https://chat-app-backend-ybjt.onrender.com';

// Global variables
let socket = null;
let currentUsername = localStorage.getItem('username') || '';
let typingTimeout = null;
let lastTypingStatus = false;
let activeMessageEdit = null; // Track which message is being edited
let socketConnected = false; // Track socket connection state
let connectionRetries = 0;
const MAX_CONNECTION_RETRIES = 3;
let unreadMessages = []; // Track messages that need to be marked as read
let readReceipts = {}; // Store read receipts for messages

// Function to add a message to the chat
function addMessage(data) {
    addMessageToChat(data);
}

// Initialize when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - initializing app');
    
    // Update debug info
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
        debugInfo.textContent = 'Initializing connection...';
    }
    
    // Connect to the server first
    connectToServer();
    
    // Set up event listeners only after DOM is loaded
    setupEventListeners();
    
    // Show login form initially
    showLogin();
});

// Setup all event listeners
function setupEventListeners() {
    console.log('Setting up event listeners');
    
    // Login form submit
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Login form submitted');
            const username = document.getElementById('username').value.trim();
            
            if (!socketConnected) {
                // If socket is not connected, attempt to reconnect
                showStatus('Connecting to server...', 'warning');
                connectToServer(() => {
                    // Try joining after connection attempt
                    joinChat(username);
                });
                return;
            }
            
            joinChat(username);
        });
    }
    
    // Send message on form submit
    const messageForm = document.getElementById('message-form');
    if (messageForm) {
        messageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendMessage();
        });
    }
    
    // Send message on Enter key (without Shift)
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Message input typing events
        messageInput.addEventListener('input', handleTyping);
        messageInput.addEventListener('touchstart', handleTyping);
        messageInput.addEventListener('touchend', handleTyping);
    }
}

// Connect to Socket.io server
function connectToServer(callback) {
    // Try to use production URL if available, fallback to localhost for development
    const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000' 
        : 'https://chat-app-backend-ybjt.onrender.com';
        
    console.log('Connecting to server at:', serverUrl);
    
    // Update debug info
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
        debugInfo.textContent = 'Connecting to: ' + serverUrl;
    }
    
    // If socket already exists, disconnect it
    if (socket) {
        try {
            console.log('Disconnecting existing socket connection');
            socket.disconnect();
        } catch (e) {
            console.error('Error disconnecting socket:', e);
        }
    }
    
    // Create socket connection
    try {
        console.log('Creating new socket connection...');
        socket = io(serverUrl, {
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            forceNew: true,
            autoConnect: true,
            path: '/socket.io'
        });
        
        // Setup socket event handlers immediately
        setupSocketEvents(callback);
        
        // Add a timeout to switch to polling if websocket fails
        setTimeout(() => {
            if (!socketConnected) {
                console.log('WebSocket connection failed, trying polling transport...');
                if (debugInfo) {
                    debugInfo.textContent = 'Trying polling transport...';
                }
                
                // Disconnect current socket
                if (socket) {
                    try {
                        socket.disconnect();
                    } catch (e) {
                        console.error('Error disconnecting socket:', e);
                    }
                }
                
                // Try with polling transport only
                socket = io(serverUrl, {
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 20000,
                    forceNew: true,
                    transports: ['polling'],
                    path: '/socket.io'
                });
                
                // Setup socket event handlers again
                setupSocketEvents(callback);
            }
        }, 5000);
    } catch (error) {
        console.error('Error creating socket connection:', error);
        socketConnected = false;
        showStatus('Failed to connect: ' + error.message, 'error');
        
        if (debugInfo) {
            debugInfo.textContent = 'Connection Error: ' + error.message;
        }
        
        // Try to reconnect if under max retries
        if (connectionRetries < MAX_CONNECTION_RETRIES) {
            connectionRetries++;
            setTimeout(() => {
                console.log(`Retrying connection (${connectionRetries}/${MAX_CONNECTION_RETRIES})...`);
                connectToServer(callback);
            }, 2000);
        }
    }
}

// Setup all socket event handlers
function setupSocketEvents(callback) {
    if (!socket) {
        console.error('Cannot setup events - socket not initialized');
        return;
    }
    
    console.log('Setting up socket events');

    // Connection successful
    socket.on('connect', () => {
        console.log('Connected to server');
        socketConnected = true;
        connectionRetries = 0;
        showStatus('Connected to chat server', 'success');
        
        // Update debug info
        const debugInfo = document.getElementById('debug-info');
        if (debugInfo) {
            debugInfo.textContent = 'Connected ✓';
            debugInfo.style.backgroundColor = 'green';
        }
        
        // Request read receipts when connected
        if (socket && socketConnected) {
            socket.emit('getReadReceipts');
        }
        
        // If we have a username, automatically join the chat
        if (currentUsername) {
            console.log('Auto-joining with username:', currentUsername);
            joinChat(currentUsername, true);
        }
        
        // Call the callback if provided (for reconnection scenarios)
        if (typeof callback === 'function') {
            callback();
        }
    });

    // Connection failed
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        socketConnected = false;
        showStatus('Error connecting to chat server: ' + error.message, 'error');
        
        // Update debug info
        const debugInfo = document.getElementById('debug-info');
        if (debugInfo) {
            debugInfo.textContent = 'Connection Error: ' + error.message;
            debugInfo.style.backgroundColor = 'red';
        }
    });

    // Disconnected
    socket.on('disconnect', () => {
        const typingDiv = document.querySelector('.typing-status');
        if (typingDiv) {
            typingDiv.remove();
        }
        lastTypingStatus = false;
        socketConnected = false;
        console.log('Disconnected from server');
        showStatus('Disconnected from chat server. Trying to reconnect...', 'warning');
        
        // Update debug info
        const debugInfo = document.getElementById('debug-info');
        if (debugInfo) {
            debugInfo.textContent = 'Disconnected';
            debugInfo.style.backgroundColor = 'orange';
        }
    });

    // Reconnecting
    socket.on('reconnecting', (attemptNumber) => {
        console.log(`Attempting to reconnect: ${attemptNumber}`);
        showStatus(`Reconnecting... (Attempt ${attemptNumber})`, 'warning');
    });

    // Reconnect failed
    socket.on('reconnect_failed', () => {
        console.log('Failed to reconnect');
        showStatus('Failed to reconnect to the server. Please refresh the page.', 'error');
    });

    // User list update
    socket.on('userList', (users) => {
        console.log('Received user list:', users);
        // Handle both array and object with users property
        const userArray = Array.isArray(users) ? users : (users && users.users ? users.users : []);
        updateUserList(userArray);
    });

    // Receive message
    socket.on('message', (messageData) => {
        console.log('Received message:', messageData);
        addMessageToChat(messageData);
        
        // If this message is from someone else, mark it as read
        if (messageData.sender && messageData.sender !== currentUsername && messageData.id) {
            markMessageAsRead(messageData.id);
        }
    });

    // Legacy event handlers for backward compatibility
    socket.on('userJoined', (data) => {
        console.log('User joined (legacy event):', data);
        addMessageToChat(data);
    });
    
    socket.on('userLeft', (data) => {
        console.log('User left (legacy event):', data);
        addMessageToChat(data);
    });

    // Receive message history
    socket.on('messageHistory', (messages) => {
        console.log('Received message history, count:', messages.length);
        const messagesContainer = document.querySelector('.chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
            messages.forEach(message => {
                addMessageToChat(message);
            });
        }
    });

    // Handle typing status updates
    socket.on('typingStatus', (data) => {
        const typingDiv = document.querySelector('.typing-status');
        const chatInput = document.querySelector('.chat-input');
        
        if (data.users && data.users.length > 0) {
            const users = data.users.filter(user => user !== currentUsername);
            if (users.length > 0) {
                const message = users.length === 1
                    ? `${users[0]} is typing...`
                    : `${users.join(', ')} are typing...`;
                    
                if (typingDiv) {
                    typingDiv.textContent = message;
                } else if (chatInput) {
                    const newTypingDiv = document.createElement('div');
                    newTypingDiv.className = 'typing-status';
                    newTypingDiv.textContent = message;
                    chatInput.appendChild(newTypingDiv);
                }
                return;
            }
        }
        
        // Remove typing status if no one is typing
        if (typingDiv) {
            typingDiv.remove();
        }
    });

    // Message edited
    socket.on('messageEdited', (data) => {
        const messageElement = document.querySelector(`.message[data-id="${data.id}"]`);
        if (messageElement) {
            const messageText = messageElement.querySelector('.message-text');
            if (messageText) {
                messageText.textContent = data.text;
                
                // Add edited indicator if not already there
                if (data.edited && !messageElement.querySelector('.edited-indicator')) {
                    const editedSpan = document.createElement('span');
                    editedSpan.className = 'edited-indicator';
                    editedSpan.textContent = ' (edited)';
                    messageText.appendChild(editedSpan);
                }
            }
        }
    });

    // Message deleted
    socket.on('messageDeleted', (data) => {
        const messageElement = document.querySelector(`.message[data-id="${data.id}"]`);
        if (messageElement) {
            messageElement.classList.add('deleted');
            const messageText = messageElement.querySelector('.message-text');
            if (messageText) {
                messageText.textContent = 'This message has been deleted';
            }
            
            // Remove edit/delete controls
            const controls = messageElement.querySelector('.message-controls');
            if (controls) {
                controls.remove();
            }
        }
    });

    // Read receipts
    socket.on('readReceipts', (data) => {
        console.log('Received read receipts:', data);
        if (data && data.readReceipts) {
            // Update read receipts
            readReceipts = {...readReceipts, ...data.readReceipts};
            
            // Update read receipt display for all affected messages
            Object.keys(data.readReceipts).forEach(messageId => {
                updateReadReceiptDisplay(messageId, data.readReceipts[messageId]);
            });
        }
    });

    // Handle public key exchange
    socket.on('userPublicKey', async (data) => {
        const { username, publicKey } = data;
        try {
            console.log('Received public key for user:', username);
            const importedKey = await encryption.importPublicKey(publicKey);
            encryption.userKeys.set(username, publicKey);
            console.log('Successfully imported public key for:', username);
        } catch (error) {
            console.error('Error importing public key:', error);
        }
    });

    socket.on('existingPublicKeys', async (keys) => {
        console.log('Received existing public keys:', keys);
        for (const { username, publicKey } of keys) {
            try {
                const importedKey = await encryption.importPublicKey(publicKey);
                encryption.userKeys.set(username, publicKey);
                console.log('Successfully imported public key for:', username);
            } catch (error) {
                console.error('Error importing public key:', error);
            }
        }
    });
}

// Show login form and hide chat
function showLogin() {
    console.log('Showing login form');
    const loginContainer = document.getElementById('login-container');
    const chatContainer = document.getElementById('chat-container');
    
    if (loginContainer) loginContainer.style.display = 'flex';
    if (chatContainer) chatContainer.style.display = 'none';
}

// Show chat and hide login form
function showChat() {
    console.log('Showing chat window');
    try {
        const loginContainer = document.getElementById('login-container');
        const chatContainer = document.getElementById('chat-container');
        const messageInput = document.getElementById('message-input');
        const userDisplay = document.getElementById('user-display');
        
        if (!chatContainer) {
            console.error('Chat container not found!');
            alert('Debug: Chat container element not found!');
            return;
        }
        
        if (loginContainer) loginContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
        
        // Update username display with logout button
        if (userDisplay) {
            userDisplay.innerHTML = `
                <span>${currentUsername}</span>
                <button onclick="logout()" class="logout-button">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            `;
        } else {
            console.error('User display element not found!');
        }
        
        // Check if user list container exists, if not create it
        if (!document.querySelector('.user-list-container')) {
            console.log('Creating user list container');
            const userListContainer = document.createElement('div');
            userListContainer.className = 'user-list-container';
            userListContainer.innerHTML = `
                <div class="user-list-header">
                    Online Users (<span>0</span>)
                </div>
                <div class="user-list"></div>
            `;
            chatContainer.appendChild(userListContainer);
        }
        
        if (messageInput) messageInput.focus();
        
        // Force a reflow/repaint
        void chatContainer.offsetWidth;
        
        console.log('Display states:', {
            loginContainer: loginContainer ? loginContainer.style.display : 'not found',
            chatContainer: chatContainer.style.display
        });
        
        // Ensure chat container is visible
        setTimeout(() => {
            if (chatContainer.style.display !== 'flex') {
                console.error('Chat container still not visible after timeout!');
                chatContainer.style.display = 'flex';
                alert('Debug: Forcing chat container display after timeout');
            }
        }, 500);
        
        // Initialize socket connection
        initializeSocket();
        
    } catch (error) {
        console.error('Error in showChat:', error);
        alert('Debug error in showChat: ' + error.message);
    }
}

// Join chat room
async function joinChat(username, reconnect = false) {
    console.log('Starting joinChat process for username:', username);
    
    if (!socket) {
        console.error('Socket not initialized');
        alert('Connection error: Socket not initialized. Refreshing the page may help.');
        return;
    }
    
    if (!socketConnected) {
        console.error('Socket not connected when trying to join chat');
        const debugInfo = document.getElementById('debug-info');
        if (debugInfo) {
            debugInfo.textContent = 'Error: Socket not connected!';
            debugInfo.style.backgroundColor = 'red';
        }
        
        // Try to reconnect
        showStatus('Not connected to server. Attempting to reconnect...', 'warning');
        connectToServer(() => {
            // Retry joining after connection
            if (socketConnected) {
                joinChat(username, reconnect);
            } else {
                showStatus('Could not connect to server. Please refresh the page.', 'error');
            }
        });
        return;
    }
    
    if (!username || username.trim() === '') {
        alert('Please enter a username');
        return;
    }
    
    try {
        console.log('Generating key pair for user...');
        // Generate key pair for the user
        const { publicKey } = await encryption.generateKeyPair();
        console.log('Key pair generated successfully');
        
        // Store username for reconnection
        currentUsername = username;
        localStorage.setItem('username', username);
        
        console.log('Emitting join event...');
        // Emit join event with public key
        socket.emit('join', { username });
        socket.emit('exchangePublicKey', { username, publicKey });
        
        console.log('Showing chat interface...');
        // Show chat interface
        showChat();
        
        // Update debug info
        const debugInfo = document.getElementById('debug-info');
        if (debugInfo) {
            debugInfo.textContent = 'Joined as: ' + username;
            debugInfo.style.backgroundColor = 'green';
        }
    } catch (error) {
        console.error('Error in joinChat:', error);
        alert('Error joining chat: ' + error.message);
    }
}

// Show status message
function showStatus(message, type = 'info') {
    console.log(`Status: ${message} (${type})`);
    const statusContainer = document.getElementById('status-container');
    if (!statusContainer) {
        console.error('Status container not found');
        return;
    }
    
    const statusMessage = document.createElement('div');
    statusMessage.className = `status-message ${type}`;
    statusMessage.textContent = message;
    statusContainer.appendChild(statusMessage);
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (statusMessage.parentNode) {
            statusMessage.remove();
        }
    }, 5000);
}

// Update user list
function updateUserList(users) {
    const userList = document.querySelector('.user-list');
    const userCount = document.querySelector('.user-list-header span');
    
    if (!userList || !userCount) {
        console.error('User list elements not found');
        return;
    }
    
    userList.innerHTML = '';
    userCount.textContent = users.length;
    
    users.forEach(username => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        
        // Add encryption status indicator
        const hasKey = encryption.userKeys.has(username);
        const statusIcon = hasKey ? '🔒' : '🔓';
        
        userItem.innerHTML = `
            <span class="user-name">${username}</span>
            <span class="encryption-status" title="${hasKey ? 'Encryption available' : 'Encryption not available'}">${statusIcon}</span>
        `;
        
        // Highlight current user
        if (username === currentUsername) {
            userItem.querySelector('.user-name').textContent += ' (you)';
            userItem.classList.add('current-user');
        }
        
        userList.appendChild(userItem);
    });
}

// Handle typing status
function handleTyping() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput) return;
    
    const isTyping = messageInput.value.length > 0;
    
    // Clear existing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    // Only emit if typing status has changed and socket is connected
    if (socket && socket.connected && isTyping !== lastTypingStatus) {
        lastTypingStatus = isTyping;
        socket.emit('typing', isTyping);
    }
    
    // Set new timeout to stop typing after 2 seconds of no input
    if (isTyping) {
        typingTimeout = setTimeout(() => {
            lastTypingStatus = false;
            if (socket && socket.connected) {
                socket.emit('typing', false);
            }
        }, 2000);
    }
}

// Send message function
async function sendMessage() {
    const messageInput = document.getElementById('message-input');
    if (!messageInput) {
        console.error('Message input not found');
        return;
    }
    
    const message = messageInput.value.trim();
    
    if (!socket || !socket.connected) {
        showStatus('Not connected to server. Please try again.', 'error');
        return;
    }
    
    if (message) {
        console.log('Sending message:', message);
        
        // Get recipient from UI
        const recipient = document.getElementById('recipient-select').value;
        const encryptMessage = document.getElementById('encrypt-message').checked;
        
        try {
            if (encryptMessage) {
                // Always encrypt the message with our own public key
                const { publicKey } = await encryption.generateKeyPair();
                const importedKey = await encryption.importPublicKey(publicKey);
                
                // Encrypt the message
                const encryptedMessage = await encryption.encrypt(message, importedKey);
                
                // Send encrypted message
                socket.emit('sendEncryptedMessage', {
                    text: message,
                    recipient: recipient,
                    encryptedMessage: encryptedMessage,
                    senderPublicKey: publicKey // Include sender's public key
                });
            } else {
                // Send as regular message
                socket.emit('sendMessage', { text: message });
            }
            
            messageInput.value = '';
            
            // Reset typing status
            lastTypingStatus = false;
            socket.emit('typing', false);
        } catch (error) {
            console.error('Error sending message:', error);
            showStatus('Error sending message: ' + error.message, 'error');
        }
    }
}

// Add message to chat
async function addMessageToChat(messageData) {
    const messagesContainer = document.querySelector('.chat-messages');
    if (!messagesContainer) {
        console.error('Messages container not found');
        return;
    }
    
    const messageElement = document.createElement('div');
    
    // Set message ID as data attribute for edit/delete
    if (messageData.id) {
        messageElement.dataset.id = messageData.id;
    }
    
    // Create formatted timestamp
    const timestamp = new Date(messageData.timestamp);
    const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Determine message type and set content
    if (messageData.type === 'system') {
        messageElement.className = 'system-message';
        messageElement.textContent = messageData.text || messageData.message;
    } else {
        messageElement.className = 'message';
        
        if (messageData.deleted) {
            messageElement.classList.add('deleted');
        }
        
        const senderName = messageData.sender || messageData.username;
        
        // Add sent/received class based on sender
        if (senderName === currentUsername) {
            messageElement.classList.add('sent');
        } else {
            messageElement.classList.add('received');
            
            // Mark other users' messages as read when displayed
            if (messageData.id) {
                markMessageAsRead(messageData.id);
            }
        }
        
        // Message sender
        const senderElement = document.createElement('div');
        senderElement.className = 'message-sender';
        senderElement.textContent = senderName;
        messageElement.appendChild(senderElement);
        
        // Message text
        const textElement = document.createElement('div');
        textElement.className = 'message-text';
        
        // Handle encrypted messages
        if (messageData.type === 'encrypted') {
            try {
                // If we have the sender's public key in the message data, use it
                let senderPublicKey = messageData.senderPublicKey;
                
                // If not in message data, try to get it from our stored keys
                if (!senderPublicKey) {
                    senderPublicKey = encryption.userKeys.get(senderName);
                }
                
                if (senderPublicKey) {
                    const importedKey = await encryption.importPublicKey(senderPublicKey);
                    const decryptedText = await encryption.decrypt(
                        messageData.encryptedMessage,
                        importedKey
                    );
                    textElement.textContent = decryptedText;
                } else {
                    // If we don't have the key yet, show encrypted indicator
                    textElement.textContent = '[Encrypted message]';
                    // Store the message data for later decryption
                    if (!encryption.pendingDecryption.has(messageData.id)) {
                        encryption.pendingDecryption.set(messageData.id, messageData);
                    }
                }
            } catch (error) {
                console.error('Error decrypting message:', error);
                textElement.textContent = '[Encrypted message]';
            }
        } else {
            textElement.textContent = messageData.text || messageData.message;
        }
        
        // Add encryption indicator if message is encrypted
        if (messageData.type === 'encrypted') {
            const encryptionIndicator = document.createElement('span');
            encryptionIndicator.className = 'encryption-indicator';
            encryptionIndicator.innerHTML = ' 🔒';
            textElement.appendChild(encryptionIndicator);
        }
        
        // Add edited indicator if needed
        if (messageData.edited) {
            const editedSpan = document.createElement('span');
            editedSpan.className = 'edited-indicator';
            editedSpan.textContent = ' (edited)';
            textElement.appendChild(editedSpan);
        }
        
        messageElement.appendChild(textElement);
        
        // Add timestamp and read receipt container for better layout
        const metaContainer = document.createElement('div');
        metaContainer.className = 'message-meta';
        
        // Add timestamp
        const timeElement = document.createElement('div');
        timeElement.className = 'timestamp';
        timeElement.textContent = formattedTime;
        metaContainer.appendChild(timeElement);
        
        // Add read receipt if this is the user's message
        if (senderName === currentUsername && messageData.id) {
            const readReceiptElement = document.createElement('div');
            readReceiptElement.className = 'read-receipt';
            readReceiptElement.innerHTML = '<i class="fas fa-check"></i>'; // Default to sent but not read
            readReceiptElement.title = 'Sent';
            metaContainer.appendChild(readReceiptElement);
            
            // Update read receipt if we have that information
            if (readReceipts[messageData.id]) {
                updateReadReceiptDisplay(messageData.id, readReceipts[messageData.id]);
            }
        }
        
        messageElement.appendChild(metaContainer);
        
        // Add edit/delete controls if message is from current user and not deleted
        if (senderName === currentUsername && !messageData.deleted && messageData.id) {
            const controlsElement = document.createElement('div');
            controlsElement.className = 'message-controls';
            
            // Edit button
            const editButton = document.createElement('button');
            editButton.className = 'edit-button';
            editButton.innerHTML = '<i class="fas fa-edit"></i>';
            editButton.title = 'Edit message';
            editButton.addEventListener('click', () => editMessage(messageData.id));
            controlsElement.appendChild(editButton);
            
            // Delete button
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.title = 'Delete message';
            deleteButton.addEventListener('click', () => deleteMessage(messageData.id));
            controlsElement.appendChild(deleteButton);
            
            messageElement.appendChild(controlsElement);
        }
    }
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Mark visible messages as read when they appear
    if (messageData.type !== 'system' && messageData.id && 
        messageData.sender && messageData.sender !== currentUsername) {
        markMessageAsRead(messageData.id);
    }
}

// Edit message function
function editMessage(messageId) {
    // Get message element and text
    const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
    if (!messageElement) return;
    
    // If another message is being edited, cancel that edit first
    if (activeMessageEdit) {
        cancelEdit(activeMessageEdit);
    }
    
    const textElement = messageElement.querySelector('.message-text');
    const originalText = textElement.textContent.replace(' (edited)', '');
    
    // Save current editing state
    activeMessageEdit = {
        id: messageId,
        element: messageElement,
        originalText: originalText
    };
    
    // Hide the current text
    textElement.style.display = 'none';
    
    // Create edit form
    const editForm = document.createElement('div');
    editForm.className = 'edit-form';
    
    // Create textarea with current text
    const editInput = document.createElement('textarea');
    editInput.className = 'edit-input';
    editInput.value = originalText;
    editForm.appendChild(editInput);
    
    // Create buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'edit-buttons';
    
    // Save button
    const saveButton = document.createElement('button');
    saveButton.className = 'save-button';
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => saveEdit(messageId, editInput.value));
    buttonContainer.appendChild(saveButton);
    
    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.className = 'cancel-button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => cancelEdit({ id: messageId, element: messageElement, originalText }));
    buttonContainer.appendChild(cancelButton);
    
    editForm.appendChild(buttonContainer);
    
    // Insert edit form after the text element
    messageElement.insertBefore(editForm, textElement.nextSibling);
    
    // Focus the textarea
    editInput.focus();
}

// Save edited message
function saveEdit(messageId, newText) {
    if (!socket || !socket.connected) {
        showStatus('Not connected to server. Please try again.', 'error');
        return;
    }
    
    if (!newText || newText.trim() === '') {
        showStatus('Message cannot be empty', 'error');
        return;
    }
    
    // Send edit to server
    socket.emit('editMessage', {
        messageId: messageId,
        newText: newText.trim()
    });
    
    // Clean up UI
    const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
    if (messageElement) {
        const textElement = messageElement.querySelector('.message-text');
        const editForm = messageElement.querySelector('.edit-form');
        
        if (textElement && editForm) {
            textElement.textContent = newText.trim();
            
            // Add edited indicator if not already there
            if (!textElement.querySelector('.edited-indicator')) {
                const editedSpan = document.createElement('span');
                editedSpan.className = 'edited-indicator';
                editedSpan.textContent = ' (edited)';
                textElement.appendChild(editedSpan);
            }
            
            textElement.style.display = '';
            editForm.remove();
        }
    }
    
    activeMessageEdit = null;
}

// Cancel message edit
function cancelEdit(editData) {
    if (!editData || !editData.element) return;
    
    const textElement = editData.element.querySelector('.message-text');
    const editForm = editData.element.querySelector('.edit-form');
    
    if (textElement && editForm) {
        textElement.style.display = '';
        editForm.remove();
    }
    
    activeMessageEdit = null;
}

// Delete message
function deleteMessage(messageId) {
    if (!socket || !socket.connected) {
        showStatus('Not connected to server. Please try again.', 'error');
        return;
    }
    
    // Confirm deletion
    if (confirm('Are you sure you want to delete this message?')) {
        socket.emit('deleteMessage', {
            messageId: messageId
        });
    }
}

// Mark message as read
function markMessageAsRead(messageId) {
    if (messageId && socket && socketConnected) {
        // Add to unread messages if not already there
        if (!unreadMessages.includes(messageId)) {
            unreadMessages.push(messageId);
        }
        
        // Debounce the markAsRead event to avoid sending too many events
        clearTimeout(window.markAsReadTimeout);
        window.markAsReadTimeout = setTimeout(() => {
            if (unreadMessages.length > 0 && socket && socketConnected) {
                socket.emit('markAsRead', { messageIds: unreadMessages });
                unreadMessages = [];
            }
        }, 1000); // Wait 1 second before sending
    }
}

// Update read receipt display for a message
function updateReadReceiptDisplay(messageId, readByUsers) {
    const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
    if (!messageElement) return;
    
    // Only update for messages sent by current user
    if (!messageElement.classList.contains('sent')) return;
    
    let readReceiptElement = messageElement.querySelector('.read-receipt');
    
    if (!readReceiptElement) {
        readReceiptElement = document.createElement('div');
        readReceiptElement.className = 'read-receipt';
        const metaContainer = messageElement.querySelector('.message-meta');
        if (metaContainer) {
            metaContainer.appendChild(readReceiptElement);
        } else {
            messageElement.appendChild(readReceiptElement);
        }
    }
    
    // Filter out current user
    const otherUsers = readByUsers.filter(user => user !== currentUsername);
    
    if (otherUsers.length === 0) {
        readReceiptElement.innerHTML = '<i class="fas fa-check"></i>'; // Sent but not read
        readReceiptElement.title = 'Sent';
    } else if (otherUsers.length === 1) {
        readReceiptElement.innerHTML = '<i class="fas fa-check-double"></i>'; // Read by one user
        readReceiptElement.title = `Read by ${otherUsers[0]}`;
    } else {
        readReceiptElement.innerHTML = '<i class="fas fa-check-double"></i>'; // Read by multiple users
        readReceiptElement.title = `Read by ${otherUsers.join(', ')}`;
    }
}

// Handle window visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // When window becomes visible, mark all visible messages as read
        const visibleMessages = document.querySelectorAll('.message.received');
        const messageIds = Array.from(visibleMessages)
            .map(el => el.dataset.id)
            .filter(id => id); // Filter out undefined IDs
        
        if (messageIds.length > 0 && socket && socketConnected) {
            socket.emit('markAsRead', { messageIds });
        }
    }
});

// Add logout function
function logout() {
    // Clear stored username
    localStorage.removeItem('username');
    
    // Disconnect socket if connected
    if (socket && socket.connected) {
        socket.disconnect();
    }
    
    // Clear encryption keys
    encryption.userKeys.clear();
    encryption.pendingDecryption.clear();
    
    // Reset UI to login screen
    document.getElementById('login-container').style.display = 'block';
    document.getElementById('chat-container').style.display = 'none';
    
    // Clear message history
    const messagesContainer = document.querySelector('.chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }
    
    // Reset current username
    currentUsername = null;
    
    // Clear any existing status messages
    showStatus('', '');
}

// Initialize socket connection
function initializeSocket() {
    // Implementation of initializeSocket function
} 