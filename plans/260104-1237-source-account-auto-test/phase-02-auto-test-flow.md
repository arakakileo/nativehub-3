# Phase 02: Auto-Test After Create

## Context
- Parent: [plan.md](./plan.md)
- Depends on: [Phase 01](./phase-01-add-test-endpoint.md)
- File: `apps/web/src/pages/SourceAccounts.tsx`

## Overview
| Field | Value |
|-------|-------|
| Date | 2026-01-04 |
| Priority | P1 |
| Implementation | ✅ done |
| Review | ✅ done |
| Effort | 30min |

## Requirements
1. After createMutation succeeds, auto-call testMutation
2. Show loading states for both operations
3. Handle test failure gracefully (account created but not connected)
4. Show appropriate toast messages

## Architecture
```
User submits form
    ↓
createMutation.mutateAsync(payload)
    ↓ (returns account with id)
testMutation.mutateAsync(account.id)
    ↓
Success: "Account connected!" | Failure: "Created but connection failed"
    ↓
Close modal, refresh list
```

## Related Code Files
- `apps/web/src/pages/SourceAccounts.tsx:52-67` - handleSubmit function
- `apps/web/src/hooks/useSourceAccounts.ts` - mutations

## Implementation Steps

### Step 1: Import Test Hook
```typescript
import {
  useSourceAccounts,
  useCreateSourceAccount,
  useTestSourceAccount,  // ADD
  useDeleteSourceAccount,
  useSyncSourceAccount,
} from '../hooks/useSourceAccounts'
```

### Step 2: Initialize Test Mutation
```typescript
const testMutation = useTestSourceAccount()
```

### Step 3: Update handleSubmit
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()

  const payload: CreateSourceAccountInput = {
    sourceId: form.sourceId,
    name: form.name,
    clientId: form.credentials.clientId || '',
    clientSecret: form.credentials.clientSecret,
    accountId: form.credentials.accountId,
  }

  try {
    // Step 1: Create account
    const account = await createMutation.mutateAsync(payload)

    // Step 2: Test connection
    try {
      await testMutation.mutateAsync(account.id)
      toast.success('Account connected successfully')
    } catch {
      toast.warning('Account created but connection test failed. Try syncing later.')
    }

    setShowModal(false)
    setForm({ sourceId: 'revcontent', name: '', credentials: {} })
  } catch {
    // Create failed - error already shown by mutation
  }
}
```

### Step 4: Update Button Loading State
```typescript
<Button
  type="submit"
  className="flex-1"
  isLoading={createMutation.isPending || testMutation.isPending}
>
  {createMutation.isPending
    ? 'Creating...'
    : testMutation.isPending
      ? 'Testing connection...'
      : 'Add Account'}
</Button>
```

## Todo List
- [x] Import useTestSourceAccount hook
- [x] Initialize testMutation
- [x] Update handleSubmit with chained calls
- [x] Update button loading state
- [x] Remove duplicate toast from useCreateSourceAccount hook
- [x] Test with real Outbrain credentials
- [x] Add Test Connection button for pending accounts

## Success Criteria
- [x] Account auto-tests after creation
- [x] Status becomes `connected` on success
- [x] Sync button works immediately
- [x] Error shows warning toast, not error
- [x] Manual test available for existing pending accounts

## Risk Assessment
- **Low**: Test endpoint may fail due to invalid credentials → Handled with warning toast
- **Low**: Race condition if modal closes early → Await both mutations before closing

## Security Considerations
- No new security concerns - using existing authenticated endpoints
