const { ChatOpenAI } = require("@langchain/openai");
const { createOpenAIFunctionsAgent, AgentExecutor } = require("langchain/agents");
const { pull } = require("langchain/hub");
const { LangchainToolSet } = require("composio-core");
const { AUGUST_SYSTEM_PROMPT } = require("../config/august-system-prompt");
const composioService = require("./composio.service");
const memoryService = require('./memory.service'); // Import memory service

class LangChainService {
  constructor() {
    this.apiKey = process.env.AZURE_OPENAI_API_KEY;
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    this.composioApiKey = process.env.COMPOSIO_API_KEY;
    this.isConfigured = !!(this.apiKey && this.endpoint && this.composioApiKey);

    if (!this.isConfigured) {
      console.warn('LangChain service not fully configured. Features will be limited.');
      return;
    }

    this.toolset = new LangchainToolSet({ apiKey: this.composioApiKey });
  }

  async setupUserConnectionIfNotExists(entityId, appName) {
    if (!this.isConfigured) {
      throw new Error('LangChain service not fully configured');
    }

    try {
      // Create entity
      const entity = this.toolset.client.getEntity(entityId);

      // Check if connection exists
      const connection = await entity.getConnection({ appName });

      if (!connection) {
        // If this entity/user hasn't already connected the account
        const newConnection = await entity.initiateConnection({ appName });
        console.log(`Log in via: ${newConnection.redirectUrl}`);
        return {
          redirectUrl: newConnection.redirectUrl,
          needsAuth: true,
          appName
        };
      }

      return { needsAuth: false };
    } catch (error) {
      console.error(`Error setting up connection for ${appName}:`, error);
      throw error;
    }
  }

  /**
   * Create a domain-specific agent based on a use case description
   * @param {string} userId - User ID
   * @param {string} useCase - Description of what the user is trying to accomplish
   * @param {boolean} advanced - Whether to return multiple tools for complex workflows
   * @param {Array} apps - Optional list of apps to filter by
   * @returns {Object} - Agent instance
   */
  async createDomainSpecificAgent(userId, useCase, advanced = false, apps = []) {
    if (!this.isConfigured) {
      throw new Error('LangChain service not fully configured');
    }

    try {
      // Find actions that match the use case
      const actions = await composioService.findActionsByUseCase(useCase, advanced, apps);

      if (!actions || actions.length === 0) {
        console.warn(`No actions found for use case: ${useCase}`);
        // Fall back to creating a general agent with no specific tools
        return this.createAgent(userId, []);
      }

      console.log(`Creating domain-specific agent for use case: ${useCase}`);
      console.log(`Found ${actions.length} matching actions:`, actions);

      // Create an agent with the specific actions found
      return this.createAgent(userId, actions);
    } catch (error) {
      console.error('Error creating domain-specific agent:', error);
      throw error;
    }
  }

  async createAgent(userId, enabledTools = [], authStatus = {}) {
    if (!this.isConfigured) {
      throw new Error('LangChain service not fully configured');
    }

    try {
      // Create entity
      const entity = this.toolset.client.getEntity(userId);

      // Map enabledTools to Composio action format
      const actions = enabledTools.map(tool => tool.toLowerCase());

      // Get tools from Composio
      const tools = await this.toolset.getTools({ actions }, entity.id);

      // Create an agent with Azure OpenAI
      const prompt = await pull("hwchase17/openai-functions-agent");
      const llm = new ChatOpenAI({
        azureOpenAIApiKey: this.apiKey,
        azureOpenAIApiVersion: "2024-10-21",
        azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        azureOpenAIApiInstanceName: new URL(this.endpoint).hostname.split('.')[0],
        temperature: 0.7,
        systemMessage: AUGUST_SYSTEM_PROMPT,
      });

      const agent = await createOpenAIFunctionsAgent({
        llm,
        tools,
        prompt,
      });

      return new AgentExecutor({
        agent,
        tools,
        verbose: true,
      });
    } catch (error) {
      console.error('Error creating agent:', error);
      throw error;
    }
  }

