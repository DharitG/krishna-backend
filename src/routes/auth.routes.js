const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');

/**
 * @route POST /api/auth/login
 * @desc User login
 * @access Public
 */
router.post('/login', (req, res) => {
  // This route is handled by Supabase Auth in the frontend
  // This is just a placeholder for the IP-based rate limiting
  res.status(200).json({
    success: true,
    message: 'Authentication is handled by Supabase Auth in the frontend'
  });
});

/**
 * @route POST /api/auth/register
 * @desc User registration
 * @access Public
 */
router.post('/register', (req, res) => {
  // This route is handled by Supabase Auth in the frontend
  // This is just a placeholder for the IP-based rate limiting
  res.status(200).json({
    success: true,
    message: 'Registration is handled by Supabase Auth in the frontend'
  });
});

/**
 * @route POST /api/auth/reset-password
 * @desc Password reset request
 * @access Public
 */
router.post('/reset-password', (req, res) => {
  // This route is handled by Supabase Auth in the frontend
  // This is just a placeholder for the IP-based rate limiting
  res.status(200).json({
    success: true,
    message: 'Password reset is handled by Supabase Auth in the frontend'
  });
});

/**
 * @route GET /api/auth/verify
 * @desc Verify authentication token
 * @access Private
 */
router.get('/verify', requireAuth, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user
  });
});

module.exports = router; 