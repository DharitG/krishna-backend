# August Backend API

This directory contains the backend API for the August AI Super Agent mobile app. It handles authentication, user management, chat processing, and integrations with external services.

## Features

*   User authentication via Supabase
*   Chat history storage and management
*   Integration with Azure OpenAI via LangChain for AI conversations
*   Composio integration for tool capabilities (GitHub, Gmail, Slack, etc.)
*   Subscription management via RevenueCat
*   User preferences and settings management
*   Cross-conversation memory system (using pgvector)
*   Rate limiting (Subscription-based and IP-based)

## Technology Stack

*   **Node.js/Express**: Backend API framework
*   **Supabase**: Authentication and PostgreSQL database
*   **LangChain.js**: AI agent framework
*   **Azure OpenAI**: AI chat and embedding models
*   **Composio**: Tool integration layer
*   **RevenueCat**: Subscription management
*   **pgvector**: Vector storage for memory system

## Documentation

**For detailed setup instructions, architecture information, API reference, feature guides, and more, please refer to the main project documentation located in the `/docs` directory at the root of the repository.**

Key relevant documents include:

*   **[Backend Setup Guide](../../docs/getting-started/backend-setup.md)**
*   **[External Service Integration Setup](../../docs/getting-started/integrations-setup.md)**
*   **[API Reference](../../docs/api/README.md)**
*   **[AI Agent Architecture](../../docs/features/ai-agents.md)**
*   **[Subscription System Guide](../../docs/features/subscriptions.md)**
*   **[Main Project Documentation](../../docs/README.md)**

## Development

Once setup is complete (following the guides in `/docs`), you can run the server in development mode from this directory:

```bash
# Ensure dependencies are installed
# npm install or yarn install

# Start the server in development mode (with auto-reloading)
npm run dev 
```

To run in production mode:
```bash
npm start
```

## License

ISC