  /**
   * Check if a tool call requires authentication and if the user is authenticated
   * @param {Object} toolCall - The tool call object
   * @param {Object} authStatus - Authentication status for various services
   * @returns {Object} - Authentication check result
   */
  async checkToolAuthRequirement(toolCall, authStatus = {}) {
    try {
      // Extract the tool name from the function name
      const functionName = toolCall.function.name;

      // Map function names to service names (this is a simplified mapping)
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

      // Try to determine the service from the function name
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

      // If no service mapping found, assume no auth needed
      if (!service) {
        return { needsAuth: false };
      }

      // Check if the user is authenticated for this service
      const isAuthenticated = authStatus[service] === true;

      return {
        needsAuth: !isAuthenticated,
        service: service
      };
    } catch (error) {
      console.error('Error checking tool auth requirement:', error);
      return { needsAuth: false };
    }
  }

  /**
   * Process tool calls and handle authentication requirements
   * @param {Array} toolCalls - Array of tool calls from the LLM
   * @param {Object} authStatus - Authentication status for various services
   * @param {String} userId - User ID
   * @returns {Object} - Processed result with auth requirements if needed
   */
  async processToolCalls(toolCalls, authStatus = {}, userId) {
    try {
      // Check if any tool calls require authentication
      for (const toolCall of toolCalls) {
        const authCheck = await this.checkToolAuthRequirement(toolCall, authStatus);

        if (authCheck.needsAuth) {
          // Tool requires authentication and user is not authenticated
          return {
            requiresAuth: true,
            service: authCheck.service,
            authRequestTag: `[AUTH_REQUEST:${authCheck.service}]`,
            message: `I need to connect to your ${authCheck.service} account to perform this action. This is a one-time setup that keeps your data secure.`
          };
        }
      }

      // All tools are authenticated, process the tool calls
      const result = await composioService.handleToolCalls(toolCalls, authStatus, userId);
      return {
        requiresAuth: false,
        result
      };
    } catch (error) {
      console.error('Error processing tool calls:', error);
      throw error;
    }
  }

  async getStreamingAgentResponse(messages, enabledTools = [], userId = 'default-user', authStatus = {}) {
    if (!this.isConfigured) {
      throw new Error('LangChain service not fully configured');
    }

    // Check if tools are actually needed
    const useTools = enabledTools && enabledTools.length > 0;

    console.log(`getStreamingAgentResponse called with: userId=${userId}, useTools=${useTools}, enabledTools=${enabledTools.join(',')}`);
    console.log('Current authStatus:', authStatus);

    if (!useTools) {
      // If no tools are needed, use the OpenAI service directly
      console.log('No tools needed, using OpenAI service directly');
      const openaiService = require('./openai.service');
      return openaiService.generateChatCompletionStream(messages);
    }

    try {
      // Create entity and get tools
      const entity = this.toolset.client.getEntity(userId);

      // Map enabledTools to Composio action format
      const actions = enabledTools.map(tool => tool.toLowerCase());

      // Get tools from Composio
      const tools = await this.toolset.getTools({ actions }, entity.id);

      // Create an agent with Azure OpenAI with streaming capability
      const prompt = await pull("hwchase17/openai-functions-agent");
      const llm = new ChatOpenAI({
        azureOpenAIApiKey: this.apiKey,
        azureOpenAIApiVersion: "2024-10-21",
        azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        azureOpenAIApiInstanceName: new URL(this.endpoint).hostname.split('.')[0],
        temperature: 0.7,
        streaming: true,
        systemMessage: AUGUST_SYSTEM_PROMPT,
      });

      const agent = await createOpenAIFunctionsAgent({
        llm,
        tools,
        prompt,
      });

      const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
        returnIntermediateSteps: true,
      });

      // Format messages for LangChain
      const history = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Get the last user message
      const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();

