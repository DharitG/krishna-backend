const { checkRateLimit } = require('../../../src/middleware/ratelimit.middleware');
const rateLimitService = require('../../../src/services/ratelimit.service');

// Mock the rate limit service
jest.mock('../../../src/services/ratelimit.service', () => ({
  checkRateLimit: jest.fn()
}));

describe('Rate Limit Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock request, response, and next function
    req = {
      user: { id: 'user-123' },
      path: '/api/chats'
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn()
    };
    
    next = jest.fn();
  });

  test('should call next() when rate limit is not exceeded', async () => {
    // Mock rate limit check result
    rateLimitService.checkRateLimit.mockResolvedValue({
      isAllowed: true,
      remaining: 5,
      plan: 'eden',
      limit: 100
    });

    await checkRateLimit(req, res, next);

    expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith('user-123');
    expect(res.set).toHaveBeenCalledWith({
      'X-RateLimit-Limit': 100,
      'X-RateLimit-Remaining': 5,
      'X-RateLimit-Plan': 'eden'
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should set unlimited headers for unlimited plan', async () => {
    // Mock rate limit check result for unlimited plan
    rateLimitService.checkRateLimit.mockResolvedValue({
      isAllowed: true,
      remaining: Infinity,
      plan: 'utopia',
      limit: Infinity
    });

    await checkRateLimit(req, res, next);

    expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith('user-123');
    expect(res.set).toHaveBeenCalledWith({
      'X-RateLimit-Limit': 'unlimited',
      'X-RateLimit-Remaining': 'unlimited',
      'X-RateLimit-Plan': 'utopia'
    });
    expect(next).toHaveBeenCalled();
  });

  test('should return 429 when rate limit is exceeded', async () => {
    // Mock rate limit check result
    rateLimitService.checkRateLimit.mockResolvedValue({
      isAllowed: false,
      remaining: 0,
      plan: 'free',
      limit: 10
    });

    await checkRateLimit(req, res, next);

    expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith('user-123');
    expect(res.set).toHaveBeenCalledWith({
      'X-RateLimit-Limit': 10,
      'X-RateLimit-Remaining': 0,
      'X-RateLimit-Plan': 'free'
    });
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Rate limit exceeded',
      message: 'You have reached your daily request limit for your free plan. Please upgrade your subscription for more requests.',
      plan: 'free',
      limit: 10,
      remaining: 0
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should skip rate limiting for webhook routes', async () => {
    req.path = '/api/webhook/revenuecat';

    await checkRateLimit(req, res, next);

    expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  test('should return 401 when user is not authenticated', async () => {
    req.user = undefined;

    await checkRateLimit(req, res, next);

    expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 500 when an error occurs', async () => {
    rateLimitService.checkRateLimit.mockRejectedValue(new Error('Database error'));

    await checkRateLimit(req, res, next);

    expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith('user-123');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Rate limit error',
      message: 'An error occurred while checking rate limits. Please try again later.'
    });
    expect(next).not.toHaveBeenCalled();
  });
});
