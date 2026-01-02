# NativeHub 3.0 - API Documentation

**Base URL**: `http://localhost:3001/api/v1`
**Version**: 3.0.0
**Status**: Phase 05 - Fully Implemented

---

## Table of Contents

1. [Authentication](#authentication)
2. [Campaigns API](#campaigns-api)
3. [Widgets API](#widgets-api)
4. [Optimizer API](#optimizer-api)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)

---

## Authentication

All API endpoints (except `/health`) require JWT authentication.

### Headers

```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### JWT Token Format

```json
{
  "sub": "user-uuid",
  "exp": 1704067200,
  "iat": 1703980800
}
```

**Token Expiration**: 24 hours

### Authentication Flow

```
1. User logs in with credentials
2. Server returns JWT token
3. Client includes token in Authorization header
4. Server validates token and user context
5. Request processed with user isolation
```

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

**Limits** (per IP address):
- 100 requests per minute

**Response Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067260
```

**Rate Limit Exceeded Response** (429):
```json
{
  "error": "Too many requests",
  "code": "RATE_LIMITED"
}
```

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
