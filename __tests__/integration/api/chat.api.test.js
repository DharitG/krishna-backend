const request = require('supertest');
const app = require('../../../src/app');
const { supabase } = require('../../../src/services/supabase');
const openaiService = require('../../../src/services/openai.service');
const langchainService = require('../../../src/services/langchain.service');
const memoryService = require('../../../src/services/memory.service');

// Mock the services
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn()
    },
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn()
  }
}));

jest.mock('../../../src/services/openai.service', () => ({
  generateChatCompletion: jest.fn(),
  generateChatCompletionStream: jest.fn()
}));

jest.mock('../../../src/services/langchain.service', () => ({
  processMessage: jest.fn(),
  getStreamingAgentResponse: jest.fn()
}));

jest.mock('../../../src/services/memory.service', () => ({
  processChatMessage: jest.fn()
}));

describe('Chat API', () => {
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

  describe('GET /api/chats', () => {
    test('should return all chats for the user', async () => {
      // Mock supabase response
      const mockChats = [
        {
          id: 'chat-1',
          title: 'Chat 1',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          use_tools: true,
          enabled_tools: ['github', 'gmail'],
          messages: [{ role: 'user', content: 'Hello' }]
        },
        {
          id: 'chat-2',
          title: 'Chat 2',
          created_at: '2023-01-03T00:00:00Z',
          updated_at: '2023-01-04T00:00:00Z',
          use_tools: false,
          enabled_tools: [],
          messages: []
        }
      ];
      
      supabase.select.mockImplementation(() => ({
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: mockChats, error: null })
      }));

      const response = await request(app)
        .get('/api/chats')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          id: 'chat-1',
          title: 'Chat 1',
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-02T00:00:00Z',
          useTools: true,
          enabledTools: ['github', 'gmail'],
          messageCount: 1,
          lastMessage: { role: 'user', content: 'Hello' }
        },
        {
          id: 'chat-2',
          title: 'Chat 2',
          createdAt: '2023-01-03T00:00:00Z',
          updatedAt: '2023-01-04T00:00:00Z',
          useTools: false,
          enabledTools: [],
          messageCount: 0,
          lastMessage: null
        }
      ]);
    });

    test('should return 401 when not authenticated', async () => {
      // Mock failed authentication
      supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      const response = await request(app)
        .get('/api/chats')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/chats', () => {
    test('should create a new chat', async () => {
      // Mock supabase response
      const mockChat = {
        id: 'chat-1',
        title: 'New Chat',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        use_tools: true,
        enabled_tools: [],
        messages: [
          {
            role: 'assistant',
            content: "Hello! I'm August, your AI super agent with tool capabilities. How can I help you today?",
            createdAt: expect.any(String)
          }
        ]
      };
      
      supabase.single.mockResolvedValue({ data: mockChat, error: null });

      const response = await request(app)
        .post('/api/chats')
        .set('Authorization', 'Bearer valid-token')
        .send({ title: 'New Chat' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: 'chat-1',
        title: 'New Chat',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        useTools: true,
        enabledTools: [],
        messages: [expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining("I'm August"),
          createdAt: expect.any(String)
        })]
      });
    });
  });

  describe('GET /api/chats/:chatId', () => {
    test('should return a specific chat by ID', async () => {
      // Mock supabase response
      const mockChat = {
        id: 'chat-1',
        title: 'Chat 1',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        use_tools: true,
        enabled_tools: ['github', 'gmail'],
        messages: [{ role: 'user', content: 'Hello' }],
        auth_status: { github: true }
      };
      
      supabase.single.mockResolvedValue({ data: mockChat, error: null });

      const response = await request(app)
        .get('/api/chats/chat-1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'chat-1',
        title: 'Chat 1',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
        useTools: true,
        enabledTools: ['github', 'gmail'],
        messages: [{ role: 'user', content: 'Hello' }],
        authStatus: { github: true }
      });
    });

    test('should return 404 when chat is not found', async () => {
      // Mock supabase error
      supabase.single.mockResolvedValue({ data: null, error: { message: 'Chat not found' } });

      const response = await request(app)
        .get('/api/chats/non-existent-chat')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Chat not found',
        error: 'Chat not found'
      });
    });
  });

  describe('PUT /api/chats/:chatId', () => {
    test('should update a chat', async () => {
      // Mock supabase response
      const mockChat = {
        id: 'chat-1',
        title: 'Updated Chat',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        use_tools: false,
        enabled_tools: ['github']
      };
      
      supabase.single.mockResolvedValue({ data: mockChat, error: null });

      const response = await request(app)
        .put('/api/chats/chat-1')
        .set('Authorization', 'Bearer valid-token')
        .send({
          title: 'Updated Chat',
          useTools: false,
          enabledTools: ['github']
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'chat-1',
        title: 'Updated Chat',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
        useTools: false,
        enabledTools: ['github']
      });
    });
  });

  describe('DELETE /api/chats/:chatId', () => {
    test('should delete a chat', async () => {
      // Mock supabase response
      supabase.delete.mockImplementation(() => ({
        eq: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ error: null })
      }));

      const response = await request(app)
        .delete('/api/chats/chat-1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(204);
    });
  });

  describe('POST /api/chats/:chatId/messages', () => {
    test('should send a message without tools', async () => {
      // Mock openai service response
      const mockResponse = {
        role: 'assistant',
        content: 'Hello! How can I help you today?'
      };
      
      openaiService.generateChatCompletion.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/chats/chat-1/messages')
        .set('Authorization', 'Bearer valid-token')
        .send({
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          enabledTools: []
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResponse);
      expect(openaiService.generateChatCompletion).toHaveBeenCalled();
      expect(memoryService.processChatMessage).toHaveBeenCalled();
    });

    test('should send a message with tools', async () => {
      // Mock supabase response for service tokens
      supabase.select.mockImplementation(() => ({
        eq: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ 
          data: [
            { service_name: 'github', access_token: 'token', expires_at: '2099-01-01T00:00:00Z' }
          ], 
          error: null 
        })
      }));
      
      // Mock langchain service response
      const mockResponse = {
        role: 'assistant',
        content: 'I found your GitHub repositories.'
      };
      
      langchainService.processMessage.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/chats/chat-1/messages')
        .set('Authorization', 'Bearer valid-token')
        .send({
          messages: [
            { role: 'user', content: 'Show me my GitHub repos' }
          ],
          enabledTools: ['github'],
          authStatus: {}
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResponse);
      expect(langchainService.processMessage).toHaveBeenCalled();
      expect(memoryService.processChatMessage).toHaveBeenCalled();
    });

    test('should return 400 when no messages are provided', async () => {
      const response = await request(app)
        .post('/api/chats/chat-1/messages')
        .set('Authorization', 'Bearer valid-token')
        .send({
          messages: []
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'No messages provided' });
    });
  });

  describe('GET /api/chats/:chatId/messages', () => {
    test('should get messages from a chat', async () => {
      // Mock supabase response
      const mockChat = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' }
        ]
      };
      
      supabase.single.mockResolvedValue({ data: mockChat, error: null });

      const response = await request(app)
        .get('/api/chats/chat-1/messages')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ]);
    });

    test('should return 404 when chat is not found', async () => {
      // Mock supabase error
      supabase.single.mockResolvedValue({ data: null, error: { message: 'Chat not found' } });

      const response = await request(app)
        .get('/api/chats/non-existent-chat/messages')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        message: 'Chat not found',
        error: 'Chat not found'
      });
    });
  });
});
