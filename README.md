# Real-time Chat Application

A real-time chat application built with Node.js, Express, and Socket.io.

## Features

- Real-time messaging
- User join/leave notifications
- Modern UI with message bubbles
- Responsive design
- Username-based chat system

## Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Start the backend server:
   ```bash
   npm run dev
   ```
4. Start the frontend server:
   ```bash
   cd frontend
   python3 -m http.server 8000
   ```
5. Open your browser and navigate to `http://localhost:8000`

## Deployment

This application can be deployed for free using Render.com:

1. Backend Deployment:
   - Create a new Web Service on Render
   - Connect your GitHub repository
   - Set the following:
     - Build Command: `cd backend && npm install`
     - Start Command: `cd backend && npm start`
     - Environment Variables: `PORT=3000`

2. Frontend Deployment:
   - Create a new Static Site on Render
   - Connect your GitHub repository
   - Set the following:
     - Build Command: `cd frontend && npm install`
     - Publish Directory: `frontend`

3. Update the Socket.io connection URL in `frontend/script.js` to point to your deployed backend URL.

## Technologies Used

- Node.js
- Express
- Socket.io
- HTML5
- CSS3
- JavaScript 