require('dotenv').config();
const axios = require('axios');
const composioService = require('./composio.service');
const { AUGUST_SYSTEM_PROMPT } = require("../config/august-system-prompt");
const memoryService = require('./memory.service'); // Import memory service

class OpenAIService {
  constructor() {
    this.apiKey = process.env.AZURE_OPENAI_API_KEY;
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    this.isConfigured = !!(this.apiKey && this.endpoint && this.deploymentName);
    this.apiVersion = '2024-10-21'; // Update as needed
    
    if (!this.isConfigured) {
      console.warn('Azure OpenAI not configured. Chat features will be limited.');
    }
    
    this.client = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey
      }
    });
  }

  /**
   * Send a message to Azure OpenAI
   * @param {Array} messages - Chat messages
   * @param {Array} enabledTools - Tools to enable
   * @param {Boolean} useTools - Whether to use tools
   * @param {Object} authStatus - User's auth status for services
   * @returns {Object} - The assistant's response
   */
  async sendMessage(messages, enabledTools = [], useTools = true, authStatus = {}) {
    if (!this.isConfigured) {
      throw new Error('Azure OpenAI is not configured');
    }

    try {
      // Normalize endpoint (remove trailing slash if present)
      const normalizedEndpoint = this.endpoint.endsWith('/') 
        ? this.endpoint.slice(0, -1) 
        : this.endpoint;
      
      // Form the Azure OpenAI API URL
      const apiUrl = `${normalizedEndpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;
      
      // Get tools from Composio if requested
      const tools = useTools ? await composioService.getTools(enabledTools) : [];
      
      // Prepare request payload
      const payload = {
        messages: [
          // Add system message
          { role: 'system', content: AUGUST_SYSTEM_PROMPT },
          // Add user messages
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 800,
        top_p: 0.95,
        frequency_penalty: 0,
        presence_penalty: 0,
        stop: null
      };
      
      // Add tools to request if available
      if (useTools && tools.length > 0) {
        payload.tools = tools;
        payload.tool_choice = 'auto';
      }
      
      // Send request to Azure OpenAI
      const response = await this.client.post(apiUrl, payload);
      
      // Get assistant message from response
      const assistantMessage = response.data.choices[0].message;
      
      // Check for tool calls
      if (assistantMessage.tool_calls?.length > 0) {
        // Extract service names from tool calls
        const toolNames = assistantMessage.tool_calls.map(tc => {
          const serviceName = tc.function.name.split('_')[0].toLowerCase();
          return serviceName;
        });
        
        // Check for unauthenticated services
        const unauthenticatedServices = toolNames.filter(service => !authStatus[service]);
        
        if (unauthenticatedServices.length > 0) {
          // Return authentication request message
          return {
            role: 'assistant',
            content: `I need to access certain services to help you with this request. Please authenticate with the following services: ${unauthenticatedServices.join(', ')}`
          };
        }
        
        // Process tool calls
        try {
          const result = await composioService.handleToolCalls(
            assistantMessage.tool_calls,
            authStatus
          );
          
          return {
            role: 'assistant',
            content: `I've used tools to help with your request: ${result.result}`
          };
        } catch (error) {
          return {
            role: 'assistant',
            content: `I tried to use tools to help with your request, but encountered an error: ${error.message}`
          };
        }
      }
      
      // Return standard assistant message if no tool calls
      return assistantMessage;
    } catch (error) {
      console.error('Error calling Azure OpenAI:', error);
      throw error;
    }
  }

  /**
   * Generate a chat completion directly without using tools
   * @param {Array} messages - Chat messages
   * @param {string} userId - The ID of the user making the request
   * @returns {Object} - The assistant's response
   */
  async generateChatCompletion(messages, userId) { // Add userId parameter
    if (!this.isConfigured) {
      throw new Error('Azure OpenAI is not configured');
    }

    try {
      // Normalize endpoint (remove trailing slash if present)
      const normalizedEndpoint = this.endpoint.endsWith('/') 
        ? this.endpoint.slice(0, -1) 
        : this.endpoint;
      
      // Form the Azure OpenAI API URL
      const apiUrl = `${normalizedEndpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;
      
      // --- Start Memory Retrieval ---
      let finalMessages = [...messages]; // Clone messages array
      const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
      if (lastUserMessage && userId) { // Check if userId is provided
        let retrievedMemoryContext = '';
        const memoryQuery = lastUserMessage.content;
        try {
          console.log(`(OpenAI Non-Stream) Retrieving memories for query: "${memoryQuery}"`);
          const relevantMemories = await memoryService.retrieveMemories({
            query: memoryQuery,
            userId: userId,
            limit: 3 // Retrieve top 3 relevant memories
          });

          if (relevantMemories && relevantMemories.length > 0) {
            retrievedMemoryContext = "Relevant information from past conversations:\n" +
              relevantMemories.map(mem => `- ${mem.content}`).join("\n") +
              "\n---\n"; // Add separator
            console.log("(OpenAI Non-Stream) Retrieved memory context:", retrievedMemoryContext);

            // Prepend context to the last user message in the cloned array
            const lastUserMessageIndex = finalMessages.map(m => m.role).lastIndexOf('user');
            if (lastUserMessageIndex !== -1) {
              finalMessages[lastUserMessageIndex].content = retrievedMemoryContext + finalMessages[lastUserMessageIndex].content;
            }
          } else {
            console.log("(OpenAI Non-Stream) No relevant memories found.");
          }
        } catch (memoryError) {
          console.error("(OpenAI Non-Stream) Error retrieving memories:", memoryError);
          // Continue without memory context if retrieval fails
        }
      }
      // --- End Memory Retrieval ---

      // Prepare request payload using potentially modified messages
      const payload = {
        messages: [
          { role: 'system', content: AUGUST_SYSTEM_PROMPT },
          ...finalMessages // Use the array possibly modified with memory context
        ],
        temperature: 0.7,
        max_tokens: 800,
        top_p: 0.95,
        frequency_penalty: 0,
        presence_penalty: 0,
        stop: null
      };
      
      // Send request to Azure OpenAI
      const response = await this.client.post(apiUrl, payload);
      
      // Get assistant message from response
      const assistantMessage = response.data.choices[0].message;
      
      return {
        role: 'assistant',
        content: assistantMessage.content
      };
    } catch (error) {
      console.error('Error calling Azure OpenAI for chat completion:', error);
      throw error;
    }
  }

  /**
   * Generate a streaming chat completion directly without using tools
   * @param {Array} messages - Chat messages
   * @param {Function} onChunk - Callback for each chunk of the response
   * @param {string} userId - The ID of the user making the request
   * @returns {Promise} - Promise that resolves when streaming is complete
   */
  async generateChatCompletionStream(messages, onChunk, userId) { // Add userId parameter
    if (!this.isConfigured) {
      console.error('Azure OpenAI is not configured. Keys missing:', {
        apiKey: !this.apiKey,
        endpoint: !this.endpoint,
        deploymentName: !this.deploymentName
      });
      throw new Error('Azure OpenAI is not configured');
    }

    try {
      console.log('Starting OpenAI streaming request with config:', {
        endpoint: this.endpoint ? `${this.endpoint.substring(0, 10)}...` : 'missing',
        deploymentName: this.deploymentName || 'missing',
        apiVersion: this.apiVersion,
        messageCount: messages.length
      });
      
      // Normalize endpoint (remove trailing slash if present)
      const normalizedEndpoint = this.endpoint.endsWith('/') 
        ? this.endpoint.slice(0, -1) 
        : this.endpoint;
      
      // Form the Azure OpenAI API URL
      const apiUrl = `${normalizedEndpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;
      
      // --- Start Memory Retrieval ---
      let finalMessages = [...messages]; // Clone messages array
      const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
      if (lastUserMessage && userId) { // Check if userId is provided
        let retrievedMemoryContext = '';
        const memoryQuery = lastUserMessage.content;
        try {
          console.log(`(OpenAI Stream) Retrieving memories for query: "${memoryQuery}"`);
          const relevantMemories = await memoryService.retrieveMemories({
            query: memoryQuery,
            userId: userId,
            limit: 3 // Retrieve top 3 relevant memories
          });

          if (relevantMemories && relevantMemories.length > 0) {
            retrievedMemoryContext = "Relevant information from past conversations:\n" +
              relevantMemories.map(mem => `- ${mem.content}`).join("\n") +
              "\n---\n"; // Add separator
            console.log("(OpenAI Stream) Retrieved memory context:", retrievedMemoryContext);

            // Prepend context to the last user message in the cloned array
            const lastUserMessageIndex = finalMessages.map(m => m.role).lastIndexOf('user');
            if (lastUserMessageIndex !== -1) {
              finalMessages[lastUserMessageIndex].content = retrievedMemoryContext + finalMessages[lastUserMessageIndex].content;
            }
          } else {
            console.log("(OpenAI Stream) No relevant memories found.");
          }
        } catch (memoryError) {
          console.error("(OpenAI Stream) Error retrieving memories:", memoryError);
          // Continue without memory context if retrieval fails
        }
      }
      // --- End Memory Retrieval ---

      // Prepare request payload with streaming enabled using potentially modified messages
      const payload = {
        messages: [
          { role: 'system', content: AUGUST_SYSTEM_PROMPT },
          ...finalMessages // Use the array possibly modified with memory context
        ],
        temperature: 0.7,
        max_tokens: 800,
        top_p: 0.95,
        frequency_penalty: 0,
        presence_penalty: 0,
        stop: null,
        stream: true
      };
      
      console.log('Sending streaming request to:', apiUrl.replace(this.apiKey, '[REDACTED]'));
      
      // Create a custom axios instance for streaming
      const streamingClient = axios.create({
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        responseType: 'stream'
      });
      
      // Send streaming request to Azure OpenAI
      const response = await streamingClient.post(apiUrl, payload);
      console.log('Streaming response received, status:', response.status);
      
      // Process the stream
      return new Promise((resolve, reject) => {
        let buffer = '';
        let assistantMessage = {
          role: 'assistant',
          content: ''
        };
        
        response.data.on('data', (chunk) => {
          const chunkString = chunk.toString();
          buffer += chunkString;
          
          // Process complete lines from buffer
          let lines = buffer.split('\n');
          buffer = lines.pop(); // Keep the last incomplete line in the buffer
          
          for (const line of lines) {
            // Skip empty lines
            if (!line.trim()) continue;
            
            // Handle data lines
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              
              // Check for end of stream
              if (data === '[DONE]') {
                onChunk(assistantMessage);
                return;
              }
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content || '';
                
                if (content) {
                  assistantMessage.content += content;
                  // Clone the message to avoid reference issues
                  onChunk({...assistantMessage});
                }
              } catch (e) {
                console.error('Error parsing streaming data:', e, data);
              }
            }
          }
        });
        
        response.data.on('end', () => {
          // Process any remaining data in the buffer
          if (buffer.trim() && buffer.startsWith('data: ')) {
            try {
              const data = buffer.substring(6);
              if (data !== '[DONE]') {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content || '';
                
                if (content) {
                  assistantMessage.content += content;
                  onChunk({...assistantMessage});
                }
              }
            } catch (e) {
              console.error('Error parsing final streaming data:', e, buffer);
            }
          }
          
          console.log('Streaming completed successfully');
          resolve(assistantMessage);
        });
        
        response.data.on('error', (err) => {
          console.error('Streaming error:', err);
          reject(err);
        });
      });
    } catch (error) {
      console.error('Error in generateChatCompletionStream:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw error;
    }
  }
}

module.exports = new OpenAIService();
