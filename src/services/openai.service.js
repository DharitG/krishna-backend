require('dotenv').config();
const axios = require('axios');
const composioService = require('./composio.service');

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
        messages,
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
   * @returns {Object} - The assistant's response
   */
  async generateChatCompletion(messages) {
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
      
      // Prepare request payload - without tools
      const payload = {
        messages,
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
}

module.exports = new OpenAIService();