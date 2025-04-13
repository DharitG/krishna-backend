// API routes for briefs

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth.middleware');
const { generateManualBrief, getBriefHistory } = require('../controllers/briefs.controller');

// Mount auth middleware for all brief routes
router.use(requireAuth);

// POST /api/briefs/generate - Manually trigger brief generation
router.post('/generate', generateManualBrief);

// GET /api/briefs/history - Get recent briefs for the user
router.get('/history', getBriefHistory);

module.exports = router;
