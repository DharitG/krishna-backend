const { authenticateSocket } = require('../../../src/middleware/socket.middleware');
const { supabase } = require('../../../src/services/supabase');

// Mock the supabase service
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn()
    }
  }
}));

describe('Socket Middleware', () => {
  let socket, next;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock socket and next function
    socket = {
      handshake: {
        auth: {
          token: 'valid-token'
        },
        headers: {
          authorization: 'Bearer valid-token'
        }
      }
    };
    
    next = jest.fn();
  });

  test('should call next() when valid token is provided in auth object', async () => {
    // Mock successful authentication
    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' }
      },
      error: null
    });

    await authenticateSocket(socket, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(socket.user).toEqual({ id: 'user-123', email: 'test@example.com' });
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeUndefined(); // No error passed to next
  });

  test('should call next() when valid token is provided in headers', async () => {
    // Remove token from auth object to test header fallback
    socket.handshake.auth.token = undefined;
    
    // Mock successful authentication
    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' }
      },
      error: null
    });

    await authenticateSocket(socket, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(socket.user).toEqual({ id: 'user-123', email: 'test@example.com' });
    expect(next).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeUndefined(); // No error passed to next
  });

  test('should call next with error when no token is provided', async () => {
    // Remove token from both auth and headers
    socket.handshake.auth.token = undefined;
    socket.handshake.headers.authorization = undefined;

    await authenticateSocket(socket, next);

    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Authentication required');
  });

  test('should call next with error when token is invalid', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' }
    });

    await authenticateSocket(socket, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Invalid authentication token');
  });

  test('should call next with error when an unexpected error occurs', async () => {
    supabase.auth.getUser.mockRejectedValue(new Error('Unexpected error'));

    await authenticateSocket(socket, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Authentication failed: Unexpected error');
  });
});
