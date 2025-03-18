// Chat socket handler
const openaiService = require('../services/openai.service');
const langchainService = require('../services/langchain.service');
const { supabase } = require('../services/supabase');

/**
 * Simple function to generate a mock streaming response
 * @param {Object} socket - Socket.io socket object
 * @param {Object} message - Message object to update
 * @param {String} content - Content to stream
 * @param {String} chatId - Chat ID
 */
const simulateStreamingResponse = async (socket, message, content, chatId) => {
  const words = content.split(' ');
  let currentContent = '';
  
  for (const word of words) {
    currentContent += word + ' ';
    socket.emit('message_chunk', {
      ...message,
      content: currentContent.trim(),
      chatId
    });
    
    // Add a small delay to simulate typing
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};

/**
 * Handle chat socket connections and events
 * @param {Object} io - Socket.io server instance
 * @param {Object} socket - Socket.io socket object
 */
const handleChatSocket = (io, socket) => {
  // Join a chat room
  socket.on('join_chat', (chatId) => {
    socket.join(`chat_${chatId}`);
    console.log(`User ${socket.user?.id || 'anonymous'} joined chat room: chat_${chatId}`);
  });
  
  // Leave a chat room
  socket.on('leave_chat', (chatId) => {
    socket.leave(`chat_${chatId}`);
    console.log(`User ${socket.user?.id || 'anonymous'} left chat room: chat_${chatId}`);
  });
  
  // Handle new message
  socket.on('send_message', async (data) => {
    try {
      console.log('Received message via WebSocket:', {
        messageCount: data?.messages?.length,
        useTools: data?.useTools,
        toolCount: data?.enabledTools?.length,
        authStatus: Object.keys(data?.authStatus || {})
      });
      
      const { messages, enabledTools = [], useTools = true, chatId, authStatus = {} } = data;
      const userId = socket.user?.id || 'anonymous';
      
      // Validate input
      if (!Array.isArray(messages) || messages.length === 0) {
        console.error('Invalid messages format:', data);
        return socket.emit('error', { message: 'Invalid messages format' });
      }
      
      // Emit typing indicator
      socket.emit('typing_start', { chatId });
      
      // Initialize response object
      const assistantMessage = {
        role: 'assistant',
        content: '',
        id: `msg-${Date.now()}`
      };
      
      // Determine if we need to use tools
      if (useTools && enabledTools.length > 0) {
        // Process with tools using LangChain
        try {
          console.log(`Processing message with tools using LangChain: ${enabledTools.join(', ')}`);
          
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
          
          // Stream the response
          const stream = await langchainService.getStreamingAgentResponse(
            messages, 
            enabledTools,
            userId,
            combinedAuthStatus
          );
          
          // Process the stream
          for await (const chunk of stream) {
            // Check if this chunk has an auth request
            if (chunk.requiresAuth) {
              // Emit the auth request
              socket.emit('auth_required', {
                service: chunk.service,
                message: chunk.content
              });
              
              // Update assistant message with auth request
              assistantMessage.content = chunk.content;
              assistantMessage.requiresAuth = true;
              assistantMessage.service = chunk.service;
              
              // Emit the updated message
              socket.emit('message_chunk', {
                ...assistantMessage,
                chatId
              });
            } else if (chunk.content) {
              // Update assistant message
              assistantMessage.content = chunk.content;
              
              // Emit the updated message
              socket.emit('message_chunk', {
                ...assistantMessage,
                chatId
              });
            }
          }
          
          console.log('Successfully processed message with tools');
        } catch (error) {
          console.error('Error processing message with tools:', error);
          socket.emit('error', { message: 'Error processing message with tools' });
          
          // Fallback to a simple response
          assistantMessage.content = "I'm sorry, I encountered an error while processing your request with tools. Please try again or contact support if the issue persists.";
          
          // Simulate streaming for a better user experience
          await simulateStreamingResponse(socket, assistantMessage, assistantMessage.content, chatId);
        }
      } else {
        // Process without tools using OpenAI directly
        try {
          console.log('Processing message without tools using OpenAI');
          
          // Use a simple response if OpenAI is not configured
          if (!openaiService.isConfigured) {
            console.warn('OpenAI service is not configured, using fallback response');
            assistantMessage.content = "I'm sorry, the OpenAI service is not properly configured. Please check your backend environment variables.";
            await simulateStreamingResponse(socket, assistantMessage, assistantMessage.content, chatId);
          } else {
            // Create a callback function for streaming
            const onChunk = (chunk) => {
              if (chunk.content) {
                // Emit the chunk to the client
                socket.emit('message_chunk', {
                  ...assistantMessage,
                  content: chunk.content,
                  chatId
                });
              }
            };
            
            // Get streaming response from OpenAI
            console.log('Requesting streaming response from OpenAI');
            try {
              // The generateChatCompletionStream function returns a Promise that resolves to the final message
              // It already calls onChunk for each chunk of the response
              const finalMessage = await openaiService.generateChatCompletionStream(messages, onChunk);
              
              // Update assistant message with the final content
              assistantMessage.content = finalMessage.content;
              
              console.log('Successfully processed OpenAI streaming response');
            } catch (streamError) {
              console.error('Error in OpenAI streaming:', streamError);
              throw streamError; // Re-throw to be caught by the outer catch block
            }
          }
        } catch (error) {
          console.error('Error processing message without tools:', error);
          socket.emit('error', { message: 'Error processing message without tools' });
          
          // Fallback to a simple response
          assistantMessage.content = "I'm sorry, I encountered an error while processing your request. This may be due to an issue with the OpenAI service.";
          
          // Simulate streaming for a better user experience
          await simulateStreamingResponse(socket, assistantMessage, assistantMessage.content, chatId);
        }
      }
      
      // Emit typing stopped
      socket.emit('typing_stop', { chatId });
      
      // Emit final message
      socket.emit('message_complete', {
        ...assistantMessage,
        chatId
      });
      
      console.log('Message processing completed for chat:', chatId);
    } catch (error) {
      console.error('Error handling message:', error);
      socket.emit('error', { message: 'Error processing message' });
    }
  });
};

module.exports = {
  handleChatSocket
};
