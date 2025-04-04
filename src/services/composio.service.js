const { OpenAIToolSet } = require('composio-core');
const { supabase } = require('./supabase');
const axios = require('axios');

class ComposioService {
  constructor() {
    this.apiKey = process.env.COMPOSIO_API_KEY;
    this.apiUrl = process.env.COMPOSIO_API_URL || 'https://backend.composio.dev';
    this.gmailIntegrationId = process.env.GMAIL_INTEGRATION_ID;
    console.log(`Initializing Composio service with SDK. API URL: ${this.apiUrl}`);
    
    if (!this.apiKey) {
      console.error('Composio service not configured. API key is missing.');
      this.isConfigured = false;
      return;
    }
    
    if (!this.gmailIntegrationId) {
      console.warn('Gmail integration ID is missing. Gmail authentication will not work.');
    }
    
    // Initialize the SDK with API URL
    try {
      this.toolset = new OpenAIToolSet({ 
        apiKey: this.apiKey,
        apiUrl: this.apiUrl
      });
      this.isConfigured = true;
      
      // Test connection
      this.testConnection();
    } catch (error) {
      console.error('Failed to initialize Composio SDK:', error.message);
      this.isConfigured = false;
    }
  }
  
  /**
   * Test connection to Composio API
   */
  async testConnection() {
    if (!this.isConfigured) {
      console.error('Cannot test connection: Composio not configured');
      return;
    }
    
    try {
      // Test by getting a list of integrations
      const integrations = await this.toolset.integrations.list();
      console.log(`Successfully connected to Composio API. Found ${integrations.length} integrations.`);
    } catch (error) {
      console.error('Failed to connect to Composio API:', error.message);
    }
  }
  
