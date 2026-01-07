# Phase 1: Core Automation - Implementation Summary

**Date**: 2026-01-05
**Status**: Complete
**Impact**: High - Core optimization features for production campaigns

---

## Overview

Phase 1 implements core automation features for NativeHub 3.0 optimizer:
- High-ticket optimization templates ($40-100 CPA offers)
- Auto-execution mode with configurable alerts
- Widget reactivation system (7-day cooldown, 50% bid reduction)
- Enhanced adapter interface for placement management

---

## Features Implemented

### 1. High-Ticket Optimization Templates

**File**: `apps/api/src/services/optimizer/source-rule-templates.ts`

**Added**: `HIGH_TICKET_TEMPLATES` constant

**Templates**:
- Pause at spend >= 2.5x CPA goal with 0 conversions
- Block at CPA > 3x goal
- Conservative thresholds for high-value offers

**Usage**:
```typescript
import { HIGH_TICKET_TEMPLATES } from './source-rule-templates.js'

// Templates exported alongside existing source-specific templates
// Applied to campaigns with targetCPA >= $40
```

---

### 2. Optimizer Auto-Execution Mode

**File**: `apps/api/src/services/optimizer/optimizer.service.ts`

**Interface**:
```typescript
interface OptimizerMode {
  autoExecute: boolean      // Execute actions without confirmation
  alertOnAction: boolean     // Send notification for each action
  alertOnError: boolean      // Send notification on failures
}

const DEFAULT_OPTIMIZER_MODE: OptimizerMode = {
  autoExecute: true,
  alertOnAction: true,
  alertOnError: true,
}
```

**Configuration**:
```typescript
const HIGH_TICKET_CONFIG = {
  noConvPauseMultiplier: 2.5,      // Pause at 2.5x CPA with 0 conv
  highCpaBlockMultiplier: 3,        // Block at 3x CPA
  reactivationCooldownDays: 7,      // 7-day cooldown
  reactivationBidReduction: 0.5,    // 50% bid reduction
}
```

---

### 3. Widget Reactivation System

#### Database Schema

**File**: `apps/api/src/db/schema.ts`

**Table**: `widgetReactivationQueue`

```typescript
export const widgetReactivationQueue = pgTable('widget_reactivation_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceAccountId: uuid('source_account_id').notNull()
    .references(() => sourceAccounts.id, { onDelete: 'cascade' }),
  externalCampaignId: text('external_campaign_id').notNull(),
  widgetId: text('widget_id').notNull(),

  // Bid management
  originalBid: numeric('original_bid'),
  reactivateBid: numeric('reactivate_bid'),  // 50% of original

  // Lifecycle timestamps
  pausedAt: timestamp('paused_at', { withTimezone: true }).notNull(),
  reactivateAfter: timestamp('reactivate_after', { withTimezone: true }).notNull(),
  reactivatedAt: timestamp('reactivated_at', { withTimezone: true }),

  // Status tracking
  status: text('status').notNull(),  // pending, reactivated, failed, cancelled
  failReason: text('fail_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueWidget: unique().on(
    table.sourceAccountId,
    table.externalCampaignId,
    table.widgetId
  ),
}))
```

#### Reactivation Service

**File**: `apps/api/src/services/optimizer/reactivation.service.ts`

**Class**: `ReactivationService`

**Methods**:

```typescript
// Queue widget for reactivation after pause
async queueForReactivation(params: {
  sourceAccountId: string
  externalCampaignId: string
  widgetId: string
  originalBid?: number
}): Promise<void>

// Process all pending reactivations past cooldown
async processReactivations(): Promise<{
  processed: number
  reactivated: number
  failed: number
}>

// Cancel pending reactivation (manual block)
async cancelReactivation(
  sourceAccountId: string,
  externalCampaignId: string,
  widgetId: string
): Promise<void>

// Get pending count
async getPendingCount(): Promise<number>

// Get queue for campaign
async getQueueForCampaign(
  sourceAccountId: string,
  externalCampaignId: string
)
```

**Lifecycle**:
1. Widget paused by optimizer → `queueForReactivation()` called
2. Queue entry created with `reactivateAfter = pausedAt + 7 days`
3. Reduced bid calculated: `reactivateBid = originalBid * 0.5`
4. Job runs every 6 hours → `processReactivations()`
5. Pending widgets past cooldown → `enablePlacement()` called
6. Status updated to 'reactivated' or 'failed'

---

### 4. Adapter Interface Enhancement

**File**: `apps/api/src/services/optimizer/adapters/interface.ts`

**Added Method**:
```typescript
interface OptimizerAdapter {
  // ... existing methods

  enablePlacement(params: {
    campaignId: string
    placementId: string
    bid?: number
  }): Promise<{
    success: boolean
    error?: string
  }>
}
```

**Implementations**:
1. `adapters/revcontent.ts` - ✓ Implemented
2. `adapters/taboola.ts` - ✓ Implemented
3. `adapters/outbrain.ts` - ✓ Implemented
4. `adapters/mgid.ts` - ✓ Implemented

