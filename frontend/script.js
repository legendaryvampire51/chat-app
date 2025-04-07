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
let socketConnected = false;
let isAuthenticated = false;
let connectionRetries = 0;
const MAX_CONNECTION_RETRIES = 3;
const RECONNECT_DELAY = 2000;
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
            const username = document.getElementById('username').value.trim();
            
            if (!username) {
                showStatus('Please enter a username', 'error');
                return;
            }
            
            // Connect to server with username
            connectToServer(username);
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
function connectToServer(username = null) {
    console.log('Connecting to server...');
    showStatus('Connecting to server...', 'info');
    
    try {
        socket = io(BACKEND_URL, {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000
        });

        setupSocketEvents(username);
    } catch (error) {
        console.error('Connection error:', error);
        showStatus('Connection error: ' + error.message, 'error');
    }
}

// Setup socket event handlers
function setupSocketEvents(username = null) {
    if (!socket) return;

    socket.on('connect', () => {
        console.log('Connected to server');
        socketConnected = true;
        showStatus('Connected to server', 'success');
        
        if (username) {
            authenticateUser(username);
        }
    });

    socket.on('authenticated', (data) => {
        console.log('Authentication successful');
        isAuthenticated = true;
        showStatus('Successfully joined chat', 'success');
        showChat();
        
        // Update user list with current user
        if (data && data.users) {
            updateUserList(data.users);
        }
    });

    socket.on('userList', (users) => {
        console.log('Received user list:', users);
        updateUserList(users);
    });

    socket.on('messageHistory', (history) => {
        console.log('Received message history');
        if (history && Array.isArray(history)) {
            history.forEach(message => {
                addMessageToChat(message);
            });
        }
    });

    // Authentication failed
    socket.on('authentication_error', (error) => {
        console.error('Authentication failed:', error);
        isAuthenticated = false;
        showStatus('Authentication failed: ' + error.message, 'error');
    });

    // Connection error
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        handleConnectionError(error);
    });

    // Disconnected
    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server. Reason:', reason);
        handleDisconnect(reason);
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

// Handle user authentication
async function authenticateUser(username) {
    if (!socket || !socketConnected) {
        showStatus('Not connected to server', 'error');
        return;
    }

    try {
        console.log('Authenticating user:', username);
        
        // Generate encryption key if available
        let publicKey = null;
        if (window.encryption && window.encryption.isSupported) {
            try {
                publicKey = await window.encryption.generateKey();
            } catch (error) {
                console.warn('Encryption initialization failed:', error);
            }
        }

        // Send authentication request
        socket.emit('authenticate', {
            username: username,
            publicKey: publicKey
        });

        // Store username
        currentUsername = username;
        localStorage.setItem('username', username);
    } catch (error) {
        console.error('Error during authentication:', error);
        showStatus('Error during authentication: ' + error.message, 'error');
    }
}

// Handle connection errors
function handleConnectionError(error) {
    socketConnected = false;
    showStatus('Connection error: ' + error.message, 'error');
    
    if (connectionRetries < MAX_CONNECTION_RETRIES) {
        connectionRetries++;
        const retryConnection = () => {
            console.log(`Retrying connection (${connectionRetries}/${MAX_CONNECTION_RETRIES})...`);
            connectToServer(currentUsername);
        };
        setTimeout(retryConnection, RECONNECT_DELAY);
    } else {
        showStatus('Failed to connect after multiple attempts. Please refresh the page.', 'error');
    }
}

