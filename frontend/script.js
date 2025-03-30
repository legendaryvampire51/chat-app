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
    
    // Only emit if typing status has changed
    if (isTyping !== lastTypingStatus) {
        lastTypingStatus = isTyping;
        socket.emit('typing', isTyping);
    }
}

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

// Handle input changes for typing status
messageInput.addEventListener('input', handleTyping);

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
    const typingDiv = document.querySelector('.typing-status') || document.createElement('div');
    typingDiv.className = 'typing-status';
    
    if (data.users.length > 0) {
        const users = data.users.filter(user => user !== currentUsername);
        if (users.length > 0) {
            typingDiv.textContent = users.length === 1
                ? `${users[0]} is typing...`
                : `${users.join(', ')} are typing...`;
            if (!typingDiv.parentNode) {
                messagesContainer.appendChild(typingDiv);
            }
            return;
        }
    }
    
    // Remove typing status if no one is typing
    if (typingDiv.parentNode) {
        typingDiv.remove();
    }
}); 