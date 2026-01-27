# Phase 1: Create Campaign Detail Page

## Context

- Parent plan: [plan.md](./plan.md)
- Dependencies: None (first phase)

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-01-05 |
| Priority | P1 |
| Effort | 2h |
| Implementation Status | Pending |
| Review Status | Pending |

Create a new CampaignDetail page that shows campaign info when user clicks a row in the campaigns list.

## Key Insights

- Campaigns.tsx currently has NO row click handler
- Campaign data includes: name, source, metrics, status, externalCampaignId, sourceAccountId
- Need to construct a unique campaign ID for routing (composite key: sourceAccountId + externalCampaignId)
- Can use base64 encoding of composite key or URL params

## Requirements

1. Make campaign rows clickable in Campaigns.tsx
2. Create CampaignDetail.tsx page with basic overview tab
3. Add route `/campaigns/:id` to router
4. Show campaign metrics and source info

## Architecture

```
/campaigns
  └── Click row → /campaigns/{sourceAccountId}_{externalCampaignId}
        └── CampaignDetail.tsx
              ├── Header (name, source badge, status)
              ├── Metrics cards (spend, clicks, conversions, CPA)
              └── Tabs (Overview selected by default)
```

## Related Code Files

- `apps/web/src/pages/Campaigns.tsx` - Add onClick to DataTable rows
- `apps/web/src/pages/CampaignDetail.tsx` - NEW FILE
- `apps/web/src/App.tsx` - Add route
- `apps/web/src/lib/api.ts` - May need getCampaign by composite ID

## Implementation Steps

### Step 1: Update Campaigns.tsx

Add row click handler to navigate:

```tsx
const handleRowClick = (campaign: Campaign) => {
  const id = `${campaign.sourceAccountId}_${campaign.externalCampaignId}`
  navigate(`/campaigns/${id}`)
}

// In DataTable, add onRowClick prop
<DataTable
  data={filteredCampaigns}
  columns={columns}
  keyField="id"
  onRowClick={handleRowClick}  // Add this
  ...
/>
```

### Step 2: Update DataTable component

If DataTable doesn't support onRowClick, add it:

```tsx
// DataTable.tsx
interface DataTableProps<T> {
  onRowClick?: (item: T) => void
  // ...existing props
}

// In tbody render:
<tr
  onClick={() => onRowClick?.(item)}
  className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
>
```

### Step 3: Create CampaignDetail.tsx

```tsx
// apps/web/src/pages/CampaignDetail.tsx
export function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const [sourceAccountId, externalCampaignId] = id?.split('_') || []

  // Fetch campaign data
  const { data: campaigns } = useCampaigns()
  const campaign = campaigns?.find(c =>
    c.sourceAccountId === sourceAccountId &&
    c.externalCampaignId === externalCampaignId
  )

  // Tabs: overview, optimizer, widgets, actions
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      {/* Metrics cards */}
      {/* Tab navigation */}
      {/* Tab content */}
    </div>
  )
}
```

### Step 4: Add route in App.tsx

```tsx
<Route path="/campaigns/:id" element={<CampaignDetail />} />
```

## Todo List

- [ ] Add onRowClick prop to DataTable component
- [ ] Add click handler in Campaigns.tsx
- [ ] Create CampaignDetail.tsx with overview section
- [ ] Add route in App.tsx
- [ ] Test navigation flow

## Success Criteria

- [ ] Clicking campaign row navigates to detail page
- [ ] Campaign detail shows correct campaign info
- [ ] Back button returns to campaigns list
- [ ] URL contains encoded campaign ID

## Risk Assessment

- **Low**: DataTable component modification is isolated
- **Low**: Route addition is additive, doesn't break existing

## Security Considerations

- Campaign ID in URL is public info (no sensitive data)
- Same auth checks apply as campaigns list

## Next Steps

After Phase 1 complete → Phase 2: Integrate optimizer settings into tabs
