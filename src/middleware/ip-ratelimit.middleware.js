const rateLimit = require('express-rate-limit');
const Redis = require('redis');
const RedisStore = require('rate-limit-redis');

// Initialize Redis client (if REDIS_URL env var is set)
let redisClient;
if (process.env.REDIS_URL) {
  redisClient = Redis.createClient({
    url: process.env.REDIS_URL,
    retry_strategy: (options) => {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        // End reconnecting on a specific error
        console.error('Redis connection refused. Using memory store instead.');
        return new Error('Redis server refused connection');
      }
      if (options.total_retry_time > 1000 * 60 * 30) {
        // End reconnecting after 30 minutes
        console.error('Redis retry time exhausted. Using memory store instead.');
        return new Error('Redis retry time exhausted');
      }
      if (options.attempt > 10) {
        // End reconnecting after 10 attempts
        console.error('Redis max retry attempts reached. Using memory store instead.');
        return new Error('Redis max retry attempts reached');
      }
      // Reconnect after increasing delay
      return Math.min(options.attempt * 100, 3000);
    }
  });

  redisClient.on('error', (err) => {
    console.error('Redis error:', err);
    // Fall back to memory store if Redis fails
  });
  
  redisClient.on('connect', () => {
    console.log('Redis connected successfully');
  });
}

/**
 * Creates store object for rate limiting
 * @param {string} prefix - Redis key prefix
 * @param {number} windowMs - Time window in milliseconds
 * @returns {object} Store object
 */
const createStore = (prefix, windowMs) => {
  if (redisClient) {
    try {
      return new RedisStore({
        client: redisClient,
        prefix: prefix,
        expiry: Math.floor(windowMs / 1000) + 60, // Add 60 seconds to clean up
      });
    } catch (error) {
      console.error('Error creating Redis store:', error);
      return undefined; // Fall back to memory store
    }
  }
  return undefined; // Use memory store
};

/**
 * IP-based rate limiting for public routes
 * Strict limits to prevent abuse and DDoS attacks
 */
const publicRouteRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 429,
    error: 'Too many requests',
    message: 'You have exceeded the rate limit. Please try again later.',
  },
  // Use Redis as store if available, otherwise use memory store
  store: createStore('rl:public:', 15 * 60 * 1000),
  // Skip rate limiting for trusted proxies
  skip: (req, res) => {
    // Skip health check endpoint
    if (req.path === '/health') {
      return true;
    }
    return false;
  },
  // Custom key generator - use X-Forwarded-For header if present
  keyGenerator: (req, res) => {
    const xff = req.headers['x-forwarded-for'];
    return xff ? 
      (Array.isArray(xff) ? xff[0] : xff.split(',')[0]) : 
      req.ip || req.connection.remoteAddress;
  },
  // Custom handler for when rate limit is exceeded
  handler: (req, res, next, options) => {
    console.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  }
});

/**
 * Stricter rate limiting for authentication routes
 * Prevents brute force attacks
 */
const authRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 requests per hour for auth routes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too many authentication attempts',
    message: 'You have exceeded the authentication rate limit. Please try again later.',
  },
  store: createStore('rl:auth:', 60 * 60 * 1000),
  keyGenerator: (req, res) => {
    const xff = req.headers['x-forwarded-for'];
    return xff ? 
      (Array.isArray(xff) ? xff[0] : xff.split(',')[0]) : 
      req.ip || req.connection.remoteAddress;
  },
  handler: (req, res, next, options) => {
    console.warn(`Auth rate limit exceeded for IP: ${req.ip}, path: ${req.path}`);
    res.status(options.statusCode).json(options.message);
  }
});

/**
 * Moderate rate limiting for webhook routes
 * Prevents spamming webhooks but allows legitimate services
 */
const webhookRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 60, // limit each IP to 60 requests per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too many webhook requests',
    message: 'Webhook request rate limit exceeded. Please try again later.',
  },
  store: createStore('rl:webhook:', 5 * 60 * 1000),
  // Add trusted IPs for webhook providers
  skip: (req, res) => {
    // List of trusted IPs for webhooks (RevenueCat, etc.)
    const trustedIps = process.env.TRUSTED_WEBHOOK_IPS ? 
      process.env.TRUSTED_WEBHOOK_IPS.split(',') : 
      [];
    
    if (trustedIps.includes(req.ip)) {
      return true;
    }
    
    return false;
  }
});

/**
 * Very strict rate limiting for sensitive operations
 * Applies to password reset, email changes, etc.
 */
const sensitiveRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // limit each IP to 3 requests per day
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too many sensitive operation attempts',
    message: 'You have exceeded the rate limit for this sensitive operation. Please try again tomorrow.',
  },
  store: createStore('rl:sensitive:', 24 * 60 * 60 * 1000),
  keyGenerator: (req, res) => {
    const xff = req.headers['x-forwarded-for'];
    return xff ? 
      (Array.isArray(xff) ? xff[0] : xff.split(',')[0]) : 
      req.ip || req.connection.remoteAddress;
  }
});

module.exports = {
  publicRouteRateLimit,
  authRateLimit,
  webhookRateLimit,
  sensitiveRateLimit,
  redisClient
}; 