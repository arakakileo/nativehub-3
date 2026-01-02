# System Architecture - NativeHub 3.0

## Overview

NativeHub 3.0 is a distributed, layered system designed for managing native advertising campaigns across multiple traffic sources. The architecture emphasizes separation of concerns, testability, and scalability.

## Architectural Layers

### 1. Presentation Layer (Frontend)

**Technology**: React + TypeScript + Vite

**Components**:
- Dashboard UI (campaigns, metrics, charts)
- Account management (connect/disconnect sources)
- Rule builder and management
- Blacklist management interface
- Settings and user preferences

**Key Patterns**:
- React Query for data fetching and caching
- Context API for global state
- React Hook Form for form management
- Component composition and reusability

**Data Flow**:
```
User Interaction → React Component → Custom Hook → API Call → State Update → Re-render
```

### 2. API Gateway & Middleware Layer

**Technology**: Hono middleware stack + Better Auth

**Responsibilities**:
- Session-based authentication (HTTP-only cookies)
- Better Auth framework integration
- Request/response transformation
- Error handling and logging
- Rate limiting (tiered by endpoint type)
- CORS handling
- Request ID tracking for tracing

**Key Middleware**:

```typescript
// session.middleware.ts - Session validation
export const sessionMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!session?.user?.id) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  c.set("user", session.user)
  c.set("userId", session.user.id)

  await next()
})

// rate-limit.middleware.ts - Tiered rate limiting
export const authRateLimiter = createMiddleware(async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const { allowed, remaining, resetTime } = checkRateLimit(
    ip,
    15 * 60 * 1000,  // 15-minute window
    10                // 10 requests max
  )

  c.header("X-RateLimit-Limit", "10")
  c.header("X-RateLimit-Remaining", String(remaining))
  c.header("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)))

  if (!allowed) {
    return c.json({ error: "Too many requests" }, 429)
  }

  await next()
})

export const apiRateLimiter = createMiddleware(async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const { allowed, remaining, resetTime } = checkRateLimit(
    ip,
    60 * 1000,        // 1-minute window
    100               // 100 requests max
  )

  c.header("X-RateLimit-Limit", "100")
  c.header("X-RateLimit-Remaining", String(remaining))
  c.header("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)))

  if (!allowed) {
    return c.json({ error: "Too many requests" }, 429)
  }

  await next()
})
```

**Authentication Flow**:
1. User authenticates via POST /api/auth/sign-in/email or POST /api/auth/sign-up/email
2. Better Auth validates credentials and creates session
3. Session token stored in HTTP-only cookie with secure flag (production only)
4. Subsequent requests automatically include session cookie
5. sessionMiddleware validates session from cookie headers
6. User context injected into request for downstream handlers

### 3. Route/Controller Layer

**Technology**: Hono route handlers

**Responsibilities**:
- Parse request parameters and body
- Call appropriate service methods
- Format and return responses
- Request validation

**Example**:

```typescript
// routes/source-accounts.ts
router.post('/api/v1/source-accounts', async (c) => {
  const userId = c.get('userId')
  const input = await c.req.json()

  const account = await sourceAccountService.create(userId, input)

  return c.json({
    success: true,
    data: account,
  }, 201)
})
```

### 4. Service Layer (Business Logic)

**Core Services**:

#### 4.1 Source Account Service
**Purpose**: Manage traffic source account connections

**Key Methods**:
- `create(userId, input)` - Create encrypted account
- `list(userId)` - List user's accounts
- `get(accountId)` - Retrieve specific account
- `update(accountId, updates)` - Update account fields
- `delete(accountId)` - Delete account and cascade

**Database Operations**:
```typescript
// Create with encryption
async create(userId: string, input: CreateInput) {
  const { encrypted, iv } = encryptCredentials(input.credentials)
  const [result] = await db.insert(sourceAccounts).values({
    userId,
    credentialsEncrypted: encrypted,
    credentialsIv: iv,
    ...
  }).returning()
  return result
}

// Retrieve and decrypt
async get(accountId: string) {
  const account = await db.select().from(sourceAccounts)
    .where(eq(sourceAccounts.id, accountId))
  return account
}
```

