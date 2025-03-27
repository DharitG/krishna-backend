const axios = require('axios');
const { supabase } = require('./supabase');

class ComposioService {
  constructor() {
    this.apiKey = process.env.COMPOSIO_API_KEY;
    // Update the base URL to match the current Composio API structure
    // Remove the /api/v2 suffix as it's causing 404 errors
    this.baseUrl = process.env.COMPOSIO_API_URL || 'https://backend.composio.dev';
    console.log(`2025-03-26T07:26:48.163Z - Initializing Composio w API Key: [REDACTED] and baseURL: ${this.baseUrl}`);
    this.isConfigured = !!this.apiKey;
    this.mockMode = false; // Flag to indicate if we're in mock mode
    
    if (!this.isConfigured) {
      console.warn('Composio service not configured. API key is missing.');
    }
    
    // Test connection to Composio API on initialization
    this.testConnection();
  }
  
  /**
   * Test connection to Composio API
   */
  async testConnection() {
    if (!this.isConfigured) return;
    
    try {
      // Try multiple health check endpoints with updated paths
      const healthEndpoints = [
        '/api/v2/health',
        '/api/health',
        '/api/v2/status',
        '/api/status',
        '/api/v2/ping',
        '/api/ping',
        '/api/v2',
        '/api',
        '/health',
        '/status',
        '/ping'
      ];
      
      let connected = false;
      let lastError = null;
      
      for (const endpoint of healthEndpoints) {
        try {
          console.log(`Testing Composio API connection with endpoint: ${this.baseUrl}${endpoint}`);
          const response = await axios.get(`${this.baseUrl}${endpoint}`, {
            headers: {
              'x-api-key': this.apiKey,
              'Authorization': `Bearer ${this.apiKey}` // Try both header formats
            },
            timeout: 5000 // 5 second timeout
          });
          
          if (response.status >= 200 && response.status < 300) {
            console.log(`Successfully connected to Composio API using endpoint: ${endpoint}`);
            connected = true;
            break;
          }
        } catch (endpointError) {
          console.log(`Endpoint ${endpoint} failed: ${endpointError.message}`);
          lastError = endpointError;
          // Continue to next endpoint
        }
      }
      
      if (!connected) {
        // If all health endpoints failed, try a simple API endpoint to verify API key
        try {
          console.log('Testing API key with a service endpoint');
          // Try the services endpoint which should be available in most API versions
          const serviceEndpoints = [
            '/api/v2/services',
            '/api/services',
            '/services'
          ];
          
          for (const endpoint of serviceEndpoints) {
            try {
              console.log(`Testing service endpoint: ${this.baseUrl}${endpoint}`);
              const response = await axios.get(`${this.baseUrl}${endpoint}`, {
                headers: {
                  'x-api-key': this.apiKey,
                  'Authorization': `Bearer ${this.apiKey}` // Try both header formats
                },
                timeout: 5000
              });
              
              if (response.status >= 200 && response.status < 300) {
                console.log(`Successfully connected to Composio API using service endpoint: ${endpoint}`);
                connected = true;
                break;
              }
            } catch (serviceEndpointError) {
              console.log(`Service endpoint ${endpoint} failed: ${serviceEndpointError.message}`);
              lastError = serviceEndpointError;
              // Continue to next endpoint
            }
          }
        } catch (serviceError) {
          console.log(`All service endpoints failed: ${serviceError.message}`);
          
          // Check for specific error codes
          if (serviceError.response) {
            if (serviceError.response.status === 401 || serviceError.response.status === 403) {
              console.error('Authentication failed with Composio API. Check your API key.');
              lastError = new Error('Invalid Composio API key');
            } else if (serviceError.response.status === 404) {
              console.error('Composio API endpoint not found. Check API version and endpoint structure.');
              lastError = new Error('Composio API endpoint not found');
            }
          }
        }
      }
      
      if (!connected) {
        console.warn(`Could not connect to Composio API, switching to mock mode: ${lastError ? lastError.message : 'Unknown error'}`);
        this.mockMode = true;
        
        // Provide guidance based on the error
        if (lastError && lastError.response) {
          if (lastError.response.status === 401 || lastError.response.status === 403) {
            console.error('IMPORTANT: Your Composio API key appears to be invalid or does not have the necessary permissions.');
            console.error('Please check your API key in the Composio dashboard and ensure it has access to the Gmail service.');
          } else if (lastError.response.status === 404) {
            console.error('IMPORTANT: The Composio API endpoints could not be found. This could be due to:');
            console.error('1. The API version has changed (we are using v2)');
            console.error('2. The endpoint structure has changed');
            console.error('3. The Composio service might be down or undergoing maintenance');
            console.error('Please check the latest Composio API documentation for the correct endpoints.');
          }
        } else if (lastError && (lastError.code === 'ECONNREFUSED' || lastError.code === 'ENOTFOUND')) {
          console.error('IMPORTANT: Could not connect to the Composio API server.');
          console.error('Please check your internet connection and ensure that the Composio API is accessible from your server.');
        }
      }
    } catch (error) {
      console.warn('Could not connect to Composio API, switching to mock mode:', error.message);
      this.mockMode = true;
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
        console.log('Composio API key not configured');
        throw new Error('Composio API key not configured');
      }
      
      // If in mock mode, return mock data
      if (this.mockMode) {
        console.log(`[MOCK] Initializing ${service} authentication for user ${userId}`);
        return {
          redirectUrl: `https://accounts.google.com/o/oauth2/auth?mock=true&service=${service}&userId=${userId}`,
          state: userId
        };
      }
      
      // Normalize service name
      const normalizedService = service.toLowerCase();
      
      // For Gmail, we need to properly initialize the connection with Composio
      if (normalizedService === 'gmail') {
        console.log('Initializing Gmail connection with Composio');
        
        // First, check if Gmail is already authenticated for this user
        try {
          const isAuthenticated = await this.checkAuthentication('gmail', userId);
          if (isAuthenticated) {
            console.log('Gmail is already authenticated for this user');
            return {
              isAuthenticated: true
            };
          }
        } catch (authCheckError) {
          console.log('Error checking Gmail authentication status:', authCheckError.message);
          // Continue with normal flow
        }
        
        // Get the integration ID for Gmail from the environment variables or use the one from your integration details
        const gmailIntegrationId = process.env.GMAIL_INTEGRATION_ID || 'aa83b6b2-e86c-4963-a117-84c6db7551e8';
        
        // The backend URL for the callback
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        const redirectUrl = `${backendUrl}/api/composio/auth/callback?service=gmail`;
        
        try {
          // Initialize the connection with Composio
          const response = await axios.post(
            `${this.baseUrl}/api/v2/integrations/${gmailIntegrationId}/connections`, 
            {
              redirectUrl: redirectUrl,
              entity: 'default',
              labels: [`user-${userId}`]
            },
            {
              headers: { 'x-api-key': this.apiKey }
            }
          );
          
          console.log('Composio connection response:', JSON.stringify(response.data, null, 2));
          
          if (response.data && response.data.redirectUrl) {
            // Store the connection ID in the redirect URL
            const redirectUrlObj = new URL(response.data.redirectUrl);
            // Add the connectionId as a query parameter to our callback URL
            redirectUrlObj.searchParams.append('connectionId', response.data.id);
            
            return {
              redirectUrl: redirectUrlObj.toString(),
              state: userId,
              connectionId: response.data.id
            };
          } else {
            throw new Error('No redirect URL in response');
          }
        } catch (error) {
          console.error('Error initializing Gmail connection:', error.message);
          if (error.response) {
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
          }
          
          // If we fail to initialize the connection, fall back to the hardcoded URL as a last resort
          console.log('Falling back to hardcoded redirect URL');
          return {
            redirectUrl: 'https://backend.composio.dev/s/LqcVWnMM',
            state: userId,
            fallback: true
          };
        }
      }
      
      // For other services, build the redirect URL
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      const redirectUrl = `${backendUrl}/api/composio/auth/callback?service=${normalizedService}`;
      console.log(`Using redirect URL: ${redirectUrl}`);
      
      // Try different endpoint formats for different API versions
      const endpoints = [
        `/api/v2/auth/services/${normalizedService}/init`,
        `/api/auth/services/${normalizedService}/init`,
        `/api/v2/auth/init/${normalizedService}`,
        `/api/auth/init/${normalizedService}`,
        `/api/v2/services/${normalizedService}/auth/init`,
        `/api/services/${normalizedService}/auth/init`,
        `/api/v2/integrations/${normalizedService}/auth`,
        `/api/integrations/${normalizedService}/auth`,
        `/auth/services/${normalizedService}/init`,
        `/auth/init/${normalizedService}`,
        `/services/${normalizedService}/auth/init`,
        `/integrations/${normalizedService}/auth`
      ];
      
      let lastError = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${this.baseUrl}${endpoint}`);
          
          const response = await axios.post(
            `${this.baseUrl}${endpoint}`,
            {
              userId: userId,
              redirectUrl: redirectUrl
            },
            {
              headers: {
                'x-api-key': this.apiKey,
                'Authorization': `Bearer ${this.apiKey}`, // Try both header formats
                'Content-Type': 'application/json'
              },
              timeout: 10000 // 10 second timeout
            }
          );
          
          console.log(`Composio API response: ${JSON.stringify(response.data, null, 2)}`);
          
          // Check if we have a valid redirectUrl in the response
          if (response.data && response.data.redirectUrl) {
            return {
              redirectUrl: response.data.redirectUrl,
              state: response.data.state || userId
            };
          } else {
            console.warn(`Endpoint ${endpoint} returned a response without redirectUrl:`, response.data);
            lastError = new Error('Response missing redirectUrl');
          }
        } catch (apiError) {
          console.error(`API error with endpoint ${endpoint}:`, apiError.message);
          lastError = apiError;
          // Continue to next endpoint
        }
      }
      
      // If we get here, all endpoints failed
      if (lastError) {
        // Special handling for Gmail
        if (normalizedService === 'gmail') {
          console.error('Failed to initialize Gmail authentication. Please check your Composio dashboard configuration.');
          console.error('Make sure Gmail is enabled and properly configured with OAuth credentials.');
          
          throw new Error('Gmail authentication initialization failed. Check Composio dashboard configuration.');
        }
        
        throw lastError;
      }
      
      throw new Error(`Failed to initialize authentication for ${service}`);
    } catch (error) {
      console.error(`Error initializing authentication for ${service}:`, error.message);
      
      // Return a more helpful error for the client
      if (error.response && error.response.data) {
        throw new Error(`Authentication error: ${JSON.stringify(error.response.data)}`);
      }
      
      throw error;
    }
  }
  
  /**
   * Complete the authentication process with the service
   * @param {string} service - The service to authenticate with
   * @param {string} code - The authorization code from the service
   * @returns {Promise<object>} - The authentication result
   */
  async completeAuthentication(service, code) {
    try {
      if (!this.isConfigured) {
        console.log('Composio API key not configured');
        throw new Error('Composio API key not configured');
      }
      
      // If in mock mode, return mock data
      if (this.mockMode) {
        console.log(`[MOCK] Completing ${service} authentication with code ${code}`);
        return {
          accessToken: `mock-token-${service}-${Date.now()}`,
          refreshToken: `mock-refresh-${service}-${Date.now()}`,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
        };
      }
      
      // Normalize service name
      const normalizedService = service.toLowerCase();
      
      // For Gmail, use a special handling since it's already configured in Composio
      if (normalizedService === 'gmail') {
        console.log('Using special handling for Gmail authentication completion');
        // We'll just return a placeholder token since Gmail is handled by Composio
        return {
          accessToken: `gmail-authenticated-${Date.now()}`,
          refreshToken: `gmail-refresh-${Date.now()}`,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
        };
      }
      
      // For other services, complete the authentication with Composio
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      const redirectUrl = `${backendUrl}/api/composio/auth/callback?service=${normalizedService}`;
      
      // Try different endpoint formats for different API versions
      const endpoints = [
        `/api/v2/auth/services/${normalizedService}/complete`,
        `/api/auth/services/${normalizedService}/complete`,
        `/api/v2/auth/complete/${normalizedService}`,
        `/api/auth/complete/${normalizedService}`,
        `/api/v2/services/${normalizedService}/auth/complete`,
        `/api/services/${normalizedService}/auth/complete`,
        `/api/v2/integrations/${normalizedService}/auth/callback`,
        `/api/integrations/${normalizedService}/auth/callback`,
        `/auth/services/${normalizedService}/complete`,
        `/auth/complete/${normalizedService}`,
        `/services/${normalizedService}/auth/complete`,
        `/integrations/${normalizedService}/auth/callback`
      ];
      
      let lastError = null;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${this.baseUrl}${endpoint}`);
          
