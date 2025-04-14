const express = require('express');
const router = express.Router();
const memoryController = require('../controllers/memory.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Apply authentication middleware to all memory routes
router.use(requireAuth);

// GET /api/memory - Get memories for the authenticated user
router.get('/', memoryController.getMemories);

// DELETE /api/memory - Delete all memories for the authenticated user
router.delete('/', memoryController.deleteAllMemories);

// DELETE /api/memory/:id - Delete a specific memory by ID
router.delete('/:id', memoryController.deleteMemory);

module.exports = router;
