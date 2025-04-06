const memoryService = require('../services/memory.service');

/**
 * Memory system controller
 */
class MemoryController {
  /**
   * Store a new memory
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async storeMemory(req, res) {
    try {
      const userId = req.user.id;
      const { content, metadata, source, context } = req.body;
      
      // Validate required parameters
      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }
      
      if (!source) {
        return res.status(400).json({ error: 'Source is required' });
      }
      
      // Store memory
      const memory = await memoryService.storeMemory({
        user_id: userId,
        content,
        metadata: metadata || {},
        source,
        context: context || {}
      });
      
      res.status(201).json(memory);
    } catch (error) {
      console.error('Error storing memory:', error);
      res.status(500).json({ error: 'Failed to store memory' });
    }
  }
  
  /**
   * Process and store a chat message
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async processChatMessage(req, res) {
    try {
      const userId = req.user.id;
      const { message, chatId, contextData } = req.body;
      
      // Validate required parameters
      if (!message || !message.role || !message.content) {
        return res.status(400).json({ error: 'Invalid message format' });
      }
      
      if (!chatId) {
        return res.status(400).json({ error: 'Chat ID is required' });
      }
      
      // Process message
      const memory = await memoryService.processChatMessage({
        userId,
        content: message.content,
        role: message.role,
        chatId,
        contextData
      });
      
      res.status(201).json(memory);
    } catch (error) {
      console.error('Error processing chat message:', error);
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  }
  
  /**
   * Retrieve memories based on a query
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async retrieveMemories(req, res) {
    try {
      const userId = req.user.id;
      const { query, filters, limit } = req.body;
      
      // Validate required parameters
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      
      // Retrieve memories
      const memories = await memoryService.retrieveMemories({
        query,
        userId,
        filters: filters || {},
        limit: limit || 10
      });
      
      res.status(200).json(memories);
    } catch (error) {
      console.error('Error retrieving memories:', error);
      res.status(500).json({ error: 'Failed to retrieve memories' });
    }
  }
  
  /**
   * Get all memories for a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getUserMemories(req, res) {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      // Get memories
      const memories = await memoryService.getUserMemories(userId, { limit, offset });
      
      res.status(200).json(memories);
    } catch (error) {
      console.error('Error getting user memories:', error);
      res.status(500).json({ error: 'Failed to get user memories' });
    }
  }
  
  /**
   * Delete a memory
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async deleteMemory(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      // Validate required parameters
      if (!id) {
        return res.status(400).json({ error: 'Memory ID is required' });
      }
      
      // Delete memory
      await memoryService.deleteMemory(id, userId);
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting memory:', error);
      res.status(500).json({ error: 'Failed to delete memory' });
    }
  }
  
  /**
   * Delete all memories for a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async deleteAllUserMemories(req, res) {
    try {
      const userId = req.user.id;
      
      // Delete all memories
      await memoryService.deleteAllUserMemories(userId);
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting all user memories:', error);
      res.status(500).json({ error: 'Failed to delete all user memories' });
    }
  }
}

module.exports = new MemoryController();
