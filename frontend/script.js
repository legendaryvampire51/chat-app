// Get the backend URL from environment variable or use localhost as fallback
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000'
  : 'https://chat-app-backend-9a5t.onrender.com';

// Global variables
let socket = null;
let currentUsername = localStorage.getItem('username') || '';
let typingTimeout = null;
let lastTypingStatus = false;
let activeMessageEdit = null; // Track which message is being edited

// Function to add a message to the chat
function addMessage(data) {
    addMessageToChat(data);
}

// Initialize when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - initializing app');
    
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
function connectToServer() {
    // Try to use production URL if available, fallback to localhost for development
    const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000' 
        : 'https://chat-app-backend-9a5t.onrender.com';
        
    console.log('Connecting to server at:', serverUrl);
    
    // Create socket connection
    socket = io(serverUrl, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    });

    // Setup socket event handlers
    setupSocketEvents();
}

// Setup all socket event handlers
function setupSocketEvents() {
    if (!socket) {
        console.error('Cannot setup events - socket not initialized');
        return;
    }
    
    console.log('Setting up socket events');

    // Connection successful
    socket.on('connect', () => {
        console.log('Connected to server');
        showStatus('Connected to chat server', 'success');
        
        // If we have a username, automatically join the chat
        if (currentUsername) {
            console.log('Auto-joining with username:', currentUsername);
            joinChat(currentUsername, true);
        }
    });

    // Connection failed
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showStatus('Error connecting to chat server', 'error');
    });

    // Disconnected
    socket.on('disconnect', () => {
        const typingDiv = document.querySelector('.typing-status');
        if (typingDiv) {
            typingDiv.remove();
        }
        lastTypingStatus = false;
        console.log('Disconnected from server');
        showStatus('Disconnected from chat server. Trying to reconnect...', 'warning');
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
        updateUserList(users);
    });

    // Receive message
    socket.on('message', (messageData) => {
        console.log('Received message:', messageData);
        addMessageToChat(messageData);
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
        if (userDisplay) userDisplay.textContent = `Logged in as: ${currentUsername}`;
        
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
        
    } catch (error) {
        console.error('Error in showChat:', error);
        alert('Debug error in showChat: ' + error.message);
    }
}

// Join chat room
function joinChat(username, reconnect = false) {
    if (!socket || !socket.connected) {
        console.error('Socket not connected when trying to join chat');
        alert('Debug: Socket not connected! Please refresh the page.');
        showStatus('Not connected to server. Please try again.', 'error');
        return;
    }
    
    if (!username || username.trim() === '') {
        alert('Please enter a username');
        return;
    }
    
    console.log('Joining chat with username:', username);
    alert('Debug: Attempting to join chat with username: ' + username);
    
    try {
        // Store username for reconnection
        currentUsername = username;
        localStorage.setItem('username', username);
        
        // Emit join event
        socket.emit('join', { username });
        
        // Show chat interface
        showChat();
        
        console.log('Chat interface should be showing now');
    } catch (error) {
        console.error('Error in joinChat:', error);
        alert('Debug error: ' + error.message);
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
        userItem.textContent = username;
        
        // Highlight current user
        if (username === currentUsername) {
            userItem.textContent += ' (you)';
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
function sendMessage() {
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
        socket.emit('sendMessage', { text: message });
        messageInput.value = '';
        
        // Reset typing status
        lastTypingStatus = false;
        socket.emit('typing', false);
    }
}

// Add message to chat
function addMessageToChat(messageData) {
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
        messageElement.textContent = messageData.text || messageData.message; // Support both formats
    } else {
        messageElement.className = 'message';
        
        if (messageData.deleted) {
            messageElement.classList.add('deleted');
        }
        
        const senderName = messageData.sender || messageData.username; // Support both formats
        
        // Add sent/received class based on sender
        if (senderName === currentUsername) {
            messageElement.classList.add('sent');
        } else {
            messageElement.classList.add('received');
        }
        
        // Message sender
        const senderElement = document.createElement('div');
        senderElement.className = 'message-sender';
        senderElement.textContent = senderName;
        messageElement.appendChild(senderElement);
        
        // Message text
        const textElement = document.createElement('div');
        textElement.className = 'message-text';
        textElement.textContent = messageData.text || messageData.message; // Support both formats
        
        // Add edited indicator if needed
        if (messageData.edited) {
            const editedSpan = document.createElement('span');
            editedSpan.className = 'edited-indicator';
            editedSpan.textContent = ' (edited)';
            textElement.appendChild(editedSpan);
        }
        
        messageElement.appendChild(textElement);
        
        // Add timestamp
        const timeElement = document.createElement('div');
        timeElement.className = 'timestamp';
        timeElement.textContent = formattedTime;
        messageElement.appendChild(timeElement);
        
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