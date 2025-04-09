const chatController = require('../../../src/controllers/chat.controller');
const { supabase } = require('../../../src/services/supabase');
const openaiService = require('../../../src/services/openai.service');
const langchainService = require('../../../src/services/langchain.service');
const memoryService = require('../../../src/services/memory.service');

// Mock the services
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
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

describe('Chat Controller', () => {
  let req, res, next;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock request, response, and next function
    req = {
      user: { id: 'user-123' },
      params: {},
      body: {}
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      headersSent: false,
      finished: false
    };
    
    next = jest.fn();
  });

  describe('getUserChats', () => {
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

      await chatController.getUserChats(req, res, next);

      expect(supabase.from).toHaveBeenCalledWith('chats');
      expect(supabase.select).toHaveBeenCalledWith('id, title, created_at, updated_at, use_tools, enabled_tools, messages');
      expect(res.json).toHaveBeenCalledWith([
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

    test('should handle database error', async () => {
      // Mock supabase error
      supabase.select.mockImplementation(() => ({
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } })
      }));

      await chatController.getUserChats(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Error fetching chats',
        error: 'Database error'
      });
    });
  });

  describe('createChat', () => {
    test('should create a new chat with default values', async () => {
      // Mock request body
      req.body = { title: 'New Chat' };
      
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

      await chatController.createChat(req, res, next);

      expect(supabase.from).toHaveBeenCalledWith('chats');
      expect(supabase.insert).toHaveBeenCalledWith([{
        user_id: 'user-123',
        title: 'New Chat',
        messages: [expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining("I'm August"),
          createdAt: expect.any(String)
        })],
        use_tools: true,
        enabled_tools: [],
        auth_status: {},
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      }]);
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
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

    test('should create a chat with custom values', async () => {
      // Mock request body
      req.body = {
        title: 'Custom Chat',
        useTools: false,
        enabledTools: ['github']
      };
      
      // Mock supabase response
      const mockChat = {
        id: 'chat-1',
        title: 'Custom Chat',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        use_tools: false,
        enabled_tools: ['github'],
        messages: [
          {
            role: 'assistant',
            content: "Hello! I'm August, your AI super agent. How can I help you today?",
            createdAt: expect.any(String)
          }
        ]
      };
      
      supabase.single.mockResolvedValue({ data: mockChat, error: null });

      await chatController.createChat(req, res, next);

      expect(supabase.insert).toHaveBeenCalledWith([{
        user_id: 'user-123',
        title: 'Custom Chat',
        messages: [expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining("I'm August"),
          createdAt: expect.any(String)
        })],
        use_tools: false,
        enabled_tools: ['github'],
        auth_status: {},
        created_at: expect.any(Date),
        updated_at: expect.any(Date)
      }]);
    });

    test('should handle database error', async () => {
      // Mock request body
      req.body = { title: 'New Chat' };
      
      // Mock supabase error
      supabase.single.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      await chatController.createChat(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Error creating chat',
        error: 'Database error'
      });
    });
  });

  describe('getChatById', () => {
    test('should return a specific chat by ID', async () => {
      // Mock request params
      req.params = { chatId: 'chat-1' };
      
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

      await chatController.getChatById(req, res, next);

      expect(supabase.from).toHaveBeenCalledWith('chats');
      expect(supabase.select).toHaveBeenCalledWith('*');
      expect(supabase.eq).toHaveBeenCalledWith('id', 'chat-1');
      expect(res.json).toHaveBeenCalledWith({
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
      // Mock request params
      req.params = { chatId: 'non-existent-chat' };
      
      // Mock supabase error
      supabase.single.mockResolvedValue({ data: null, error: { message: 'Chat not found' } });

      await chatController.getChatById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Chat not found',
        error: 'Chat not found'
      });
    });
  });

  // Add more tests for other controller methods...
});
