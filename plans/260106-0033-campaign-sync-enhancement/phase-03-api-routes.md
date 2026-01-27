# Phase 3: API Routes

**Status:** ⚠️ Complete (Rate Limiting Missing)
**Effort:** 2h
**Parent:** [plan.md](./plan.md)
**Depends on:** [Phase 2](./phase-02-sync-service.md)

## Overview

Create REST API endpoints for manual sync triggers and sync history retrieval.

## New File: `apps/api/src/routes/sync.ts`

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { queueManualSync } from '../jobs/job-queue';
import { syncMetricsService } from '../services/sync-metrics';
import { authMiddleware } from '../middleware/auth';

const syncRoutes = new Hono();

// All routes require authentication
syncRoutes.use('*', authMiddleware);

// POST /api/v1/sync/account/:accountId - Trigger account sync
syncRoutes.post('/account/:accountId', async (c) => {
  const { accountId } = c.req.param();
  const user = c.get('user');

  // Verify user owns this account
  const account = await db.query.sourceAccounts.findFirst({
    where: and(
      eq(sourceAccounts.id, accountId),
      eq(sourceAccounts.userId, user.id)
    ),
  });

  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const jobId = await queueManualSync('account', accountId, user.id);

  return c.json({
    success: true,
    jobId,
    message: `Sync queued for account ${account.name}`,
  });
});

// POST /api/v1/sync/campaign/:campaignId - Trigger campaign sync
syncRoutes.post('/campaign/:campaignId', async (c) => {
  const { campaignId } = c.req.param();
  const user = c.get('user');

  // Verify user owns this campaign
  const campaign = await db.query.campaignSyncs.findFirst({
    where: eq(campaignSyncs.id, campaignId),
    with: { sourceAccount: true },
  });

  if (!campaign || campaign.sourceAccount?.userId !== user.id) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const jobId = await queueManualSync('campaign', campaignId, user.id);

  return c.json({
    success: true,
    jobId,
    message: `Sync queued for campaign ${campaign.name}`,
  });
});

// GET /api/v1/sync/runs - List sync run history
const listRunsSchema = z.object({
  accountId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

syncRoutes.get('/runs', zValidator('query', listRunsSchema), async (c) => {
  const { accountId, limit, offset } = c.req.valid('query');
  const user = c.get('user');

  // If accountId provided, verify ownership
  if (accountId) {
    const account = await db.query.sourceAccounts.findFirst({
      where: and(
        eq(sourceAccounts.id, accountId),
        eq(sourceAccounts.userId, user.id)
      ),
    });

    if (!account) {
      return c.json({ error: 'Account not found' }, 404);
    }
  }

  const runs = await syncMetricsService.getSyncRuns({
    sourceAccountId: accountId,
    limit,
    offset,
  });

  return c.json({ runs });
});

// GET /api/v1/sync/runs/:runId - Get sync run details
syncRoutes.get('/runs/:runId', async (c) => {
  const { runId } = c.req.param();
  const user = c.get('user');

  const details = await syncMetricsService.getSyncRunDetails(runId);

  if (!details) {
    return c.json({ error: 'Sync run not found' }, 404);
  }

  // Verify user owns this sync run's account
  const account = await db.query.sourceAccounts.findFirst({
    where: and(
      eq(sourceAccounts.id, details.sourceAccountId),
      eq(sourceAccounts.userId, user.id)
    ),
  });

  if (!account) {
    return c.json({ error: 'Sync run not found' }, 404);
  }

  return c.json(details);
});

// GET /api/v1/sync/widgets/:campaignId - Get widget history for campaign
const widgetHistorySchema = z.object({
  days: z.coerce.number().min(1).max(90).default(30),
});

syncRoutes.get('/widgets/:campaignId', zValidator('query', widgetHistorySchema), async (c) => {
  const { campaignId } = c.req.param();
  const { days } = c.req.valid('query');
  const user = c.get('user');

  // Verify user owns this campaign
  const campaign = await db.query.campaignSyncs.findFirst({
    where: eq(campaignSyncs.id, campaignId),
    with: { sourceAccount: true },
  });

  if (!campaign || campaign.sourceAccount?.userId !== user.id) {
    return c.json({ error: 'Campaign not found' }, 404);
  }

  const history = await syncMetricsService.getWidgetHistory(campaignId, days);

  return c.json({ widgets: history });
});

export { syncRoutes };
```

## Register Routes in App

```typescript
// apps/api/src/app.ts
import { syncRoutes } from './routes/sync';

// Add after other route registrations
app.route('/api/v1/sync', syncRoutes);
```

## API Endpoints Summary

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/sync/account/:accountId` | Trigger account sync | Required |
| POST | `/api/v1/sync/campaign/:campaignId` | Trigger campaign sync | Required |
| GET | `/api/v1/sync/runs` | List sync run history | Required |
| GET | `/api/v1/sync/runs/:runId` | Get sync run details | Required |
| GET | `/api/v1/sync/widgets/:campaignId` | Get widget history | Required |

## Request/Response Examples

### Trigger Account Sync

```bash
POST /api/v1/sync/account/123e4567-e89b-12d3-a456-426614174000
Authorization: Bearer <token>

# Response 200
{
  "success": true,
  "jobId": "job_abc123",
  "message": "Sync queued for account My Revcontent"
}
```

### List Sync Runs

```bash
GET /api/v1/sync/runs?accountId=123&limit=10
Authorization: Bearer <token>

# Response 200
{
  "runs": [
    {
      "id": "run_123",
      "sourceAccountId": "123",
      "triggeredBy": "manual",
      "status": "completed",
      "startedAt": "2026-01-06T00:30:00Z",
      "completedAt": "2026-01-06T00:30:15Z",
      "durationMs": 15000,
      "campaignsTotal": 25,
      "campaignsSynced": 25,
      "campaignsFailed": 0,
      "widgetsSynced": 150
    }
  ]
}
```

### Get Widget History

```bash
GET /api/v1/sync/widgets/campaign_456?days=7
Authorization: Bearer <token>

# Response 200
{
  "widgets": [
    {
      "id": "widget_abc",
      "widgetId": "ext_widget_123",
      "widgetName": "News Site A",
      "impressions": 10000,
      "clicks": 150,
      "spend": "45.00",
      "conversions": 3,
      "ctr": "0.015000",
      "syncedAt": "2026-01-06T00:30:00Z"
    }
  ]
}
```

## Implementation Steps

- [ ] Create `apps/api/src/routes/sync.ts`
- [ ] Add Zod validation schemas
- [ ] Implement all 5 endpoints
- [ ] Add auth middleware checks
- [ ] Register routes in app.ts
- [ ] Add rate limiting for manual sync
- [ ] Write integration tests
- [ ] Update API documentation

## Rate Limiting

Manual sync endpoints should be rate-limited to prevent abuse:

```typescript
// In sync.ts - add rate limit check
const RATE_LIMIT_MANUAL_SYNC = 10; // per minute per user

syncRoutes.post('/account/:accountId', rateLimitMiddleware({
  limit: RATE_LIMIT_MANUAL_SYNC,
  window: 60,
  key: (c) => `manual-sync:${c.get('user').id}`,
}), async (c) => {
  // ... handler
});
```

## Success Criteria

- [ ] All 5 endpoints functional
- [ ] Auth required on all routes
- [ ] Rate limiting on manual sync
- [ ] Proper error responses (404, 401, 429)
- [ ] Query validation working
- [ ] Integration tests passing
