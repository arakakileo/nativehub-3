# Phase 1: API Hooks Update

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-01-05 |
| Priority | P1 |
| Status | pending |
| Effort | 1.5h |

## Context Links
- API Docs: `docs/api-docs.md` (lines 484-745)
- Current API Client: `apps/web/src/lib/api.ts` (lines 119-143)
- Current Hooks: `apps/web/src/hooks/useOptimizer.ts`

## Key Insights
- Current API uses `/optimizer/rules` - deprecated
- New endpoints use `/optimizer/campaigns` with nested `/actions`
- Per-campaign run via `POST /optimizer/campaigns/:id/run`
- Global run via `POST /optimizer/run`

## Requirements
1. Add new types for `OptimizerCampaign`, `OptimizerRule` (nested), `OptimizerAction`
2. Update api.ts with new endpoints
3. Create hooks for campaigns CRUD, actions, and run operations
4. Maintain backward compat with existing rule hooks (can remove later)

## Architecture

### New Types (api.ts)
```typescript
interface OptimizerCampaign {
  id: string
  sourceAccountId: string
  externalCampaignId: string
  enabled: boolean
  targetCpa: number
  bidStrategy: 'target_cpa' | 'maximize_conversions' | 'manual'
  bidStrategyConfig?: Record<string, unknown>
  customThresholds?: Record<string, unknown>
  rules?: OptimizerCampaignRule[]
  createdAt: string
  updatedAt: string
}

interface OptimizerCampaignRule {
  id: string
  name: string
  enabled: boolean
  priority: number
  ruleType: string
  templateId?: string
  condition: Record<string, unknown>
  action: Record<string, unknown>
}

interface OptimizerActionHistory {
  id: string
  actionType: string
  targetType: string
  targetId: string
  targetName?: string
  previousValue?: unknown
  newValue?: unknown
  reason?: string
  metrics?: Record<string, number>
  confidenceScore?: number
  executed: boolean
  executedAt?: string
  error?: string
  createdAt: string
}
```

### New API Methods (api.ts)
```
getOptimizerCampaigns() -> OptimizerCampaign[]
getOptimizerCampaign(id) -> OptimizerCampaign (with rules)
createOptimizerCampaign(data) -> OptimizerCampaign
updateOptimizerCampaign(id, data) -> OptimizerCampaign
getOptimizerCampaignActions(id, limit?) -> OptimizerActionHistory[]
runOptimizerCampaign(id) -> { actionsCount, errors }
runOptimizerAll() -> { actionsCount, campaignsProcessed, errors }
```

### New Hooks (useOptimizer.ts)
```
useOptimizerCampaigns()
useOptimizerCampaign(id)
useCreateOptimizerCampaign()
useUpdateOptimizerCampaign()
useOptimizerCampaignActions(id)
useRunOptimizerCampaign()
useRunOptimizerAll()
```

## Related Files
| File | Action |
|------|--------|
| `apps/web/src/lib/api.ts` | Add types + methods |
| `apps/web/src/hooks/useOptimizer.ts` | Replace hooks |

## Implementation Steps

### Step 1: Add Types to api.ts
Add `OptimizerCampaign`, `OptimizerCampaignRule`, `OptimizerActionHistory` interfaces.

### Step 2: Add API Methods
```typescript
// Optimizer Campaigns
getOptimizerCampaigns = (): Promise<OptimizerCampaign[]> =>
  this.request('/api/v1/optimizer/campaigns')

getOptimizerCampaign = (id: string): Promise<OptimizerCampaign> =>
  this.request(`/api/v1/optimizer/campaigns/${id}`)

createOptimizerCampaign = (data: CreateOptimizerCampaignInput): Promise<OptimizerCampaign> =>
  this.request('/api/v1/optimizer/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  })

updateOptimizerCampaign = (id: string, data: UpdateOptimizerCampaignInput): Promise<OptimizerCampaign> =>
  this.request(`/api/v1/optimizer/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

getOptimizerCampaignActions = (id: string, limit = 50): Promise<OptimizerActionHistory[]> =>
  this.request(`/api/v1/optimizer/campaigns/${id}/actions?limit=${limit}`)

runOptimizerCampaign = (id: string): Promise<{ actionsCount: number; errors: string[] }> =>
  this.request(`/api/v1/optimizer/campaigns/${id}/run`, { method: 'POST' })

runOptimizerAll = (): Promise<{ actionsCount: number; campaignsProcessed: number; errors: string[] }> =>
  this.request('/api/v1/optimizer/run', { method: 'POST' })
```

### Step 3: Update Hooks
Replace current hooks with new campaign-centric ones. Keep old ones temporarily for migration.

## Todo List
- [ ] Add OptimizerCampaign types to api.ts
- [ ] Add OptimizerCampaignRule type to api.ts
- [ ] Add OptimizerActionHistory type to api.ts
- [ ] Add CreateOptimizerCampaignInput type
- [ ] Add UpdateOptimizerCampaignInput type
- [ ] Add getOptimizerCampaigns method
- [ ] Add getOptimizerCampaign method
- [ ] Add createOptimizerCampaign method
- [ ] Add updateOptimizerCampaign method
- [ ] Add getOptimizerCampaignActions method
- [ ] Add runOptimizerCampaign method
- [ ] Add runOptimizerAll method
- [ ] Create useOptimizerCampaigns hook
- [ ] Create useOptimizerCampaign hook
- [ ] Create useCreateOptimizerCampaign hook
- [ ] Create useUpdateOptimizerCampaign hook
- [ ] Create useOptimizerCampaignActions hook
- [ ] Create useRunOptimizerCampaign hook
- [ ] Create useRunOptimizerAll hook

## Success Criteria
1. All new types compile without errors
2. API methods match backend endpoints from api-docs.md
3. Hooks properly invalidate queries on mutations
4. Toast notifications on success/error

## Risk Assessment
| Risk | Level | Mitigation |
|------|-------|------------|
| Type mismatch | Low | Validate against api-docs.md |
| Breaking existing | Low | Keep old hooks temporarily |

## Security Considerations
- All endpoints use session auth via cookies (already configured)
- No sensitive data exposed in console logs

## Next Steps
After completion, proceed to Phase 2: Optimizer List Page.
