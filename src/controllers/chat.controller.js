const { supabase } = require('../services/supabase');
const openaiService = require('../services/openai.service');

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
    const { content } = req.body;
    
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
    
    // Add user message
    const userMessage = {
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    
    const messages = [...chat.messages, userMessage];
    
    // Update chat with user message
    await supabase
      .from('chats')
      .update({
        messages,
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
    const authStatus = {};
    const now = new Date();
    
    if (serviceTokens) {
      serviceTokens.forEach(token => {
        const isValid = token.expires_at ? new Date(token.expires_at) > now : false;
        authStatus[token.service_name] = isValid;
      });
    }
    
    try {
      // Send to OpenAI
      const response = await openaiService.sendMessage(
        messages,
        chat.enabled_tools,
        chat.use_tools,
        authStatus
      );
      
      // Add assistant response
      const assistantMessage = {
        ...response,
        createdAt: new Date().toISOString()
      };
      
      const updatedMessages = [...messages, assistantMessage];
      
      // Update chat with assistant response
      const updates = {
        messages: updatedMessages,
        updated_at: new Date()
      };
      
      // Update chat title if this is the first user message
      if (messages.filter(m => m.role === 'user').length === 1) {
        updates.title = content.substring(0, 40) + (content.length > 40 ? '...' : '');
      }
      
      await supabase
        .from('chats')
        .update(updates)
        .eq('id', chatId)
        .eq('user_id', userId);
      
      res.json(assistantMessage);
    } catch (error) {
      console.error('Error sending message:', error);
      
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
          messages: [...messages, errorMessage],
          updated_at: new Date()
        })
        .eq('id', chatId)
        .eq('user_id', userId);
      
      res.status(500).json(errorMessage);
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