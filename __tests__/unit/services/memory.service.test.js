const memoryService = require('../../../src/services/memory.service');
const embeddingService = require('../../../src/services/embedding.service');
const { supabase } = require('../../../src/services/supabase');

// Mock the embedding service
jest.mock('../../../src/services/embedding.service', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

// Mock the supabase service
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    bind: jest.fn().mockReturnThis()
  }
}));

describe('Memory Service', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('storeMemory', () => {
    test('should store a memory entry', async () => {
      // Mock supabase response
      const mockMemory = {
        id: 'memory-1',
        user_id: 'user-123',
        content: 'Test memory',
        embedding: [0.1, 0.2, 0.3],
        metadata: { type: 'note' },
        source: 'manual',
        context: { importance: 'high' },
        created_at: '2023-01-01T00:00:00Z'
      };
      
      supabase.select.mockResolvedValue({ data: [mockMemory], error: null });

      const result = await memoryService.storeMemory({
        user_id: 'user-123',
        content: 'Test memory',
        metadata: { type: 'note' },
        source: 'manual',
        context: { importance: 'high' }
      });

      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('Test memory');
      expect(supabase.from).toHaveBeenCalledWith('memory_entries');
      expect(supabase.insert).toHaveBeenCalledWith({
        user_id: 'user-123',
        content: 'Test memory',
        embedding: [0.1, 0.2, 0.3],
        metadata: { type: 'note' },
        source: 'manual',
        context: { importance: 'high' }
      });
      expect(result).toEqual(mockMemory);
    });

    test('should throw an error when supabase insert fails', async () => {
      supabase.select.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      await expect(memoryService.storeMemory({
        user_id: 'user-123',
        content: 'Test memory',
        source: 'manual'
      })).rejects.toThrow();
    });
  });

  describe('processChatMessage', () => {
    test('should process and store a chat message', async () => {
      // Mock storeMemory method
      const storeMemorySpy = jest.spyOn(memoryService, 'storeMemory').mockResolvedValue({
        id: 'memory-1',
        user_id: 'user-123',
        content: 'Hello, how are you?',
        source: 'chat'
      });

      const result = await memoryService.processChatMessage({
        userId: 'user-123',
        content: 'Hello, how are you?',
        role: 'user',
        chatId: 'chat-1',
        contextData: {
          timezone: 'America/New_York',
          device: { type: 'mobile', os: 'iOS' },
          location: { latitude: 40.7128, longitude: -74.0060 }
        }
      });

      expect(storeMemorySpy).toHaveBeenCalledWith({
        user_id: 'user-123',
        content: 'Hello, how are you?',
        metadata: {
          type: 'chat_message',
          chatId: 'chat-1',
          role: 'user'
        },
        source: 'chat',
        context: {
          temporal: {
            timestamp: expect.any(String),
            timezone: 'America/New_York'
          },
          source: {
            service: 'chat',
            type: 'user_message'
          },
          device: { type: 'mobile', os: 'iOS' },
          geospatial: { latitude: 40.7128, longitude: -74.0060 }
        }
      });
      
      expect(result).toEqual({
        id: 'memory-1',
        user_id: 'user-123',
        content: 'Hello, how are you?',
        source: 'chat'
      });
    });

    test('should skip system messages', async () => {
      const storeMemorySpy = jest.spyOn(memoryService, 'storeMemory');

      const result = await memoryService.processChatMessage({
        userId: 'user-123',
        content: 'System message',
        role: 'system',
        chatId: 'chat-1'
      });

      expect(storeMemorySpy).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('retrieveMemories', () => {
    test('should retrieve memories based on a query', async () => {
      // Mock supabase response
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
      
      supabase.bind.mockResolvedValue({ data: mockMemories, error: null });

      const result = await memoryService.retrieveMemories({
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

      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('test query');
      expect(supabase.from).toHaveBeenCalledWith('memory_entries');
      expect(supabase.select).toHaveBeenCalledWith('*');
      expect(supabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(supabase.order).toHaveBeenCalledWith('embedding <=> $1', { ascending: true });
      expect(supabase.limit).toHaveBeenCalledWith(5);
      expect(supabase.gte).toHaveBeenCalledWith('created_at', '2023-01-01');
      expect(supabase.lte).toHaveBeenCalledWith('created_at', '2023-01-31');
      expect(supabase.in).toHaveBeenCalledWith('source', ['chat', 'email']);
      expect(supabase.bind).toHaveBeenCalledWith('$1', [0.1, 0.2, 0.3]);
      expect(result).toEqual(mockMemories);
    });

    test('should throw an error when supabase query fails', async () => {
      supabase.bind.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      await expect(memoryService.retrieveMemories({
        query: 'test query',
        userId: 'user-123'
      })).rejects.toThrow();
    });
  });

  describe('getUserMemories', () => {
    test('should get all memories for a user', async () => {
      // Mock supabase response
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
      
      supabase.range.mockResolvedValue({ data: mockMemories, error: null });

      const result = await memoryService.getUserMemories('user-123', { limit: 10, offset: 0 });

      expect(supabase.from).toHaveBeenCalledWith('memory_entries');
      expect(supabase.select).toHaveBeenCalledWith('*');
      expect(supabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(supabase.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(supabase.range).toHaveBeenCalledWith(0, 9);
      expect(result).toEqual(mockMemories);
    });

    test('should throw an error when supabase query fails', async () => {
      supabase.range.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      await expect(memoryService.getUserMemories('user-123')).rejects.toThrow();
    });
  });

  describe('deleteMemory', () => {
    test('should delete a memory entry', async () => {
      supabase.eq.mockResolvedValue({ error: null });

      await memoryService.deleteMemory('memory-1', 'user-123');

      expect(supabase.from).toHaveBeenCalledWith('memory_entries');
      expect(supabase.delete).toHaveBeenCalled();
      expect(supabase.eq).toHaveBeenCalledWith('id', 'memory-1');
      expect(supabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
    });

    test('should throw an error when supabase delete fails', async () => {
      supabase.eq.mockResolvedValue({ error: { message: 'Database error' } });

      await expect(memoryService.deleteMemory('memory-1', 'user-123')).rejects.toThrow();
    });
  });

  describe('deleteAllUserMemories', () => {
    test('should delete all memories for a user', async () => {
      supabase.eq.mockResolvedValue({ error: null });

      await memoryService.deleteAllUserMemories('user-123');

      expect(supabase.from).toHaveBeenCalledWith('memory_entries');
      expect(supabase.delete).toHaveBeenCalled();
      expect(supabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
    });

    test('should throw an error when supabase delete fails', async () => {
      supabase.eq.mockResolvedValue({ error: { message: 'Database error' } });

      await expect(memoryService.deleteAllUserMemories('user-123')).rejects.toThrow();
    });
  });
});
