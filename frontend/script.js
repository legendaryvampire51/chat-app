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

// Function to show status messages
function showStatus(message, type = 'info') {
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;
    
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        messagesContainer.appendChild(statusDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    setTimeout(() => statusDiv.remove(), 5000);
}

// Function to update user list
function updateUserList(users) {
    const userList = document.querySelector('.user-list');
    const onlineCount = document.querySelector('.online-count');
    
    if (userList && onlineCount) {
        userList.innerHTML = users
            .map(user => `<div class="user-item">${user === currentUsername ? `${user} (you)` : user}</div>`)
            .join('');
        
        onlineCount.textContent = `${users.length} online`;
        console.log('Updated user list:', users); // Debug log
    } else {
        console.error('User list elements not found'); // Debug log
    }
}

// Function to add message to UI
function addMessageToUI(message) {
    console.log('Adding message:', message); // Debug log
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) {
        console.error('Messages container not found');
        return;
    }

    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.username === currentUsername ? 'own' : ''}`;
    messageElement.dataset.messageId = message.id;
    messageElement.dataset.username = message.username;

    if (message.type === 'system') {
        messageElement.classList.add('system-message');
        messageElement.textContent = message.content;
    } else {
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
    }

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (message.id) {
        socket.emit('messageRead', message.id);
    }

    playNotificationSound();
}

// Send message function
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();
    
    if (content) {
        if (selectedMessageForEdit) {
            socket.emit('editMessage', {
                messageId: selectedMessageForEdit,
                newContent: content
            });
            selectedMessageForEdit = null;
        } else {
            socket.emit('message', { content });
        }
        
        messageInput.value = '';
        lastTypingStatus = false;
        socket.emit('typing', false);
    }
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
        
        document.getElementById('login').style.display = 'none';
        document.getElementById('chat').style.display = 'flex';
        
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.focus();
        }
        
        showStatus(`Welcome, ${username}!`, 'success');
        console.log('Joined chat as:', username); // Debug log
    } else {
        alert('Please enter a username');
    }
}

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
        const voiceButton = document.getElementById('voiceRecordBtn');
        if (voiceButton) {
            voiceButton.style.display = 'none';
        }
    }
}

// Event Listeners
document.getElementById('voiceRecordBtn')?.addEventListener('click', () => {
    if (!isRecording && mediaRecorder) {
        mediaRecorder.start();
        isRecording = true;
        document.getElementById('voiceRecordBtn').classList.add('recording');
    } else if (isRecording && mediaRecorder) {
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById('voiceRecordBtn').classList.remove('recording');
    }
});

document.getElementById('messageInput')?.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    showStatus('Connected to chat server', 'success');
    
    if (currentUsername) {
        socket.emit('join', currentUsername);
        document.getElementById('login').style.display = 'none';
        document.getElementById('chat').style.display = 'flex';
    }
});

socket.on('message', (message) => {
    console.log('Received message:', message); // Debug log
    addMessageToUI(message);
});

socket.on('messageHistory', (messages) => {
    console.log('Received message history:', messages); // Debug log
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
        messages.forEach(addMessageToUI);
    }
});

socket.on('userList', (users) => {
    console.log('Received user list:', users); // Debug log
    updateUserList(users);
});

socket.on('disconnect', () => {
    showStatus('Disconnected from server. Trying to reconnect...', 'warning');
});

// Initialize voice recording when the page loads
initVoiceRecording();

// Simple test functions
function runTests() {
    console.log('Running tests...');
    
    // Test 1: Check if socket connection is established
    console.assert(socket.connected, 'Socket should be connected');
    
    // Test 2: Check if theme is properly set
    const currentTheme = document.documentElement.getAttribute('data-theme');
    console.assert(currentTheme === 'light' || currentTheme === 'dark', 'Theme should be either light or dark');
    
    // Test 3: Check if username is stored properly
    if (currentUsername) {
        console.assert(localStorage.getItem('username') === currentUsername, 'Username should be stored in localStorage');
    }
    
    // Test 4: Check if UI elements exist
    console.assert(document.getElementById('login'), 'Login container should exist');
    console.assert(document.getElementById('chat'), 'Chat container should exist');
    console.assert(document.getElementById('messages'), 'Messages container should exist');
    console.assert(document.getElementById('messageInput'), 'Message input should exist');
    console.assert(document.getElementById('voiceRecordBtn'), 'Voice record button should exist');
    
    // Test 5: Check if message sending works
    const testMessage = { 
        id: 'test',
        username: 'Test User',
        content: 'Test message',
        timestamp: Date.now(),
        type: 'user'
    };
    addMessageToUI(testMessage);
    const addedMessage = document.querySelector('[data-message-id="test"]');
    console.assert(addedMessage, 'Test message should be added to UI');
    if (addedMessage) addedMessage.remove();
    
    console.log('Tests completed!');
}

// Run tests when page loads
window.addEventListener('load', runTests);

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