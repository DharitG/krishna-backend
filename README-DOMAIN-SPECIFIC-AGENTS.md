# Domain-Specific Agents with Composio Use-Case Search

This document explains how to use the newly implemented use-case search functionality and domain-specific agents in the August app.

## Overview

Instead of creating a single agent with all possible tools, you can now create specialized agents that focus on specific domains or tasks. This approach has several advantages:

1. **Reduced Context Window Usage**: Only relevant tools are loaded, saving valuable context space
2. **Improved Performance**: Agents with fewer, more focused tools tend to perform better
3. **More Natural Interactions**: Users can describe what they want in plain language
4. **Dynamic Tool Selection**: Tools are selected based on the current conversation context

## Use-Case Search API

The use-case search functionality allows you to find relevant Composio actions based on natural language descriptions.

### Finding Actions by Use Case

```javascript
// Client-side example
const response = await fetch('/api/composio/actions/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    useCase: 'send an email with an attachment',
    advanced: false, // Set to true for complex workflows requiring multiple tools
    apps: [] // Optional filter by specific apps, e.g. ['GMAIL', 'NOTION']
  })
});

const data = await response.json();
// data.actions will contain the list of action names matching the use case
```

### Executing a Specific Action

```javascript
// Client-side example
const response = await fetch('/api/composio/actions/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    action: 'GMAIL_SEND_EMAIL',
    params: {
      to: 'recipient@example.com',
      subject: 'Hello from August',
      body: 'This is a test email'
    }
  })
});

const result = await response.json();
// result will contain the execution result
```

## Domain-Specific Agents

Domain-specific agents are LangChain agents that are created with only the tools needed for a specific task or domain.

### Creating a Domain-Specific Agent

```javascript
// Client-side example
const response = await fetch('/api/langchain/domain-agent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    useCase: 'manage my calendar and schedule meetings',
    advanced: true, // Get multiple related tools
    apps: ['GOOGLECALENDAR'] // Optional filter
  })
});

const data = await response.json();
// data will contain information about the created agent
```

### Processing Messages with a Domain-Specific Agent

```javascript
// Client-side example
const response = await fetch('/api/langchain/domain-process', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Schedule a meeting with John tomorrow at 2pm' }
    ],
    useCase: 'manage my calendar and schedule meetings',
    advanced: true,
    apps: ['GOOGLECALENDAR'],
    authStatus: {
      // Include authentication status for relevant services
      googlecalendar: true
    }
  })
});

const result = await response.json();
// result will contain the assistant's response
```

## Integration with Chat Interface

To integrate domain-specific agents with the chat interface, you can modify your chat component to detect when a specific domain is being discussed and dynamically create the appropriate agent.

### Example Implementation

```javascript
// Detect the domain from the user's message
function detectDomain(message) {
  const domains = {
    email: ['email', 'gmail', 'message', 'send', 'inbox'],
    calendar: ['calendar', 'schedule', 'meeting', 'appointment'],
    github: ['github', 'repository', 'code', 'pull request', 'issue'],
    // Add more domains as needed
  };
  
  const messageLower = message.toLowerCase();
  
  for (const [domain, keywords] of Object.entries(domains)) {
    if (keywords.some(keyword => messageLower.includes(keyword))) {
      return domain;
    }
  }
  
  return 'general';
}

// Map domains to use cases
const domainUseCases = {
  email: 'manage and send emails',
  calendar: 'manage my calendar and schedule meetings',
  github: 'work with GitHub repositories and issues',
  general: ''
};

// Process a message with the appropriate domain-specific agent
async function processMessage(message, userId) {
  const domain = detectDomain(message);
  const useCase = domainUseCases[domain];
  
  if (domain === 'general' || !useCase) {
    // Use the general agent for generic requests
    return processWithGeneralAgent(message, userId);
  }
  
  // Use a domain-specific agent
  return processWithDomainSpecificAgent(message, useCase, userId);
}
```

## Best Practices

1. **Start with Broad Domains**: Begin with a few broad domains (email, calendar, task management) rather than very specific ones.

2. **Use the `advanced` Flag Wisely**: Set `advanced: true` when you expect the task might require multiple related tools working together.

3. **Provide Fallbacks**: Always have a fallback to the general agent if no domain-specific agent can handle the request.

4. **Cache Agent Results**: Consider caching the results of use-case searches to avoid repeated API calls for similar requests.

5. **Monitor Performance**: Track which domains and use cases are most effective and refine your approach based on real usage data.

## Limitations

1. The use-case search is experimental and may not always return the most relevant actions.

2. Creating too many specialized agents could lead to increased API usage and latency.

3. The current implementation does not persist agent state between requests, so each request creates a new agent.

## Future Improvements

1. Implement agent routing based on conversation context analysis
2. Add support for progressive tool loading during conversations
3. Develop a caching mechanism for frequently used domain-specific agents
4. Create a feedback loop to improve domain detection and use-case mapping
