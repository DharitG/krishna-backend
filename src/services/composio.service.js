const axios = require('axios');
const { supabase } = require('./supabase');

class ComposioService {
  constructor() {
    this.apiKey = process.env.COMPOSIO_API_KEY;
    this.baseUrl = 'https://api.composio.dev';
    this.isConfigured = !!this.apiKey;
    
    if (!this.isConfigured) {
      console.warn('Composio service not configured. API key is missing.');
    }
  }
  
  /**
   * Initialize authentication for a service
   * @param {string} service - Service name (e.g., 'gmail', 'github')
   * @param {string} userId - User ID
   * @returns {Object} - Authentication info
   */
  async initAuthentication(service, userId) {
    try {
      if (!this.isConfigured) {
        throw new Error('Composio API key not configured');
      }
      
      // Normalize service name
      const normalizedService = service.toLowerCase();
      
      // Make request to Composio API to initiate authentication
      const response = await axios.post(
        `${this.baseUrl}/v1/auth/init`,
        {
          service: normalizedService,
          userId: userId,
          redirectUrl: `${process.env.BACKEND_URL}/api/composio/auth/callback?service=${normalizedService}`
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return {
        redirectUrl: response.data.redirectUrl,
        state: response.data.state
      };
    } catch (error) {
      console.error(`Error initializing ${service} authentication:`, error);
      
      if (error.response) {
        return {
          error: error.response.data.message || 'Authentication initialization failed'
        };
      }
      
      return {
        error: error.message || 'Authentication initialization failed'
      };
    }
  }
  
  /**
   * Complete authentication process
   * @param {string} service - Service name
   * @param {string} code - Authorization code
   * @returns {Object} - Authentication result
   */
  async completeAuthentication(service, code) {
    try {
      if (!this.isConfigured) {
        throw new Error('Composio API key not configured');
      }
      
      // Normalize service name
      const normalizedService = service.toLowerCase();
      
      // Make request to Composio API to complete authentication
      const response = await axios.post(
        `${this.baseUrl}/v1/auth/complete`,
        {
          service: normalizedService,
          code: code
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        expiresAt: response.data.expiresAt
      };
    } catch (error) {
      console.error(`Error completing ${service} authentication:`, error);
      
      if (error.response) {
        return {
          error: error.response.data.message || 'Authentication completion failed'
        };
      }
      
      return {
        error: error.message || 'Authentication completion failed'
      };
    }
  }
  
  /**
   * Check authentication status for a service
   * @param {string} service - Service name
   * @param {string} userId - User ID
   * @returns {Object} - Authentication status
   */
  async checkAuthentication(service, userId) {
    try {
      if (!this.isConfigured) {
        throw new Error('Composio API key not configured');
      }
      
      // Get token from database
      const { data: token, error } = await supabase
        .from('service_tokens')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', userId)
        .eq('service_name', service.toLowerCase())
        .single();
      
      if (error || !token) {
        return {
          authenticated: false,
          status: 'not_authenticated'
        };
      }
      
      // Check if token is expired
      const now = new Date();
      const expiresAt = token.expires_at ? new Date(token.expires_at) : null;
      
      if (expiresAt && expiresAt <= now) {
        return {
          authenticated: false,
          status: 'token_expired'
        };
      }
      
      return {
        authenticated: true,
        status: 'authenticated'
      };
    } catch (error) {
      console.error(`Error checking ${service} authentication:`, error);
      return {
        authenticated: false,
        status: 'error',
        error: error.message
      };
    }
  }
  
  /**
   * Get available tools from Composio
   * @param {Array} actions - List of actions to filter by
   * @param {string} userId - User ID
   * @returns {Array} - List of available tools
   */
  async getTools(actions = [], userId) {
    try {
      if (!this.isConfigured) {
        throw new Error('Composio API key not configured');
      }
      
      // Make request to Composio API to get available tools
      const response = await axios.get(
        `${this.baseUrl}/v1/tools`,
        {
          params: {
            actions: actions.join(','),
            userId: userId
          },
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );
      
      return response.data.tools || [];
    } catch (error) {
      console.error('Error fetching tools from Composio:', error);
      throw error;
    }
  }
  
  /**
   * Handle tool calls
   * @param {Array} toolCalls - Array of tool calls
   * @param {Object} authStatus - Authentication status for various services
   * @param {string} userId - User ID
   * @returns {Object} - Tool execution result
   */
  async handleToolCalls(toolCalls, authStatus = {}, userId) {
    try {
      if (!this.isConfigured) {
        throw new Error('Composio API key not configured');
      }
      
      if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
        throw new Error('No tool calls provided');
      }
      
      // Get service tokens for the user
      const { data: serviceTokens, error } = await supabase
        .from('service_tokens')
        .select('service_name, access_token')
        .eq('user_id', userId);
      
      if (error) {
        console.error('Error fetching service tokens:', error);
      }
      
      // Create a map of service tokens
      const tokenMap = {};
      
      if (serviceTokens) {
        serviceTokens.forEach(token => {
          tokenMap[token.service_name.toLowerCase()] = token.access_token;
        });
      }
      
      // Process the first tool call (for now, we only support one at a time)
      const toolCall = toolCalls[0];
      const functionName = toolCall.function.name;
      
      // Parse arguments
      let args = {};
      try {
        if (typeof toolCall.function.arguments === 'string') {
          args = JSON.parse(toolCall.function.arguments);
        } else {
          args = toolCall.function.arguments;
        }
      } catch (e) {
        console.error('Error parsing tool arguments:', e);
        args = {};
      }
      
      // Determine the service from the function name
      const serviceMap = {
        'gmail': 'gmail',
        'sendEmail': 'gmail',
        'readEmails': 'gmail',
        'github': 'github',
        'createIssue': 'github',
        'createPullRequest': 'github',
        'slack': 'slack',
        'sendMessage': 'slack',
      };
      
      let service = null;
      
      // Check for exact matches first
      if (serviceMap[functionName]) {
        service = serviceMap[functionName];
      } else {
        // Check for partial matches
        for (const [key, value] of Object.entries(serviceMap)) {
          if (functionName.toLowerCase().includes(key.toLowerCase())) {
            service = value;
            break;
          }
        }
      }
      
      // Get the access token for this service
      const accessToken = service ? tokenMap[service.toLowerCase()] : null;
      
      // Make request to Composio API to execute the tool
      const response = await axios.post(
        `${this.baseUrl}/v1/tools/execute`,
        {
          name: functionName,
          arguments: args,
          userId: userId,
          serviceToken: accessToken
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return {
        output: response.data.result,
        status: 'success'
      };
    } catch (error) {
      console.error('Error executing tool call:', error);
      
      // Check if this is an authentication error
      if (error.response && error.response.status === 401) {
        return {
          output: 'Authentication required to perform this action.',
          status: 'auth_required',
          error: error.message
        };
      }
      
      return {
        output: 'Error executing tool call.',
        status: 'error',
        error: error.message
      };
    }
  }
}

module.exports = new ComposioService();