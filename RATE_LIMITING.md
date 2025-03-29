# Rate Limiting System

This document outlines the rate limiting implementation for the backend API. The system includes both subscription-based rate limiting for authenticated users and IP-based rate limiting for protection against attacks.

## Overview

The rate limiting system consists of two main components:

1. **Subscription-Based Rate Limiting**: Limits API requests based on the user's subscription tier
2. **IP-Based Rate Limiting**: Protects public endpoints from abuse and DDoS attacks

## Subscription-Based Rate Limiting

### Tiers and Limits

| Tier    | Daily Request Limit |
|---------|---------------------|
| Free    | 10 requests         |
| Eden    | 100 requests        |
| Utopia  | Unlimited           |

### Implementation

Subscription-based rate limiting is implemented in:
- `ratelimit.service.js`: Core service that manages rate limits
- `ratelimit.middleware.js`: Express middleware that applies limits to routes

The system tracks request counts per user per day and stores this information in:
- Database (Supabase): For persistent storage
- Redis: For distributed caching (when available)
- In-memory cache: As a fallback when Redis is unavailable

### Headers

When rate limiting is applied, the following headers are included in responses:

```
X-RateLimit-Limit: [maximum requests per day]
X-RateLimit-Remaining: [remaining requests for the day]
X-RateLimit-Plan: [user's subscription plan]
```

## IP-Based Rate Limiting

### Rate Limits

| Route Type      | Time Window | Request Limit |
|-----------------|-------------|---------------|
| Public routes   | 15 minutes  | 100 requests  |
| Auth routes     | 1 hour      | 10 requests   |
| Webhook routes  | 5 minutes   | 60 requests   |
| Sensitive ops   | 24 hours    | 3 requests    |

### Implementation

IP-based rate limiting is implemented in `ip-ratelimit.middleware.js` using the `express-rate-limit` package.

Key features:
- Uses Redis for distributed rate limiting when available
- Falls back to in-memory storage when Redis is unavailable
- Handles X-Forwarded-For headers for proper IP detection behind proxies
- Configurable trusted IPs for webhook providers
- Skips rate limiting for health check endpoints

## Caching Strategy

The system uses a multi-layered caching approach:

1. **Redis Cache**:
   - Primary cache for production environments
   - Provides distributed caching across multiple instances
   - Automatically expires keys based on rate limit windows

2. **In-Memory Cache**:
   - Fallback when Redis is unavailable
   - Plan cache: 1 hour TTL
   - Request count cache: 5 minutes TTL

## Security Considerations

- Rate limited routes return `429 Too Many Requests` when limits are exceeded
- Authentication routes have stricter limits to prevent brute force attacks
- Webhook routes have specialized limits to prevent webhook spam
- Sensitive operations have very strict limits (password reset, etc.)
- IP addresses are properly extracted even when behind proxies
- Health check endpoints are excluded from rate limiting

## Configuration

Configuration is managed through environment variables:

```
# Redis connection
REDIS_URL=redis://username:password@redis-host:6379

# Trusted IPs for webhooks (comma-separated)
TRUSTED_WEBHOOK_IPS=34.235.143.13,52.87.73.209
```

## Resetting Rate Limits

Rate limits can be reset programmatically via:
1. API endpoint: `POST /api/subscription/reset-limit` (authenticated)
2. Webhook handler: `clearRateLimitCache(userId)` function

## Implementation Notes

- The system is resilient to Redis failures, falling back to in-memory caching
- Rate limiting decisions are logged for monitoring and debugging
- Redis connections are configured with retry strategies and connection monitoring 