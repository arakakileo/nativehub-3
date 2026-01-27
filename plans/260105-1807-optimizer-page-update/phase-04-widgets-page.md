# Phase 4: Widgets Page

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-01-05 |
| Priority | P2 |
| Status | pending |
| Effort | 1h |

## Context Links
- Widget Blacklist Page: `apps/web/src/pages/WidgetBlacklist.tsx`
- Blacklist API: `POST /widgets/blacklist`
- Note: `TrafficSource.getWidgets(campaignId)` returns widgets

## Key Insights
- Widgets are fetched per campaign via traffic source adapter
- Need new API endpoint OR use existing `/campaigns/:id/widgets`
- Can reuse blacklist mutation from existing hooks
- Similar table structure to WidgetBlacklist page

## Requirements
1. Route: `/optimizer/:id/widgets`
2. Show widgets for the optimizer campaign
3. Display metrics: impressions, clicks, spend, CTR, CPA
4. Blacklist action per widget row
5. Back navigation to optimizer detail

## Architecture

### Component Structure
```
OptimizerWidgets.tsx
├── Header
│   ├── Back Button
│   └── Campaign Name
├── Stats Summary (optional)
└── DataTable (widgets)
    └── Blacklist Button per row
```

### API Consideration
Backend has `TrafficSource.getWidgets(campaignId)`. Need endpoint:
- Option A: `GET /optimizer/campaigns/:id/widgets` (new)
- Option B: `GET /campaigns/:sourceAccountId/:externalCampaignId/widgets` (may exist)

For MVP, assume endpoint exists or will be added. Define types:

```typescript
interface NormalizedWidget {
  id: string
  widgetId: string
  widgetName?: string
  widgetDomain?: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  ctr: number
  cpc: number
  cpa: number
}
```

## Related Files
| File | Action |
|------|--------|
| `apps/web/src/pages/OptimizerWidgets.tsx` | Create new |
| `apps/web/src/App.tsx` | Add route |
| `apps/web/src/lib/api.ts` | Add getOptimizerCampaignWidgets |
| `apps/web/src/hooks/useOptimizer.ts` | Add useOptimizerCampaignWidgets |

## Implementation Steps

### Step 1: Add API Method
```typescript
// api.ts
getOptimizerCampaignWidgets = (id: string): Promise<NormalizedWidget[]> =>
  this.request(`/api/v1/optimizer/campaigns/${id}/widgets`)
```

### Step 2: Add Hook
```typescript
// useOptimizer.ts
export function useOptimizerCampaignWidgets(id: string) {
  return useQuery({
    queryKey: ['optimizerCampaignWidgets', id],
    queryFn: () => api.getOptimizerCampaignWidgets(id),
    enabled: !!id,
  })
}
```

### Step 3: Create Page File
Create `apps/web/src/pages/OptimizerWidgets.tsx`.

### Step 4: Add Route
```typescript
// App.tsx
import { OptimizerWidgets } from './pages/OptimizerWidgets'
// ...
<Route path="optimizer/:id/widgets" element={<OptimizerWidgets />} />
```

### Step 5: Page Implementation
```tsx
export function OptimizerWidgets() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: campaign } = useOptimizerCampaign(id!)
  const { data: widgets = [], isLoading } = useOptimizerCampaignWidgets(id!)
  const { data: campaigns = [] } = useCampaigns()
  const blacklistMutation = useAddToBlacklist()

  const campaignName = campaigns.find(c =>
    c.externalCampaignId === campaign?.externalCampaignId
  )?.name || campaign?.externalCampaignId || 'Campaign'

  const handleBlacklist = (widget: NormalizedWidget) => {
    blacklistMutation.mutate({
      sourceAccountId: campaign!.sourceAccountId,
      widgetId: widget.widgetId,
      widgetDomain: widget.widgetDomain,
      externalCampaignId: campaign!.externalCampaignId,
      reason: 'Blacklisted from optimizer',
    })
  }

  return (...)
}
```

### Step 6: Widgets Table
```tsx
const widgetColumns = [
  {
    key: 'widgetId',
    header: 'Widget',
    render: (w: NormalizedWidget) => (
      <div>
        <p className="font-mono text-sm">{w.widgetId}</p>
        {w.widgetDomain && <p className="text-xs text-muted-foreground">{w.widgetDomain}</p>}
      </div>
    ),
  },
  { key: 'impressions', header: 'Impr.', render: (w) => formatNumber(w.impressions), className: 'text-right' },
  { key: 'clicks', header: 'Clicks', render: (w) => formatNumber(w.clicks), className: 'text-right' },
  { key: 'spend', header: 'Spend', render: (w) => formatCurrency(w.spend), className: 'text-right' },
  { key: 'conversions', header: 'Conv.', render: (w) => formatNumber(w.conversions), className: 'text-right' },
  { key: 'ctr', header: 'CTR', render: (w) => `${(w.ctr * 100).toFixed(2)}%`, className: 'text-right' },
  { key: 'cpa', header: 'CPA', render: (w) => w.conversions > 0 ? formatCurrency(w.cpa) : '-', className: 'text-right' },
  {
    key: 'actions',
    header: '',
    render: (w: NormalizedWidget) => (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => handleBlacklist(w)}
        disabled={blacklistMutation.isPending}
      >
        <Ban className="h-4 w-4 text-destructive" />
      </Button>
    ),
  },
]

<DataTable data={widgets} columns={widgetColumns} keyField="widgetId" isLoading={isLoading} />
```

### Step 7: Header
```tsx
<div className="flex items-center gap-4">
  <Button variant="ghost" onClick={() => navigate(`/optimizer/${id}`)}>
    <ArrowLeft className="h-4 w-4" />
  </Button>
  <div>
    <h1 className="text-2xl font-bold">{campaignName}</h1>
    <p className="text-muted-foreground">Campaign Widgets</p>
  </div>
</div>
```

## Todo List
- [ ] Add NormalizedWidget type to api.ts
- [ ] Add getOptimizerCampaignWidgets API method
- [ ] Add useOptimizerCampaignWidgets hook
- [ ] Create OptimizerWidgets.tsx file
- [ ] Add route to App.tsx
- [ ] Implement header with back button
- [ ] Implement widgets table
- [ ] Wire up blacklist action
- [ ] Add loading state
- [ ] Add empty state

## Success Criteria
1. Page loads with widget data
2. Metrics display correctly
3. Blacklist button adds widget to blacklist
4. Toast notification on blacklist
5. Back button returns to detail page

## Risk Assessment
| Risk | Level | Mitigation |
|------|-------|------------|
| Backend endpoint missing | Medium | Define endpoint spec, coordinate with backend |
| Large widget list | Low | Consider pagination in future |
| Already blacklisted widgets | Low | Handle 409 conflict gracefully |

## Security Considerations
- Validate campaign ownership via session
- Prevent double blacklisting (handle 409)

## Backend Endpoint Requirement

If endpoint doesn't exist, backend needs:
```
GET /api/v1/optimizer/campaigns/:id/widgets

Response:
{
  "data": [
    {
      "widgetId": "123",
      "widgetName": "Site Name",
      "widgetDomain": "example.com",
      "impressions": 10000,
      "clicks": 250,
      "spend": 125.50,
      "conversions": 10,
      "ctr": 0.025,
      "cpc": 0.50,
      "cpa": 12.55
    }
  ]
}
```

## Unresolved Questions
1. Does `/optimizer/campaigns/:id/widgets` endpoint exist? If not, needs backend work.
2. Should blacklisted widgets be filtered from list or shown with indicator?
3. Pagination needed for large widget sets?
