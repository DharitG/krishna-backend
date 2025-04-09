const memoryController = require('../../../src/controllers/memory.controller');
const memoryService = require('../../../src/services/memory.service');

// Mock the memory service
jest.mock('../../../src/services/memory.service', () => ({
  storeMemory: jest.fn(),
  processChatMessage: jest.fn(),
  retrieveMemories: jest.fn(),
  getUserMemories: jest.fn(),
  deleteMemory: jest.fn(),
  deleteAllUserMemories: jest.fn()
}));

describe('Memory Controller', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock request and response
    req = {
      user: { id: 'user-123' },
      params: {},
      body: {},
      query: {}
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };
  });

  describe('storeMemory', () => {
    test('should store a memory and return 201 status', async () => {
      // Mock request body
      req.body = {
        content: 'Test memory',
        metadata: { type: 'note' },
        source: 'manual',
        context: { importance: 'high' }
      };
      
      // Mock service response
      const mockMemory = {
        id: 'memory-1',
        user_id: 'user-123',
        content: 'Test memory',
        metadata: { type: 'note' },
        source: 'manual',
        context: { importance: 'high' },
        created_at: '2023-01-01T00:00:00Z'
      };
      
      memoryService.storeMemory.mockResolvedValue(mockMemory);

      await memoryController.storeMemory(req, res);

      expect(memoryService.storeMemory).toHaveBeenCalledWith({
        user_id: 'user-123',
        content: 'Test memory',
        metadata: { type: 'note' },
        source: 'manual',
        context: { importance: 'high' }
      });
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockMemory);
    });

    test('should return 400 when content is missing', async () => {
      // Mock request body with missing content
      req.body = {
        source: 'manual'
      };

      await memoryController.storeMemory(req, res);

      expect(memoryService.storeMemory).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Content is required' });
    });

    test('should return 400 when source is missing', async () => {
      // Mock request body with missing source
      req.body = {
        content: 'Test memory'
      };

      await memoryController.storeMemory(req, res);

      expect(memoryService.storeMemory).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Source is required' });
    });

    test('should return 500 when service throws an error', async () => {
      // Mock request body
      req.body = {
        content: 'Test memory',
        source: 'manual'
      };
      
      // Mock service error
      memoryService.storeMemory.mockRejectedValue(new Error('Database error'));

      await memoryController.storeMemory(req, res);

      expect(memoryService.storeMemory).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to store memory' });
    });
  });

  describe('processChatMessage', () => {
    test('should process a chat message and return 201 status', async () => {
      // Mock request body
      req.body = {
        message: {
          role: 'user',
          content: 'Hello, how are you?'
        },
        chatId: 'chat-1',
        contextData: {
          timezone: 'America/New_York'
        }
      };
      
      // Mock service response
      const mockMemory = {
        id: 'memory-1',
        user_id: 'user-123',
        content: 'Hello, how are you?',
        source: 'chat'
      };
      
      memoryService.processChatMessage.mockResolvedValue(mockMemory);

      await memoryController.processChatMessage(req, res);

      expect(memoryService.processChatMessage).toHaveBeenCalledWith({
        userId: 'user-123',
        content: 'Hello, how are you?',
        role: 'user',
        chatId: 'chat-1',
        contextData: {
          timezone: 'America/New_York'
        }
      });
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockMemory);
    });

    test('should return 400 when message is invalid', async () => {
      // Mock request body with invalid message
      req.body = {
        message: {
          // Missing role or content
        },
        chatId: 'chat-1'
      };

      await memoryController.processChatMessage(req, res);

      expect(memoryService.processChatMessage).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid message format' });
    });

    test('should return 400 when chatId is missing', async () => {
      // Mock request body with missing chatId
      req.body = {
        message: {
          role: 'user',
          content: 'Hello'
        }
        // Missing chatId
      };

      await memoryController.processChatMessage(req, res);

      expect(memoryService.processChatMessage).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Chat ID is required' });
    });

    test('should return 500 when service throws an error', async () => {
      // Mock request body
      req.body = {
        message: {
          role: 'user',
          content: 'Hello'
        },
        chatId: 'chat-1'
      };
      
      // Mock service error
      memoryService.processChatMessage.mockRejectedValue(new Error('Database error'));

      await memoryController.processChatMessage(req, res);

      expect(memoryService.processChatMessage).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to process chat message' });
    });
  });

  describe('retrieveMemories', () => {
    test('should retrieve memories and return 200 status', async () => {
      // Mock request body
      req.body = {
        query: 'test query',
        filters: {
          timeRange: {
            start: '2023-01-01',
            end: '2023-01-31'
          },
          sources: ['chat', 'email']
        },
        limit: 5
      };
      
      // Mock service response
      const mockMemories = [
        {
          id: 'memory-1',
          user_id: 'user-123',
          content: 'First memory',
          created_at: '2023-01-01T00:00:00Z'
        },
        {
          id: 'memory-2',
          user_id: 'user-123',
          content: 'Second memory',
          created_at: '2023-01-02T00:00:00Z'
        }
      ];
      
      memoryService.retrieveMemories.mockResolvedValue(mockMemories);

      await memoryController.retrieveMemories(req, res);

      expect(memoryService.retrieveMemories).toHaveBeenCalledWith({
        query: 'test query',
        userId: 'user-123',
        filters: {
          timeRange: {
            start: '2023-01-01',
            end: '2023-01-31'
          },
          sources: ['chat', 'email']
        },
        limit: 5
      });
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockMemories);
    });

    test('should return 400 when query is missing', async () => {
      // Mock request body with missing query
      req.body = {
        filters: {}
      };

      await memoryController.retrieveMemories(req, res);

      expect(memoryService.retrieveMemories).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Query is required' });
    });

    test('should return 500 when service throws an error', async () => {
      // Mock request body
      req.body = {
        query: 'test query'
      };
      
      // Mock service error
      memoryService.retrieveMemories.mockRejectedValue(new Error('Database error'));

      await memoryController.retrieveMemories(req, res);

      expect(memoryService.retrieveMemories).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to retrieve memories' });
    });
  });

  describe('getUserMemories', () => {
    test('should get user memories and return 200 status', async () => {
      // Mock query parameters
      req.query = {
        limit: '10',
        offset: '20'
      };
      
      // Mock service response
      const mockMemories = [
        {
          id: 'memory-1',
          user_id: 'user-123',
          content: 'First memory',
          created_at: '2023-01-01T00:00:00Z'
        },
        {
          id: 'memory-2',
          user_id: 'user-123',
          content: 'Second memory',
          created_at: '2023-01-02T00:00:00Z'
        }
      ];
      
      memoryService.getUserMemories.mockResolvedValue(mockMemories);

      await memoryController.getUserMemories(req, res);

      expect(memoryService.getUserMemories).toHaveBeenCalledWith('user-123', { limit: 10, offset: 20 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockMemories);
    });

    test('should use default limit and offset when not provided', async () => {
      // Mock empty query parameters
      req.query = {};
      
      // Mock service response
      const mockMemories = [];
      
      memoryService.getUserMemories.mockResolvedValue(mockMemories);

      await memoryController.getUserMemories(req, res);

      expect(memoryService.getUserMemories).toHaveBeenCalledWith('user-123', { limit: 100, offset: 0 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockMemories);
    });

    test('should return 500 when service throws an error', async () => {
      // Mock service error
      memoryService.getUserMemories.mockRejectedValue(new Error('Database error'));

      await memoryController.getUserMemories(req, res);

      expect(memoryService.getUserMemories).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get user memories' });
    });
  });

  describe('deleteMemory', () => {
    test('should delete a memory and return 204 status', async () => {
      // Mock request parameters
      req.params = {
        id: 'memory-1'
      };
      
      memoryService.deleteMemory.mockResolvedValue();

      await memoryController.deleteMemory(req, res);

      expect(memoryService.deleteMemory).toHaveBeenCalledWith('memory-1', 'user-123');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    test('should return 400 when memory ID is missing', async () => {
      // Mock empty request parameters
      req.params = {};

      await memoryController.deleteMemory(req, res);

      expect(memoryService.deleteMemory).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Memory ID is required' });
    });

    test('should return 500 when service throws an error', async () => {
      // Mock request parameters
      req.params = {
        id: 'memory-1'
      };
      
      // Mock service error
      memoryService.deleteMemory.mockRejectedValue(new Error('Database error'));

      await memoryController.deleteMemory(req, res);

      expect(memoryService.deleteMemory).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete memory' });
    });
  });

  describe('deleteAllUserMemories', () => {
    test('should delete all user memories and return 204 status', async () => {
      memoryService.deleteAllUserMemories.mockResolvedValue();

      await memoryController.deleteAllUserMemories(req, res);

      expect(memoryService.deleteAllUserMemories).toHaveBeenCalledWith('user-123');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    test('should return 500 when service throws an error', async () => {
      // Mock service error
      memoryService.deleteAllUserMemories.mockRejectedValue(new Error('Database error'));

      await memoryController.deleteAllUserMemories(req, res);

      expect(memoryService.deleteAllUserMemories).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to delete all user memories' });
    });
  });
});
