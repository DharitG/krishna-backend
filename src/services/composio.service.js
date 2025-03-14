require('dotenv').config();
const axios = require('axios');

class ComposioService {
  constructor() {
    this.apiKey = process.env.COMPOSIO_API_KEY;
    this.isConfigured = !!this.apiKey;
    this.baseUrl = 'https://api.composio.dev'; // Update with actual API URL
    
    if (!this.isConfigured) {
      console.warn('Composio API key not configured. Composio features will not work.');
    }
  }

  /**
   * Get tools for specific actions
   * @param {Array} actions - Array of action identifiers
   * @returns {Array} - Array of tools in the OpenAI tool format
   */
  async getTools(actions = []) {
    if (!this.isConfigured) {
      return [];
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/tools`,
        { actions },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data.tools;
    } catch (error) {
      console.error('Error fetching Composio tools:', error.message);
      return [];
    }
  }

  /**
   * Handle tool calls from OpenAI response
   * @param {Object} toolCalls - Tool calls from the OpenAI API
   * @param {Object} authTokens - User's authentication tokens for various services
   * @returns {Object} - Results of the tool calls
   */
  async handleToolCalls(toolCalls, authTokens = {}) {
    if (!this.isConfigured) {
      return { error: 'Composio not configured' };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/execute`,
        {
          toolCalls,
          authTokens
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error executing Composio tool calls:', error.message);
      throw new Error(`Composio tool execution failed: ${error.message}`);
    }
  }

  /**
   * Initialize authentication for a service
   * @param {String} serviceName - Name of the service (e.g., "github", "gmail")
   * @param {String} userId - User ID for callback URL
   * @returns {Object} - Authentication info including redirect URL
   */
  async initAuthentication(serviceName, userId) {
    if (!this.isConfigured) {
      return { error: 'Composio not configured' };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/auth/init`,
        {
          service: serviceName,
          userId,
          callbackUrl: `${process.env.BACKEND_URL}/api/composio/auth/callback`
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error(`Error initializing ${serviceName} authentication:`, error.message);
      throw new Error(`${serviceName} authentication initialization failed: ${error.message}`);
    }
  }

  /**
   * Complete the authentication flow with the auth code
   * @param {String} serviceName - Name of the service
   * @param {String} code - Authorization code from service
   * @returns {Object} - Authentication tokens
   */
  async completeAuthentication(serviceName, code) {
    if (!this.isConfigured) {
      return { error: 'Composio not configured' };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/auth/complete`,
        {
          service: serviceName,
          code
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error(`Error completing ${serviceName} authentication:`, error.message);
      throw new Error(`${serviceName} authentication completion failed: ${error.message}`);
    }
  }
}

module.exports = new ComposioService();