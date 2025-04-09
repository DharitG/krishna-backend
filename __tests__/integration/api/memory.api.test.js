const request = require('supertest');
const app = require('../../../src/app');
const { supabase } = require('../../../src/services/supabase');
const memoryService = require('../../../src/services/memory.service');
const embeddingService = require('../../../src/services/embedding.service');

// Mock the services
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn()
    }
  }
}));

jest.mock('../../../src/services/memory.service', () => ({
  storeMemory: jest.fn(),
  processChatMessage: jest.fn(),
  retrieveMemories: jest.fn(),
  getUserMemories: jest.fn(),
  deleteMemory: jest.fn(),
  deleteAllUserMemories: jest.fn()
}));

jest.mock('../../../src/services/embedding.service', () => ({
  generateEmbedding: jest.fn()
}));

describe('Memory API', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock successful authentication for all tests
    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' }
      },
      error: null
    });
  });

  describe('POST /api/memory', () => {
    test('should store a memory and return 201 status', async () => {
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

      const response = await request(app)
        .post('/api/memory')
        .set('Authorization', 'Bearer valid-token')
        .send({
          content: 'Test memory',
          metadata: { type: 'note' },
          source: 'manual',
          context: { importance: 'high' }
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockMemory);
      expect(memoryService.storeMemory).toHaveBeenCalledWith({
        user_id: 'user-123',
        content: 'Test memory',
        metadata: { type: 'note' },
        source: 'manual',
        context: { importance: 'high' }
      });
    });

    test('should return 400 when content is missing', async () => {
      const response = await request(app)
        .post('/api/memory')
        .set('Authorization', 'Bearer valid-token')
        .send({
          source: 'manual'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Content is required' });
      expect(memoryService.storeMemory).not.toHaveBeenCalled();
    });

    test('should return 400 when source is missing', async () => {
      const response = await request(app)
        .post('/api/memory')
        .set('Authorization', 'Bearer valid-token')
        .send({
          content: 'Test memory'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Source is required' });
      expect(memoryService.storeMemory).not.toHaveBeenCalled();
    });

    test('should return 401 when not authenticated', async () => {
      // Mock failed authentication
      supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      const response = await request(app)
        .post('/api/memory')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          content: 'Test memory',
          source: 'manual'
        });

      expect(response.status).toBe(401);
      expect(memoryService.storeMemory).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/memory/chat', () => {
    test('should process a chat message and return 201 status', async () => {
      // Mock service response
      const mockMemory = {
        id: 'memory-1',
        user_id: 'user-123',
        content: 'Hello, how are you?',
        source: 'chat'
      };
      
      memoryService.processChatMessage.mockResolvedValue(mockMemory);

      const response = await request(app)
        .post('/api/memory/chat')
        .set('Authorization', 'Bearer valid-token')
        .send({
          message: {
            role: 'user',
            content: 'Hello, how are you?'
          },
          chatId: 'chat-1',
          contextData: {
            timezone: 'America/New_York'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockMemory);
      expect(memoryService.processChatMessage).toHaveBeenCalledWith({
        userId: 'user-123',
        content: 'Hello, how are you?',
        role: 'user',
        chatId: 'chat-1',
        contextData: {
          timezone: 'America/New_York'
        }
      });
    });

    test('should return 400 when message is invalid', async () => {
      const response = await request(app)
        .post('/api/memory/chat')
        .set('Authorization', 'Bearer valid-token')
        .send({
          message: {
            // Missing role or content
          },
          chatId: 'chat-1'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid message format' });
      expect(memoryService.processChatMessage).not.toHaveBeenCalled();
    });

    test('should return 400 when chatId is missing', async () => {
      const response = await request(app)
        .post('/api/memory/chat')
        .set('Authorization', 'Bearer valid-token')
        .send({
          message: {
            role: 'user',
            content: 'Hello'
          }
          // Missing chatId
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Chat ID is required' });
      expect(memoryService.processChatMessage).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/memory/retrieve', () => {
    test('should retrieve memories and return 200 status', async () => {
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

      const response = await request(app)
        .post('/api/memory/retrieve')
        .set('Authorization', 'Bearer valid-token')
        .send({
          query: 'test query',
          filters: {
            timeRange: {
              start: '2023-01-01',
              end: '2023-01-31'
            },
            sources: ['chat', 'email']
          },
          limit: 5
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockMemories);
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
    });

    test('should return 400 when query is missing', async () => {
      const response = await request(app)
        .post('/api/memory/retrieve')
        .set('Authorization', 'Bearer valid-token')
        .send({
          filters: {}
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Query is required' });
      expect(memoryService.retrieveMemories).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/memory', () => {
    test('should get user memories and return 200 status', async () => {
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

      const response = await request(app)
        .get('/api/memory')
        .set('Authorization', 'Bearer valid-token')
        .query({ limit: '10', offset: '20' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockMemories);
      expect(memoryService.getUserMemories).toHaveBeenCalledWith('user-123', { limit: 10, offset: 20 });
    });
  });

  describe('DELETE /api/memory/:id', () => {
    test('should delete a memory and return 204 status', async () => {
      memoryService.deleteMemory.mockResolvedValue();

      const response = await request(app)
        .delete('/api/memory/memory-1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(204);
      expect(memoryService.deleteMemory).toHaveBeenCalledWith('memory-1', 'user-123');
    });
  });

  describe('DELETE /api/memory', () => {
    test('should delete all user memories and return 204 status', async () => {
      memoryService.deleteAllUserMemories.mockResolvedValue();

      const response = await request(app)
        .delete('/api/memory')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(204);
      expect(memoryService.deleteAllUserMemories).toHaveBeenCalledWith('user-123');
    });
  });
});