#### 4.2 Optimizer Service
**Purpose**: Manage campaign optimization configuration

**Key Methods**:
- `getOrCreateOptimizerCampaign(sourceAccountId, campaignId, targetCpa)` - Create or retrieve
- `getRules(campaignId)` - List rules for campaign
- `createRule(campaignId, rule)` - Create custom rule
- `updateRule(ruleId, updates)` - Update rule
- `deleteRule(ruleId)` - Delete rule
- `recordAction(action)` - Log action execution

**Rule Types**:
- `bid_adjustment` - Adjust campaign bid up/down
- `widget_blacklist` - Blacklist underperforming publisher
- `pause_campaign` - Pause campaign if metrics worsen
- `scale_budget` - Scale budget up/down

**Rule Conditions**:
```typescript
interface Condition {
  metric: 'cpa' | 'ctr' | 'roas' | 'spend'
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  value: number
  lookback?: number // hours
}
```

#### 4.3 Action Executor
**Purpose**: Execute optimization actions

**Key Methods**:
- `executeBidAdjustment(campaign, action)` - Adjust bid
- `executeBlacklist(campaign, action)` - Blacklist widget
- `recordExecution(action)` - Log execution

**Implementation**:
```typescript
async executeBidAdjustment(campaign: Campaign, action: Action) {
  const newBid = calculateNewBid(campaign.bid, action.adjustment)

  // Validate bid constraints
  if (newBid < action.minBid || newBid > action.maxBid) {
    throw new Error('Bid outside allowed range')
  }

  // Record action
  await db.insert(optimizerActions).values({
    campaignId: campaign.id,
    previousValue: campaign.bid,
    newValue: newBid,
    ...
  })

  // TODO: Call traffic source API in Phase 03
  return { success: true, newBid }
}
```

#### 4.4 Campaign Sync Service (Conceptual - Phase 03)
**Purpose**: Sync campaigns from traffic sources

**Key Methods**:
- `syncCampaigns(sourceAccountId)` - Fetch from API and update DB
- `syncMetrics(sourceAccountId)` - Update campaign metrics

**Data Flow**:
```
Traffic Source API → Parse Response → Normalize Metrics
  → Update campaign_syncs table → Generate Alerts
```

#### 4.5 Rule Engine
**Purpose**: Evaluate conditions and generate actions

**Key Methods**:
- `evaluate(campaign, rules)` - Evaluate all rules for campaign
- `generateActions(campaign, rule)` - Generate actions from rule

**Rule Evaluation Logic**:
```typescript
async evaluate(campaign: Campaign, rules: Rule[]) {
  const actions: GeneratedAction[] = []

  for (const rule of rules) {
    if (!rule.enabled) continue

    // Evaluate condition
    const conditionMet = evaluateCondition(campaign, rule.condition)
    if (!conditionMet) continue

    // Generate action
    const action = generateAction(campaign, rule)
    actions.push(action)
  }

  // Sort by priority
  return actions.sort((a, b) => a.priority - b.priority)
}
```

### 5. Traffic Source Integration Layer

**Status**: Phase 06 - Complete (4 sources implemented)

**Supported Sources**:
- Revcontent (OAuth2, Phase 03)
- Taboola (OAuth2 + account ID, Phase 06)
- Outbrain (Basic auth + token, Phase 06)
- MGID (API key header, Phase 06)

**Base Interface**:
```typescript
interface TrafficSource {
  // Authentication
  authenticate(credentials: TrafficSourceCredentials): Promise<AuthResult>

  // Campaign management
  getCampaigns(options?: ListCampaignsOptions): Promise<NormalizedCampaign[]>
  getCampaign(campaignId: string): Promise<NormalizedCampaign>
  toggleCampaign(campaignId: string): Promise<{ enabled: boolean }>

  // Widget (publisher) management
  getWidgets(options: ListWidgetsOptions): Promise<NormalizedWidget[]>
  blacklistWidget(campaignId: string, widgetId: string): Promise<BlacklistResult>
  adjustWidgetBid(campaignId: string, widgetId: string, newBid: number): Promise<BidAdjustmentResult>
}
```

