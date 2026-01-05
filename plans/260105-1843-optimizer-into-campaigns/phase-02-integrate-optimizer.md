# Phase 2: Integrate Optimizer into Campaign Detail

## Context

- Parent plan: [plan.md](./plan.md)
- Dependencies: [Phase 1](./phase-01-campaign-detail-page.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-01-05 |
| Priority | P1 |
| Effort | 2h |
| Implementation Status | Pending |
| Review Status | Pending |

Move optimizer settings, widgets, and action history into CampaignDetail tabs.

## Key Insights

- OptimizerDetail.tsx shows: settings form, rules table, actions table
- OptimizerWidgets.tsx shows: active widgets, blacklisted widgets with tabs
- Optimizer campaign is linked by: sourceAccountId + externalCampaignId
- Need to handle case where campaign has no optimizer config yet

## Requirements

1. Add "Optimizer" tab to CampaignDetail
2. Add "Widgets" tab to CampaignDetail
3. Add "Actions" tab to CampaignDetail
4. Show "Enable Optimizer" button if no optimizer config exists
5. Reuse existing hooks and logic from OptimizerDetail/OptimizerWidgets

## Architecture

```
CampaignDetail.tsx
  ├── Tab: Overview (from Phase 1)
  ├── Tab: Optimizer
  │     ├── Settings form (enable/disable, target CPA, bid strategy)
  │     └── Rules table
  ├── Tab: Widgets
  │     ├── Active widgets table
  │     └── Blacklisted widgets table
  └── Tab: Actions
        └── Action history table
```

## Related Code Files

- `apps/web/src/pages/CampaignDetail.tsx` - Add tabs
- `apps/web/src/pages/OptimizerDetail.tsx` - Copy logic
- `apps/web/src/pages/OptimizerWidgets.tsx` - Copy logic
- `apps/web/src/hooks/useOptimizer.ts` - Existing hooks

## Implementation Steps

### Step 1: Add Optimizer Tab Content

Extract optimizer settings form from OptimizerDetail.tsx:

```tsx
// CampaignDetail.tsx - Optimizer Tab
function OptimizerTab({ sourceAccountId, externalCampaignId }) {
  // Find optimizer campaign by source + external IDs
  const { data: optCampaigns } = useOptimizerCampaigns()
  const optCampaign = optCampaigns?.find(oc =>
    oc.sourceAccountId === sourceAccountId &&
    oc.externalCampaignId === externalCampaignId
  )

  // If no optimizer config, show "Enable" button
  if (!optCampaign) {
    return <EnableOptimizerCard onEnable={handleEnable} />
  }

  // Otherwise show settings form + rules
  return (
    <div className="space-y-6">
      <OptimizerSettingsCard optCampaign={optCampaign} />
      <OptimizerRulesTable rules={optCampaign.rules} />
    </div>
  )
}
```

### Step 2: Add Widgets Tab Content

Extract from OptimizerWidgets.tsx:

```tsx
// CampaignDetail.tsx - Widgets Tab
function WidgetsTab({ sourceAccountId, externalCampaignId, optCampaign }) {
  const { data: widgets } = useCampaignWidgets(sourceAccountId, externalCampaignId)
  const { data: blacklist } = useBlacklist()

  // Existing logic for filtering, blocking, unblocking
  return (
    <div className="space-y-6">
      <WidgetsTabs
        activeWidgets={...}
        blacklistedWidgets={...}
        onBlock={handleBlock}
        onUnblock={handleUnblock}
      />
    </div>
  )
}
```

### Step 3: Add Actions Tab Content

```tsx
// CampaignDetail.tsx - Actions Tab
function ActionsTab({ optimizerCampaignId }) {
  const { data: actions } = useOptimizerCampaignActions(optimizerCampaignId, 50)

  return (
    <DataTable
      data={actions}
      columns={actionsColumns}
      emptyMessage="No actions executed yet."
    />
  )
}
```

### Step 4: Tab Navigation UI

```tsx
const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'optimizer', label: 'Optimizer' },
  { key: 'widgets', label: 'Widgets', count: widgetsCount },
  { key: 'actions', label: 'Actions', count: actionsCount },
]

// Tab buttons
<div className="border-b">
  <div className="flex gap-4">
    {tabs.map(tab => (
      <button
        key={tab.key}
        onClick={() => setActiveTab(tab.key)}
        className={activeTab === tab.key ? 'border-primary' : ''}
      >
        {tab.label}
        {tab.count !== undefined && <span>({tab.count})</span>}
      </button>
    ))}
  </div>
</div>
```

### Step 5: Handle "Enable Optimizer"

When campaign has no optimizer config:

```tsx
function EnableOptimizerCard({ campaign, onEnabled }) {
  const createMutation = useCreateOptimizerCampaign()

  const handleEnable = async () => {
    await createMutation.mutateAsync({
      sourceAccountId: campaign.sourceAccountId,
      externalCampaignId: campaign.externalCampaignId,
      enabled: true,
      targetCpa: 10.00, // Default
      bidStrategy: 'target_cpa',
    })
    onEnabled?.()
  }

  return (
    <div className="text-center py-12 border rounded-lg">
      <p>Optimizer not configured for this campaign</p>
      <Button onClick={handleEnable}>Enable Optimizer</Button>
    </div>
  )
}
```

## Todo List

- [ ] Create OptimizerTab component
- [ ] Create WidgetsTab component
- [ ] Create ActionsTab component
- [ ] Add tab navigation UI
- [ ] Handle enable optimizer flow
- [ ] Test all mutations work correctly

## Success Criteria

- [ ] Optimizer settings editable in campaign detail
- [ ] Widgets tab shows active/blacklisted widgets
- [ ] Actions tab shows history
- [ ] "Enable Optimizer" button works for new campaigns
- [ ] All existing functionality preserved

## Risk Assessment

- **Medium**: State sync between tabs (use React Query invalidation)
- **Low**: Hook reuse is straightforward

## Security Considerations

- Same auth as existing optimizer pages
- No new endpoints needed

## Next Steps

After Phase 2 complete → Phase 3: Remove standalone optimizer pages