      // --- Start Memory Retrieval with Gemini ---
      let retrievedMemoryContext = '';
      const memoryQuery = lastUserMessage.content;
      try {
        console.log(`(Streaming) Retrieving memories with Gemini for query: "${memoryQuery}"`);
        // Use Gemini-powered memory retrieval for more intelligent selection
        const relevantMemories = await memoryService.retrieveMemoriesWithGemini({
          query: memoryQuery,
          userId: userId,
          limit: 3 // Retrieve top 3 relevant memories
        });

        if (relevantMemories && relevantMemories.length > 0) {
          retrievedMemoryContext = "Relevant information from past conversations:\n" +
            relevantMemories.map(mem => `- ${mem.content}`).join("\n") +
            "\n---\n"; // Add separator
          console.log("(Streaming) Retrieved memory context with Gemini:", retrievedMemoryContext);
        } else {
          console.log("(Streaming) No relevant memories found with Gemini.");
        }
      } catch (memoryError) {
        console.error("(Streaming) Error retrieving memories with Gemini:", memoryError);
        // Fall back to standard retrieval if Gemini fails
        try {
          console.log(`(Streaming) Falling back to standard memory retrieval for query: "${memoryQuery}"`);
          const fallbackMemories = await memoryService.retrieveMemories({
            query: memoryQuery,
            userId: userId,
            limit: 3
          });

          if (fallbackMemories && fallbackMemories.length > 0) {
            retrievedMemoryContext = "Relevant information from past conversations:\n" +
              fallbackMemories.map(mem => `- ${mem.content}`).join("\n") +
              "\n---\n"; // Add separator
            console.log("(Streaming) Retrieved memory context with fallback:", retrievedMemoryContext);
          }
        } catch (fallbackError) {
          console.error("(Streaming) Error in fallback memory retrieval:", fallbackError);
          // Continue without memory context if all retrieval methods fail
        }
      }
      // --- End Memory Retrieval ---

      // Prepend memory context to the input
      const agentInput = retrievedMemoryContext + lastUserMessage.content;

      // Create a streaming response
      const stream = await agentExecutor.streamEvents({
        input: agentInput, // Use modified input with memory context
        chat_history: history.slice(0, -1) // Exclude the last message as it's the input
      }, {
        version: "v1",
      });

      // Transform the stream to match our expected format
      const transformedStream = {
        async *[Symbol.asyncIterator]() {
          let currentContent = '';
          let toolCallsToProcess = [];

          for await (const event of stream) {
            if (event.event === 'on_chat_model_stream' && event.data?.chunk?.content) {
              currentContent += event.data.chunk.content;
              yield { content: currentContent };
            } else if (event.event === 'on_tool_start') {
              // Add tool call to the list to process later
              if (event.name && event.data?.input) {
                toolCallsToProcess.push({
                  function: {
                    name: event.name,
                    arguments: event.data.input
                  }
                });
              }

              yield { content: `\n\nUsing tool: ${event.name}...\n` };
            } else if (event.event === 'on_tool_end') {
              if (event.data?.output) {
                const output = typeof event.data.output === 'object'
                  ? JSON.stringify(event.data.output, null, 2)
                  : event.data.output;
                yield { content: `\nTool result: ${output}\n\n` };
              }
            }
          }

          // After stream completes, check if any tool calls need authentication
          if (toolCallsToProcess.length > 0) {
            try {
              console.log(`Processing ${toolCallsToProcess.length} tool calls after streaming`);

              // Process the collected tool calls
              const processedResult = await this.processToolCalls(toolCallsToProcess, authStatus, userId);

              if (processedResult.requiresAuth) {
                console.log(`Tool requires authentication for service: ${processedResult.service}`);
                // Tool requires authentication, yield the auth request
                yield {
                  content: `${processedResult.authRequestTag} ${processedResult.message}`,
                  requiresAuth: true,
                  service: processedResult.service
                };
              }
            } catch (error) {
              console.error('Error processing tool calls after streaming:', error);
            }
          }
        }
      };