**Implementation Pattern**:
```typescript
// Base class with common functionality
export class BaseTrafficSource implements TrafficSource {
  protected accessToken?: string
  protected tokenExpiresAt?: number

  isAuthenticated(): boolean { /* check token validity */ }
  isTokenExpiringSoon(bufferMs: number): boolean { /* check expiry */ }
  setStoredToken(token: string, expiresAt: Date): void { /* restore */ }
}

// Platform-specific implementations
export class TaboolaSource extends BaseTrafficSource {
  readonly sourceId = 'taboola'
  // Taboola-specific: OAuth2 with account ID
}

export class OutbrainSource extends BaseTrafficSource {
  readonly sourceId = 'outbrain'
  // Outbrain-specific: Basic auth with strict rate limits
}

export class MgidSource extends BaseTrafficSource {
  readonly sourceId = 'mgid'
  // MGID-specific: API key header (no token exchange)
}
```

**Factory & Caching**:
```typescript
// Create source instance
const source = createTrafficSource('taboola')

// Get authenticated instance (with DB token management)
const authenticated = await getAuthenticatedSource(sourceAccountId)
// - Loads encrypted credentials from DB
// - Authenticates if needed
// - Caches instance in memory
// - Updates token in DB after auth
```

**Authentication Mechanisms**:

| Source | Method | Token Validity | Rate Limit | Notes |
|--------|--------|---|---|---|
| Revcontent | OAuth2 | 1 hour | 100/min | Standard OAuth flow |
| Taboola | OAuth2 | ~1 hour | 100/min | Client credentials flow |
| Outbrain | Basic auth | 30 days | 30/sec | Very strict login rate (2/hour) |
| MGID | API key | Never expires | 100/min | No token exchange needed |

**Shared Utilities** (`utils/request-helpers.ts`):
```typescript
// Generic HTTP request with auth
makeRequest<T>(url: string, options: RequestInit & { accessToken?: string }): Promise<T>

// URL building with query params
buildUrl(baseUrl: string, path: string, params?: Record<string, any>): string

// Metric extraction (DRY utility)
extractMetrics(data: MetricsData): CampaignMetrics {
  // Handles all variations: 'spend'/'spent', calculates CTR/CPA/CPC
}

// Pagination parsing
parsePagination(headers: Headers, defaultPerPage?: number): PaginationInfo
```

**Rate Limiting per Source**:
```typescript
// Each source has dedicated rate limiter
private rateLimiter = getRateLimiter('taboola', { perMinute: 100 })

// Called before every API request
await this.rateLimiter.acquire()

// Respects per-source limits
// Prevents API throttling
```

**Error Handling**:
```typescript
// Methods return result objects, don't throw
async blacklistWidget(campaignId: string, widgetId: string): Promise<BlacklistResult> {
  try {
    await makeRequest(/* ... */)
    return { success: true, widgetId }
  } catch (error) {
    return { success: false, widgetId, error: error.message }
  }
}
```

### 6. Data Access Layer

**Technology**: Drizzle ORM + PostgreSQL

**Key Concepts**:

#### Schema Definition
```typescript
// db/schema.ts
export const sourceAccounts = pgTable('source_accounts', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull(),
  sourceId: text().notNull(),
  credentialsEncrypted: text().notNull(),
  credentialsIv: text().notNull(),
  status: text().notNull().default('pending'),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
}, (table) => ({
  uniqueUserSourceName: unique().on(table.userId, table.sourceId, table.name),
  idx_userId: index('idx_user_id').on(table.userId),
}))
```

