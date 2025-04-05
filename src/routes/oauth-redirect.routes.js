const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Redirect handler for OAuth callbacks
 * This endpoint receives OAuth callbacks and forwards them to Composio
 */
router.get('/redirect', async (req, res) => {
  try {
    // Get all query parameters from the request
    const queryParams = new URLSearchParams(req.query).toString();
    
    // Forward to Composio's backend with all parameters intact
    const composioUrl = `https://backend.composio.dev/api/v1/auth-apps/add?${queryParams}`;
    
    // Option 1: Server-side redirect (302)
    return res.redirect(302, composioUrl);
    
    /* 
    // Option 2: Proxy the request server-side and return the response
    // This gives you more control but is more complex
    const response = await axios.get(composioUrl, {
      headers: {
        // Forward relevant headers
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json'
      }
    });
    
    // Return the Composio response
    return res.status(response.status).json(response.data);
    */
  } catch (error) {
    console.error('Error in OAuth redirect:', error);
    res.status(500).json({ 
      error: 'Failed to process OAuth callback',
      details: error.message
    });
  }
});

module.exports = router;
