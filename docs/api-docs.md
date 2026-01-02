# NativeHub 3.0 - API Documentation

**Base URL**: `http://localhost:3001/api/v1`
**Version**: 3.0.0
**Status**: Phase 06 - Traffic Source Adapters Integrated

---

## Table of Contents

1. [Authentication](#authentication)
2. [Supported Traffic Sources](#supported-traffic-sources)
3. [Campaigns API](#campaigns-api)
4. [Widgets API](#widgets-api)
5. [Optimizer API](#optimizer-api)
6. [Error Handling](#error-handling)
7. [Rate Limiting](#rate-limiting)

---

## Authentication

All API endpoints (except `/health` and `/api/auth/*`) require a valid session via HTTP-only cookies.

### Session Management

NativeHub 3.0 uses **Better Auth** framework for session-based authentication with HTTP-only cookies.

**Key Features**:
- Session tokens stored in secure HTTP-only cookies
- Session expiration: 7 days
- Session update frequency: 24 hours (auto-renewal on activity)
- Cookie prefix: `nativehub_`
- Secure cookies enforced in production
- Cookie cache enabled (5-minute cache window)

### Authentication Endpoints

```
POST /api/auth/sign-in/email       - Email/password login
POST /api/auth/sign-up/email       - Email/password signup
POST /api/auth/sign-out            - Sign out (invalidates session)
GET  /api/auth/get-session         - Retrieve current session
POST /api/auth/verify-email        - Verify email (if enabled)
```

### Request/Response Examples

**Sign In**

```bash
curl -X POST http://localhost:3001/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword"
  }'
```

Response (201 Created):
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "User Name",
    "image": null
  },
  "session": {
    "id": "session-uuid",
    "expiresAt": "2026-01-09T16:00:00Z"
  }
}
```

**Sign Up**

```bash
curl -X POST http://localhost:3001/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "securepassword",
    "name": "New User"
  }'
```

**Get Session**

```bash
curl -X GET http://localhost:3001/api/auth/get-session
```

Response (200 OK):
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "User Name",
    "image": null
  },
  "session": {
    "id": "session-uuid",
    "expiresAt": "2026-01-09T16:00:00Z"
  }
}
```

**Sign Out**

```bash
curl -X POST http://localhost:3001/api/auth/sign-out
```

Response (200 OK):
```json
{
  "success": true
}
```

### Authentication Flow

```
1. User submits credentials to POST /api/auth/sign-in/email or /api/auth/sign-up/email
2. Server validates credentials and creates session
3. Session token stored in HTTP-only cookie (automatically included in requests)
4. Client receives user data and can cache in local state
5. Subsequent requests automatically include session cookie
6. Server validates session via sessionMiddleware
7. Session auto-renewed on each request (if older than updateAge)
```

### Protected Routes

All `/api/v1/*` endpoints require valid session. Missing or invalid session returns **401 Unauthorized**.

**Session Validation in Middleware**:
```typescript
export const sessionMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  c.set("user", session.user)
  c.set("userId", session.user.id)

  await next()
})
```

---

## Supported Traffic Sources

NativeHub 3.0 integrates with 4 major native advertising platforms. Each source has specific authentication requirements and capabilities.

### Source Types & Authentication

| Source | Auth Method | Token Duration | Rate Limit | Credentials |
|--------|------------|---|---|---|
| **Revcontent** | OAuth2 | 1 hour | 100 req/min | clientId, clientSecret |
| **Taboola** | OAuth2 | 1 hour | 100 req/min | clientId, clientSecret, accountId |
| **Outbrain** | Basic auth | 30 days | 30 req/sec | username, password, marketerId |
| **MGID** | API key | Never | 100 req/min | apiKey, clientId |

### Connecting a Traffic Source

When connecting a source account via the Source Accounts API:

```json
{
  "sourceId": "taboola",
  "name": "Q1 Taboola Campaigns",
  "credentials": {
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "accessToken": "your-account-id"
  }
}
```

**Credentials storage**: All credentials are encrypted with AES-256-GCM before storage.

### Source Implementation Details

**Revcontent**
- Standard OAuth2 client credentials flow
- Direct API key authentication
- Straightforward campaign and widget management

**Taboola**
- OAuth2 with account ID passed as accessToken
- Requires account ID for all API operations
- Campaign status: RUNNING, PAUSED, FROZEN, TERMINATED

**Outbrain**
- Basic authentication (username/password) → token exchange
- Tokens valid for 30 days (long-lived)
- **Important**: Only 2 login requests allowed per hour
- Very strict rate limiting (30 req/sec)

**MGID**
- Simple API key authentication (no token exchange)
- No login rate limits
- Most straightforward integration
- API key never expires

---

## Campaigns API

Manage campaign metrics and performance data from connected traffic sources.

### GET /campaigns

List all campaigns for authenticated user.

**Authentication**: Required
**Parameters**:

| Name | Type | Location | Required | Description |
|------|------|----------|----------|-------------|
| sourceAccountId | string | query | No | Filter by specific source account UUID |

**Example Request**:
```bash
curl -X GET "http://localhost:3001/api/v1/campaigns" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"

# With filter
curl -X GET "http://localhost:3001/api/v1/campaigns?sourceAccountId=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer <token>"
```

**Example Response** (200 OK):
```json
{
  "data": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "externalCampaignId": "rev-12345",
      "name": "Q1 Mobile - January Promo",
      "status": "active",
      "enabled": true,
      "budget": 5000.00,
      "bid": 0.25,
      "metrics": {
        "spend": 3245.67,
        "impressions": 125000,
        "clicks": 2500,
        "conversions": 125,
        "ctr": 0.02,
        "cpa": 25.97
      },
      "syncedAt": "2026-01-02T10:30:00Z"
    }
  ]
}
```

**Status Codes**:
- `200 OK` - Success
- `401 Unauthorized` - Missing or invalid token

---

### GET /campaigns/:sourceAccountId/:externalCampaignId

Get single campaign with complete history.

**Authentication**: Required
**Parameters**:

| Name | Type | Location | Required | Description |
|------|------|----------|----------|-------------|
| sourceAccountId | string | path | Yes | UUID of source account |
| externalCampaignId | string | path | Yes | External campaign identifier |

**Example Request**:
```bash
curl -X GET "http://localhost:3001/api/v1/campaigns/550e8400-e29b-41d4-a716-446655440000/rev-12345" \
  -H "Authorization: Bearer <token>"
```

**Example Response** (200 OK):
```json
{
  "data": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "externalCampaignId": "rev-12345",
    "name": "Q1 Mobile - January Promo",
    "status": "active",
    "enabled": true,
    "budget": 5000.00,
    "bid": 0.25,
    "metrics": {
      "spend": 3245.67,
      "impressions": 125000,
      "clicks": 2500,
      "conversions": 125,
      "ctr": 0.02,
      "cpa": 25.97
    },
    "syncedAt": "2026-01-02T10:30:00Z",
    "history": [
      {
        "spend": 2100.50,
        "conversions": 85,
        "cpa": 24.71,
        "syncedAt": "2026-01-02T09:30:00Z"
      },
      {
        "spend": 1200.00,
        "conversions": 50,
        "cpa": 24.00,
        "syncedAt": "2026-01-02T08:30:00Z"
      }
    ]
  }
}
```

**Status Codes**:
- `200 OK` - Success
- `401 Unauthorized` - Invalid token
- `404 Not Found` - Campaign not found or not owned by user

---

## Widgets API

Manage widget (publisher) blacklist entries.

### GET /widgets/blacklist

List blacklisted widgets.

**Authentication**: Required
**Parameters**:

| Name | Type | Location | Required | Description |
|------|------|----------|----------|-------------|
| sourceAccountId | string | query | No | Filter by source account UUID |
| externalCampaignId | string | query | No | Filter by campaign ID |

**Example Request**:
```bash
curl -X GET "http://localhost:3001/api/v1/widgets/blacklist" \
  -H "Authorization: Bearer <token>"

# With filters
curl -X GET "http://localhost:3001/api/v1/widgets/blacklist?sourceAccountId=550e8400-e29b-41d4-a716-446655440000&externalCampaignId=rev-12345" \
  -H "Authorization: Bearer <token>"
```

**Example Response** (200 OK):
```json
{
  "data": [
    {
      "id": "c47ac10b-58cc-4372-a567-0e02b2c3d479",
      "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "widgetId": "widget-999",
      "widgetDomain": "lowquality-ads.com",
      "externalCampaignId": "rev-12345",
      "reason": "Low CTR and high bounce rate",
      "autoBlacklisted": false,
      "metricsAtBlacklist": {
        "ctr": 0.005,
        "bounceRate": 0.85
      },
      "createdAt": "2026-01-02T10:00:00Z"
    }
  ]
}
```

**Status Codes**:
- `200 OK` - Success
- `401 Unauthorized` - Invalid token

---

### POST /widgets/blacklist

Manually blacklist a widget.

**Authentication**: Required
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "widgetId": "widget-999",
  "widgetDomain": "lowquality-ads.com",
  "externalCampaignId": "rev-12345",
  "reason": "Low CTR and high bounce rate"
}
```

**Field Validation**:
- `sourceAccountId` - Required, UUID format
- `widgetId` - Required, minimum 1 character
- `widgetDomain` - Optional, string
- `externalCampaignId` - Optional, string
- `reason` - Optional, string (defaults to "Manual blacklist")

**Example Request**:
```bash
curl -X POST "http://localhost:3001/api/v1/widgets/blacklist" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "widgetId": "widget-999",
    "widgetDomain": "lowquality-ads.com",
    "reason": "Low CTR"
  }'
```

**Example Response** (201 Created):
```json
{
  "id": "c47ac10b-58cc-4372-a567-0e02b2c3d479",
  "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "widgetId": "widget-999",
  "widgetDomain": "lowquality-ads.com",
  "reason": "Low CTR",
  "createdAt": "2026-01-02T10:00:00Z"
}
```

**Status Codes**:
- `201 Created` - Successfully created
- `400 Bad Request` - Invalid request body
- `401 Unauthorized` - Invalid token
- `404 Not Found` - Source account not found or not owned by user
- `409 Conflict` - Widget already blacklisted

---

### DELETE /widgets/blacklist/:id

Remove widget from blacklist.

**Authentication**: Required
**Parameters**:

| Name | Type | Location | Required | Description |
|------|------|----------|----------|-------------|
| id | string | path | Yes | UUID of blacklist entry |

**Example Request**:
```bash
curl -X DELETE "http://localhost:3001/api/v1/widgets/blacklist/c47ac10b-58cc-4372-a567-0e02b2c3d479" \
  -H "Authorization: Bearer <token>"
```

**Example Response** (200 OK):
```json
{
  "success": true
}
```

**Status Codes**:
- `200 OK` - Successfully deleted
- `401 Unauthorized` - Invalid token
- `404 Not Found` - Entry not found or not owned by user

---

## Optimizer API

Manage optimization campaigns, rules, and action history.

### GET /optimizer/campaigns

List all optimizer campaigns.

**Authentication**: Required

**Example Request**:
```bash
curl -X GET "http://localhost:3001/api/v1/optimizer/campaigns" \
  -H "Authorization: Bearer <token>"
```

**Example Response** (200 OK):
```json
{
  "data": [
    {
      "id": "d47ac10b-58cc-4372-a567-0e02b2c3d479",
      "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
      "externalCampaignId": "rev-12345",
      "enabled": true,
      "targetCpa": 25.00,
      "bidStrategy": "target_cpa",
      "createdAt": "2026-01-01T14:30:00Z",
      "updatedAt": "2026-01-02T10:15:00Z"
    }
  ]
}
```

**Status Codes**:
- `200 OK` - Success
- `401 Unauthorized` - Invalid token

---

### GET /optimizer/campaigns/:id

Get single optimizer campaign with rules.

**Authentication**: Required
**Parameters**:

| Name | Type | Location | Required | Description |
|------|------|----------|----------|-------------|
| id | string | path | Yes | UUID of optimizer campaign |

**Example Request**:
```bash
curl -X GET "http://localhost:3001/api/v1/optimizer/campaigns/d47ac10b-58cc-4372-a567-0e02b2c3d479" \
  -H "Authorization: Bearer <token>"
```

**Example Response** (200 OK):
```json
{
  "data": {
    "id": "d47ac10b-58cc-4372-a567-0e02b2c3d479",
    "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "externalCampaignId": "rev-12345",
    "enabled": true,
    "targetCpa": 25.00,
    "bidStrategy": "target_cpa",
    "bidStrategyConfig": {},
    "customThresholds": null,
    "rules": [
      {
        "id": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
        "name": "Pause on high CPA",
        "enabled": true,
        "priority": 1,
        "ruleType": "pause_campaign",
        "templateId": "template-1",
        "condition": {
          "metric": "cpa",
          "operator": "gt",
          "value": 35.00
        },
        "action": {
          "type": "pause_campaign"
        }
      }
    ],
    "createdAt": "2026-01-01T14:30:00Z",
    "updatedAt": "2026-01-02T10:15:00Z"
  }
}
```

**Status Codes**:
- `200 OK` - Success
- `401 Unauthorized` - Invalid token
- `404 Not Found` - Campaign not found or not owned by user

---

### POST /optimizer/campaigns

Create new optimizer campaign.

**Authentication**: Required
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "externalCampaignId": "rev-12345",
  "targetCpa": 25.00,
  "bidStrategy": "target_cpa"
}
```

**Field Validation**:
- `sourceAccountId` - Required, UUID format
- `externalCampaignId` - Required, minimum 1 character
- `targetCpa` - Required, positive number
- `bidStrategy` - Optional, enum: "target_cpa|maximize_conversions|manual" (defaults to "target_cpa")

**Example Request**:
```bash
curl -X POST "http://localhost:3001/api/v1/optimizer/campaigns" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "externalCampaignId": "rev-12345",
    "targetCpa": 25.00,
    "bidStrategy": "target_cpa"
  }'
```

**Example Response** (201 Created):
```json
{
  "id": "d47ac10b-58cc-4372-a567-0e02b2c3d479",
  "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
  "externalCampaignId": "rev-12345",
  "enabled": true,
  "targetCpa": 25.00,
  "bidStrategy": "target_cpa",
  "createdAt": "2026-01-02T10:30:00Z"
}
```

**Status Codes**:
- `201 Created` - Successfully created
- `400 Bad Request` - Invalid request body
- `401 Unauthorized` - Invalid token
- `404 Not Found` - Source account not found or not owned by user
- `409 Conflict` - Optimizer campaign already exists

---

### PATCH /optimizer/campaigns/:id

Update optimizer campaign configuration.

**Authentication**: Required
**Content-Type**: `application/json`

**Request Body** (all fields optional):
```json
{
  "enabled": true,
  "targetCpa": 30.00,
  "bidStrategy": "maximize_conversions"
}
```

**Field Validation**:
- `enabled` - Optional, boolean
- `targetCpa` - Optional, positive number
- `bidStrategy` - Optional, enum: "target_cpa|maximize_conversions|manual"

**Example Request**:
```bash
curl -X PATCH "http://localhost:3001/api/v1/optimizer/campaigns/d47ac10b-58cc-4372-a567-0e02b2c3d479" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetCpa": 30.00,
    "enabled": false
  }'
```

**Example Response** (200 OK):
```json
{
  "id": "d47ac10b-58cc-4372-a567-0e02b2c3d479",
  "enabled": false,
  "targetCpa": 30.00,
  "bidStrategy": "target_cpa",
  "updatedAt": "2026-01-02T10:45:00Z"
}
```

**Status Codes**:
- `200 OK` - Successfully updated
- `400 Bad Request` - Invalid request body
- `401 Unauthorized` - Invalid token
- `404 Not Found` - Campaign not found or not owned by user

---

### GET /optimizer/campaigns/:id/actions

Get action execution history.

**Authentication**: Required
**Parameters**:

| Name | Type | Location | Required | Description |
|------|------|----------|----------|-------------|
| id | string | path | Yes | UUID of optimizer campaign |
| limit | number | query | No | Number of actions to return (default 50) |

**Example Request**:
```bash
curl -X GET "http://localhost:3001/api/v1/optimizer/campaigns/d47ac10b-58cc-4372-a567-0e02b2c3d479/actions?limit=10" \
  -H "Authorization: Bearer <token>"
```

**Example Response** (200 OK):
```json
{
  "data": [
    {
      "id": "e47ac10b-58cc-4372-a567-0e02b2c3d480",
      "actionType": "bid_adjust",
      "targetType": "campaign",
      "targetId": "rev-12345",
      "targetName": "Q1 Mobile - January Promo",
      "previousValue": 0.25,
      "newValue": 0.28,
      "reason": "CPA decreased below target",
      "metrics": {
        "spend": 3245.67,
        "impressions": 125000,
        "conversions": 125,
        "cpa": 25.97
      },
      "confidenceScore": 0.92,
      "executed": true,
      "executedAt": "2026-01-02T10:15:00Z",
      "error": null,
      "createdAt": "2026-01-02T10:15:00Z"
    }
  ]
}
```

**Status Codes**:
- `200 OK` - Success
- `401 Unauthorized` - Invalid token
- `404 Not Found` - Campaign not found or not owned by user

---

## Error Handling

### Error Response Format

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| UNAUTHORIZED | 401 | Missing or invalid JWT token |
| NOT_FOUND | 404 | Resource not found or not owned by user |
| VALIDATION_ERROR | 400 | Invalid request body or parameters |
| CONFLICT | 409 | Resource already exists (duplicate) |
| INTERNAL_ERROR | 500 | Server error (see logs) |

### Example Error Response

```bash
curl -X POST "http://localhost:3001/api/v1/widgets/blacklist" \
  -H "Authorization: Bearer invalid-token"
```

Response (401 Unauthorized):
```json
{
  "error": "Invalid token",
  "code": "UNAUTHORIZED"
}
```

---

## Rate Limiting

Rate limiting is enforced per IP address with different limits for authentication and API endpoints to prevent brute force attacks and ensure fair resource usage.

### Rate Limit Tiers

| Endpoint Category | Window | Max Requests | Purpose |
|---|---|---|---|
| **Authentication** (`/api/auth/*`) | 15 minutes | 10 | Brute force protection |
| **API** (`/api/v1/*`) | 1 minute | 100 | General API usage |

### Rate Limit Headers

All responses include rate limit information:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067260
```

**Header Descriptions**:
- `X-RateLimit-Limit`: Maximum requests allowed in the window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

### Rate Limit Exceeded Response

**Status Code**: 429 Too Many Requests

```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded",
  "retryAfter": 45
}
```

For authentication endpoints:
```json
{
  "error": "Too many requests",
  "message": "Please try again later",
  "retryAfter": 125
}
```

### Implementation Details

Rate limiting uses in-memory store with automatic cleanup. IP detection follows standard proxy headers:
- `x-forwarded-for` (takes first value for chain)
- `x-real-ip` (fallback)
- Remote connection IP (final fallback)

---

## Health Check

### GET /health

Check API health status (no authentication required).

**Example Request**:
```bash
curl -X GET "http://localhost:3001/health"
```

**Example Response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2026-01-02T10:30:00.000Z",
  "version": "3.0.0"
}
```

---

## CORS Configuration

**Allowed Origins**:
- `http://localhost:3000`
- `http://localhost:5173`

**Allowed Methods**:
- GET, POST, PUT, PATCH, DELETE, OPTIONS

**Allowed Headers**:
- Content-Type
- Authorization

---

## Related Documents

- [System Architecture](./system-architecture.md) - API design patterns
- [Phase 05 Summary](./PHASE-05-SUMMARY.md) - Implementation details
- [Testing Guide](./testing-guide.md) - Integration test examples
