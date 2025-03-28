const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const { 
  getSubscriptionStatus, 
  getPurchaseHistory, 
  getSubscriptionPlans,
  resetRateLimitCache
} = require('../controllers/subscription.controller');

/**
 * @route GET /api/subscription/status
 * @desc Get user's subscription status and rate limit info
 * @access Private
 */
router.get('/status', requireAuth, getSubscriptionStatus);

/**
 * @route GET /api/subscription/history
 * @desc Get user's purchase history
 * @access Private
 */
router.get('/history', requireAuth, getPurchaseHistory);

/**
 * @route GET /api/subscription/plans
 * @desc Get available subscription plans
 * @access Public
 */
router.get('/plans', getSubscriptionPlans);

/**
 * @route POST /api/subscription/reset-limit
 * @desc Reset user's rate limit cache
 * @access Private
 */
router.post('/reset-limit', requireAuth, resetRateLimitCache);

module.exports = router;
