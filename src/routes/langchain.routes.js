const express = require('express');
const router = express.Router();
const langchainController = require('../controllers/langchain.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Process a message using LangChain (no auth required for testing)
router.post('/process', langchainController.processMessage);

// Get streaming response from LangChain agent (no auth required for testing)
router.post('/stream', langchainController.getStreamingResponse);

// Create a domain-specific agent based on a use case description
router.post('/domain-agent', langchainController.createDomainSpecificAgent);

// Process a message using a domain-specific agent
router.post('/domain-process', langchainController.processDomainSpecificMessage);

module.exports = router;