      return transformedStream;
    } catch (error) {
      console.error('Error getting streaming agent response:', error);
      throw error;
    }
  }

  async processMessage(userId, messages, enabledTools = [], authStatus = {}) {
    try {
      // Check if tools are actually needed
      const useTools = enabledTools && enabledTools.length > 0;

      if (!useTools) {
        // If no tools are needed, use the OpenAI service directly
        console.log('No tools needed, using OpenAI service directly');
        const openaiService = require('./openai.service');
        return await openaiService.generateChatCompletion(messages);
      }

      // Tools are needed, create an agent
      console.log(`Creating agent with tools: ${enabledTools.join(', ')}`);
      const agentExecutor = await this.createAgent(userId, enabledTools, authStatus);

      // Format messages for LangChain
      const history = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Get the last user message
      const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();

      // --- Start Memory Retrieval with Gemini ---
      let retrievedMemoryContext = '';
      const memoryQuery = lastUserMessage.content;
      try {
        console.log(`Retrieving memories with Gemini for query: "${memoryQuery}"`);
        // Use Gemini-powered memory retrieval for more intelligent selection
        const relevantMemories = await memoryService.retrieveMemoriesWithGemini({
          query: memoryQuery,
          userId: userId,
          limit: 3 // Retrieve top 3 relevant memories
        });

        if (relevantMemories && relevantMemories.length > 0) {
          retrievedMemoryContext = "Relevant information from past conversations:\n" +
            relevantMemories.map(mem => `- ${mem.content}`).join("\n") +
            "\n---\n"; // Add separator
          console.log("Retrieved memory context with Gemini:", retrievedMemoryContext);
        } else {
          console.log("No relevant memories found with Gemini.");
        }
      } catch (memoryError) {
        console.error("Error retrieving memories with Gemini:", memoryError);
        // Fall back to standard retrieval if Gemini fails
        try {
          console.log(`Falling back to standard memory retrieval for query: "${memoryQuery}"`);
          const fallbackMemories = await memoryService.retrieveMemories({
            query: memoryQuery,
            userId: userId,
            limit: 3
          });

          if (fallbackMemories && fallbackMemories.length > 0) {
            retrievedMemoryContext = "Relevant information from past conversations:\n" +
              fallbackMemories.map(mem => `- ${mem.content}`).join("\n") +
              "\n---\n"; // Add separator
            console.log("Retrieved memory context with fallback:", retrievedMemoryContext);
          }
        } catch (fallbackError) {
          console.error("Error in fallback memory retrieval:", fallbackError);
          // Continue without memory context if all retrieval methods fail
        }
      }
      // --- End Memory Retrieval ---

      // Prepend memory context to the input
      const agentInput = retrievedMemoryContext + lastUserMessage.content;

      // Invoke the agent with the last user message and chat history
      const result = await agentExecutor.invoke({
        input: agentInput, // Use modified input with memory context
        chat_history: history.slice(0, -1) // Exclude the last message as it's the input
      });

      // Check if the result contains tool calls that need to be processed
      if (result.intermediateSteps && result.intermediateSteps.length > 0) {
        // Extract tool calls from intermediate steps
        const toolCalls = result.intermediateSteps
          .filter(step => step.action && step.action.tool)
          .map(step => ({
            function: {
              name: step.action.tool,
              arguments: step.action.toolInput
            }
          }));

        if (toolCalls.length > 0) {
          // Process the tool calls and check for auth requirements
          const processedResult = await this.processToolCalls(toolCalls, authStatus, userId);

          if (processedResult.requiresAuth) {
            // Tool requires authentication
            return {
              role: 'assistant',
              content: `${processedResult.authRequestTag} ${processedResult.message}`
            };
          }
        }
      }

      return {
        role: 'assistant',
        content: result.output
      };
    } catch (error) {
      console.error('Error processing message with LangChain:', error);
      throw error;
    }
  }
}

module.exports = new LangChainService();
