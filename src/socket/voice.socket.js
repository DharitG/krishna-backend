// Voice socket handler for speech-to-speech functionality
const openaiService = require('../services/openai.service');
const langchainService = require('../services/langchain.service');

/**
 * Handle voice socket connections and events
 * @param {Object} io - Socket.io server instance
 * @param {Object} socket - Socket.io socket object
 */
const handleVoiceSocket = (io, socket) => {
  // Join a voice session
  socket.on('join_voice_session', (sessionId) => {
    socket.join(`voice_${sessionId}`);
    console.log(`User ${socket.user?.id || 'anonymous'} joined voice session: voice_${sessionId}`);
  });
  
  // Leave a voice session
  socket.on('leave_voice_session', (sessionId) => {
    socket.leave(`voice_${sessionId}`);
    console.log(`User ${socket.user?.id || 'anonymous'} left voice session: voice_${sessionId}`);
  });
  
  // Handle audio data from client
  socket.on('audio_data', async (data) => {
    try {
      const { audioChunk, sessionId, messageId, isLastChunk } = data;
      
      // Store audio chunks in a buffer (could be implemented with Redis for production)
      if (!socket.audioBuffers) {
        socket.audioBuffers = {};
      }
      
      if (!socket.audioBuffers[messageId]) {
        socket.audioBuffers[messageId] = [];
      }
      
      // Add the chunk to the buffer
      socket.audioBuffers[messageId].push(audioChunk);
      
      // If this is the last chunk, process the complete audio
      if (isLastChunk) {
        console.log(`Processing complete audio for message: ${messageId}`);
        
        // Emit processing indicator
        socket.emit('voice_processing_start', { sessionId, messageId });
        
        try {
          // Here we would process the audio to text
          // In a real implementation, we'd use a service like OpenAI's Whisper API
          // For now, we'll simulate this with a delay
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Simulate transcription result
          const transcription = "This is a simulated transcription. Replace with actual speech-to-text processing.";
          
          // Emit the transcription
          socket.emit('transcription_result', { 
            sessionId, 
            messageId, 
            text: transcription 
          });
          
          // Process the transcription with AI
          const messages = [{ role: 'user', content: transcription }];
          const enabledTools = data.enabledTools || [];
          
          // Create a user message object
          const userMessage = {
            role: 'user',
            content: transcription,
            id: messageId
          };
          
          // Emit the user message
          socket.emit('message_received', {
            ...userMessage,
            sessionId
          });
          
          // Determine if we need to use tools
          if (enabledTools && enabledTools.length > 0) {
            // Process with tools using LangChain
            try {
              console.log('Processing voice message with tools using LangChain');
              
              // Initialize assistant message
              const assistantMessage = {
                role: 'assistant',
                content: '',
                id: `msg-${Date.now()}`
              };
              
              // Stream the response
              const stream = await langchainService.getStreamingAgentResponse(messages, enabledTools, socket.user?.id);
              
              // Process the stream
              for await (const chunk of stream) {
                if (chunk.content) {
                  // Update assistant message
                  assistantMessage.content = chunk.content;
                  
                  // Emit the updated message
                  socket.emit('voice_text_chunk', {
                    ...assistantMessage,
                    sessionId
                  });
                }
              }
              
              // Convert final text to speech (simulated)
              socket.emit('voice_synthesis_start', { 
                sessionId, 
                messageId: assistantMessage.id,
                text: assistantMessage.content
              });
              
              // Simulate audio chunks being sent back
              const audioChunkCount = 5;
              for (let i = 0; i < audioChunkCount; i++) {
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // In a real implementation, these would be actual audio chunks
                socket.emit('voice_audio_chunk', {
                  sessionId,
                  messageId: assistantMessage.id,
                  audioChunk: `simulated-audio-chunk-${i}`,
                  isLastChunk: i === audioChunkCount - 1
                });
              }
              
              console.log('Successfully processed voice message with tools');
            } catch (error) {
              console.error('Error processing voice message with tools:', error);
              socket.emit('error', { message: 'Error processing voice message with tools' });
              
              // Fallback to a simple response
              const fallbackMessage = "I'm sorry, I encountered an error while processing your voice request with tools.";
              
              socket.emit('voice_text_chunk', {
                role: 'assistant',
                content: fallbackMessage,
                id: `msg-${Date.now()}`,
                sessionId
              });
              
              // Simulate audio response for fallback
              socket.emit('voice_synthesis_start', { 
                sessionId, 
                messageId: `msg-${Date.now()}`,
                text: fallbackMessage
              });
              
              // Send a single audio chunk for the fallback
              await new Promise(resolve => setTimeout(resolve, 300));
              socket.emit('voice_audio_chunk', {
                sessionId,
                messageId: `msg-${Date.now()}`,
                audioChunk: 'simulated-fallback-audio',
                isLastChunk: true
              });
            }
          } else {
            // Process without tools using OpenAI directly
            try {
              console.log('Processing voice message without tools using OpenAI');
              
              // Initialize assistant message
              const assistantMessage = {
                role: 'assistant',
                content: '',
                id: `msg-${Date.now()}`
              };
              
              // Use a simple response if OpenAI is not configured
              if (!openaiService.isConfigured) {
                console.warn('OpenAI service is not configured, using fallback response');
                assistantMessage.content = "I'm sorry, the OpenAI service is not properly configured.";
                
                socket.emit('voice_text_chunk', {
                  ...assistantMessage,
                  sessionId
                });
                
                // Simulate audio response
                socket.emit('voice_synthesis_start', { 
                  sessionId, 
                  messageId: assistantMessage.id,
                  text: assistantMessage.content
                });
                
                // Send a single audio chunk
                await new Promise(resolve => setTimeout(resolve, 300));
                socket.emit('voice_audio_chunk', {
                  sessionId,
                  messageId: assistantMessage.id,
                  audioChunk: 'simulated-fallback-audio',
                  isLastChunk: true
                });
              } else {
                // Create a callback function for streaming
                const onChunk = (chunk) => {
                  if (chunk.content) {
                    // Emit the chunk to the client
                    socket.emit('voice_text_chunk', {
                      ...assistantMessage,
                      content: chunk.content,
                      sessionId
                    });
                  }
                };
                
                // Get streaming response from OpenAI
                console.log('Requesting streaming response from OpenAI for voice');
                try {
                  // Get the response
                  const finalMessage = await openaiService.generateChatCompletionStream(messages, onChunk);
                  
                  // Update assistant message with the final content
                  assistantMessage.content = finalMessage.content;
                  
                  // Convert final text to speech (simulated)
                  socket.emit('voice_synthesis_start', { 
                    sessionId, 
                    messageId: assistantMessage.id,
                    text: assistantMessage.content
                  });
                  
                  // Simulate audio chunks being sent back
                  const audioChunkCount = 5;
                  for (let i = 0; i < audioChunkCount; i++) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // In a real implementation, these would be actual audio chunks
                    socket.emit('voice_audio_chunk', {
                      sessionId,
                      messageId: assistantMessage.id,
                      audioChunk: `simulated-audio-chunk-${i}`,
                      isLastChunk: i === audioChunkCount - 1
                    });
                  }
                  
                  console.log('Successfully processed OpenAI streaming response for voice');
                } catch (streamError) {
                  console.error('Error in OpenAI streaming for voice:', streamError);
                  throw streamError;
                }
              }
            } catch (error) {
              console.error('Error processing voice message without tools:', error);
              socket.emit('error', { message: 'Error processing voice message without tools' });
              
              // Fallback to a simple response
              const fallbackMessage = "I'm sorry, I encountered an error while processing your voice request.";
              
              socket.emit('voice_text_chunk', {
                role: 'assistant',
                content: fallbackMessage,
                id: `msg-${Date.now()}`,
                sessionId
              });
              
              // Simulate audio response for fallback
              socket.emit('voice_synthesis_start', { 
                sessionId, 
                messageId: `msg-${Date.now()}`,
                text: fallbackMessage
              });
              
              // Send a single audio chunk for the fallback
              await new Promise(resolve => setTimeout(resolve, 300));
              socket.emit('voice_audio_chunk', {
                sessionId,
                messageId: `msg-${Date.now()}`,
                audioChunk: 'simulated-fallback-audio',
                isLastChunk: true
              });
            }
          }
          
          // Emit processing complete
          socket.emit('voice_processing_complete', { sessionId, messageId });
          
          // Clean up the audio buffer
          delete socket.audioBuffers[messageId];
        } catch (processingError) {
          console.error('Error processing audio:', processingError);
          socket.emit('error', { message: 'Error processing audio' });
          socket.emit('voice_processing_complete', { sessionId, messageId, error: true });
          
          // Clean up the audio buffer
          delete socket.audioBuffers[messageId];
        }
      }
    } catch (error) {
      console.error('Error handling audio data:', error);
      socket.emit('error', { message: 'Error handling audio data' });
    }
  });
};

module.exports = {
  handleVoiceSocket
};
