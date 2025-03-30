// Get the backend URL from environment variable or use localhost as fallback
const BACKEND_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000'
  : 'https://chat-app-backend-ybjt.onrender.com';

// Initialize socket with connection options
const socket = io(BACKEND_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    transports: ['websocket', 'polling']
});

let currentUsername = localStorage.getItem('chatUsername') || '';
let typingTimeout = null;
let lastTypingStatus = false;
let activeMessageEdit = null; // Track which message is being edited

// DOM Elements
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const userDisplay = document.getElementById('user-display');

// Create user list container
const userListContainer = document.createElement('div');
userListContainer.className = 'user-list-container';
chatContainer.appendChild(userListContainer);

// Function to add a message to the chat
function addMessage(data) {
    const messageElement = document.createElement('div');
    
    if (data.type === 'system') {
        messageElement.classList.add('system-message');
        messageElement.textContent = data.message;
    } else {
        messageElement.classList.add('message');
        messageElement.classList.add(data.username === currentUsername ? 'sent' : 'received');
        
        messageElement.innerHTML = `
            <div class="username">${data.username}</div>
            <div class="text">${data.message}</div>
            <div class="timestamp">${new Date(data.timestamp).toLocaleTimeString()}</div>
        `;
    }
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Connection event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    showStatus('Connected to chat server', 'success');
    
    // If user was previously logged in, rejoin automatically
    if (currentUsername) {
        socket.emit('join', currentUsername);
        showChat();
    }
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showStatus('Connection error. Please try again later.', 'error');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showStatus('Disconnected from chat server. Trying to reconnect...', 'warning');
});

// Show status message to user
function showStatus(message, type) {
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;
    messagesContainer.appendChild(statusDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Remove status message after 5 seconds
    setTimeout(() => {
        statusDiv.remove();
    }, 5000);
}

// Update user list display
function updateUserList(data) {
    userListContainer.innerHTML = `
        <div class="user-list-header">
            Online Users (${data.count})
        </div>
        <div class="user-list">
            ${data.users.map(username => `
                <div class="user-item">
                    ${username === currentUsername ? `${username} (You)` : username}
                </div>
            `).join('')}
        </div>
    `;
}

// Show chat interface
function showChat() {
    loginContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    userDisplay.textContent = `Logged in as: ${currentUsername}`;
    messageInput.focus();
}

// Join chat function
function joinChat() {
    const usernameInput = document.getElementById('username');
    const username = usernameInput.value.trim();
    
    if (username) {
        if (!socket.connected) {
            showStatus('Trying to connect to server...', 'warning');
            return;
        }
        
        currentUsername = username;
        localStorage.setItem('chatUsername', username);
        socket.emit('join', username);
        showChat();
    } else {
        alert('Please enter a username');
    }
}

// Handle typing status
function handleTyping() {
    const isTyping = messageInput.value.length > 0;
    
    // Clear existing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    // Only emit if typing status has changed
    if (isTyping !== lastTypingStatus) {
        lastTypingStatus = isTyping;
        socket.emit('typing', isTyping);
    }
    
    // Set new timeout to stop typing after 2 seconds of no input
    if (isTyping) {
        typingTimeout = setTimeout(() => {
            lastTypingStatus = false;
            socket.emit('typing', false);
        }, 2000);
    }
}

// Add touch events for mobile devices
messageInput.addEventListener('input', handleTyping);
messageInput.addEventListener('touchstart', handleTyping);
messageInput.addEventListener('touchend', handleTyping);

// Send message function
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        if (!socket.connected) {
            showStatus('Cannot send message: Not connected to server', 'error');
            return;
        }
        
        socket.emit('message', message);
        messageInput.value = '';
        lastTypingStatus = false;
        socket.emit('typing', false);
    }
}

// Handle enter key in message input
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Socket event handlers
socket.on('message', addMessage);
socket.on('userJoined', addMessage);
socket.on('userLeft', addMessage);
socket.on('userList', updateUserList);

// Handle message history
socket.on('messageHistory', (messages) => {
    // Clear existing messages
    messagesContainer.innerHTML = '';
    // Add all messages from history
    messages.forEach(addMessage);
});

