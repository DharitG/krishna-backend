const express = require('express');
const router = express.Router();
const preferencesController = require('../controllers/preferences.controller');

// Get user preferences
router.get('/', preferencesController.getPreferences);

// Update user preferences
router.put('/', preferencesController.updatePreferences);

module.exports = router;