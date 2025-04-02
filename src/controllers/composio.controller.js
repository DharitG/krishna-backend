const { supabase } = require('../services/supabase');
const composioService = require('../services/composio.service');
const langchainService = require('../services/langchain.service');
const axios = require('axios');

/**
 * Initialize authentication with a third-party service
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.initAuthentication = async (req, res, next) => {
  try {
    const { service } = req.params;
    const userId = req.user ? req.user.id : 'anonymous-user';
    
    console.log(`Initializing authentication for service: ${service}, userId: ${userId}`);
    
    // Check if Composio API key is configured
    if (!process.env.COMPOSIO_API_KEY) {
      console.log('Composio API key not configured');
      return res.status(400).json({ 
        error: 'Composio API key is not configured.', 
        configError: true 
      });
    }

    // Check if Gmail integration ID is configured
    if (service.toLowerCase() === 'gmail' && !process.env.GMAIL_INTEGRATION_ID) {
      console.log('Gmail integration ID not configured');
      return res.status(400).json({ 
        error: 'Gmail integration ID is not configured.', 
        configError: true 
      });
    }

    // Check if the service is already authenticated
    try {
      const isAuthenticated = await composioService.checkAuthentication(service, userId);
      if (isAuthenticated) {
        console.log(`Service ${service} is already authenticated for user ${userId}`);
        return res.json({ 
          isAuthenticated: true,
          message: `${service} is already connected` 
        });
      }
    } catch (checkError) {
      console.log(`Error checking authentication status: ${checkError.message}`);
      // Continue with authentication initialization
    }

    // Initialize authentication with Composio
    try {
      console.log(`Initializing ${service} authentication`);
      const authInfo = await composioService.initAuthentication(service, userId);
      console.log('Auth info:', JSON.stringify(authInfo, null, 2));
      
      // Verify that we have a redirect URL
      if (!authInfo.redirectUrl) {
        console.error(`No redirect URL for ${service}:`, JSON.stringify(authInfo, null, 2));
        return res.status(400).json({
          error: `No redirect URL received from Composio API. Please check your ${service} configuration.`,
          details: 'Make sure the service is properly configured with OAuth credentials.',
          composioError: true
        });
      }
      
      return res.json(authInfo);
    } catch (error) {
      console.error(`${service} auth error:`, error);
      
      // Return a more helpful error message
      return res.status(500).json({
        error: `${service} authentication failed: ${error.message}`,
        details: 'Check your Composio dashboard configuration and ensure the service is properly set up.',
        composioError: true
      });
    }
  } catch (error) {
    console.error(`Error initializing authentication with ${req.params.service}:`, error);
    res.status(500).json({ error: `Failed to initialize authentication: ${error.message}` });
  }
};

/**
 * Complete authentication process (callback from service)
 */
exports.completeAuthentication = async (req, res, next) => {
  try {
    // Check if we're receiving data from query params (redirect) or request body (API call)
    const params = Object.keys(req.query).length > 0 ? req.query : req.body;
    const { code, state, service, connectedAccountId } = params;
    
    console.log('Auth callback received:', { 
      code: code ? 'PRESENT' : 'MISSING', 
      state: state || 'MISSING', 
      service: service || 'MISSING',
      connectedAccountId: connectedAccountId || 'MISSING'
    });
    
    // Validate required parameters
    if (!code) {
      console.error('Missing code parameter in callback');
      return res.status(400).json({ error: 'Missing code parameter' });
    }
    
    if (!service) {
      console.error('Missing service parameter in callback');
      return res.status(400).json({ error: 'Missing service parameter' });
    }
    
    if (!connectedAccountId) {
      console.error('Missing connectedAccountId parameter in callback');
      return res.status(400).json({ error: 'Missing connectedAccountId parameter' });
    }
    
    // The state parameter contains the user ID, but it might be missing for some services
    const userId = state || 'anonymous-user';
    
    try {
      // Complete authentication with Composio
      const connectionInfo = await composioService.completeAuthentication({
        connectedAccountId,
        code
      });
      
      console.log('Connection info from Composio:', connectionInfo);
      
      // Save connection info to database with more details
      const { error } = await supabase
        .from('service_tokens')
        .upsert({
          user_id: userId,
          service_name: service.toLowerCase(),
          access_token: connectionInfo.connectionId, // Store the connection ID
          connection_status: connectionInfo.status || 'connected',
          created_at: new Date(),
          updated_at: new Date()
        });
      
      if (error) {
        console.error('Error saving connection info to database:', error);
        return res.status(500).json({ error: 'Failed to save connection info' });
      }
      
      // For API calls (not redirects), return success response
      if (Object.keys(req.query).length === 0) {
        return res.json({
          success: true,
          service,
          authenticated: true,
          connectionId: connectionInfo.connectionId
        });
      }
      
      // For redirects, redirect to frontend with success message
      res.redirect(`${process.env.APP_URL}/auth-success?service=${service}`);
    } catch (error) {
      console.error(`Error completing authentication:`, error);
      
      // For API calls (not redirects), return error response
      if (Object.keys(req.query).length === 0) {
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
      
      // For redirects, redirect to frontend with error message
      res.redirect(`${process.env.APP_URL}/auth-error?message=${encodeURIComponent(error.message)}`);
    }
  } catch (error) {
    console.error(`Error in authentication callback:`, error);
    
    // For API calls (not redirects), return error response
    if (Object.keys(req.query).length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Unexpected error during authentication'
      });
    }
    
    // For redirects, redirect to frontend with error message
    res.redirect(`${process.env.APP_URL}/auth-error?message=${encodeURIComponent('Unexpected error during authentication')}`);
  }
};

