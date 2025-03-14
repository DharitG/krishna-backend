const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

// Get user profile
router.get('/profile', userController.getProfile);

// Update user profile
router.put('/profile', userController.updateProfile);

// Get user auth status for services
router.get('/auth-status', userController.getAuthStatus);

module.exports = router;