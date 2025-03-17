const express = require('express');
const router = express.Router();
const accountController = require('../controllers/account.controller');
const authMiddleware = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Get all accounts for the authenticated user
router.get('/', accountController.getAccounts);

// Add a new account
router.post('/', accountController.addAccount);

// Remove an account
router.delete('/:accountId', accountController.removeAccount);

// Set an account as active
router.put('/:accountId/active', accountController.setActiveAccount);

// Initiate OAuth authentication for a service
router.get('/auth/:serviceName', accountController.initiateOAuth);

// Handle OAuth callback
router.get('/auth/:serviceName/callback', accountController.handleOAuthCallback, accountController.addAccount);

module.exports = router;
