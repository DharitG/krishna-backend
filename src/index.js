// This file is the application entry point
require('dotenv').config();
const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const { testConnection } = require('./services/supabase');
const { authenticateSocket } = require('./middleware/socket.middleware');
const { handleChatSocket } = require('./socket/chat.socket');

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: '*', // In production, you should restrict this
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
      console.log(`API base URL: http://localhost:${PORT}/api`);
      console.log(`WebSocket server running on ws://localhost:${PORT}`);
      console.log(`Supabase: Connected ✅`);
    });
  } catch (error) {
    console.error('Failed to start the server:', error);
    process.exit(1);
  }
})();