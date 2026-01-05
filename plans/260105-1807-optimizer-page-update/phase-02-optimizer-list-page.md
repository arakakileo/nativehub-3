# Phase 2: Optimizer List Page

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-01-05 |
| Priority | P1 |
| Status | pending |
| Effort | 1.5h |

## Context Links
- Current Page: `apps/web/src/pages/Optimizer.tsx`
- DataTable: `apps/web/src/components/ui/DataTable.tsx`
- Campaigns Page (pattern): `apps/web/src/pages/Campaigns.tsx`
- Modal Component: `apps/web/src/components/ui/Modal.tsx`

## Key Insights
- Current page has tabs: Rules | Actions
- New page has tabs: Campaigns | Rules (global) | Action History
- Default tab must be Campaigns
- "Run All" button in header
- Row click navigates to `/optimizer/:id`
- Create modal accessible from optimizer page AND campaigns page

## Requirements
1. Default tab: Campaigns (shows OptimizerCampaign list)
2. Optional tabs: Rules (deprecated), Action History
3. Header: "Run All" button + "Add Campaign" button
4. DataTable with row click → navigate to detail page
5. Create Campaign Modal with:
   - Campaign selector (from synced campaigns)
   - Target CPA input
   - Bid Strategy select

## Architecture

### Component Structure
```
Optimizer.tsx
├── Header (Run All + Add Campaign buttons)
├── Tabs (Campaigns | Rules | Actions)
├── DataTable (campaigns list)
└── CreateOptimizerCampaignModal
    ├── Campaign Selector
    ├── Target CPA Input
    └── Bid Strategy Select
```

### State
```typescript
const [activeTab, setActiveTab] = useState<'campaigns' | 'rules' | 'actions'>('campaigns')
const [showCreateModal, setShowCreateModal] = useState(false)
```

### Columns for Campaigns Table
| Column | Key | Render |
|--------|-----|--------|
| Campaign | name | Fetch from campaigns by externalCampaignId |
| Status | enabled | StatusBadge (enabled/disabled) |
| Target CPA | targetCpa | formatCurrency |
| Bid Strategy | bidStrategy | Capitalize + replace _ |
| Actions | - | Run button + toggle |

## Related Files
| File | Action |
|------|--------|
| `apps/web/src/pages/Optimizer.tsx` | Refactor completely |
| `apps/web/src/App.tsx` | No change needed |

## Implementation Steps

### Step 1: Import New Hooks
Replace old imports with new optimizer campaign hooks.

### Step 2: Refactor State
```typescript
const [activeTab, setActiveTab] = useState<'campaigns' | 'rules' | 'actions'>('campaigns')
const [showCreateModal, setShowCreateModal] = useState(false)
const [createForm, setCreateForm] = useState({
  sourceAccountId: '',
  externalCampaignId: '',
  targetCpa: '',
  bidStrategy: 'target_cpa' as const,
})
```

### Step 3: Fetch Data
```typescript
const { data: optimizerCampaigns = [], isLoading } = useOptimizerCampaigns()
const { data: campaigns = [] } = useCampaigns() // for selector
const runAllMutation = useRunOptimizerAll()
const createMutation = useCreateOptimizerCampaign()
```

### Step 4: Campaign Columns
```typescript
const campaignColumns = [
  {
    key: 'externalCampaignId',
    header: 'Campaign',
    render: (c: OptimizerCampaign) => {
      const campaign = campaigns.find(x => x.externalCampaignId === c.externalCampaignId)
      return campaign?.name || c.externalCampaignId
    }
  },
  {
    key: 'enabled',
    header: 'Status',
    render: (c: OptimizerCampaign) => (
      <StatusBadge status={c.enabled ? 'enabled' : 'disabled'} />
    )
  },
  {
    key: 'targetCpa',
    header: 'Target CPA',
    render: (c: OptimizerCampaign) => formatCurrency(c.targetCpa),
    className: 'text-right'
  },
  {
    key: 'bidStrategy',
    header: 'Bid Strategy',
    render: (c: OptimizerCampaign) => (
      <span className="capitalize">{c.bidStrategy.replace(/_/g, ' ')}</span>
    )
  },
  {
    key: 'actions',
    header: '',
    render: (c: OptimizerCampaign) => (
      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); runCampaign(c.id) }}>
        <Zap className="h-4 w-4" />
      </Button>
    )
  }
]
```

### Step 5: Row Click Handler
```typescript
const navigate = useNavigate()
const handleRowClick = (campaign: OptimizerCampaign) => {
  navigate(`/optimizer/${campaign.id}`)
}
```

### Step 6: Create Modal
Use existing Modal component with form:
- Select: Source Account + Campaign (filtered to non-optimizer campaigns)
- Input: Target CPA (number)
- Select: Bid Strategy (target_cpa | maximize_conversions | manual)

### Step 7: Handle Create
```typescript
const handleCreate = async (e: React.FormEvent) => {
  e.preventDefault()
  await createMutation.mutateAsync({
    sourceAccountId: createForm.sourceAccountId,
    externalCampaignId: createForm.externalCampaignId,
    targetCpa: parseFloat(createForm.targetCpa),
    bidStrategy: createForm.bidStrategy,
  })
  setShowCreateModal(false)
  resetForm()
}
```

## Todo List
- [ ] Replace hook imports
- [ ] Update state for tabs and modal
- [ ] Add useNavigate import
- [ ] Create campaignColumns definition
- [ ] Implement row click navigation
- [ ] Update header with Run All + Add Campaign
- [ ] Update tabs to show Campaigns first
- [ ] Implement CreateOptimizerCampaignModal
- [ ] Add campaign selector (filter already-added)
- [ ] Add form validation
- [ ] Handle create submission
- [ ] Add loading states

## Success Criteria
1. Page loads with Campaigns tab active
2. Table shows optimizer campaigns with correct data
3. Row click navigates to /optimizer/:id
4. Run All button triggers optimization
5. Create modal opens, validates, and creates campaign
6. Toast notifications on actions

## Risk Assessment
| Risk | Level | Mitigation |
|------|-------|------------|
| Missing campaign data | Low | Join with campaigns query |
| Empty state confusion | Low | Clear empty state message |

## Security Considerations
- Form validation prevents invalid targetCpa values
- Selector only shows user's campaigns

## Next Steps
After completion, proceed to Phase 3: Optimizer Detail Page.
