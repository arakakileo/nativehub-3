# Testing Guide - Phase 02 Backend Unit Tests

## Overview

Phase 02 introduces comprehensive backend unit testing with Vitest, PGlite for isolated testing, and focused test coverage across all critical service layers.

**Test Coverage**: 78 unit tests across services, middleware, and utilities
**Test Framework**: Vitest with global test setup and PGlite integration
**Coverage Targets**: Lines: 85%, Functions: 85%, Branches: 80%, Statements: 85%

## Test Infrastructure

### Configuration

**File**: `apps/api/vitest.config.ts`

- **DB Mocking**: Module aliases map production `db.js` to `src/test/mocks/db.ts`
- **Test Environment**: Node environment with fork-based parallelization
- **Setup File**: `src/test/setup.ts` initializes PGlite and creates test tables
- **Timeout**: 10 seconds per test
- **Coverage**: V8 provider with HTML/JSON/text reporters

### Database Setup

**File**: `apps/api/src/test/setup.ts`

PGlite provides an in-memory PostgreSQL instance for isolated test execution:

1. **Initialization** (`beforeAll`):
   - Creates 8 test tables with proper relationships
   - Sets up encryption keys and JWT secrets
   - Initializes defaults and constraints

2. **Cleanup** (`beforeEach`):
   - Truncates all tables in dependency order
   - Clears all mocks

3. **Teardown** (`afterAll`):
   - Closes PGlite connection

**Tables Created**:
- `source_accounts` - Connected traffic source accounts
- `campaign_syncs` - Campaign metrics sync log
- `widget_blacklist` - Blacklisted publishers
- `optimizer_campaigns` - Campaign optimization config
- `optimizer_rules` - Rule templates and custom rules
- `optimizer_actions` - Action execution history
- `alerts` - User-facing alerts

### Mock Database Module

**File**: `apps/api/src/test/mocks/db.ts`

Exports:
- `testDb` - Drizzle ORM instance connected to PGlite
- `db` - Alias for testDb (imported by services)
- `pgClient` - Raw PGlite instance (for manual schema operations)

## Test Suites

### 1. Source Account Service Tests (18 tests)

**File**: `apps/api/src/services/source-account.service.test.ts`

Tests account lifecycle management with encryption:

#### Create Tests
- Creates accounts with encrypted credentials
- Stores optional fields (account ID, username, password)
- Generates unique IDs per account
- Validates encryption/decryption roundtrip

#### List Tests
- Lists user's accounts only (isolation)
- Filters by user ID and source
- Handles empty account lists

#### Get/Update/Delete Tests
- Retrieves accounts by ID
- Updates account fields and status
- Handles missing accounts
- Performs soft deletes with cascade

#### Integration Tests
- Encrypts credentials on create
- Decrypts on retrieval
- Tracks sync metadata

### 2. Optimizer Service Tests (14 tests)

**File**: `apps/api/src/services/optimizer/optimizer.service.test.ts`

Tests campaign optimization workflow:

#### Campaign Creation
- Creates optimizer campaigns with target CPA
- Returns existing campaigns (idempotence)
- Adds default rules to new campaigns
- Preserves target CPA on retrieval

#### Rule Management
- Lists rules for a campaign
- Filters by rule type and template
- Updates rule conditions and actions
- Deletes rules properly

#### Action Recording
- Logs optimization actions with metrics
- Tracks execution status and errors
- Associates actions with rules

### 3. Action Executor Tests (12 tests)

**File**: `apps/api/src/services/optimizer/action-executor.test.ts`

Tests rule action execution:

#### Bid Adjustment
- Increases/decreases bids correctly
- Validates bid constraints (min/max)
- Calculates percentages and fixed amounts
- Records previous/new values

#### Widget Blacklist
- Blacklists widgets correctly
- Associates with campaigns
- Stores metrics at blacklist time
- Handles duplicate blacklists

#### Execution Tracking
- Marks actions as executed
- Logs error messages on failure
- Tracks execution timestamp
- Maintains confidence scores

### 4. Rule Engine Tests (fixed)

**File**: `apps/api/src/services/optimizer/rule-engine.ts`

**Change**: `GeneratedAction.ruleId` type changed from `string` to `string | null`

Allows actions to be generated without explicit rule association (system-generated actions).

### 5. Traffic Source Tests (13 tests)

**File**: `apps/api/src/traffic-sources/revcontent/index.test.ts`

Tests Revcontent API integration:

#### Sync Operations
- Syncs campaigns from API
- Parses metrics (spend, impressions, clicks)
- Handles pagination
- Updates campaign status

#### Rate Limiting
- Respects API rate limits
- Implements backoff strategy
- Tracks remaining quota

#### Error Handling
- Handles auth failures
- Retries on transient errors
- Logs API errors