#### Query Patterns
```typescript
// Insert with encryption
const [account] = await db.insert(sourceAccounts).values({
  userId,
  credentialsEncrypted: encrypted,
  credentialsIv: iv,
}).returning()

// Select with filtering
const campaigns = await db.select({
  id: campaign.id,
  name: campaign.name,
  status: campaign.status,
}).from(campaign)
  .where(eq(campaign.sourceAccountId, sourceAccountId))
  .limit(50)

// Update with cascade
await db.update(sourceAccounts).set({ status: 'deleted' })
  .where(eq(sourceAccounts.id, accountId))
```

#### Indexes
```
source_accounts:
  - PRIMARY KEY: id
  - UNIQUE: (user_id, source_id, name)
  - INDEX: user_id (for list queries)

campaign_syncs:
  - PRIMARY KEY: id
  - FOREIGN KEY: source_account_id
  - INDEX: source_account_id (for joins)

optimizer_rules:
  - PRIMARY KEY: id
  - FOREIGN KEY: optimizer_campaign_id
  - INDEX: optimizer_campaign_id (for filtering)
```

### 7. Database Layer

**Technology**: PostgreSQL (Supabase)

**Tables & Relationships**:

```
source_accounts (1) ──┬──────── (*) campaign_syncs
                      ├──────── (*) widget_blacklist
                      └──────── (*) optimizer_campaigns
                                        │
                                        ├── (*) optimizer_rules
                                        └── (*) optimizer_actions

optimizer_rules (1) ──── (*) optimizer_actions
```

**Key Tables**:

1. **source_accounts** - Account credentials and metadata
   - `id` (UUID) - Primary key
   - `user_id` (UUID) - Foreign key to users
   - `source_id` (TEXT) - 'revcontent', 'taboola', etc.
   - `credentials_encrypted` (TEXT) - AES-256-GCM encrypted JSON
   - `credentials_iv` (TEXT) - Initialization vector
   - `status` (TEXT) - 'pending', 'connected', 'error'
   - `created_at`, `updated_at` (TIMESTAMPTZ)

2. **campaign_syncs** - Campaign metrics snapshots
   - `id` (UUID)
   - `source_account_id` (UUID) - Foreign key
   - `external_campaign_id` (TEXT) - API campaign ID
   - `campaign_name` (TEXT)
   - `status` (TEXT), `enabled` (BOOLEAN), `bid` (NUMERIC)
   - `spend` (NUMERIC), `impressions` (BIGINT), `clicks` (BIGINT)
   - `ctr` (NUMERIC), `cpa` (NUMERIC)
   - `synced_at` (TIMESTAMPTZ)

3. **optimizer_campaigns** - Campaign optimization config
   - `id` (UUID)
   - `source_account_id` (UUID)
   - `external_campaign_id` (TEXT)
   - `target_cpa` (NUMERIC)
   - `bid_strategy` (TEXT) - 'target_cpa', 'fixed_bid', etc.
   - `enabled` (BOOLEAN)
   - `created_at`, `updated_at` (TIMESTAMPTZ)

4. **optimizer_rules** - Rules (templates + custom)
   - `id` (UUID)
   - `optimizer_campaign_id` (UUID)
   - `name` (TEXT)
   - `rule_type` (TEXT) - 'bid_adjustment', 'widget_blacklist', etc.
   - `template_id` (TEXT) - For template-based rules
   - `condition` (JSONB) - Condition expression
   - `action` (JSONB) - Action definition
   - `enabled` (BOOLEAN), `priority` (INTEGER)
   - `created_at`, `updated_at` (TIMESTAMPTZ)

