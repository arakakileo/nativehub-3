# Phase 03: Frontend Filters & Sorting UI

## Context
- Parent: [plan.md](./plan.md)
- Depends on: [Phase 02](./phase-02-campaign-api.md)
- File: `apps/web/src/pages/Campaigns.tsx`

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-01-04 |
| Priority | P1 |
| Implementation | pending |
| Review | pending |
| Effort | 1.5h |

## Requirements

1. Date range picker (from/to) - filters by syncedAt
2. Status dropdown (Active, Paused only) - no deleted by default
3. Clickable column headers for sorting (all columns)
4. CPC column with formatted values
5. Default sort: Active first, then by spend (desc)
6. Maintain source account filter

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Filters Bar                                         │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│ │ Source ▼ │ │ Status ▼ │ │ From 📅  │ │ To 📅   ││
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Campaign ▲ │ Status │ Spend ▼ │ Clicks │ CPC │ ... │
├─────────────────────────────────────────────────────┤
│ Camp A      │ active │ $1,234  │ 500    │ $2.47│    │
└─────────────────────────────────────────────────────┘
```

## Related Code Files

- `apps/web/src/pages/Campaigns.tsx:1-183` - Main component
- `apps/web/src/hooks/useCampaigns.ts` - Query hook
- `apps/web/src/lib/api.ts:84-87` - API method
- `apps/web/src/components/ui/DataTable.tsx` - Table component

## Implementation Steps

### Step 1: Update API Types

```typescript
// apps/web/src/lib/api.ts
export interface CampaignFilters {
  sourceAccountId?: string
  from?: string
  to?: string
  status?: 'active' | 'paused' | 'deleted' | 'all'
  sortBy?: 'name' | 'spend' | 'conversions' | 'clicks' | 'cpc'
  sortOrder?: 'asc' | 'desc'
}

getCampaigns = (filters?: CampaignFilters): Promise<Campaign[]> => {
  const params = new URLSearchParams()
  if (filters?.sourceAccountId) params.set('sourceAccountId', filters.sourceAccountId)
  if (filters?.from) params.set('from', filters.from)
  if (filters?.to) params.set('to', filters.to)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.sortBy) params.set('sortBy', filters.sortBy)
  if (filters?.sortOrder) params.set('sortOrder', filters.sortOrder)

  const query = params.toString() ? `?${params.toString()}` : ''
  return this.request(`/api/v1/campaigns${query}`)
}
```

### Step 2: Update useCampaigns Hook

```typescript
// apps/web/src/hooks/useCampaigns.ts
import type { CampaignFilters } from '../lib/api'

export function useCampaigns(filters?: CampaignFilters) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: () => api.getCampaigns(filters),
  })
}
```

### Step 3: Add Filter State to Campaigns.tsx

```typescript
const [filters, setFilters] = useState<CampaignFilters>({
  status: 'active', // Show active first by default
  sortBy: 'spend',
  sortOrder: 'desc',
})

const { data: campaigns = [], isLoading, refetch } = useCampaigns(filters)

// Update filter
const updateFilter = (key: keyof CampaignFilters, value: string) => {
  setFilters(prev => ({ ...prev, [key]: value }))
}

// Toggle sort
const toggleSort = (column: CampaignFilters['sortBy']) => {
  setFilters(prev => ({
    ...prev,
    sortBy: column,
    sortOrder: prev.sortBy === column && prev.sortOrder === 'asc' ? 'desc' : 'asc',
  }))
}
```

### Step 4: Add Filter UI

```tsx
<div className="flex gap-3 flex-wrap">
  {/* Source Account */}
  <select
    value={filters.sourceAccountId || ''}
    onChange={(e) => updateFilter('sourceAccountId', e.target.value)}
    className="rounded-lg border bg-background px-3 py-2 text-sm"
  >
    <option value="">All Sources</option>
    {accounts.map((acc) => (
      <option key={acc.id} value={acc.id}>{acc.name}</option>
    ))}
  </select>

  {/* Status */}
  <select
    value={filters.status || 'active'}
    onChange={(e) => updateFilter('status', e.target.value)}
    className="rounded-lg border bg-background px-3 py-2 text-sm"
  >
    <option value="active">Active</option>
    <option value="paused">Paused</option>
    <option value="all">All Status</option>
  </select>

  {/* Date From */}
  <input
    type="date"
    value={filters.from || ''}
    onChange={(e) => updateFilter('from', e.target.value)}
    className="rounded-lg border bg-background px-3 py-2 text-sm"
  />

  {/* Date To */}
  <input
    type="date"
    value={filters.to || ''}
    onChange={(e) => updateFilter('to', e.target.value)}
    className="rounded-lg border bg-background px-3 py-2 text-sm"
  />
</div>
```

### Step 5: Add Sortable Column Headers

```typescript
const SortableHeader = ({
  column,
  label,
}: {
  column: CampaignFilters['sortBy']
  label: string
}) => (
  <button
    onClick={() => toggleSort(column)}
    className="flex items-center gap-1 hover:text-foreground"
  >
    {label}
    {filters.sortBy === column && (
      filters.sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
    )}
  </button>
)
```

### Step 6: Add CPC Column

```typescript
{
  key: 'cpc',
  header: 'CPC',
  render: (c: Campaign) => formatCurrency(c.cpc || 0),
  className: 'text-right',
},
```

### Step 7: Update Column Headers

```typescript
{
  key: 'name',
  header: () => <SortableHeader column="name" label="Campaign" />,
  // ... render
},
{
  key: 'spend',
  header: () => <SortableHeader column="spend" label="Spend" />,
  // ... render
},
{
  key: 'conversions',
  header: () => <SortableHeader column="conversions" label="Conv." />,
  // ... render
},
```

## Todo List
- [ ] Update CampaignFilters type in api.ts
- [ ] Update getCampaigns method with query params
- [ ] Update useCampaigns hook to accept filters
- [ ] Add filter state to Campaigns component
- [ ] Add filter UI (status, date from/to)
- [ ] Add sortable column headers
- [ ] Add CPC column
- [ ] Import ChevronUp, ChevronDown from lucide-react
- [ ] Test filter combinations

## Success Criteria
- [ ] Filters persist across refetches
- [ ] Sorting shows visual indicator (arrow)
- [ ] Date inputs are native HTML date pickers
- [ ] CPC column displays formatted currency
- [ ] Empty state shows when no results match filters

## Risk Assessment
- **Low**: DataTable may need header prop type update. Check if header can be component
- **Low**: Date picker styling may vary by browser. Acceptable for MVP

## Security Considerations
- All filtering happens server-side (no client-side data exposure)
- Input validation prevents injection