### 6. Middleware Tests

#### Auth Middleware (6 tests)

**File**: `apps/api/src/middleware/auth.test.ts`

- Validates JWT tokens
- Extracts user ID from claims
- Returns 401 on invalid token
- Skips auth for public routes
- Handles missing tokens

#### Error Handler Middleware (6 tests)

**File**: `apps/api/src/middleware/error-handler.test.ts`

- Catches and formats errors
- Returns appropriate HTTP status codes
- Logs errors with context
- Sends user-friendly messages
- Preserves error details in dev mode

### 7. Rate Limiter Tests (9 tests)

**File**: `apps/api/src/traffic-sources/utils/rate-limiter.test.ts`

- Enforces rate limits (requests/second)
- Tracks remaining quota
- Implements sliding window algorithm
- Handles burst traffic
- Resets counters appropriately

## Running Tests

### All Tests
```bash
npm run test --workspace=apps/api
```

### Specific Suite
```bash
npm run test -- source-account.service.test.ts
```

### Watch Mode
```bash
npm run test -- --watch
```

### Coverage Report
```bash
npm run test:coverage --workspace=apps/api
```

Coverage reports are generated in `apps/api/coverage/`:
- `coverage/index.html` - Interactive HTML report
- `coverage/coverage-final.json` - Machine-readable results

## Test Utilities

### Fixtures

**File**: `apps/api/src/test/fixtures/index.ts`

Provides constants for all tests:

```typescript
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_USER_ID_2 = '00000000-0000-0000-0000-000000000002'
export const TEST_SOURCE_ACCOUNT_ID = '...'
// ... more fixtures
```

### Mock Helpers

Mock common dependencies:

```typescript
// Mock traffic source
vi.mock('../../traffic-sources/index.js', () => ({
  getAuthenticatedSource: vi.fn(),
}))

// Import after mocking
const { optimizerService } = await import('./optimizer.service.js')
```

## Best Practices

### 1. Test Isolation
- Each test starts with a clean database (pre-emptied in `beforeEach`)
- Mock external APIs (traffic sources, authentication)
- Use fixtures for consistent test data

### 2. Test Organization
- Group related tests with `describe()` blocks
- Name tests as "should [action] [condition]"
- Use `beforeEach` for shared setup

### 3. Assertions
- Test behavior, not implementation
- Verify both positive and negative cases
- Check side effects (database writes, logs)

### 4. Coverage
- Aim for 85% line/function coverage
- 80% branch coverage (conditional logic)
- Focus on critical paths over edge cases

## Extending Tests

### Add Service Test
1. Create `src/services/my-service.test.ts`
2. Import test utilities and fixtures
3. Use `beforeEach` to set up test data
4. Follow existing test patterns

### Add Integration Test
1. Use same setup (PGlite + fixtures)
2. Don't mock service dependencies
3. Mock only external APIs
4. Verify database state changes

### Mock External APIs
```typescript
vi.mock('../../external-api.js', () => ({
  callApi: vi.fn().mockResolvedValue({ success: true }),
}))
```

## Debugging Tests

### Run Single Test
```bash
npm run test -- --reporter=verbose source-account.service.test.ts
```

### Add Debug Output
```typescript
it('should do something', async () => {
  console.log('Debug:', testData)
  expect(result).toBeDefined()
})
```

### Inspect Database
```typescript
it('should create account', async () => {
  await sourceAccountService.create(TEST_USER_ID, {...})

  // Check database directly
  const accounts = await db.select().from(sourceAccounts)
  console.log('Accounts:', accounts)
})
```

## CI/CD Integration

Tests run on every pull request via GitHub Actions. Coverage reports are published to the repository. Minimum coverage thresholds must be met to merge.

## Known Limitations

1. **BYTEA vs TEXT**: PGlite uses TEXT for binary data; production uses BYTEA
2. **No Transactions**: Tests use truncation instead of rollback for speed
3. **No Concurrency**: Single-fork test execution (no parallel race conditions)

## Architecture Overview

```
test/
├── setup.ts                 # PGlite initialization
├── mocks/
│   └── db.ts               # Mock database module
├── fixtures/
│   └── index.ts            # Test constants
└── ...
services/
├── source-account.service.test.ts
├── optimizer/
│   ├── optimizer.service.test.ts
│   ├── action-executor.test.ts
│   └── rule-engine.test.ts
├── ...
middleware/
├── auth.test.ts
├── error-handler.test.ts
└── ...
traffic-sources/
├── revcontent/
│   └── index.test.ts
└── utils/
    └── rate-limiter.test.ts
```

## Related Documents

- [Code Standards](./code-standards.md) - General testing conventions
- [System Architecture](./system-architecture.md) - Service layer design
- [Deployment Guide](./deployment-guide.md) - Test environment setup
