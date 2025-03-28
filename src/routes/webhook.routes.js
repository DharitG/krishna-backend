const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// RevenueCat webhook endpoint
router.post('/revenuecat', webhookController.handleRevenueCatWebhook);

module.exports = router;
