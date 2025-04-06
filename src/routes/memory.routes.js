const express = require('express');
const router = express.Router();
const memoryController = require('../controllers/memory.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply authentication middleware to all routes
router.use(authMiddleware.requireAuth);

// Store a new memory
router.post('/', memoryController.storeMemory);

// Process and store a chat message
router.post('/chat', memoryController.processChatMessage);

// Retrieve memories based on a query
router.post('/retrieve', memoryController.retrieveMemories);

// Get all memories for a user
router.get('/', memoryController.getUserMemories);

// Delete a memory
router.delete('/:id', memoryController.deleteMemory);

// Delete all memories for a user
router.delete('/', memoryController.deleteAllUserMemories);

module.exports = router;
