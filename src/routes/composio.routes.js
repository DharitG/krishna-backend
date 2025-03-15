const express = require('express');
const router = express.Router();
const composioController = require('../controllers/composio.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Test endpoint that doesn't require authentication
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Backend API is working!' });
});

// Initialize authentication with a service
router.post('/auth/init/:service', requireAuth, composioController.initAuthentication);

// Complete authentication process - no auth required for callback
router.get('/auth/callback/:service', composioController.completeAuthentication);

// Check authentication requirements for tools
router.post('/auth/check', requireAuth, composioController.checkToolAuth);

// Get available tools
router.get('/tools', requireAuth, composioController.getTools);

// Execute tool call
router.post('/execute', requireAuth, composioController.executeToolCall);

module.exports = router;