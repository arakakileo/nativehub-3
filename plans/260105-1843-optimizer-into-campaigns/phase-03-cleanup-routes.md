# Phase 3: Remove Standalone Optimizer Routes

## Context

- Parent plan: [plan.md](./plan.md)
- Dependencies: [Phase 2](./phase-02-integrate-optimizer.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-01-05 |
| Priority | P2 |
| Effort | 1h |
| Implementation Status | Pending |
| Review Status | Pending |

Remove the standalone optimizer pages and update navigation.

## Key Insights

- Three optimizer pages to remove: Optimizer.tsx, OptimizerDetail.tsx, OptimizerWidgets.tsx
- Sidebar has "Optimizer" nav item to remove
- Routes: /optimizer, /optimizer/:id, /optimizer/:id/widgets

## Requirements

1. Remove optimizer routes from App.tsx
2. Remove optimizer nav item from sidebar
3. Delete optimizer page files (or archive)
4. Update any remaining links to optimizer

## Related Code Files

- `apps/web/src/App.tsx` - Remove routes
- `apps/web/src/components/Sidebar.tsx` - Remove nav item
- `apps/web/src/pages/Optimizer.tsx` - DELETE
- `apps/web/src/pages/OptimizerDetail.tsx` - DELETE
- `apps/web/src/pages/OptimizerWidgets.tsx` - DELETE

## Implementation Steps

### Step 1: Remove Routes from App.tsx

```tsx
// REMOVE these routes:
// <Route path="/optimizer" element={<Optimizer />} />
// <Route path="/optimizer/:id" element={<OptimizerDetail />} />
// <Route path="/optimizer/:id/widgets" element={<OptimizerWidgets />} />

// REMOVE these imports:
// import { Optimizer } from './pages/Optimizer'
// import { OptimizerDetail } from './pages/OptimizerDetail'
// import { OptimizerWidgets } from './pages/OptimizerWidgets'
```

### Step 2: Update Sidebar Navigation

```tsx
// Sidebar.tsx - REMOVE optimizer nav item
const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Megaphone, label: 'Campaigns', path: '/campaigns' },
  // REMOVE: { icon: Zap, label: 'Optimizer', path: '/optimizer' },
  { icon: Building2, label: 'Accounts', path: '/accounts' },
  { icon: Settings, label: 'Settings', path: '/settings' },
]
```

### Step 3: Delete Page Files

Delete these files:
- `apps/web/src/pages/Optimizer.tsx`
- `apps/web/src/pages/OptimizerDetail.tsx`
- `apps/web/src/pages/OptimizerWidgets.tsx`

### Step 4: Search for Remaining References

Check for any other files linking to /optimizer:
```bash
grep -r "/optimizer" apps/web/src/
```

Update any found references to point to `/campaigns/:id` instead.

## Todo List

- [ ] Remove optimizer routes from App.tsx
- [ ] Remove optimizer from sidebar nav
- [ ] Delete Optimizer.tsx
- [ ] Delete OptimizerDetail.tsx
- [ ] Delete OptimizerWidgets.tsx
- [ ] Search and update remaining references

## Success Criteria

- [ ] /optimizer routes return 404
- [ ] Sidebar has no Optimizer item
- [ ] No broken links in app
- [ ] Build succeeds without optimizer imports

## Risk Assessment

- **Low**: Removing routes is safe after Phase 2 complete
- **Low**: No backend changes

## Security Considerations

- None - just frontend cleanup

## Next Steps

After Phase 3 complete → Phase 4: Testing and polish
