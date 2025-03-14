# August Backend API

This is the backend API for the August AI Super Agent mobile app. It handles authentication, user management, and integrations with external services like Composio and Azure OpenAI.

## Features

- User authentication via Supabase
- Chat history storage and management
- Integration with Azure OpenAI for AI conversations
- Composio integration for tool capabilities (GitHub, Gmail, Slack, etc.)
- User preferences and settings management

## Technology Stack

- **Node.js/Express**: Backend API framework
- **Supabase**: Authentication and database
- **Azure OpenAI**: AI chat capabilities
- **Composio**: Tool integrations for productivity

## Getting Started

See [SETUP.md](./SETUP.md) for detailed instructions on how to set up the backend.

## API Endpoints

### User Management

- `GET /api/user/profile`: Get user profile
- `PUT /api/user/profile`: Update user profile
- `GET /api/user/auth-status`: Get authentication status for services

### Preferences

- `GET /api/preferences`: Get user preferences
- `PUT /api/preferences`: Update user preferences

### Chat

- `GET /api/chats`: Get all user chats
- `POST /api/chats`: Create a new chat
- `GET /api/chats/:chatId`: Get chat by ID
- `PUT /api/chats/:chatId`: Update chat details
- `DELETE /api/chats/:chatId`: Delete a chat
- `POST /api/chats/:chatId/messages`: Send a message in a chat
- `GET /api/chats/:chatId/messages`: Get messages from a chat

### Composio Integration

- `POST /api/composio/auth/init/:service`: Initialize authentication with a service
- `GET /api/composio/auth/callback`: Authentication callback endpoint
- `GET /api/composio/tools`: Get available tools
- `POST /api/composio/execute`: Execute tool calls

### Health Check

- `GET /health`: API health check endpoint (no auth required)

## Database Schema

The backend uses Supabase with the following tables:

1. `profiles` - User profile information
2. `chats` - Chat conversations and messages
3. `service_tokens` - Authentication tokens for third-party services

Row Level Security (RLS) is enabled on all tables to ensure users can only access their own data.

## Authentication

The backend uses Supabase Authentication, which provides:

- Email/password login
- Social login (Google, GitHub, etc.)
- Magic link authentication
- JWT-based auth with secure token handling

## License

ISC