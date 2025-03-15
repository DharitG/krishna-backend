require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { requireAuth } = require('./middleware/auth.middleware');

// Initialize express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Request logging
app.use(express.json()); // Parse JSON request bodies

// Import routes
const userRoutes = require('./routes/user.routes');
const composioRoutes = require('./routes/composio.routes');
const preferencesRoutes = require('./routes/preferences.routes');
const chatRoutes = require('./routes/chat.routes');

// Register routes
app.use('/api/user', requireAuth, userRoutes);
app.use('/api/composio', requireAuth, composioRoutes);
app.use('/api/preferences', requireAuth, preferencesRoutes);
app.use('/api/chats', requireAuth, chatRoutes);

// Public test endpoint (no auth required)
app.get('/api/test', (req, res) => {
  res.status(200).json({ message: 'Backend API is working!', auth: false });
});

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

module.exports = app;