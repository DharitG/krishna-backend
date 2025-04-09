const request = require('supertest');
const app = require('../../../src/app');
const { supabase } = require('../../../src/services/supabase');

// Mock the supabase service
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn()
    }
  }
}));

describe('Auth API', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('GET /api/auth/verify', () => {
    test('should return 200 and user data when token is valid', async () => {
      // Mock successful authentication
      supabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: 'test@example.com' }
        },
        error: null
      });

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        user: { id: 'user-123', email: 'test@example.com' }
      });
      expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-token');
    });

    test('should return 401 when no token is provided', async () => {
      const response = await request(app)
        .get('/api/auth/verify');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        message: 'Missing or invalid authorization header'
      });
      expect(supabase.auth.getUser).not.toHaveBeenCalled();
    });

    test('should return 401 when token is invalid', async () => {
      // Mock failed authentication
      supabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        message: 'Invalid or expired authentication token'
      });
      expect(supabase.auth.getUser).toHaveBeenCalledWith('invalid-token');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should return 200 with placeholder message', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Authentication is handled by Supabase Auth in the frontend'
      });
    });
  });

  describe('POST /api/auth/register', () => {
    test('should return 200 with placeholder message', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Registration is handled by Supabase Auth in the frontend'
      });
    });
  });

  describe('POST /api/auth/reset-password', () => {
    test('should return 200 with placeholder message', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Password reset is handled by Supabase Auth in the frontend'
      });
    });
  });
});
