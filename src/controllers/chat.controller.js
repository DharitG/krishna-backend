const { supabase } = require('../services/supabase');
const openaiService = require('../services/openai.service');
const langchainService = require('../services/langchain.service');
const composioService = require('../services/composio.service');
const memoryService = require('../services/memory.service');

/**
 * Get all chats for the current user
 */
exports.getUserChats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get all chats for the user
    const { data: chats, error } = await supabase
      .from('chats')
      .select('id, title, created_at, updated_at, use_tools, enabled_tools, messages')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching chats:', error);
      return res.status(500).json({ message: 'Error fetching chats', error: error.message });
    }

    // Return chat list with minimal message info
    const chatList = chats.map(chat => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      useTools: chat.use_tools,
      enabledTools: chat.enabled_tools,
      messageCount: chat.messages.length,
      lastMessage: chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null
    }));

    res.json(chatList);
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new chat
 */
exports.createChat = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title, useTools = true, enabledTools = [] } = req.body;

    // Create initial welcome message
    const initialMessage = {
      role: 'assistant',
      content: `Hello! I'm August, your AI super agent${useTools ? ' with tool capabilities' : ''}. How can I help you today?`,
      createdAt: new Date().toISOString()
    };

    // Create new chat
    const { data: chat, error } = await supabase
      .from('chats')
      .insert([{
        user_id: userId,
        title: title || 'New Chat',
        messages: [initialMessage],
        use_tools: useTools,
        enabled_tools: enabledTools,
        auth_status: {},
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating chat:', error);
      return res.status(500).json({ message: 'Error creating chat', error: error.message });
    }

    res.status(201).json({
      id: chat.id,
      title: chat.title,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      useTools: chat.use_tools,
      enabledTools: chat.enabled_tools,
      messages: chat.messages
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific chat by ID
 */
exports.getChatById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;

    // Get chat
    const { data: chat, error } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching chat:', error);
      return res.status(404).json({ message: 'Chat not found', error: error.message });
    }

    res.json({
      id: chat.id,
      title: chat.title,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      useTools: chat.use_tools,
      enabledTools: chat.enabled_tools,
      messages: chat.messages,
      authStatus: chat.auth_status
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update chat details
 */
exports.updateChat = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { title, useTools, enabledTools } = req.body;

    // Prepare update object
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (useTools !== undefined) updates.use_tools = useTools;
    if (enabledTools !== undefined) updates.enabled_tools = enabledTools;
    updates.updated_at = new Date();

    // Update chat
    const { data: chat, error } = await supabase
      .from('chats')
      .update(updates)
      .eq('id', chatId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating chat:', error);
      return res.status(500).json({ message: 'Error updating chat', error: error.message });
    }

    res.json({
      id: chat.id,
      title: chat.title,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      useTools: chat.use_tools,
      enabledTools: chat.enabled_tools
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a chat
 */
exports.deleteChat = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;

    // Delete chat
    const { error } = await supabase
      .from('chats')
      .delete()
      .eq('id', chatId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting chat:', error);
      return res.status(500).json({ message: 'Error deleting chat', error: error.message });
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

/**
 * Send a message in a chat
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { messages, enabledTools = [], stream = false, authStatus = {}, contextData = {} } = req.body;

    // Validate required parameters
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided' });
    }

    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();

    if (!lastUserMessage) {
      return res.status(400).json({ error: 'No user message found in the provided messages' });
    }

    // Process the last user message for memory system (don't wait for completion)
    try {
      const chatId = req.body.chatId || 'unknown';
      memoryService.processChatMessage({
        userId,
        content: lastUserMessage.content,
        role: 'user',
        chatId,
        contextData
      }).catch(err => {
        console.error('Error processing user message for memory:', err);
        // Don't fail the request if memory processing fails
      });
    } catch (memoryError) {
      console.error('Error processing user message for memory:', memoryError);
      // Don't fail the request if memory processing fails
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
                // Send the auth request as a special event
                res.write(`data: ${JSON.stringify({
                  role: 'assistant',
                  content: chunk.content,
                  requiresAuth: true,
                  service: chunk.service
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
 * Get messages from a chat
 */
exports.getChatMessages = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;

    // Get chat messages
    const { data: chat, error } = await supabase
      .from('chats')
      .select('messages')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching chat messages:', error);
      return res.status(404).json({ message: 'Chat not found', error: error.message });
    }

    res.json(chat.messages);
  } catch (error) {
    next(error);
  }
};

/**
 * Save a message to the database
 */
exports.saveMessage = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { message, conversationId, contextData } = req.body;

    // Validate required parameters
    if (!message || !message.role || !message.content) {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Save message to database
    const { data, error } = await supabase
      .from('messages')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        created_at: new Date()
      })
      .select();

    if (error) {
      console.error('Error saving message:', error);
      return res.status(500).json({ error: 'Failed to save message' });
    }

    // Process message for memory system (don't wait for completion)
    try {
      memoryService.processChatMessage({
        userId,
        content: message.content,
        role: message.role,
        chatId: conversationId,
        contextData
      }).catch(err => {
        console.error('Error processing message for memory:', err);
        // Don't fail the request if memory processing fails
      });
    } catch (memoryError) {
      console.error('Error processing message for memory:', memoryError);
      // Don't fail the request if memory processing fails
    }

    res.json({ message: data[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * Get messages for a conversation
 */
exports.getMessages = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    // Validate required parameters
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Get messages from database
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error getting messages:', error);
      return res.status(500).json({ error: 'Failed to get messages' });
    }

    // Format messages for the client
    const messages = data.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at
    }));

    res.json({ messages });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new conversation
 */
exports.createConversation = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title } = req.body;

    // Create conversation in database
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        title: title || 'New Conversation',
        created_at: new Date(),
        updated_at: new Date()
      })
      .select();

    if (error) {
      console.error('Error creating conversation:', error);
      return res.status(500).json({ error: 'Failed to create conversation' });
    }

    res.json({ conversation: data[0] });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all conversations for a user
 */
exports.getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get conversations from database
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error getting conversations:', error);
      return res.status(500).json({ error: 'Failed to get conversations' });
    }

    // Format conversations for the client
    const conversations = data.map(conv => ({
      id: conv.id,
      title: conv.title,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at
    }));

    res.json({ conversations });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a conversation
 */
exports.deleteConversation = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    // Validate required parameters
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    // Delete conversation from database
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('user_id', userId)
      .eq('id', conversationId);

    if (error) {
      console.error('Error deleting conversation:', error);
      return res.status(500).json({ error: 'Failed to delete conversation' });
    }

    // Also delete all messages in the conversation
    const { error: messagesError } = await supabase
      .from('messages')
      .delete()
      .eq('user_id', userId)
      .eq('conversation_id', conversationId);

    if (messagesError) {
      console.error('Error deleting messages:', messagesError);
      // Continue even if message deletion fails
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};