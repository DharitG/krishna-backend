const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');

// Get all chats for the user
router.get('/', chatController.getUserChats);

// Create a new chat
router.post('/', chatController.createChat);

// Get a specific chat by ID
router.get('/:chatId', chatController.getChatById);

// Update chat details (title, enabled tools)
router.put('/:chatId', chatController.updateChat);

// Delete a chat
router.delete('/:chatId', chatController.deleteChat);

// Send a message in a chat
router.post('/:chatId/messages', chatController.sendMessage);

// Get messages from a chat
router.get('/:chatId/messages', chatController.getChatMessages);

module.exports = router;