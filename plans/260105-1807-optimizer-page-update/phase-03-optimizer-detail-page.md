# Phase 3: Optimizer Detail Page

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-01-05 |
| Priority | P1 |
| Status | pending |
| Effort | 2h |

## Context Links
- API Endpoint: `GET /optimizer/campaigns/:id`
- Actions Endpoint: `GET /optimizer/campaigns/:id/actions`
- Run Endpoint: `POST /optimizer/campaigns/:id/run`
- Router: `apps/web/src/App.tsx`

## Key Insights
- Campaign detail returns rules nested within response
- Actions are separate endpoint with pagination
- Need editable settings: targetCpa, bidStrategy, enabled toggle
- Link to widgets page at `/optimizer/:id/widgets`

## Requirements
1. Route: `/optimizer/:id`
2. Header: Campaign name + Run button + Back button
3. Tabs/Sections:
   - Settings (targetCpa, bidStrategy, enabled)
   - Rules (list from campaign.rules)
   - Action History (paginated)
4. Link to widgets page
5. Inline edit for settings with save

## Architecture

### Component Structure
```
OptimizerDetail.tsx
├── Header
│   ├── Back Button
│   ├── Campaign Name
│   └── Run Button
├── Settings Card
│   ├── Enabled Toggle
│   ├── Target CPA (editable)
│   └── Bid Strategy (editable)
├── Widgets Link Card
└── Tabs
    ├── Rules Tab
    │   └── DataTable (rules)
    └── Actions Tab
        └── DataTable (actions)
```

### URL Params
```typescript
const { id } = useParams<{ id: string }>()
```

### Data Fetching
```typescript
const { data: campaign, isLoading } = useOptimizerCampaign(id!)
const { data: actions = [] } = useOptimizerCampaignActions(id!)
const { data: campaigns = [] } = useCampaigns() // for name lookup
```

## Related Files
| File | Action |
|------|--------|
| `apps/web/src/pages/OptimizerDetail.tsx` | Create new |
| `apps/web/src/App.tsx` | Add route |

## Implementation Steps

### Step 1: Create Page File
Create `apps/web/src/pages/OptimizerDetail.tsx`.

### Step 2: Add Route to App.tsx
```typescript
import { OptimizerDetail } from './pages/OptimizerDetail'
// ...
<Route path="optimizer/:id" element={<OptimizerDetail />} />
```

### Step 3: Page Structure
```tsx
export function OptimizerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'rules' | 'actions'>('rules')

  const { data: campaign, isLoading } = useOptimizerCampaign(id!)
  const { data: actions = [] } = useOptimizerCampaignActions(id!)
  const { data: campaigns = [] } = useCampaigns()
  const updateMutation = useUpdateOptimizerCampaign()
  const runMutation = useRunOptimizerCampaign()

  if (isLoading) return <LoadingState />
  if (!campaign) return <NotFoundState />

  const campaignName = campaigns.find(c =>
    c.externalCampaignId === campaign.externalCampaignId
  )?.name || campaign.externalCampaignId

  return (...)
}
```

### Step 4: Header Component
```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-4">
    <Button variant="ghost" onClick={() => navigate('/optimizer')}>
      <ArrowLeft className="h-4 w-4" />
    </Button>
    <div>
      <h1 className="text-2xl font-bold">{campaignName}</h1>
      <p className="text-muted-foreground">Optimizer Settings</p>
    </div>
  </div>
  <Button onClick={() => runMutation.mutate(id!)} isLoading={runMutation.isPending}>
    <Zap className="h-4 w-4" />
    Run Optimization
  </Button>
</div>
```

