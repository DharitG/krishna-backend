const langchainService = require('../services/langchain.service');

/**
 * Process a message using LangChain
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.processMessage = async (req, res, next) => {
  try {
    const { messages, enabledTools = [] } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }
    
    // Get user ID from auth token
    const userId = req.user.id;
    
    // Get authentication status from the request
    const authStatus = req.body.authStatus || {};
    
    // Process the message
    const response = await langchainService.processMessage(userId, messages, enabledTools, authStatus);
    
    res.json(response);
  } catch (error) {
    console.error('Error processing message with LangChain:', error);
    next(error);
  }
};

/**
 * Get streaming response from LangChain agent
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getStreamingResponse = async (req, res, next) => {
  try {
    const { messages, enabledTools = [] } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }
    
    // Get user ID from auth token
    const userId = req.user.id;
    
    // Get authentication status from the request
    const authStatus = req.body.authStatus || {};
    
    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Get streaming response
    const stream = await langchainService.getStreamingAgentResponse(messages, enabledTools, userId, authStatus);
    
    // Stream the response
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    
    res.end();
  } catch (error) {
    console.error('Error getting streaming response from LangChain:', error);
    next(error);
  }
};

/**
 * Create a domain-specific agent based on a use case description
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createDomainSpecificAgent = async (req, res, next) => {
  try {
    const { useCase, advanced = false, apps = [] } = req.body;
    
    if (!useCase) {
      return res.status(400).json({ error: 'Use case description is required' });
    }
    
    // Get user ID from auth token
    const userId = req.user.id;
    
    // Create a domain-specific agent
    const agent = await langchainService.createDomainSpecificAgent(userId, useCase, advanced, apps);
    
    // Return success message
    res.json({ 
      success: true, 
      message: `Domain-specific agent created for use case: ${useCase}`,
      agentInfo: {
        useCase,
        advanced,
        apps: apps.length > 0 ? apps : ['all']
      }
    });
  } catch (error) {
    console.error('Error creating domain-specific agent:', error);
    next(error);
  }
};

/**
 * Process a message using a domain-specific agent
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.processDomainSpecificMessage = async (req, res, next) => {
  try {
    const { messages, useCase, advanced = false, apps = [] } = req.body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }
    
    if (!useCase) {
      return res.status(400).json({ error: 'Use case description is required' });
    }
    
    // Get user ID from auth token
    const userId = req.user.id;
    
    // Get authentication status from the request
    const authStatus = req.body.authStatus || {};
    
    // Create a domain-specific agent
    const agent = await langchainService.createDomainSpecificAgent(userId, useCase, advanced, apps);
    
    // Format messages for LangChain
    const history = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Get the last user message
    const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
    
    // Invoke the agent with the last user message and chat history
    const result = await agent.invoke({
      input: lastUserMessage.content,
      chat_history: history.slice(0, -1) // Exclude the last message as it's the input
    });
    
    res.json({
      role: 'assistant',
      content: result.output
    });
  } catch (error) {
    console.error('Error processing message with domain-specific agent:', error);
    next(error);
  }
};
