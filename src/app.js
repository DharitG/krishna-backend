require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { requireAuth } = require('./middleware/auth.middleware');
const { checkRateLimit } = require('./middleware/ratelimit.middleware');
const { 
  publicRouteRateLimit, 
  authRateLimit, 
  webhookRateLimit 
} = require('./middleware/ip-ratelimit.middleware');

// Initialize express app
const app = express();

// Security middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.APP_URL, process.env.BACKEND_URL]
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
})); // Configured CORS
app.use(morgan('dev')); // Request logging
app.use(express.json()); // Parse JSON request bodies

// Apply global IP-based rate limiting to all routes
// This is a first line of defense against DDoS attacks
app.use(publicRouteRateLimit);

// Import routes
const userRoutes = require('./routes/user.routes');
const composioRoutes = require('./routes/composio.routes');
const composioController = require('./controllers/composio.controller');
const langchainRoutes = require('./routes/langchain.routes');
const preferencesRoutes = require('./routes/preferences.routes');
const chatRoutes = require('./routes/chat.routes');
const accountRoutes = require('./routes/account.routes');
const webhookRoutes = require('./routes/webhook.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const authRoutes = require('./routes/auth.routes');
const oauthRedirectRoutes = require('./routes/oauth-redirect.routes');

// Apply stricter rate limits to authentication routes
app.use('/api/auth', authRateLimit, authRoutes);

// Register webhook routes with webhook-specific rate limits
app.use('/api/webhooks', webhookRateLimit, webhookRoutes); // No auth for webhooks

// Register routes that mix public and authenticated endpoints
app.use('/api/subscription', subscriptionRoutes);

// Register Composio auth routes with authentication requirement
app.post('/api/composio/auth/init/:service', requireAuth, authRateLimit, composioController.initAuthentication);
app.post('/api/composio/auth/:service', requireAuth, authRateLimit, composioController.initAuthentication);
app.get('/api/composio/auth/callback', authRateLimit, composioController.completeAuthentication);
app.get('/api/composio/auth/status/:service', requireAuth, authRateLimit, composioController.checkAuth);

// Register authenticated routes with subscription tier rate limits
app.use('/api/user', requireAuth, checkRateLimit, userRoutes);
app.use('/api/composio', requireAuth, checkRateLimit, composioRoutes);
app.use('/api/langchain', requireAuth, checkRateLimit, langchainRoutes);
app.use('/api/preferences', requireAuth, checkRateLimit, preferencesRoutes);
app.use('/api/chats', requireAuth, checkRateLimit, chatRoutes);
app.use('/api/accounts', requireAuth, checkRateLimit, accountRoutes);

// Register OAuth redirect routes (no auth required - these are public endpoints for OAuth callbacks)
app.use('/oauth', oauthRedirectRoutes);

// Public test endpoint (no auth required) - safe for basic connectivity testing
app.get('/api/test', (req, res) => {
  res.status(200).json({ message: 'Backend API is working!', auth: false });
});

// Public test endpoint for use-case search (no auth required) - for testing only
app.post('/api/test/use-case-search', async (req, res) => {
  try {
    const { useCase, advanced = false, apps = [] } = req.body;
    const composioService = require('./services/composio.service');
    const actions = await composioService.findActionsByUseCase(useCase, advanced, apps);
    res.status(200).json({ actions });
  } catch (error) {
    console.error('Error in test use-case search:', error);
    res.status(500).json({ message: 'Error in test use-case search', error: error.message });
  }
});

// Health check endpoint (no auth required) - necessary for deployment health checks
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    // Only show error details in development
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

module.exports = app;