5. **optimizer_actions** - Action execution history
   - `id` (UUID)
   - `optimizer_campaign_id` (UUID)
   - `rule_id` (UUID, nullable) - Foreign key to rule
   - `action_type` (TEXT) - 'bid_adjust', 'blacklist', etc.
   - `target_type` (TEXT) - 'campaign', 'widget', etc.
   - `target_id` (TEXT) - Campaign or widget ID
   - `previous_value`, `new_value` (NUMERIC)
   - `reason` (TEXT)
   - `metrics` (JSONB) - Campaign metrics at execution
   - `executed` (BOOLEAN), `executed_at` (TIMESTAMPTZ)
   - `error` (TEXT) - Error message if failed
   - `created_at` (TIMESTAMPTZ)

## Data Flow Diagrams

### Campaign Sync Flow

```
Scheduled Job (hourly)
    │
    ├─→ CampaignSyncService.sync()
    │   │
    │   ├─→ Get source account
    │   ├─→ Get authenticated API client
    │   ├─→ API: Fetch campaigns
    │   ├─→ Parse and normalize metrics
    │   ├─→ Update campaign_syncs table
    │   └─→ Trigger alerts if needed
    │
    └─→ Log sync result
```

### Optimization Run Flow

```
Scheduled Job (hourly) or Manual Trigger
    │
    ├─→ OptimizerService.runOptimization()
    │   │
    │   ├─→ Get campaigns for account
    │   ├─→ For each campaign:
    │   │   ├─→ Get optimizer rules
    │   │   ├─→ RuleEngine.evaluate()
    │   │   │   ├─→ For each rule:
    │   │   │   │   ├─→ Evaluate condition
    │   │   │   │   ├─→ Generate action if condition met
    │   │   │   ├─→ Return sorted actions
    │   │   │
    │   │   ├─→ ActionExecutor.execute()
    │   │   │   ├─→ For each action:
    │   │   │   │   ├─→ Call traffic source API
    │   │   │   │   ├─→ Record action result
    │   │   │   │   ├─→ Log error if failed
    │   │   │   │
    │   │   ├─→ Update optimizer_actions table
    │   │
    │   └─→ Generate alerts for changes
    │
    └─→ Return execution summary
```

### Authentication Flow

```
Client Request
    │
    ├─→ Request includes JWT token
    │
    ├─→ AuthMiddleware
    │   ├─→ Extract token from header
    │   ├─→ Verify signature with JWT_SECRET
    │   ├─→ Check expiration
    │   ├─→ Extract user ID from claims
    │   ├─→ Set context.userId
    │
    ├─→ Route Handler
    │   ├─→ Get userId from context
    │   ├─→ Query database scoped to user
    │
    └─→ Response
```

## Deployment Architecture

### Container Structure

```
Docker Image (API)
    ├─ Node.js 20 runtime
    ├─ App code (/app)
    ├─ node_modules
    ├─ .env variables
    └─ Port 3000

Docker Image (Web)
    ├─ Node.js 20 runtime
    ├─ Built React app
    ├─ node_modules
    └─ Port 5173

Docker Compose Orchestration
    ├─ api service
    ├─ web service (frontend)
    ├─ PostgreSQL (managed by Supabase)
    ├─ Redis (future caching)
    └─ pg-boss (job queue)
```

### Environment Configuration

**Development**:
```env
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/nativehub_dev
JWT_SECRET=dev-secret-key
ENCRYPTION_KEY=dev-encryption-key-64-chars-hex
```

**Production**:
```env
NODE_ENV=production
DATABASE_URL=postgresql://{supabase-managed}
JWT_SECRET={secure-random-key}
ENCRYPTION_KEY={secure-random-key}
LOG_LEVEL=info
```

## Security Architecture

### Encryption Strategy

1. **Credentials at Rest**:
   - Algorithm: AES-256-GCM
   - Key: From `ENCRYPTION_KEY` environment variable
   - IV: Random per credential, stored with ciphertext
   - Auth tag: Prevents tampering

2. **Credentials in Transit**:
   - HTTPS/TLS only in production
   - JWT tokens in Authorization header
   - No credentials in request body (use token-based auth)

3. **Key Management**:
   - `ENCRYPTION_KEY`: 64-character hex string
   - Never commit keys to repository
   - Rotate annually
   - Supabase vault for key storage (future)

