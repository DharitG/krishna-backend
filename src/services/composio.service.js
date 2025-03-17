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
   * @param {String} userId - User ID for authentication
   * @returns {Array} - Array of tools in the OpenAI tool format
   */
  async getTools(actions = [], userId = null) {
    if (!this.isConfigured) {
      return [];
    }

    try {
      const payload = { actions };
      if (userId) {
        payload.userId = userId;
      }

      const response = await axios.post(
        `${this.baseUrl}/tools`,
        payload,
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
   * @param {String} userId - User ID for authentication
   * @returns {Object} - Results of the tool calls
   */
  async handleToolCalls(toolCalls, authTokens = {}, userId = null) {
    if (!this.isConfigured) {
      return { error: 'Composio not configured' };
    }

    try {
      const payload = {
        toolCalls,
        authTokens
      };
      
      if (userId) {
        payload.userId = userId;
      }

      const response = await axios.post(
        `${this.baseUrl}/execute`,
        payload,
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
      // Make sure serviceName is lowercase
      const service = serviceName.toLowerCase();
      
      // Construct a proper callback URL
      const callbackUrl = `${process.env.BACKEND_URL}/api/composio/auth/callback`;
      
      const response = await axios.post(
        `${this.baseUrl}/auth/init`,
        {
          service,
          userId,
          callbackUrl
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
      // Make sure serviceName is lowercase
      const service = serviceName.toLowerCase();
      
      const response = await axios.post(
        `${this.baseUrl}/auth/complete`,
        {
          service,
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
  
  /**
   * Check if a user is authenticated for a specific service
   * @param {String} serviceName - Name of the service (e.g., "github", "gmail")
   * @param {String} userId - User ID
   * @returns {Object} - Authentication status
   */
  async checkAuthentication(serviceName, userId) {
    if (!this.isConfigured) {
      return { authenticated: false, error: 'Composio not configured' };
    }

    try {
      // Make sure serviceName is lowercase
      const service = serviceName.toLowerCase();
      
      const response = await axios.get(
        `${this.baseUrl}/auth/status`,
        {
          params: {
            service,
            userId
          },
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return {
        authenticated: response.data.authenticated || false,
        status: response.data.status || 'unknown'
      };
    } catch (error) {
      console.error(`Error checking ${serviceName} authentication:`, error.message);
      return { authenticated: false, error: error.message };
    }
  }
}

module.exports = new ComposioService();