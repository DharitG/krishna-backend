const { ChatOpenAI } = require("@langchain/openai");
const { createOpenAIFunctionsAgent, AgentExecutor } = require("langchain/agents");
const { pull } = require("langchain/hub");
const { LangchainToolSet } = require("composio-core");
const { AUGUST_SYSTEM_PROMPT } = require("../config/august-system-prompt");

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
    const entity = this.toolset.client.getEntity(entityId);
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
  }

  async createAgent(userId, enabledTools = [], authStatus = {}) {
    if (!this.isConfigured) {
      throw new Error('LangChain service not fully configured');
    }
    
    // Create entity and get tools
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
      
      // Invoke the agent with the last user message and chat history
      const result = await agentExecutor.invoke({
        input: lastUserMessage.content,
        chat_history: history.slice(0, -1) // Exclude the last message as it's the input
      });
      
      return {
        role: 'assistant',
        content: result.output
      };
    } catch (error) {
      console.error('Error processing message with LangChain:', error);
      throw error;
    }
  }

  async getStreamingAgentResponse(messages, enabledTools = [], userId = 'default-user') {
    if (!this.isConfigured) {
      throw new Error('LangChain service not fully configured');
    }

    // Check if tools are actually needed
    const useTools = enabledTools && enabledTools.length > 0;
    
    if (!useTools) {
      // If no tools are needed, use the OpenAI service directly
      console.log('No tools needed, using OpenAI service directly');
      const openaiService = require('./openai.service');
      return openaiService.generateChatCompletionStream(messages);
    }
    
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
    
    // Create a streaming response
    const stream = await agentExecutor.streamEvents({
      input: lastUserMessage.content,
      chat_history: history.slice(0, -1) // Exclude the last message as it's the input
    }, {
      version: "v1",
    });
    
    // Transform the stream to match our expected format
    const transformedStream = {
      async *[Symbol.asyncIterator]() {
        let currentContent = '';
        
        for await (const event of stream) {
          if (event.event === 'on_chat_model_stream' && event.data?.chunk?.content) {
            currentContent += event.data.chunk.content;
            yield { content: currentContent };
          } else if (event.event === 'on_tool_start') {
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
      }
    };
    
    return transformedStream;
  }
}

module.exports = new LangChainService();