### Step 5: Settings Card
```tsx
<div className="rounded-xl border bg-card p-6">
  <h3 className="text-lg font-medium mb-4">Settings</h3>
  <div className="grid grid-cols-3 gap-6">
    {/* Enabled Toggle */}
    <div>
      <label className="text-sm text-muted-foreground">Status</label>
      <button onClick={toggleEnabled} className="...">
        {campaign.enabled ? 'Enabled' : 'Disabled'}
      </button>
    </div>

    {/* Target CPA */}
    <div>
      <label className="text-sm text-muted-foreground">Target CPA</label>
      <EditableInput
        value={campaign.targetCpa}
        onSave={(val) => updateMutation.mutate({ id: id!, data: { targetCpa: val }})}
      />
    </div>

    {/* Bid Strategy */}
    <div>
      <label className="text-sm text-muted-foreground">Bid Strategy</label>
      <select onChange={(e) => updateMutation.mutate({ id: id!, data: { bidStrategy: e.target.value }})}>
        <option value="target_cpa">Target CPA</option>
        <option value="maximize_conversions">Maximize Conversions</option>
        <option value="manual">Manual</option>
      </select>
    </div>
  </div>
</div>
```

### Step 6: Widgets Link Card
```tsx
<div
  className="rounded-xl border bg-card p-4 cursor-pointer hover:bg-muted/50 transition-colors"
  onClick={() => navigate(`/optimizer/${id}/widgets`)}
>
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <LayoutGrid className="h-5 w-5 text-muted-foreground" />
      <div>
        <p className="font-medium">View Widgets</p>
        <p className="text-sm text-muted-foreground">Manage publishers for this campaign</p>
      </div>
    </div>
    <ChevronRight className="h-5 w-5 text-muted-foreground" />
  </div>
</div>
```

### Step 7: Rules Table
```tsx
const rulesColumns = [
  { key: 'name', header: 'Rule Name' },
  { key: 'enabled', header: 'Status', render: (r) => <StatusBadge status={r.enabled ? 'active' : 'disabled'} /> },
  { key: 'priority', header: 'Priority' },
  { key: 'ruleType', header: 'Type', render: (r) => <span className="capitalize">{r.ruleType.replace(/_/g, ' ')}</span> },
]

<DataTable data={campaign.rules || []} columns={rulesColumns} keyField="id" />
```

### Step 8: Actions Table
```tsx
const actionsColumns = [
  { key: 'actionType', header: 'Action', render: (a) => <span className="capitalize">{a.actionType.replace(/_/g, ' ')}</span> },
  { key: 'targetName', header: 'Target', render: (a) => a.targetName || a.targetId },
  { key: 'executed', header: 'Status', render: (a) => <StatusBadge status={a.executed ? 'executed' : 'pending'} /> },
  { key: 'executedAt', header: 'Executed At', render: (a) => a.executedAt ? new Date(a.executedAt).toLocaleString() : '-' },
  { key: 'reason', header: 'Reason', render: (a) => a.reason || '-' },
]

<DataTable data={actions} columns={actionsColumns} keyField="id" />
```

## Todo List
- [ ] Create OptimizerDetail.tsx file
- [ ] Add route to App.tsx
- [ ] Implement loading state
- [ ] Implement not found state
- [ ] Create header with back + run buttons
- [ ] Create settings card with editable fields
- [ ] Create widgets link card
- [ ] Create tabs (Rules | Actions)
- [ ] Implement rules table
- [ ] Implement actions table
- [ ] Wire up update mutations
- [ ] Wire up run mutation
- [ ] Add toast notifications

## Success Criteria
1. Page loads with campaign data
2. Settings editable inline with save
3. Run button triggers per-campaign optimization
4. Rules table shows nested rules
5. Actions table shows action history
6. Widgets link navigates correctly

## Risk Assessment
| Risk | Level | Mitigation |
|------|-------|------------|
| No rules exist | Low | Empty state in table |
| Long action history | Low | Limit param (50 default) |
| Stale data | Low | Invalidate on mutations |

## Security Considerations
- Validate id param before API calls
- Handle 404 gracefully

## Next Steps
After completion, proceed to Phase 4: Widgets Page.
