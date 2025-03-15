const { supabase } = require('../services/supabase');
const composioService = require('../services/composio.service');
const langchainService = require('../services/langchain.service');

/**
 * Initialize authentication with a third-party service
 */
exports.initAuthentication = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { service } = req.params;
    
    // Initialize authentication with Composio
    const authInfo = await composioService.initAuthentication(service, userId);
    
    res.json({
      service,
      redirectUrl: authInfo.redirectUrl,
      status: 'pending'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Complete authentication process (callback from service)
 */
exports.completeAuthentication = async (req, res, next) => {
  try {
    const { code, state, service } = req.query;
    
    // The state parameter contains the user ID
    const userId = state;
    
    // Complete authentication with Composio
    const authResult = await composioService.completeAuthentication(service, code);
    
    // Save token to database
    const { error } = await supabase
      .from('service_tokens')
      .upsert({
        user_id: userId,
        service_name: service,
        access_token: authResult.accessToken,
        refresh_token: authResult.refreshToken,
        expires_at: authResult.expiresAt,
        created_at: new Date(),
        updated_at: new Date()
      });
    
    if (error) {
      console.error('Error saving service token:', error);
      throw new Error(`Failed to save ${service} authentication: ${error.message}`);
    }
    
    // Redirect to app with success message
    res.redirect(`${process.env.APP_URL}/auth-callback?service=${service}&status=success`);
  } catch (error) {
    console.error(`Error completing authentication:`, error);
    
    // Redirect to app with error message
    res.redirect(`${process.env.APP_URL}/auth-callback?service=${req.query.service}&status=error&message=${encodeURIComponent(error.message)}`);
  }
};

/**
 * Get available tools from Composio
 */
exports.getTools = async (req, res, next) => {
  try {
    const tools = await composioService.getTools();
    res.json({ tools });
  } catch (error) {
    next(error);
  }
};

/**
 * Execute a tool call
 */
exports.executeToolCall = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { toolCalls } = req.body;
    
    // Extract services from tool calls
    const serviceNames = toolCalls.map(tc => {
      // Example: "GMAIL_SEND_EMAIL" -> "gmail"
      return tc.function.name.split('_')[0].toLowerCase();
    });
    
    // Get unique service names
    const uniqueServices = [...new Set(serviceNames)];
    
    // Get service tokens
    const { data: serviceTokens, error } = await supabase
      .from('service_tokens')
      .select('service_name, access_token, refresh_token')
      .eq('user_id', userId)
      .in('service_name', uniqueServices);
    
    if (error) {
      console.error('Error fetching service tokens:', error);
      return res.status(500).json({ message: 'Error fetching service tokens', error: error.message });
    }
    
    // Convert to format expected by composio service
    const tokenMap = {};
    
    if (serviceTokens) {
      serviceTokens.forEach(token => {
        tokenMap[token.service_name] = {
          accessToken: token.access_token,
          refreshToken: token.refresh_token
        };
      });
    }
    
    // Execute tool call with Composio
    const result = await composioService.handleToolCalls(toolCalls, tokenMap);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Check authentication requirements for tools
 */
exports.checkToolAuth = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { tools } = req.body;
    
    const authResults = [];
    
    for (const tool of tools) {
      // Extract service name from tool (e.g., "GITHUB_CREATE_ISSUE" -> "GITHUB")
      const serviceName = tool.split('_')[0].toUpperCase();
      
      // Check if authentication is needed
      const authResult = await langchainService.setupUserConnectionIfNotExists(
        userId, 
        serviceName
      );
      
      if (authResult.needsAuth) {
        authResults.push({
          service: serviceName,
          redirectUrl: authResult.redirectUrl,
          status: 'pending'
        });
      }
    }
    
    res.json({ authRequirements: authResults });
  } catch (error) {
    next(error);
  }
};