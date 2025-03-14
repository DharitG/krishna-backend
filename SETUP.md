# Setting Up the August Backend

This guide will help you set up the backend API for the August app using Supabase.

## Prerequisites

1. Node.js (v14+)
2. Supabase account
3. Azure OpenAI access
4. Composio API key (optional, for tool capabilities)

## Step 1: Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. After the project is created, go to the SQL Editor
3. Copy the contents of `supabase/schema.sql` from this repository
4. Paste and run the SQL in the Supabase SQL Editor to create the necessary tables and policies
5. Make note of your project URL and API keys (found in Project Settings > API)

## Step 2: Configure Environment Variables

1. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Edit the `.env` file and add your:
   - Supabase URL and API keys
   - Azure OpenAI credentials
   - Composio API key (if available)

## Step 3: Install Dependencies

Install the required npm packages:

```bash
npm install
```

## Step 4: Start the Server

For development:

```bash
npm run dev
```

For production:

```bash
npm start
```

The server should now be running at `http://localhost:3000` (or whatever port you configured).

## Step 5: Configure the Mobile App

Update the August mobile app to connect to this backend by:

1. Creating a `.env` file in the mobile app directory
2. Adding your Supabase and Backend API URL details
3. Adding the following to the app's `.env`:
   ```
   API_URL=http://localhost:3000/api
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

## Authentication Flow

The backend uses Supabase Authentication:

1. Users sign up/log in through the mobile app using Supabase Auth
2. Upon successful authentication, Supabase returns a JWT token
3. The mobile app includes this token in the `Authorization` header for API requests
4. The backend verifies the token with Supabase before processing requests

## Testing the Setup

To verify your setup is working:

1. Check the API health endpoint: `http://localhost:3000/health`
2. Try registering a new user through the Supabase Auth UI
3. Verify the user appears in the Supabase Dashboard under Authentication > Users
4. Verify a corresponding profile is created in the `profiles` table

## Troubleshooting

Common issues:

- **Supabase connection errors**: Check your Supabase URL and API keys
- **"Invalid JWT" errors**: Ensure the client is sending the correct Authorization header
- **Azure OpenAI errors**: Check your API key and ensure your deployment is active
- **"Cannot find module" errors**: Run `npm install` to ensure all dependencies are installed

## Database Schema

The backend uses the following tables in Supabase:

1. `profiles` - User profile information
2. `chats` - Chat conversations and messages
3. `service_tokens` - Authentication tokens for third-party services

Row Level Security (RLS) is enabled on all tables to ensure users can only access their own data.