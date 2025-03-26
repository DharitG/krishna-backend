const express = require('express');
const router = express.Router();
const composioController = require('../controllers/composio.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Test endpoint that doesn't require authentication
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Backend API is working!' });
});

// Authentication routes (no auth required)
router.get('/auth/callback', composioController.completeAuthentication);
router.post('/auth/init/:service', composioController.initAuthentication);

// Protected routes (require authentication)
router.use(requireAuth);
router.get('/auth/status/:service', composioController.checkAuth);

// Tool management
router.get('/tools', composioController.getTools);
router.post('/tools/check-auth', composioController.checkToolAuth);
router.post('/tools/execute', composioController.executeToolCall);

module.exports = router;