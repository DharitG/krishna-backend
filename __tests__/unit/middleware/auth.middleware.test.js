const { requireAuth } = require('../../../src/middleware/auth.middleware');
const { supabase } = require('../../../src/services/supabase');

// Mock the supabase service
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn()
    }
  }
}));

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock request, response, and next function
    req = {
      headers: {
        authorization: 'Bearer valid-token'
      }
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    next = jest.fn();
  });

  test('should call next() when valid token is provided', async () => {
    // Mock successful authentication
    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' }
      },
      error: null
    });

    await requireAuth(req, res, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(req.user).toEqual({ id: 'user-123', email: 'test@example.com' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 401 when no authorization header is provided', async () => {
    req.headers.authorization = undefined;

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing or invalid authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when authorization header does not start with Bearer', async () => {
    req.headers.authorization = 'Basic invalid-token';

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing or invalid authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when token is empty', async () => {
    req.headers.authorization = 'Bearer ';

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing authentication token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 when token is invalid', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' }
    });

    await requireAuth(req, res, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired authentication token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 500 when an unexpected error occurs', async () => {
    supabase.auth.getUser.mockRejectedValue(new Error('Unexpected error'));

    await requireAuth(req, res, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ 
      message: 'Authentication error', 
      error: 'Unexpected error' 
    });
    expect(next).not.toHaveBeenCalled();
  });
});
