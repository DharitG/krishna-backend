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
const accountRoutes = require('./routes/account.routes');

// Register routes
app.use('/api/user', requireAuth, userRoutes);

// Register Composio routes - public routes must be registered first
app.use('/api/composio', composioRoutes); // This will handle both public and authenticated routes
app.use('/api/preferences', requireAuth, preferencesRoutes);
app.use('/api/chats', requireAuth, chatRoutes);
app.use('/api/accounts', requireAuth, accountRoutes);

// Public test endpoint (no auth required)
app.get('/api/test', (req, res) => {
  res.status(200).json({ message: 'Backend API is working!', auth: false });
});

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint for user_accounts table (no auth required)
app.get('/api/test-accounts', async (req, res) => {
  try {
    const { supabase } = require('./services/supabase');
    const { data, error } = await supabase
      .from('user_accounts')
      .select('count', { count: 'exact' })
      .limit(0);
    
    if (error) {
      return res.status(500).json({ 
        success: false, 
        message: 'Error accessing user_accounts table', 
        error: error.message 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Successfully accessed user_accounts table',
      count: data[0]?.count || 0
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Unexpected error', 
      error: error.message 
    });
  }
});

// Test endpoint for accounts that bypasses authentication (FOR TESTING ONLY)
app.get('/api/test-get-accounts', async (req, res) => {
  try {
    // Mock user for testing
    req.user = { id: '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a' };
    
    // Call the getAccounts controller function
    const accountController = require('./controllers/account.controller');
    await accountController.getAccounts(req, res, (err) => {
      if (err) {
        console.error('Error in test-get-accounts:', err);
        res.status(500).json({ 
          success: false, 
          message: 'Error in getAccounts controller', 
          error: err.message 
        });
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Unexpected error', 
      error: error.message 
    });
  }
});

// Test endpoint for adding an account (FOR TESTING ONLY)
app.post('/api/test-add-account', async (req, res) => {
  try {
    // Mock user for testing
    req.user = { id: '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a' };
    
    // Call the addAccount controller function
    const accountController = require('./controllers/account.controller');
    await accountController.addAccount(req, res, (err) => {
      if (err) {
        console.error('Error in test-add-account:', err);
        res.status(500).json({ 
          success: false, 
          message: 'Error in addAccount controller', 
          error: err.message 
        });
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Unexpected error', 
      error: error.message 
    });
  }
});

// Test endpoint for removing an account (FOR TESTING ONLY)
app.delete('/api/test-remove-account', async (req, res) => {
  try {
    // Mock user for testing
    req.user = { id: '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a' };
    req.params = { id: req.query.id }; // Get account ID from query parameter
    
    // Call the removeAccount controller function
    const accountController = require('./controllers/account.controller');
    await accountController.removeAccount(req, res, (err) => {
      if (err) {
        console.error('Error in test-remove-account:', err);
        res.status(500).json({ 
          success: false, 
          message: 'Error in removeAccount controller', 
          error: err.message 
        });
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Unexpected error', 
      error: error.message 
    });
  }
});

// Test endpoint for setting an account as active (FOR TESTING ONLY)
app.put('/api/test-set-active-account', async (req, res) => {
  try {
    // Mock user for testing
    req.user = { id: '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a' };
    req.params = { id: req.query.id }; // Get account ID from query parameter
    
    // Call the setActiveAccount controller function
    const accountController = require('./controllers/account.controller');
    await accountController.setActiveAccount(req, res, (err) => {
      if (err) {
        console.error('Error in test-set-active-account:', err);
        res.status(500).json({ 
          success: false, 
          message: 'Error in setActiveAccount controller', 
          error: err.message 
        });
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Unexpected error', 
      error: error.message 
    });
  }
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