// Handle disconnection
function handleDisconnect(reason) {
    socketConnected = false;
    isAuthenticated = false;
    
    // Only show warning if we were previously connected
    if (reason !== 'io client disconnect') {
        showStatus('Disconnected from server. Reason: ' + reason, 'warning');
    }
    
    // Only attempt to reconnect if we were authenticated
    if (isAuthenticated && connectionRetries < MAX_CONNECTION_RETRIES) {
        connectionRetries++;
        const retryConnection = () => {
            console.log(`Retrying connection (${connectionRetries}/${MAX_CONNECTION_RETRIES})...`);
            connectToServer(currentUsername);
        };
        setTimeout(retryConnection, RECONNECT_DELAY);
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
    const removeStatus = () => {
        if (statusMessage.parentNode) {
            statusMessage.remove();
        }
    };
    setTimeout(removeStatus, 5000);
}

// Update user list
function updateUserList(users) {
    const userList = document.querySelector('.user-list');
    if (!userList) return;

    userList.innerHTML = '';
    
    if (users && Array.isArray(users)) {
        users.forEach(username => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.textContent = username;
            userList.appendChild(userItem);
        });
    }
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

// Handle sending messages
function sendMessage() {
    if (!socket || !socket.connected) {
        showStatus('Not connected to server', 'error');
        return;
    }

    const messageInput = document.getElementById('message-input');
    if (!messageInput) {
        showStatus('Message input not found', 'error');
        return;
    }

    const message = messageInput.value.trim();
    if (!message) return;

    try {
        socket.emit('sendMessage', {
            text: message,
            timestamp: new Date().toISOString()
        });
        messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        showStatus('Error sending message: ' + error.message, 'error');
    }
}

// Add message to chat
async function addMessageToChat(message, isSystem = false, sender = null, encrypted = false) {
    const messagesContainer = document.querySelector('.chat-messages');
    if (!messagesContainer) {
        console.error('Messages container not found');
        return;
    }
    
    const messageElement = document.createElement('div');
    
    // Set message ID as data attribute for edit/delete
    if (message.id) {
        messageElement.dataset.id = message.id;
    }
    
    // Create formatted timestamp
    const timestamp = new Date(message.timestamp);
    const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Determine message type and set content
    if (isSystem) {
        messageElement.className = 'system-message';
        messageElement.textContent = message.text || message.message;
    } else {
        messageElement.className = 'message';
        
        if (message.deleted) {
            messageElement.classList.add('deleted');
        }
        
        const senderName = sender || message.username;
        
        // Add sent/received class based on sender
        if (senderName === currentUsername) {
            messageElement.classList.add('sent');
        } else {
            messageElement.classList.add('received');
            
            // Mark other users' messages as read when displayed
            if (message.id) {
                markMessageAsRead(message.id);
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
        if (encrypted) {
            try {
                // If we have the sender's public key in the message data, use it
                let senderPublicKey = message.senderPublicKey;
                
                // If not in message data, try to get it from our stored keys
                if (!senderPublicKey) {
                    senderPublicKey = encryption.userKeys.get(senderName);
                }
                
                if (senderPublicKey) {
                    const importedKey = await encryption.importPublicKey(senderPublicKey);
                    const decryptedText = await encryption.decrypt(
                        message.encryptedMessage,
                        importedKey
                    );
                    textElement.textContent = decryptedText;
                } else {
                    // If we don't have the key yet, show encrypted indicator
                    textElement.textContent = '[Encrypted message]';
                    // Store the message data for later decryption
                    if (!encryption.pendingDecryption.has(message.id)) {
                        encryption.pendingDecryption.set(message.id, message);
                    }
                }
            } catch (error) {
                console.error('Error decrypting message:', error);
                textElement.textContent = '[Encrypted message]';
            }
        } else {
            textElement.textContent = message.text || message.message;
        }
        
        // Add encryption indicator if message is encrypted
        if (encrypted) {
            const encryptionIndicator = document.createElement('span');
            encryptionIndicator.className = 'encryption-indicator';
            encryptionIndicator.innerHTML = ' 🔒';
            textElement.appendChild(encryptionIndicator);
        }
        
        // Add edited indicator if needed
        if (message.edited) {
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
        if (senderName === currentUsername && message.id) {
            const readReceiptElement = document.createElement('div');
            readReceiptElement.className = 'read-receipt';
            readReceiptElement.innerHTML = '<i class="fas fa-check"></i>'; // Default to sent but not read
            readReceiptElement.title = 'Sent';
            metaContainer.appendChild(readReceiptElement);
            
            // Update read receipt if we have that information
            if (readReceipts[message.id]) {
                updateReadReceiptDisplay(message.id, readReceipts[message.id]);
            }
        }
        
        messageElement.appendChild(metaContainer);
        
        // Add edit/delete controls if message is from current user and not deleted
        if (senderName === currentUsername && !message.deleted && message.id) {
            const controlsElement = document.createElement('div');
            controlsElement.className = 'message-controls';
            
            // Edit button
            const editButton = document.createElement('button');
            editButton.className = 'edit-button';
            editButton.innerHTML = '<i class="fas fa-edit"></i>';
            editButton.title = 'Edit message';
            editButton.addEventListener('click', () => editMessage(message.id));
            controlsElement.appendChild(editButton);
            
            // Delete button
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.title = 'Delete message';
            deleteButton.addEventListener('click', () => deleteMessage(message.id));
            controlsElement.appendChild(deleteButton);
            
            messageElement.appendChild(controlsElement);
        }
    }
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Mark visible messages as read when they appear
    if (!isSystem && message.id && 
        sender && sender !== currentUsername) {
        markMessageAsRead(message.id);
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

// Make logout function globally available
window.logout = function() {
    try {
        // Clear stored username
        localStorage.removeItem('username');
        
        // Disconnect socket if connected
        if (socket && socket.connected) {
            socket.disconnect();
        }
        
        // Clear encryption keys if encryption instance exists
        if (window.encryption) {
            window.encryption.userKeys.clear();
            window.encryption.pendingDecryption.clear();
        }
        
        // Reset UI to login screen
        const loginContainer = document.getElementById('login-container');
        const chatContainer = document.getElementById('chat-container');
        
        if (loginContainer) {
            loginContainer.style.display = 'flex';
            // Reset login form
            const loginForm = document.getElementById('login-form');
            if (loginForm) {
                loginForm.reset();
            }
        }
        
        if (chatContainer) {
            chatContainer.style.display = 'none';
        }
        
        // Clear message history
        const messagesContainer = document.querySelector('.chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        
        // Reset current username
        currentUsername = null;
        
        // Clear any existing status messages
        showStatus('', '');
        
        // Reset socket connection state
        socketConnected = false;
        
        // Clear any existing socket instance
        socket = null;
        
        // Reset connection retries
        connectionRetries = 0;
        
        // Clear unread messages and read receipts
        unreadMessages = [];
        readReceipts = {};
        
        // Clear any existing typing status
        const typingDiv = document.querySelector('.typing-status');
        if (typingDiv) {
            typingDiv.remove();
        }
        
        // Reset message input
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.value = '';
        }
        
        // Reset recipient select
        const recipientSelect = document.getElementById('recipient-select');
        if (recipientSelect) {
            recipientSelect.value = 'all';
        }
        
        // Reset encryption checkbox
        const encryptCheckbox = document.getElementById('encrypt-message');
        if (encryptCheckbox) {
            encryptCheckbox.checked = false;
        }
        
        // Clear user list
        const userList = document.querySelector('.user-list');
        if (userList) {
            userList.innerHTML = '';
        }
        
        // Update user count
        const userCount = document.querySelector('.user-list-header span');
        if (userCount) {
            userCount.textContent = '0';
        }
        
        // Focus username input
        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.focus();
        }
        
        // Clear any active message edit
        if (activeMessageEdit) {
            cancelEdit(activeMessageEdit);
        }
        
        // Clear any existing timeouts
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        if (window.markAsReadTimeout) {
            clearTimeout(window.markAsReadTimeout);
        }
        
        // Reset last typing status
        lastTypingStatus = false;
        
    } catch (error) {
        console.error('Error during logout:', error);
        showStatus('Error during logout: ' + error.message, 'error');
    }
};

// Initialize socket connection
function initializeSocket() {
    // Implementation of initializeSocket function
} 