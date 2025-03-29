const express = require('express');
const router = express.Router();
const { checkRateLimit } = require('../middleware/ratelimit.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const { 
  getSubscriptionStatus, 
  getPurchaseHistory, 
  getSubscriptionPlans,
  resetRateLimitCache
} = require('../controllers/subscription.controller');

// Public routes (no authentication required)
/**
 * @route GET /api/subscription/plans
 * @desc Get available subscription plans
 * @access Public
 */
router.get('/plans', getSubscriptionPlans);

// Protected routes (authentication required)
/**
 * @route GET /api/subscription/status
 * @desc Get user's subscription status and rate limit info
 * @access Private
 */
router.get('/status', requireAuth, checkRateLimit, getSubscriptionStatus);

/**
 * @route GET /api/subscription/history
 * @desc Get user's purchase history
 * @access Private
 */
router.get('/history', requireAuth, checkRateLimit, getPurchaseHistory);

/**
 * @route POST /api/subscription/reset-limit
 * @desc Reset user's rate limit cache
 * @access Private
 */
router.post('/reset-limit', requireAuth, checkRateLimit, resetRateLimitCache);

module.exports = router;
