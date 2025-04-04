const express = require('express');
const router = express.Router();
const composioController = require('../controllers/composio.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Public test endpoint (no auth required)
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Backend API is working!' });
});

// NOTE: Authentication routes are now handled directly in app.js
// so they can be registered without requireAuth middleware

// Tool management (require authentication)
router.get('/tools', requireAuth, composioController.getTools);

// Find actions by use case description
router.post('/actions/search', requireAuth, composioController.findActionsByUseCase);

// Execute a specific action directly
router.post('/actions/execute', requireAuth, composioController.executeAction);
router.post('/tools/check-auth', requireAuth, composioController.checkToolAuth);
router.post('/tools/execute', requireAuth, composioController.executeToolCall);

module.exports = router;