// Handle typing status updates
socket.on('typingStatus', (data) => {
    const typingDiv = document.querySelector('.typing-status');
    const chatInput = document.querySelector('.chat-input');
    
    if (data.users.length > 0) {
        const users = data.users.filter(user => user !== currentUsername);
        if (users.length > 0) {
            const message = users.length === 1
                ? `${users[0]} is typing...`
                : `${users.join(', ')} are typing...`;
                
            if (typingDiv) {
                typingDiv.textContent = message;
            } else {
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

// Clear typing status when disconnected
socket.on('disconnect', () => {
    const typingDiv = document.querySelector('.typing-status');
    if (typingDiv) {
        typingDiv.remove();
    }
    lastTypingStatus = false;
    console.log('Disconnected from server');
    showStatus('Disconnected from chat server. Trying to reconnect...', 'warning');
});

// Show login form and hide chat
function showLogin() {
    document.getElementById('login-container').style.display = 'flex';
    document.getElementById('chat-container').style.display = 'none';
}

// Show chat and hide login form
function showChat() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
    document.getElementById('message-input').focus();
}

// Connect to Socket.io server
function connectToServer() {
    // Try to use production URL if available, fallback to localhost for development
    const serverUrl = location.hostname === 'localhost' || location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000' 
        : 'https://chat-app-backend-9a5t.onrender.com';
        
    socket = io(serverUrl, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    });

    // Connection successful
    socket.on('connect', () => {
        console.log('Connected to server');
        showStatus('Connected to chat server', 'success');
        
        // If we have a username, automatically join the chat
        if (currentUsername) {
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
        updateUserList(users);
    });

    // Receive message
    socket.on('message', (messageData) => {
        addMessageToChat(messageData);
    });

    // Receive message history
    socket.on('messageHistory', (messages) => {
        const messagesContainer = document.querySelector('.chat-messages');
        messagesContainer.innerHTML = '';
        messages.forEach(message => {
            addMessageToChat(message);
        });
    });

    // Handle typing status updates
    socket.on('typingStatus', (data) => {
        const typingDiv = document.querySelector('.typing-status');
        const chatInput = document.querySelector('.chat-input');
        
        if (data.users.length > 0) {
            const users = data.users.filter(user => user !== currentUsername);
            if (users.length > 0) {
                const message = users.length === 1
                    ? `${users[0]} is typing...`
                    : `${users.join(', ')} are typing...`;
                    
                if (typingDiv) {
                    typingDiv.textContent = message;
                } else {
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

// Join chat room
function joinChat(username, reconnect = false) {
    if (!socket || !socket.connected) {
        showStatus('Not connected to server. Please try again.', 'error');
        return;
    }
    
    if (!username || username.trim() === '') {
        alert('Please enter a username');
        return;
    }
    
    // Store username for reconnection
    currentUsername = username;
    localStorage.setItem('chatUsername', username);
    
    // Emit join event
    socket.emit('join', { username });
    
    // Only show chat if not reconnecting automatically
    if (!reconnect) {
        showChat();
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const statusContainer = document.getElementById('status-container');
    const statusMessage = document.createElement('div');
    statusMessage.className = `status-message ${type}`;
    statusMessage.textContent = message;
    statusContainer.appendChild(statusMessage);
    
    // Remove after 5 seconds
    setTimeout(() => {
        statusMessage.remove();
    }, 5000);
}

// Update user list
function updateUserList(users) {
    const userList = document.querySelector('.user-list');
    const userCount = document.querySelector('.user-list-header span');
    
    if (userList && userCount) {
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
}

// Add message to chat
function addMessageToChat(messageData) {
    const messagesContainer = document.querySelector('.chat-messages');
    const messageElement = document.createElement('div');
    
    // Set message ID as data attribute for edit/delete
    messageElement.dataset.id = messageData.id;
    
    // Create formatted timestamp
    const timestamp = new Date(messageData.timestamp);
    const formattedTime = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Determine message type and set content
    if (messageData.type === 'system') {
        messageElement.className = 'system-message';
        messageElement.textContent = messageData.text;
    } else {
        messageElement.className = 'message';
        
        if (messageData.deleted) {
            messageElement.classList.add('deleted');
        }
        
        // Message sender
        const senderElement = document.createElement('div');
        senderElement.className = 'message-sender';
        senderElement.textContent = messageData.sender;
        messageElement.appendChild(senderElement);
        
        // Message text
        const textElement = document.createElement('div');
        textElement.className = 'message-text';
        textElement.textContent = messageData.text;
        
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
        if (messageData.sender === currentUsername && !messageData.deleted) {
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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Connect to server
    connectToServer();
    
    // Login form submit
    document.getElementById('login-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        joinChat(username);
    });
    
    // Join button click (if form doesn't exist)
    const joinButton = document.querySelector('.login-container button');
    if (joinButton) {
        joinButton.addEventListener('click', () => {
            const username = document.getElementById('username').value.trim();
            if (!username) {
                alert('Please enter a username');
                return;
            }
            joinChat(username);
        });
    }
    
    // Send message on form submit
    document.getElementById('message-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
    });
    
    // Send button click (if form doesn't exist)
    const sendButton = document.querySelector('.chat-input button');
    if (sendButton) {
        sendButton.addEventListener('click', () => {
            sendMessage();
        });
    }
    
    // Send message on Enter key (without Shift)
    document.getElementById('message-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Show login form if no username is stored
    if (!currentUsername) {
        showLogin();
    }
}); 