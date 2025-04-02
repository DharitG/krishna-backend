// This file is the application entry point
require('dotenv').config();
const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const { testConnection } = require('./services/supabase');
const { authenticateSocket } = require('./middleware/socket.middleware');
const { handleChatSocket } = require('./socket/chat.socket');
const { handleVoiceSocket } = require('./socket/voice.socket');
const { initAccountSocket } = require('./socket/account.socket');

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.APP_URL, process.env.BACKEND_URL] // Only allow connections from our app in production
      : '*', // Allow all in development
    methods: ['GET', 'POST']
  }
});

// Socket.IO middleware for authentication
io.use(authenticateSocket);

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  // Register chat socket handlers
  handleChatSocket(io, socket);
  
  // Register voice socket handlers
  handleVoiceSocket(io, socket);
  
  // Register account socket handlers
  initAccountSocket(io, socket, socket.user);
  
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;

// Test Supabase connection and then start the server
(async () => {
  try {
    // Test Supabase connection
    const connected = await testConnection();
    
    if (!connected) {
      console.error('Failed to connect to Supabase. Please check your configuration.');
      process.exit(1);
    }
    
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Use BACKEND_URL from environment instead of hardcoded localhost
      const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
      console.log(`API base URL: ${backendUrl}/api`);
      
      // For WebSocket, derive from the backend URL
      const wsUrl = backendUrl.replace('http://', 'ws://').replace('https://', 'wss://');
      console.log(`WebSocket server running on ${wsUrl}`);
      
      console.log(`Supabase: Connected ✅`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
})();