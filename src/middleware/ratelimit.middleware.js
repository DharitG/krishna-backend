const rateLimitService = require('../services/ratelimit.service');

/**
 * Middleware to check rate limits based on user's subscription tier
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkRateLimit = async (req, res, next) => {
  try {
    // Skip rate limiting for webhook routes
    if (req.path.includes('/webhook')) {
      return next();
    }
    
    // Get user ID from request
    const userId = req.user?.id;
    
    // If no user ID, user is not authenticated - should never happen since this middleware
    // should always be used after requireAuth middleware, but we'll handle it just in case
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }
    
    // Check rate limit
    const result = await rateLimitService.checkRateLimit(userId);
    
    // Add rate limit info to response headers
    res.set({
      'X-RateLimit-Limit': result.limit === Infinity ? 'unlimited' : result.limit,
      'X-RateLimit-Remaining': result.remaining === Infinity ? 'unlimited' : result.remaining,
      'X-RateLimit-Plan': result.plan
    });
    
    // If rate limit exceeded, return 429 Too Many Requests
    if (!result.isAllowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `You have reached your daily request limit for your ${result.plan} plan. Please upgrade your subscription for more requests.`,
        plan: result.plan,
        limit: result.limit,
        remaining: 0
      });
    }
    
    // Continue to the next middleware
    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    // Return an error rather than silently continuing
    res.status(500).json({
      error: 'Rate limit error',
      message: 'An error occurred while checking rate limits. Please try again later.'
    });
  }
};

module.exports = { checkRateLimit };