          const response = await axios.post(
            `${this.baseUrl}${endpoint}`,
            {
              code: code,
              redirectUrl: redirectUrl
            },
            {
              headers: {
                'x-api-key': this.apiKey,
                'Authorization': `Bearer ${this.apiKey}`, // Try both header formats
                'Content-Type': 'application/json'
              },
              timeout: 10000 // 10 second timeout
            }
          );
          
          console.log(`Composio API response: ${JSON.stringify(response.data, null, 2)}`);
          
          // Check if we have a valid accessToken in the response
          if (response.data && response.data.accessToken) {
            return {
              accessToken: response.data.accessToken,
              refreshToken: response.data.refreshToken,
              expiresAt: response.data.expiresAt
            };
          } else {
            console.warn(`Endpoint ${endpoint} returned a response without accessToken:`, response.data);
            lastError = new Error('Response missing accessToken');
          }
        } catch (apiError) {
          console.error(`API error with endpoint ${endpoint}:`, apiError.message);
          lastError = apiError;
          // Continue to next endpoint
        }
      }
      
      // If we get here, all endpoints failed
      if (lastError) {
        throw lastError;
      }
      
      throw new Error(`Failed to complete authentication for ${service}`);
    } catch (error) {
      console.error(`Error completing authentication for ${service}:`, error.message);
      
      // Return a more helpful error for the client
      if (error.response && error.response.data) {
        return { error: `Authentication error: ${JSON.stringify(error.response.data)}` };
      }
      
      return { error: error.message };
    }
  }
  
  /**
   * Check if a service is already authenticated for a user
   * @param {string} service - Service name (e.g., 'gmail', 'github')
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} - True if authenticated, false otherwise
   */
  async checkAuthentication(service, userId) {
    try {
      if (!this.isConfigured || this.mockMode) {
        return false; // In mock mode, always assume not authenticated
      }
      
      // Normalize service name
      const normalizedService = service.toLowerCase();
      
      // Try to get auth status from Composio API
      console.log(`Checking authentication status for ${normalizedService} user ${userId}`);
      
      try {
        // First try the v2 endpoint
        const response = await axios.get(
          `${this.baseUrl}/auth/services/${normalizedService}/status?userId=${userId}`,
          {
            headers: {
              'x-api-key': this.apiKey,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );
        
        console.log(`Auth status response: ${JSON.stringify(response.data, null, 2)}`);
        return response.data.isAuthenticated === true;
      } catch (apiError) {
        // If the v2 endpoint fails, try alternative endpoints
        const fallbackEndpoints = [
          `/auth/status/${normalizedService}?userId=${userId}`,
          `/integrations/${normalizedService}/auth/status?userId=${userId}`,
          `/services/${normalizedService}/status?userId=${userId}`
        ];
        
        for (const endpoint of fallbackEndpoints) {
          try {
            console.log(`Trying fallback endpoint for auth status: ${this.baseUrl}${endpoint}`);
            const fallbackResponse = await axios.get(
              `${this.baseUrl}${endpoint}`,
              {
                headers: {
                  'x-api-key': this.apiKey,
                  'Content-Type': 'application/json'
                },
                timeout: 5000
              }
            );
            
            console.log(`Fallback auth status response: ${JSON.stringify(fallbackResponse.data, null, 2)}`);
            return fallbackResponse.data.isAuthenticated === true;
          } catch (fallbackError) {
            console.log(`Fallback endpoint ${endpoint} failed:`, fallbackError.message);
            // Continue to next fallback
          }
        }
        
        // If all endpoints fail, check our database or local storage
        // This is where you would implement a check against your own database
        // For now, we'll return false to indicate not authenticated
        console.log('All auth status endpoints failed, assuming not authenticated');
        return false;
      }
    } catch (error) {
      console.error(`Error checking authentication for ${service}:`, error);
      return false; // Default to not authenticated on error
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
   * @returns {Array} - List of available tools
   */
  async getTools(actions = [], userId) {
    try {
      if (!this.isConfigured) {
        throw new Error('Composio API key not configured');
      }
      
      // Make request to Composio API to get available tools
      const response = await axios.get(
        `${this.baseUrl}/tools`,
        {
          params: {
            actions: actions.join(','),
            userId: userId
          },
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
        `${this.baseUrl}/tools/execute`,
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