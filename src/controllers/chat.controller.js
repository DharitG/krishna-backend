const { supabase } = require('../services/supabase');
const openaiService = require('../services/openai.service');
const langchainService = require('../services/langchain.service');

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
    const { chatId } = req.params;
    const { content, messages, enabledTools = [], stream = false, authStatus = {} } = req.body;
    
    // Get chat
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();
    
    if (chatError) {
      console.error('Error fetching chat:', chatError);
      return res.status(404).json({ message: 'Chat not found', error: chatError.message });
    }
    
    // Handle both formats - either content directly or messages array
    let userMessage;
    let existingMessages;
    
    if (messages && Array.isArray(messages)) {
      // If messages array is provided, use the last user message
      userMessage = messages.filter(m => m.role === 'user').pop();
      // Use the provided messages array
      existingMessages = chat.messages;
    } else if (content) {
      // Create user message from content
      userMessage = {
        role: 'user',
        content,
        createdAt: new Date().toISOString()
      };
      // Use existing messages from the chat
      existingMessages = chat.messages;
    } else {
      return res.status(400).json({ message: 'No message content provided' });
    }
    
    // Add user message to existing messages if not already included
    const messageExists = existingMessages.some(m => 
      m.role === userMessage.role && 
      m.content === userMessage.content &&
      m.createdAt === userMessage.createdAt
    );
    
    const updatedMessages = messageExists 
      ? existingMessages 
      : [...existingMessages, userMessage];
    
    // Update chat with user message
    await supabase
      .from('chats')
      .update({
        messages: updatedMessages,
        updated_at: new Date()
      })
      .eq('id', chatId)
      .eq('user_id', userId);
    
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
    
    // Determine which tools are enabled
    let toolsToUse = [];
    
    if (chat.use_tools && chat.enabled_tools && chat.enabled_tools.length > 0) {
      toolsToUse = chat.enabled_tools;
    } else if (enabledTools && enabledTools.length > 0) {
      toolsToUse = enabledTools;
    }
    
    // Check if any tools require authentication
    if (toolsToUse.length > 0) {
      // Check if Gmail is in the enabled tools
      const hasGmail = toolsToUse.some(tool => tool.toLowerCase().includes('gmail'));
      
      if (hasGmail) {
        // Check if Gmail is authenticated
        const isGmailAuthenticated = combinedAuthStatus['gmail'] === true;
        
        if (!isGmailAuthenticated) {
          try {
            // Try to set up Gmail authentication
            const gmailAuthResult = await langchainService.setupUserConnectionIfNotExists(userId, 'gmail');
            
            if (gmailAuthResult.needsAuth) {
              // Return the redirect URL to the client
              return res.status(200).json({
                needsAuth: true,
                service: 'gmail',
                redirectUrl: gmailAuthResult.redirectUrl,
                message: 'Gmail authentication required'
              });
            }
          } catch (authError) {
            console.error('Error setting up Gmail authentication:', authError);
            // Continue without Gmail tools
            toolsToUse = toolsToUse.filter(tool => !tool.toLowerCase().includes('gmail'));
          }
        }
      }
    }
    
    // Set up streaming response headers if streaming is requested
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.flushHeaders(); // Flush the headers to establish SSE with client
    }
    
    try {
      // Determine if tools should be used
      const useTools = toolsToUse.length > 0;
      
      if (useTools) {
        // Use LangChain service for tool-enabled messages
        console.log(`Processing message with tools: ${toolsToUse.join(', ')}`);
        
        if (stream) {
          try {
            // Use streaming with tools
            const streamingResponse = await langchainService.getStreamingAgentResponse(
              updatedMessages,
              toolsToUse,
              userId
            );
            
            let finalContent = '';
            
            // Stream the response chunks
            for await (const chunk of streamingResponse) {
              finalContent = chunk.content;
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
            
            // Add assistant response to the database
            const assistantMessage = {
              role: 'assistant',
              content: finalContent,
              createdAt: new Date().toISOString()
            };
            
            const finalMessages = [...updatedMessages, assistantMessage];
            
            // Update chat with assistant response
            await supabase
              .from('chats')
              .update({
                messages: finalMessages,
                updated_at: new Date()
              })
              .eq('id', chatId)
              .eq('user_id', userId);
            
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (streamError) {
            console.error('Error streaming response with tools:', streamError);
            
            // Fallback to non-streaming approach
            const response = await langchainService.processMessage(
              userId,
              updatedMessages,
              toolsToUse,
              combinedAuthStatus
            );
            
            // Add assistant response to the database
            const assistantMessage = {
              ...response,
              createdAt: new Date().toISOString()
            };
            
            const finalMessages = [...updatedMessages, assistantMessage];
            
            // Update chat with assistant response
            await supabase
              .from('chats')
              .update({
                messages: finalMessages,
                updated_at: new Date()
              })
              .eq('id', chatId)
              .eq('user_id', userId);
            
            // Send the result as a single event
            res.write(`data: ${JSON.stringify(assistantMessage)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          }
        } else {
          // Non-streaming approach with tools
          const response = await langchainService.processMessage(
            userId,
            updatedMessages,
            toolsToUse,
            combinedAuthStatus
          );
          
          // Add assistant response
          const assistantMessage = {
            ...response,
            createdAt: new Date().toISOString()
          };
          
          const finalMessages = [...updatedMessages, assistantMessage];
          
          // Update chat with assistant response
          const updates = {
            messages: finalMessages,
            updated_at: new Date()
          };
          
          // Update chat title if this is the first user message
          if (updatedMessages.filter(m => m.role === 'user').length === 1) {
            updates.title = userMessage.content.substring(0, 40) + (userMessage.content.length > 40 ? '...' : '');
          }
          
          await supabase
            .from('chats')
            .update(updates)
            .eq('id', chatId)
            .eq('user_id', userId);
          
          res.json(assistantMessage);
        }
      } else {
        // Use direct OpenAI service for regular messages
        console.log('Processing message without tools');
        const openaiService = require('../services/openai.service');
        
        if (stream) {
          // Use streaming approach
          console.log('Using streaming response');
          
          // Create a temporary message to store the full response
          let assistantMessage = {
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString()
          };
          
          // Stream the response
          await openaiService.generateChatCompletionStream(updatedMessages, (chunk) => {
            // Update the full message content
            assistantMessage.content = chunk.content;
            
            // Send each chunk as an SSE event
            res.write(`data: ${JSON.stringify({
              role: 'assistant',
              content: chunk.content,
              createdAt: assistantMessage.createdAt
            })}\n\n`);
          });
          
          // Save the complete message to the database
          const finalMessages = [...updatedMessages, assistantMessage];
          
          // Update chat with assistant response
          const updates = {
            messages: finalMessages,
            updated_at: new Date()
          };
          
          // Update chat title if this is the first user message
          if (updatedMessages.filter(m => m.role === 'user').length === 1) {
            updates.title = userMessage.content.substring(0, 40) + (userMessage.content.length > 40 ? '...' : '');
          }
          
          await supabase
            .from('chats')
            .update(updates)
            .eq('id', chatId)
            .eq('user_id', userId);
          
          // Signal the end of the stream
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          // Use non-streaming approach
          const response = await openaiService.generateChatCompletion(updatedMessages);
          
          // Add assistant response
          const assistantMessage = {
            ...response,
            createdAt: new Date().toISOString()
          };
          
          const finalMessages = [...updatedMessages, assistantMessage];
          
          // Update chat with assistant response
          const updates = {
            messages: finalMessages,
            updated_at: new Date()
          };
          
          // Update chat title if this is the first user message
          if (updatedMessages.filter(m => m.role === 'user').length === 1) {
            updates.title = userMessage.content.substring(0, 40) + (userMessage.content.length > 40 ? '...' : '');
          }
          
          await supabase
            .from('chats')
            .update(updates)
            .eq('id', chatId)
            .eq('user_id', userId);
          
          res.json(assistantMessage);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Handle errors differently for streaming vs non-streaming
      if (stream && !res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }
      
      if (stream && !res.finished) {
        // Add error message
        const errorMessage = {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again later.',
          error: true,
          createdAt: new Date().toISOString()
        };
        
        // Update chat with error message
        await supabase
          .from('chats')
          .update({
            messages: [...updatedMessages, errorMessage],
            updated_at: new Date()
          })
          .eq('id', chatId)
          .eq('user_id', userId);
        
        // Send error as an event
        res.write(`data: ${JSON.stringify(errorMessage)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else if (!stream) {
        // Add error message
        const errorMessage = {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again later.',
          error: true,
          createdAt: new Date().toISOString()
        };
        
        // Update chat with error message
        await supabase
          .from('chats')
          .update({
            messages: [...updatedMessages, errorMessage],
            updated_at: new Date()
          })
          .eq('id', chatId)
          .eq('user_id', userId);
        
        res.status(500).json(errorMessage);
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