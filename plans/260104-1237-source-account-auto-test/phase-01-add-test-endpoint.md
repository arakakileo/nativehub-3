# Phase 01: Add Test Endpoint & Hook

## Context
- Parent: [plan.md](./plan.md)
- Backend endpoint exists: `POST /api/v1/source-accounts/:id/test`
- Frontend missing: API method and React Query hook

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-01-04 |
| Priority | P1 |
| Implementation | ✅ done |
| Review | ✅ done |
| Effort | 30min |

## Requirements
1. Add `testSourceAccount` method to API client
2. Create `useTestSourceAccount` React Query mutation hook
3. No UI changes in this phase

## Implementation Steps

### Step 1: Add API Method
File: `apps/web/src/lib/api.ts`

Add after `syncSourceAccount`:
```typescript
testSourceAccount = (id: string): Promise<{ success: boolean; message?: string }> =>
  this.request(`/api/v1/source-accounts/${id}/test`, { method: 'POST' })
```

### Step 2: Add React Query Hook
File: `apps/web/src/hooks/useSourceAccounts.ts`

Add new hook:
```typescript
export function useTestSourceAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.testSourceAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourceAccounts'] })
    },
    // No toast here - handled by caller
  })
}
```

## Todo List
- [x] Add testSourceAccount to api.ts
- [x] Add useTestSourceAccount hook
- [x] Verify TypeScript compiles

## Success Criteria
- [x] API method exists and typed correctly
- [x] Hook exported from useSourceAccounts.ts
- [x] Build passes

## Next Steps
→ Phase 02: Integrate auto-test in create flow