### Authentication & Authorization

1. **JWT Tokens**:
   - Signed with `JWT_SECRET`
   - Expires in 24 hours
   - Includes user ID in `sub` claim
   - Refresh token support (future)

2. **Data Isolation**:
   - All queries scoped to authenticated user
   - No cross-user data access
   - Foreign keys ensure data integrity

3. **Rate Limiting**:
   - 100 requests/minute per IP
   - Per-user limits (future)
   - Prevents API abuse

## Scalability Considerations

### Horizontal Scaling

1. **Stateless API**:
   - No session state in memory
   - All state in PostgreSQL
   - Easy to run multiple instances

2. **Load Balancing**:
   - Nginx or AWS ALB
   - Route traffic to multiple API instances
   - Health checks on /health endpoint

3. **Database Connection Pooling**:
   - Use PgBouncer for connection pooling
   - Prevents connection exhaustion
   - Reduces latency

### Vertical Scaling

1. **Caching**:
   - Redis for session cache (future)
   - Cache frequently accessed rules
   - Cache campaign metrics (short TTL)

2. **Query Optimization**:
   - Indexes on foreign keys and filters
   - Avoid N+1 queries with joins
   - Pagination for large datasets

3. **Job Scheduling**:
   - Distribute sync/optimization jobs
   - Stagger jobs to avoid spike load
   - Use pg-boss for reliable execution

## Monitoring & Observability

### Metrics to Track

1. **Performance**:
   - API response time (p50, p95, p99)
   - Database query time
   - Sync job duration
   - Optimization run duration

2. **Reliability**:
   - API error rate (4xx, 5xx)
   - Sync success/failure rate
   - Database connection pool utilization
   - Background job execution success rate

3. **Business**:
   - Active users
   - Campaigns managed
   - Optimizations executed
   - Blacklisted widgets

### Logging

Structured JSON logging via Pino:
```typescript
logger.info({
  userId,
  accountId,
  campaignCount,
  actionCount,
}, 'Optimization run completed')

logger.error({
  userId,
  error: err.message,
  stack: err.stack,
}, 'Sync failed')
```

### Error Tracking

1. **Sentry Integration** (future):
   - Capture unhandled errors
   - Track error trends
   - Alert on critical errors

2. **Application Logs**:
   - All errors logged with context
   - Requests tracked with ID
   - Easy debugging with structured logs

## Testing Architecture

### Test Pyramid

```
        / \
       /   \  E2E Tests
      /     \ (Dashboard flows)
     /-------\
    /         \  Integration Tests
   /           \ (Services with real DB)
  /-------------\
 /               \ Unit Tests
/______________\ (Services, utils, logic)
```

### Test Infrastructure (Phase 02)

1. **Unit Tests**:
   - Vitest framework
   - PGlite in-memory database
   - Mocked external APIs
   - 78 tests covering critical paths

2. **Test Database**:
   - Fresh schema per test suite
   - Auto-cleanup between tests
   - No shared state
   - Deterministic results

3. **Mocking Strategy**:
   - Module aliases for db mocking
   - vi.mock() for API clients
   - Fixtures for test data

## API Contracts

### Request/Response Format

**Success Response**:
```json
{
  "success": true,
  "data": { /* resource */ }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

### Key Endpoints

- `POST /api/v1/auth/login` - User authentication
- `POST /api/v1/source-accounts` - Connect traffic source
- `GET /api/v1/source-accounts` - List accounts
- `GET /api/v1/campaigns` - List campaigns
- `GET /api/v1/optimizer/rules` - List rules
- `POST /api/v1/optimizer/run` - Trigger optimization

## Related Documents

- [Testing Guide](./testing-guide.md) - Test infrastructure details
- [Code Standards](./code-standards.md) - Development conventions
- [Deployment Guide](./deployment-guide.md) - Production setup
- [Project Overview & PDR](./project-overview-pdr.md) - Requirements
