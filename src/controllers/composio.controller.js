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
    const { messages, enabledTools = [], stream = false, authStatus = {} } = req.body;
    
    // If there are no messages, return an error
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: 'No messages provided' });
    }

    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    
    if (!lastUserMessage) {
      return res.status(400).json({ message: 'No user message found in the provided messages' });
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
        
        if (stream) {
          // Not implemented yet - tools with streaming
          // For now, just use non-streaming approach and send the full response at once
          const result = await langchainService.processMessage(
            userId,
            messages, 
            enabledTools,
            authStatus
          );
          
          // Send the result as a single event
          res.write(`data: ${JSON.stringify(result)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          // Non-streaming approach with tools
          const result = await langchainService.processMessage(
            userId,
            messages, 
            enabledTools,
            authStatus
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
          content: `Error: ${error.message || 'Unknown error occurred'}`,
          error: true
        };
        res.write(`data: ${JSON.stringify(errorMessage)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else if (!stream) {
        // Regular error response
        return res.status(500).json({ 
          message: 'Error processing message', 
          error: error.message || 'Unknown error' 
        });
      }
    }
  } catch (error) {
    console.error('Error in executeToolCall:', error);
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