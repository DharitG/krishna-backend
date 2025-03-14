const express = require('express');
const router = express.Router();
const composioController = require('../controllers/composio.controller');

// Initialize authentication with a service
router.post('/auth/init/:service', composioController.initAuthentication);

// Complete authentication process
router.get('/auth/callback', composioController.completeAuthentication);

// Get available tools
router.get('/tools', composioController.getTools);

// Execute tool call
router.post('/execute', composioController.executeToolCall);

module.exports = router;