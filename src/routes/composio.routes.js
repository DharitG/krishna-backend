const express = require('express');
const router = express.Router();
const composioController = require('../controllers/composio.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Initialize authentication with a service
router.post('/auth/init/:service', authMiddleware, composioController.initAuthentication);

// Complete authentication process
router.get('/auth/callback', composioController.completeAuthentication);

// Check authentication requirements for tools
router.post('/auth/check', authMiddleware, composioController.checkToolAuth);

// Get available tools
router.get('/tools', composioController.getTools);

// Execute tool call
router.post('/execute', composioController.executeToolCall);

module.exports = router;