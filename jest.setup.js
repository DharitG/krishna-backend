// Set up environment variables for testing
require('dotenv').config({ path: '.env.test' });

// Mock Supabase
jest.mock('./src/services/supabase', () => {
  return {
    supabase: {
      auth: {
        getUser: jest.fn(),
        getSession: jest.fn()
      },
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
    },
    testConnection: jest.fn().mockResolvedValue(true)
  };
});

// Mock Azure OpenAI
jest.mock('./src/services/openai.service', () => ({
  generateChatCompletion: jest.fn(),
  generateStreamingChatCompletion: jest.fn()
}));

// Mock Composio
jest.mock('./src/services/composio.service', () => ({
  getTools: jest.fn(),
  findActionsByUseCase: jest.fn(),
  executeAction: jest.fn(),
  checkToolAuth: jest.fn(),
  executeToolCall: jest.fn()
}));

// Global test timeout
jest.setTimeout(10000);