/**
 * Get available tools from Composio
 */
exports.getTools = async (req, res, next) => {
  try {
    const { actions } = req.query;
    const userId = req.user.id;
    
    // Parse actions if provided
    const actionsList = actions ? actions.split(',') : [];
    
    // Get tools from Composio
    const tools = await composioService.getTools(actionsList, userId);
    
    res.json({ tools });
  } catch (error) {
    console.error('Error fetching tools:', error);
    next(error);
  }
};

/**
 * Execute a tool call
 */
exports.executeToolCall = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { messages, enabledTools = [], stream = false, authStatus = {}, toolCalls = null } = req.body;
    
    // If specific tool calls are provided, process them directly
    if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
      try {
        // Get service tokens for authentication status
        const { data: serviceTokens, error: tokensError } = await supabase
          .from('service_tokens')
          .select('service_name, access_token, expires_at')
          .eq('user_id', userId);
        
        // Process auth status
        const combinedAuthStatus = { ...authStatus };
        const now = new Date();
        
        if (serviceTokens) {
          serviceTokens.forEach(token => {
            const isValid = token.expires_at ? new Date(token.expires_at) > now : false;
            combinedAuthStatus[token.service_name.toLowerCase()] = isValid;
          });
        }
        
        // Process the tool calls
        const processedResult = await langchainService.processToolCalls(toolCalls, combinedAuthStatus, userId);
        
        if (processedResult.requiresAuth) {
          // Tool requires authentication
          return res.json({
            role: 'assistant',
            content: `${processedResult.authRequestTag} ${processedResult.message}`,
            requiresAuth: true,
            service: processedResult.service
          });
        }
        
        // Tool execution successful
        return res.json({
          role: 'assistant',
          content: `I've completed the action successfully. ${processedResult.result.output || ''}`,
          toolResult: processedResult.result
        });
      } catch (error) {
        console.error('Error processing tool calls:', error);
        return res.status(500).json({
          role: 'assistant',
          content: 'Sorry, I encountered an error while trying to perform that action. Please try again later.',
          error: error.message
        });
      }
    }
    
    // Validate required parameters for regular message processing
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }
    
    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    
    if (!lastUserMessage) {
      return res.status(400).json({ error: 'No user message found in the provided messages' });
    }
    
    // Check if tools are needed/enabled
    const useTools = enabledTools && enabledTools.length > 0;
    
    try {
      // Set up streaming response headers if streaming is requested
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders(); // Flush the headers to establish SSE with client
      }
      
      // Only use LangChain agent if tools are enabled
      if (useTools) {
        console.log(`Processing message with tools enabled: ${enabledTools.join(', ')}`);
        
        // Get service tokens for authentication status
        const { data: serviceTokens, error: tokensError } = await supabase
          .from('service_tokens')
          .select('service_name, access_token, expires_at')
          .eq('user_id', userId);
        
        // Process auth status
        const combinedAuthStatus = { ...authStatus };
        const now = new Date();
        
        if (serviceTokens) {
          serviceTokens.forEach(token => {
            const isValid = token.expires_at ? new Date(token.expires_at) > now : false;
            combinedAuthStatus[token.service_name.toLowerCase()] = isValid;
          });
        }
        
        if (stream) {
          try {
            // Use streaming with tools
            const streamingResponse = await langchainService.getStreamingAgentResponse(
              messages,
              enabledTools,
              userId,
              combinedAuthStatus
            );
            
            // Stream the response chunks
            for await (const chunk of streamingResponse) {
              // Check if this chunk has an auth request
              if (chunk.requiresAuth) {
                // Send the auth request as a special event with all properties
                res.write(`data: ${JSON.stringify({
                  role: 'assistant',
                  content: chunk.content,
                  requiresAuth: true,
                  service: chunk.service,
                  authRequestTag: chunk.authRequestTag
                })}\n\n`);
              } else {
                // Send regular content chunk
                res.write(`data: ${JSON.stringify({
                  role: 'assistant',
                  content: chunk.content
                })}\n\n`);
              }
            }
            
            // Signal the end of the stream
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (error) {
            console.error('Error streaming response with tools:', error);
            
            // Send error as an event
            const errorMessage = {
              role: 'assistant',
              content: 'Sorry, I encountered an error while processing your request. Please try again later.',
              error: true
            };
            
            res.write(`data: ${JSON.stringify(errorMessage)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          }
        } else {
          // Non-streaming approach with tools
          const result = await langchainService.processMessage(
            userId,
            messages, 
            enabledTools,
            combinedAuthStatus
          );
          return res.json(result);
        }
      } else {
        // For simple messages without tools, use a more direct approach
        console.log('Processing message without tools');
        const openaiService = require('../services/openai.service');
        
        if (stream) {
          // Use streaming approach
          console.log('Using streaming response');
          await openaiService.generateChatCompletionStream(messages, (chunk) => {
            // Send each chunk as an SSE event
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          });
          
          // Signal the end of the stream
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          // Use non-streaming approach
          const result = await openaiService.generateChatCompletion(messages);
          return res.json(result);
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Handle errors differently for streaming vs non-streaming
      if (stream && !res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }
      
      if (stream && !res.finished) {
        // Send error as an event
        const errorMessage = {
          role: 'assistant',
          content: 'Sorry, I encountered an error while processing your request. Please try again later.',
          error: true
        };
        
        res.write(`data: ${JSON.stringify(errorMessage)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else if (!stream) {
        return res.status(500).json({
          role: 'assistant',
          content: 'Sorry, I encountered an error while processing your request. Please try again later.',
          error: true
        });
      }
    }
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
    let toolsToCheck = [];
    
    // Handle both formats: { toolName: string } and { tools: array }
    if (req.body.toolName) {
      toolsToCheck = [req.body.toolName];
    } else if (req.body.tools && Array.isArray(req.body.tools)) {
      toolsToCheck = req.body.tools;
    } else {
      return res.status(400).json({ error: 'No tools specified. Provide either toolName or tools array.' });
    }
    
    if (toolsToCheck.length === 0) {
      return res.status(400).json({ error: 'No tools specified' });
    }
    
    // Get service tokens for authentication status
    const { data: serviceTokens, error: tokensError } = await supabase
      .from('service_tokens')
      .select('service_name, access_token, expires_at')
      .eq('user_id', userId);
    
    // Process auth status
    const authStatus = {};
    const now = new Date();
    
    if (serviceTokens) {
      serviceTokens.forEach(token => {
        const isValid = token.expires_at ? new Date(token.expires_at) > now : false;
        authStatus[token.service_name.toLowerCase()] = isValid;
      });
    }
    
    // Check each tool for auth requirements
    const results = {};
    
    for (const tool of toolsToCheck) {
      // Create a mock tool call to check auth requirements
      const mockToolCall = {
        function: {
          name: tool,
          arguments: '{}'
        }
      };
      
      const authCheck = await langchainService.checkToolAuthRequirement(mockToolCall, authStatus);
      
      results[tool] = {
        needsAuth: authCheck.needsAuth,
        service: authCheck.service || null,
        isAuthenticated: !authCheck.needsAuth
      };
    }
    
    res.json({
      authStatus,
      toolAuthRequirements: results
    });
  } catch (error) {
    console.error('Error checking tool auth requirements:', error);
    next(error);
  }
};

/**
 * Check authentication status for a service
 */
exports.checkAuth = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : 'anonymous-user';
    const { service } = req.params;
    
    // Validate service name
    if (!service) {
      return res.status(400).json({ error: 'Service name is required' });
    }
    
    // If we don't have a user ID, return not authenticated
    if (userId === 'anonymous-user') {
      return res.json({
        authenticated: false,
        service,
        message: 'User not logged in'
      });
    }
    
    // Check if the user has a token for this service
    const { data: token, error } = await supabase
      .from('service_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('service_name', service.toLowerCase())
      .single();
    
    if (error || !token) {
      return res.json({
        authenticated: false,
        service,
        message: 'Not authenticated'
      });
    }
    
    // Check if the token is expired
    const now = new Date();
    const expiresAt = token.expires_at ? new Date(token.expires_at) : null;
    const isExpired = expiresAt && expiresAt <= now;
    
    if (isExpired) {
      // Token is expired, try to refresh it
      try {
        // This is a placeholder for token refresh logic
        // In a real implementation, you would use the refresh_token to get a new access_token
        // For now, we'll just return that the token is expired
        return res.json({
          authenticated: false,
          service,
          message: 'Token expired',
          needsReauth: true
        });
      } catch (refreshError) {
        console.error('Error refreshing token:', refreshError);
        return res.json({
          authenticated: false,
          service,
          message: 'Token expired and refresh failed',
          needsReauth: true
        });
      }
    }
    
    // Token is valid
    return res.json({
      authenticated: true,
      service,
      message: 'Authenticated'
    });
  } catch (error) {
    console.error(`Error checking ${req.params.service} authentication:`, error);
    next(error);
  }
};
