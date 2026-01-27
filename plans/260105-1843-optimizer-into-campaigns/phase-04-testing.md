# Phase 4: Testing and Polish

## Context

- Parent plan: [plan.md](./plan.md)
- Dependencies: [Phase 3](./phase-03-cleanup-routes.md)

## Overview

| Field | Value |
|-------|-------|
| Date | 2026-01-05 |
| Priority | P2 |
| Effort | 1h |
| Implementation Status | Pending |
| Review Status | Pending |

End-to-end testing of the integrated campaign detail page.

## Requirements

1. Test all user flows work correctly
2. Verify data consistency
3. Polish UI/UX details
4. Deploy and verify on VPS

## Test Cases

### TC1: Campaign List Navigation
- [ ] Load /campaigns page
- [ ] Click on a campaign row
- [ ] Verify navigation to /campaigns/{id}
- [ ] Verify back button returns to list

### TC2: Overview Tab
- [ ] Campaign name displayed correctly
- [ ] Source badge shows correct color
- [ ] Metrics match campaigns list values
- [ ] Status indicator works

### TC3: Optimizer Tab - New Campaign
- [ ] Campaign without optimizer shows "Enable" button
- [ ] Click "Enable Optimizer" creates config
- [ ] Settings form appears after enable

### TC4: Optimizer Tab - Existing Config
- [ ] Settings load correctly (enabled, target CPA, bid strategy)
- [ ] Edit mode works
- [ ] Save updates config
- [ ] Rules table displays correctly

### TC5: Widgets Tab
- [ ] Active widgets load
- [ ] Blacklisted widgets load in separate tab
- [ ] Block widget adds to blacklist
- [ ] Unblock widget removes from blacklist
- [ ] Widget counts update

### TC6: Actions Tab
- [ ] Action history loads
- [ ] Shows action type, target, reason, status, date
- [ ] Empty state shows "No actions executed"

### TC7: Run Optimization
- [ ] "Run Optimization" button works from campaign detail
- [ ] Actions appear after run
- [ ] Toast notification shows result

## UI Polish

- [ ] Loading states for all tabs
- [ ] Error handling with user-friendly messages
- [ ] Consistent spacing and typography
- [ ] Mobile responsive layout
- [ ] Tab transition animations (optional)

## Implementation Steps

### Step 1: Manual Testing

Go through all test cases manually on local dev.

### Step 2: Fix Issues

Address any bugs found during testing.

### Step 3: Deploy to VPS

```bash
ssh vps
cd /srv/nativehub-3
git pull origin master
docker compose build
docker compose up -d
```

### Step 4: Production Verification

Test on https://nativehub.arakakileo.com/campaigns

## Todo List

- [ ] TC1: Campaign navigation
- [ ] TC2: Overview tab
- [ ] TC3: Enable optimizer flow
- [ ] TC4: Edit optimizer settings
- [ ] TC5: Widget management
- [ ] TC6: Action history
- [ ] TC7: Run optimization
- [ ] UI polish items
- [ ] Deploy to VPS
- [ ] Production verification

## Success Criteria

- [ ] All test cases pass
- [ ] No console errors
- [ ] No broken layouts
- [ ] Production deployment working

## Risk Assessment

- **Low**: Testing phase, issues can be fixed
- **Medium**: Edge cases in optimizer creation flow

## Security Considerations

- Verify no data leakage between campaigns
- Test with different source accounts

## Next Steps

After Phase 4 complete → Project complete! Update roadmap.