  /**
   * Initialize authentication for a service
   * @param {string} service - Service name (e.g., 'gmail')
   * @param {string} userId - User ID
   * @returns {Object} - Authentication info with redirectUrl
   */
  async initAuthentication(service, userId) {
    if (!this.isConfigured) {
      throw new Error('Composio API key not configured');
    }
    
    // Use the appropriate integration ID based on the service
    let integrationId;
    
    console.log(`Initializing authentication for service: ${service}`);
    
    if (service.toLowerCase() === 'gmail') {
      // For Gmail, use the configured integration ID
      integrationId = this.gmailIntegrationId;
      if (!integrationId) {
        throw new Error('Gmail integration ID not configured');
      }
    } else {
      // For other services, we would need to map the service name to an integration ID
      // This is a placeholder - you'll need to add support for other services as needed
      throw new Error(`Service "${service}" is not supported yet`);
    }
    
    try {
      console.log(`Using integration ID: ${integrationId} for service: ${service}`);
      
      // Get the integration details
      const integration = await this.toolset.integrations.get({
        integrationId: integrationId
      });
      
      console.log(`Got integration details for ${service}: ${integration.id}`);
      
      // Initialize connection
      const connectedAccount = await this.toolset.connectedAccounts.initiate({
        integrationId: integration.id,
        entityId: `user-${userId}`, // Use userId as the entity identifier
      });
      
      console.log(`Created connected account: ${connectedAccount.connectedAccountId}`);
      console.log(`Redirect URL: ${connectedAccount.redirectUrl}`);
      
      // Return the authentication information
      return {
        redirectUrl: connectedAccount.redirectUrl,
        connectionId: connectedAccount.connectedAccountId,
        state: userId
      };
    } catch (error) {
      console.error(`Error initializing authentication for ${service}:`, error.message);
      if (error.response) {
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }
  
  /**
   * Complete the authentication flow (callback handler)
   * @param {Object} params - Callback parameters
   * @returns {Object} - Connection information
   */
  async completeAuthentication(params) {
    if (!this.isConfigured) {
      throw new Error('Composio API key not configured');
    }
    
    try {
      // Get the connection details
      const connection = await this.toolset.connectedAccounts.get({
        connectedAccountId: params.connectedAccountId
      });
      
      // Store connection in database if needed
      // This depends on your application's needs
      
      return {
        connectionId: connection.connectedAccountId,
        status: connection.connectionStatus,
        service: 'gmail', // Assuming this is for Gmail
        connected: connection.connectionStatus === 'connected'
      };
    } catch (error) {
      console.error('Error completing authentication:', error.message);
      throw error;
    }
  }
  
  /**
   * Check if a service is authenticated for a user
   * @param {string} service - Service name
   * @param {string} userId - User ID
   * @returns {boolean} - Whether the service is authenticated
   */
  async checkAuthentication(service, userId) {
    if (!this.isConfigured) {
      throw new Error('Composio API key not configured');
    }
    
    try {
      // Determine the correct integration ID based on service
      let integrationId;
      
      if (service.toLowerCase() === 'gmail') {
        integrationId = this.gmailIntegrationId;
        if (!integrationId) {
          console.warn('Gmail integration ID not configured');
          return false;
        }
      } else {
        // For future services, we would add mappings here
        console.warn(`No integration ID mapping for service: ${service}`);
        return false;
      }
      
      // List connected accounts
      const connections = await this.toolset.connectedAccounts.list({
        integrationId: integrationId,
        entityId: `user-${userId}`
      });
      
      // Check if any connection is active
      const isAuthenticated = connections.some(conn => conn.connectionStatus === 'connected');
      console.log(`Authentication status for ${service} (user ${userId}): ${isAuthenticated ? 'Authenticated' : 'Not authenticated'}`);
      
      return isAuthenticated;
    } catch (error) {
      console.error(`Error checking authentication for ${service}:`, error.message);
      return false;
    }
  }
  
  /**
   * Check authentication status for a service
   * @param {string} service - Service name
   * @param {string} userId - User ID
   * @returns {Object} - Authentication status
   */
  async checkAuthenticationStatus(service, userId) {
    try {
      if (!this.isConfigured) {
        throw new Error('Composio API key not configured');
      }
      
      // If in mock mode, check if we have a mock token in the database
      if (this.mockMode) {
        console.log(`[MOCK] Checking ${service} authentication for user ${userId}`);
        
        // Check if we have a token in the database
        const { data: token, error } = await supabase
          .from('service_tokens')
          .select('access_token, refresh_token, expires_at')
          .eq('user_id', userId)
          .eq('service_name', service.toLowerCase())
          .single();
        
        if (error || !token) {
          return {
            authenticated: false,
            status: 'not_authenticated',
            mockMode: true
          };
        }
        
        return {
          authenticated: true,
          status: 'authenticated',
          mockMode: true
        };
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
      
      // If connection error, switch to mock mode and retry
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.warn(`Connection to Composio API failed, switching to mock mode`);
        this.mockMode = true;
        return this.checkAuthenticationStatus(service, userId);
      }
      
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
   * @param {Array} apps - Optional list of apps to filter by
   * @param {Array} tags - Optional list of tags to filter by
   * @returns {Array} - List of available tools
   */
  async getTools(actions = [], userId, apps = [], tags = []) {
    try {
      if (!this.isConfigured) {
        throw new Error('Composio API key not configured');
      }
      
      // Prepare params object
      const params = { userId };
      
      // Add optional parameters if provided
      if (actions && actions.length > 0) {
        params.actions = actions.join(',');
      }
      
      if (apps && apps.length > 0) {
        params.apps = apps.join(',');
      }
      
      if (tags && tags.length > 0) {
        params.tags = tags.join(',');
      }
      
      // Make request to Composio API to get available tools
      const response = await axios.get(
        `${this.apiUrl}/tools`,
        {
          params,
          headers: {
            'x-api-key': this.apiKey
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
   * Find actions by use case description
   * @param {string} useCase - Description of what the user is trying to accomplish
   * @param {boolean} advanced - Whether to return multiple tools for complex workflows
   * @param {Array} apps - Optional list of apps to filter by
   * @returns {Array} - List of action names matching the use case
   */
  async findActionsByUseCase(useCase, advanced = false, apps = []) {
    try {
      if (!this.isConfigured) {
        throw new Error('Composio API key not configured');
      }
      
      if (!useCase || typeof useCase !== 'string') {
        throw new Error('Use case description is required');
      }
      
      // Prepare params object
      const params = {
        query: useCase,
        advanced: advanced
      };
      
      // Add optional app filter if provided
      if (apps && apps.length > 0) {
        params.apps = apps.join(',');
      }
      
      // Make request to Composio API to search for actions by use case
      const response = await axios.get(
        `${this.apiUrl}/actions/search`,
        {
          params,
          headers: {
            'x-api-key': this.apiKey
          }
        }
      );
      
      return response.data.actions || [];
    } catch (error) {
      console.error('Error searching for actions by use case:', error);
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
        `${this.apiUrl}/tools/execute`,
        {
          name: functionName,
          arguments: args,
          userId: userId,
          serviceToken: accessToken
        },
        {
          headers: {
            'x-api-key': this.apiKey,
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