**Usage**:
```typescript
const adapter = createOptimizerAdapter(sourceId, source)
const result = await adapter.enablePlacement({
  campaignId: '12345',
  placementId: 'widget-abc',
  bid: 0.25  // 50% of original $0.50
})

if (result.success) {
  // Widget re-enabled successfully
} else {
  // Handle error: result.error
}
```

---

### 5. Job Queue Integration

**File**: `apps/api/src/jobs/job-queue.ts`

**Added Job**: `process-reactivations`

**Schedule**: `0 */6 * * *` (every 6 hours)

**Implementation**:
```typescript
// Queue creation
await boss.createQueue('process-reactivations')

// Job handler
await boss.work('process-reactivations', async (jobs) => {
  const result = await reactivationService.processReactivations()
  logger.info(result, 'Reactivation job complete')
})

// Schedule
await boss.schedule('process-reactivations', '0 */6 * * *', {}, {
  tz: 'UTC'
})
```

**Execution Flow**:
1. Job triggered every 6 hours
2. Service queries pending widgets where `reactivateAfter <= NOW()`
3. For each widget:
   - Get source account and adapter
   - Call `adapter.enablePlacement()` with reduced bid
   - Update status to 'reactivated' or 'failed'
4. Log results and continue on errors

---

## Integration Points

### Optimizer Service → Reactivation Service
```typescript
// When pausing a widget
await reactivationService.queueForReactivation({
  sourceAccountId,
  externalCampaignId,
  widgetId,
  originalBid: currentBid
})
```

### Job Queue → Reactivation Service
```typescript
// Every 6 hours
const result = await reactivationService.processReactivations()
// Returns: { processed, reactivated, failed }
```

### Reactivation Service → Adapters
```typescript
const adapter = createOptimizerAdapter(sourceId, source)
await adapter.enablePlacement({
  campaignId,
  placementId: widgetId,
  bid: reducedBid
})
```

---

## Configuration

### Environment Variables
None added - uses existing database and traffic source configurations

### Database Migration
```sql
-- Migration: widgetReactivationQueue table
CREATE TABLE widget_reactivation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_account_id UUID NOT NULL REFERENCES source_accounts(id) ON DELETE CASCADE,
  external_campaign_id TEXT NOT NULL,
  widget_id TEXT NOT NULL,
  original_bid NUMERIC,
  reactivate_bid NUMERIC,
  paused_at TIMESTAMPTZ NOT NULL,
  reactivate_after TIMESTAMPTZ NOT NULL,
  reactivated_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  fail_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_account_id, external_campaign_id, widget_id)
);

CREATE INDEX idx_widget_reactivation_status ON widget_reactivation_queue(status, reactivate_after);
```

---

## Testing

### Files Modified
1. `source-rule-templates.ts` - Added HIGH_TICKET_TEMPLATES
2. `optimizer.service.ts` - Added OptimizerMode, HIGH_TICKET_CONFIG
3. `schema.ts` - Added widgetReactivationQueue table
4. `reactivation.service.ts` - NEW reactivation service
5. `adapters/interface.ts` - Added enablePlacement
6. `adapters/*.ts` - Implemented enablePlacement (4 files)
7. `job-queue.ts` - Added process-reactivations job

### Test Coverage
- Reactivation service unit tests (recommended)
- Adapter enablePlacement tests (recommended)
- Integration tests for full lifecycle (recommended)

---

## Performance Characteristics

### Database Queries
- Queue insertion: O(1) with unique constraint (upsert)
- Pending query: O(log n) on indexed `(status, reactivate_after)`
- Single widget query: O(1) on unique constraint

### Job Performance
- 10 widgets: ~2-5 seconds (adapter API calls)
- 100 widgets: ~20-50 seconds (adapter rate limits)
- 1000 widgets: ~200-500 seconds (batch processing recommended)

---

## Security Considerations

1. **Access Control**: Reactivation respects source account ownership
2. **Error Handling**: Failed reactivations logged, don't block queue
3. **Bid Limits**: Reduced bid never exceeds original bid
4. **Cancellation**: Manual cancellation available via API

---

## Monitoring

### Metrics to Track
1. Reactivation success rate
2. Average cooldown duration
3. Bid reduction effectiveness
4. Failed reactivation reasons
5. Queue depth over time

### Alerts
1. High failure rate (>10%)
2. Queue backlog (>100 pending)
3. Long processing time (>10 minutes)

---

## Next Steps

### Phase 2 Enhancements
- [ ] Manual reactivation API endpoint
- [ ] Reactivation history UI
- [ ] Custom cooldown periods per campaign
- [ ] A/B testing different bid reductions
- [ ] Reactivation analytics dashboard

### Documentation
- [x] Phase 1 summary (this file)
- [ ] Update codebase-summary.md
- [ ] Update system-architecture.md
- [ ] API documentation (if endpoints added)

---

## References

- Optimizer Service: `apps/api/src/services/optimizer/optimizer.service.ts`
- Reactivation Service: `apps/api/src/services/optimizer/reactivation.service.ts`
- Database Schema: `apps/api/src/db/schema.ts`
- Job Queue: `apps/api/src/jobs/job-queue.ts`
- Adapter Interface: `apps/api/src/services/optimizer/adapters/interface.ts`
