# Setting Up Composio for Gmail Integration

This guide explains how to set up Composio for Gmail integration with the August app.

## Prerequisites

1. Composio account (sign up at [app.composio.dev](https://app.composio.dev/))
2. Gmail account

## Step 1: Get Your Composio API Key

1. Sign up or log in to [Composio](https://app.composio.dev/)
2. After logging in, you'll be able to access your API key from the dashboard
3. Copy your API key and add it to your backend's `.env` file:
   ```
   COMPOSIO_API_KEY=your-composio-api-key
   ```

## Step 2: Set Up Gmail Integration in Composio

1. Navigate to [https://app.composio.dev/apps](https://app.composio.dev/apps)
2. Search for "Gmail" in the search box
3. Click on the purple "Integration Setup" button
4. Click on the purple button again to connect to Google's OAuth authentication page
5. You'll see a Google Auth page - authorize the connection
6. After authorization, you'll be redirected back to Composio as an authenticated user

## Step 3: Configure Your Backend

1. Make sure your backend URL is correctly set in the `.env` file:
   ```
   BACKEND_URL=http://localhost:3000
   ```
   
   > **Note:** For production, this should be your actual backend URL.

2. The redirect URL in Composio must match the callback URL in your backend:
   ```
   ${BACKEND_URL}/api/composio/auth/callback?service=gmail
   ```

## Step 4: Verify the Integration

1. Go to Composio's integration page under Apps > Integrations
2. Click on the "Open" button in front of Gmail
3. Verify that your Gmail account is connected

## Troubleshooting

If you encounter a "400 error" when authenticating with Gmail, check the following:

1. Ensure your Composio API key is correctly set in your backend's `.env` file
2. Verify that your backend URL is correctly set in your `.env` file
3. Make sure Gmail is properly configured in the Composio dashboard
4. Check that the redirect URL in Composio matches the callback URL in your backend

If you can't connect to the Composio API (`getaddrinfo ENOTFOUND api.composio.dev`), the backend will automatically switch to mock mode, which allows you to continue development without a Composio connection.
