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

let currentUsername = localStorage.getItem('username') || '';
let typingTimeout = null;
let lastTypingStatus = false;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let selectedMessageForEdit = null;

// Theme handling
const theme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', theme);

document.getElementById('themeToggle').addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

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
        localStorage.setItem('username', username);
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

// Initialize voice recording
async function initVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            socket.emit('voiceMessage', { audioUrl });
            audioChunks = [];
        };
    } catch (error) {
        console.error('Error accessing microphone:', error);
        document.getElementById('voiceRecordBtn').style.display = 'none';
    }
}

// Voice recording button handler
document.getElementById('voiceRecordBtn').addEventListener('click', () => {
    if (!isRecording) {
        mediaRecorder.start();
        isRecording = true;
        document.getElementById('voiceRecordBtn').classList.add('recording');
    } else {
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById('voiceRecordBtn').classList.remove('recording');
    }
});

// Message context menu
function showContextMenu(event, messageElement) {
    event.preventDefault();
    const contextMenu = document.getElementById('messageContextMenu');
    const messageId = messageElement.dataset.messageId;
    const username = messageElement.dataset.username;

    // Only show edit/delete for own messages
    const editOption = contextMenu.querySelector('[data-action="edit"]');
    const deleteOption = contextMenu.querySelector('[data-action="delete"]');
    if (username === currentUsername) {
        editOption.style.display = 'flex';
        deleteOption.style.display = 'flex';
    } else {
        editOption.style.display = 'none';
        deleteOption.style.display = 'none';
    }

    contextMenu.style.display = 'block';
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.dataset.messageId = messageId;
}

// Hide context menu when clicking outside
document.addEventListener('click', (event) => {
    const contextMenu = document.getElementById('messageContextMenu');
    if (!event.target.closest('.context-menu')) {
        contextMenu.style.display = 'none';
    }
});

// Context menu actions
document.getElementById('messageContextMenu').addEventListener('click', (event) => {
    const action = event.target.closest('li')?.dataset.action;
    const messageId = event.target.closest('.context-menu').dataset.messageId;
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);

    switch (action) {
        case 'edit':
            startEditing(messageId, messageElement);
            break;
        case 'delete':
            socket.emit('deleteMessage', messageId);
            break;
        case 'react':
            showEmojiPicker(messageId);
            break;
    }
    document.getElementById('messageContextMenu').style.display = 'none';
});

// Emoji picker handling
function showEmojiPicker(messageId) {
    const emojiPicker = document.getElementById('emojiPicker');
    emojiPicker.style.display = 'block';
    emojiPicker.dataset.messageId = messageId;
}

document.querySelectorAll('.emoji-item').forEach(emoji => {
    emoji.addEventListener('click', () => {
        const messageId = document.getElementById('emojiPicker').dataset.messageId;
        const reaction = emoji.dataset.emoji;
        socket.emit('addReaction', { messageId, reaction });
        document.getElementById('emojiPicker').style.display = 'none';
    });
});

// Message editing
function startEditing(messageId, messageElement) {
    const contentElement = messageElement.querySelector('.content');
    const originalContent = contentElement.textContent;
    selectedMessageForEdit = messageId;

    const input = document.getElementById('messageInput');
    input.value = originalContent;
    input.focus();
}

// Socket event handlers
socket.on('messageUpdated', (message) => {
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
    if (messageElement) {
        messageElement.querySelector('.content').textContent = message.content;
        messageElement.querySelector('.edited-tag').textContent = '(edited)';
    }
});

socket.on('messageDeleted', (messageId) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.remove();
    }
});

socket.on('reactionUpdated', (data) => {
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        updateReactions(messageElement, data.reactions);
    }
});

socket.on('readReceiptUpdated', (data) => {
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        updateReadReceipt(messageElement, data.readBy);
    }
});

// UI update functions
function addMessageToUI(message) {
    const chatMessages = document.querySelector('.chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.username === currentUsername ? 'own' : ''}`;
    messageElement.dataset.messageId = message.id;
    messageElement.dataset.username = message.username;

    let content = '';
    if (message.type === 'voice') {
        content = `
            <div class="voice-message">
                <i class="fas fa-play"></i>
                <audio controls src="${message.content}"></audio>
            </div>
        `;
    } else {
        content = `<div class="content">${message.content}</div>`;
    }

    messageElement.innerHTML = `
        <div class="username">${message.username}</div>
        ${content}
        <div class="timestamp">${new Date(message.timestamp).toLocaleTimeString()}</div>
        <span class="edited-tag">${message.edited ? '(edited)' : ''}</span>
        <div class="reactions"></div>
        <div class="read-receipt"></div>
    `;

    messageElement.addEventListener('contextmenu', (event) => showContextMenu(event, messageElement));
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Mark message as read
    socket.emit('messageRead', message.id);
}

function updateReactions(messageElement, reactions) {
    const reactionsContainer = messageElement.querySelector('.reactions');
    reactionsContainer.innerHTML = '';

    reactions.forEach(reaction => {
        const reactionElement = document.createElement('span');
        reactionElement.className = 'reaction';
        reactionElement.innerHTML = `
            ${reaction.emoji}
            <span class="count">${reaction.users.length}</span>
        `;
        reactionElement.title = reaction.users.join(', ');
        reactionsContainer.appendChild(reactionElement);
    });
}

function updateReadReceipt(messageElement, readBy) {
    const readReceiptElement = messageElement.querySelector('.read-receipt');
    if (readBy.length > 1) {
        readReceiptElement.textContent = `Read by ${readBy.length} users`;
    } else if (readBy.length === 1 && readBy[0] !== currentUsername) {
        readReceiptElement.textContent = `Read by ${readBy[0]}`;
    }
}

function playNotificationSound() {
    const audio = document.getElementById('notificationSound');
    audio.play().catch(error => console.log('Error playing notification:', error));
}

// Initialize voice recording when the page loads
initVoiceRecording(); 