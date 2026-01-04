# NativeHub 3.0 - Codebase Summary

**Generated**: January 3, 2026 (Updated for Phase 11)
**Total Files**: 176+ (+ monitoring configs)
**Total Tokens**: ~250K
**Repository**: GitHub (Private)

---

## Project Structure

```
nativehub-3/
├── apps/
│   ├── api/                           # Express/Hono backend API
│   │   ├── src/
│   │   │   ├── auth.ts                # Better Auth configuration
│   │   │   ├── index.ts               # Express app setup
│   │   │   ├── db/
│   │   │   │   └── schema.ts          # Drizzle ORM schema (PostgreSQL)
│   │   │   ├── lib/
│   │   │   │   ├── db.js              # Database connection
│   │   │   │   ├── logger.js          # Pino logger
│   │   │   │   └── encryption.ts      # AES-256-GCM encryption
│   │   │   ├── middleware/
│   │   │   │   ├── session.ts         # Authentication middleware
│   │   │   │   ├── rate-limit.ts      # Tiered rate limiting
│   │   │   │   └── validate.ts        # Zod body validation
│   │   │   ├── services/
│   │   │   │   ├── campaign-sync.ts   # NEW - Campaign sync service
│   │   │   │   ├── source-account.service.ts
│   │   │   │   ├── optimizer/
│   │   │   │   ├── campaign.service.ts
│   │   │   │   └── widget-blacklist.service.ts
│   │   │   ├── jobs/
│   │   │   │   └── scheduler.ts       # UPDATED - node-cron job scheduling
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── source-accounts.ts # UPDATED - Added /sync endpoint
│   │   │   │   ├── campaigns.ts
│   │   │   │   ├── widgets.ts
│   │   │   │   └── optimizer.ts
│   │   │   ├── traffic-sources/
│   │   │   │   ├── index.ts           # Factory function
│   │   │   │   ├── base.ts            # Abstract base class
│   │   │   │   ├── revcontent.ts
│   │   │   │   ├── taboola.ts
│   │   │   │   ├── outbrain.ts
│   │   │   │   └── mgid.ts
│   │   │   └── test/
│   │   │       └── fixtures/
│   │   └── package.json
│   └── web/                           # React + Vite frontend
│       ├── playwright.config.ts           # NEW - Phase 10 (E2E config)
│       ├── src/
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── Layout.tsx
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   └── Header.tsx
│       │   │   └── ui/
│       │   │       ├── Button.tsx
│       │   │       ├── DataTable.tsx
│       │   │       ├── MetricCard.tsx
│       │   │       ├── StatusBadge.tsx
│       │   │       ├── Skeleton.tsx         # NEW - Phase 09
│       │   │       ├── EmptyState.tsx       # NEW - Phase 09
│       │   │       └── Modal.tsx            # NEW - Phase 09
│       │   ├── hooks/
│       │   │   ├── useCampaigns.ts
│       │   │   ├── useSourceAccounts.ts
│       │   │   ├── useOptimizer.ts
│       │   │   ├── useToast.ts             # Phase 09
│       │   │   └── useWidgetBlacklist.ts
│       │   ├── e2e/                        # NEW - Phase 10
│       │   │   ├── dashboard.spec.ts       # Dashboard E2E tests
│       │   │   └── navigation.spec.ts      # Navigation E2E tests
│       │   ├── stores/
│       │   │   ├── authStore.ts
│       │   │   ├── themeStore.ts           # NEW - Phase 09
│       │   │   └── toastStore.ts           # NEW - Phase 09
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx           # UPDATED - Phase 09
│       │   │   ├── Campaigns.tsx           # UPDATED - Phase 09
│       │   │   ├── SourceAccounts.tsx
│       │   │   ├── Optimizer.tsx
│       │   │   ├── WidgetBlacklist.tsx     # UPDATED - Phase 09
│       │   │   ├── Settings.tsx            # UPDATED - Phase 09
│       │   │   ├── Login.tsx
│       │   │   └── Register.tsx
│       │   ├── lib/
│       │   │   ├── api.ts
│       │   │   └── utils.ts
│       │   ├── App.tsx
│       │   ├── index.css
│       │   └── main.tsx
│       └── package.json
├── packages/
│   ├── shared/                        # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── campaign.ts
│   │   │   │   ├── widget.ts
│   │   │   │   ├── optimizer.ts
│   │   │   │   ├── traffic-source.ts
│   │   │   │   └── api.ts
│   │   │   └── index.ts
│   │   └── package.json
│   └── ui/                            # Shared UI components (Shadcn/UI)
├── docker/                            # Docker configurations
│   ├── prometheus/                    # Prometheus monitoring (Phase 11)
│   │   ├── prometheus.yml             # Metrics scrape config
│   │   └── alert-rules.yml            # 7 alert rules
│   ├── alertmanager/                  # AlertManager (Phase 11)
│   │   └── alertmanager.yml           # Discord notifications
│   ├── grafana/                       # Grafana dashboards (Phase 11)
│   │   ├── provisioning/              # Datasource & dashboard provisioning
│   │   └── dashboards/
│   │       └── nativehub-overview.json # Main monitoring dashboard
│   └── docker-stack.yml               # Compose config (+ monitoring services)
├── docs/                              # Documentation
│   ├── project-overview-pdr.md        # Project goals & requirements
│   ├── api-docs.md                    # API endpoint documentation
│   ├── system-architecture.md         # System design overview (+ Phase 11 monitoring)
│   ├── code-standards.md              # Code guidelines
│   ├── testing-guide.md               # Testing approach
│   ├── deployment-guide.md            # Deployment instructions
│   ├── PHASE-11-SUMMARY.md            # Phase 11 implementation details
│   └── codebase-summary.md            # THIS FILE
├── plans/                             # Development plans & reports
└── README.md                          # Project root README
```

---

## Key Components

### 1. Campaign Sync Service (NEW - Phase 02)

**File**: `apps/api/src/services/campaign-sync.ts`

**Purpose**: Automatic synchronization of campaigns from external traffic sources to local database.

**Class**: `CampaignSyncService`

**Methods**:

| Method | Description | Returns |
|--------|-------------|---------|
| `syncAll()` | Syncs campaigns for all active source accounts | `SyncResult` |
| `syncAccount(accountId)` | Syncs campaigns for single account | `number` (campaign count) |
| `delay(ms)` | Helper for rate limit delays | `Promise<void>` |

**Key Features**:
- Batch sync with 2-second delays between accounts (rate limiting)
- Upsert logic with conflict handling (unique constraint on `sourceAccountId` + `externalCampaignId`)
- Error resilience: continues processing if individual accounts fail
- Updates `lastSyncAt` and `lastError` on source account
- Supports unlimited budgets (stored as `null`)
- Handles all campaign metrics (spend, impressions, clicks, conversions, CPA, CTR)

**Test Coverage**: 78% - 11 test cases in `campaign-sync.test.ts`

### 2. Frontend UI Components (NEW - Phase 09)

**Purpose**: Reusable, production-ready UI components for enhanced dashboard experience.

#### Skeleton.tsx
**File**: `apps/web/src/components/ui/Skeleton.tsx`

**Exports**:
- `Skeleton()` - Base skeleton loader with pulse animation
- `TableSkeleton()` - Table structure placeholder
- `CardSkeleton()` - Card layout placeholder
- `MetricGridSkeleton()` - 4-column metric grid placeholder

**Usage**: Loading states on Dashboard and Campaigns pages

#### EmptyState.tsx
**File**: `apps/web/src/components/ui/EmptyState.tsx`

**Purpose**: Display helpful placeholder when data is unavailable

**Props**:
```typescript
interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}
```

**Features**:
- Framer Motion animations
- Icon with background
- Optional CTA button

#### Modal.tsx
**File**: `apps/web/src/components/ui/Modal.tsx`

**Purpose**: Reusable modal dialog component

**Features**:
- Escape key handling
- Click-outside-to-close
- Size variants (sm/md/lg)
- Framer Motion animations
- Body scroll prevention

#### Toast Notification System
**Files**: `apps/web/src/stores/toastStore.ts` + `apps/web/src/hooks/useToast.ts`

**Toast Types**: success, error, info
**Features**: Auto-dismiss (5s), manual close, queue support
**Integration**: All CRUD operations

### 3. Theme Store (NEW - Phase 09)

**File**: `apps/web/src/stores/themeStore.ts`

**Purpose**: Persist user theme preference (light/dark/system)

**Features**:
- Zustand + persist middleware
- localStorage persistence
- System preference detection
- Input validation (security)

**Usage in Settings**:
```typescript
const { theme, setTheme } = useThemeStore()
```

### 4. Job Scheduler (UPDATED)

**File**: `apps/api/src/jobs/scheduler.ts`

**Purpose**: Background job orchestration using node-cron.

**Jobs**:
1. **Campaign Sync** - `*/30 * * * *` (every 30 minutes)
   - Calls `campaignSyncService.syncAll()`
   - Logs execution time and results

2. **Optimizer** - `0 * * * *` (every hour at minute 0)
   - Calls `optimizerService.optimizeAll()`
   - Executes optimization rules

**Features**:
- UTC timezone
- Error handling and logging
- Manual job triggering via `triggerJob(name)`
- Start/stop job management

### 3. Database Schema (UPDATED)

**File**: `apps/api/src/db/schema.ts`

**New Table**: `campaign_syncs`

```typescript
export const campaignSyncs = pgTable('campaign_syncs', {
  // Primary identifiers
  id: uuid('id').primaryKey().defaultRandom(),
  sourceAccountId: uuid('source_account_id').notNull()
    .references(() => sourceAccounts.id, { onDelete: 'cascade' }),
  externalCampaignId: text('external_campaign_id').notNull(),

  // Campaign metadata
  campaignName: text('campaign_name').notNull(),
  status: text('status').notNull(),      // 'active', 'paused', 'archived'
  enabled: boolean('enabled').notNull(),
  budget: numeric('budget'),             // NULL for unlimited
  bid: numeric('bid').notNull(),

  // Performance metrics
  spend: numeric('spend').notNull().default('0'),
  impressions: bigint('impressions').notNull().default(0),
  clicks: bigint('clicks').notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  ctr: numeric('ctr').notNull().default('0'),      // Click-through rate
  cpa: numeric('cpa').notNull().default('0'),      // Cost per acquisition

  // Sync metadata
  syncedAt: timestamp('synced_at', { withTimezone: true })
    .notNull().defaultNow(),
}, (table) => ({
  // Indexes for performance
  accountDateIdx: index('idx_campaign_syncs_account_date')
    .on(table.sourceAccountId, table.syncedAt),
  campaignIdx: index('idx_campaign_syncs_campaign')
    .on(table.externalCampaignId, table.syncedAt),

  // Unique constraint for upsert operations
  uniqueAccountCampaign: unique()
    .on(table.sourceAccountId, table.externalCampaignId),
}))
```

**Constraints**:
- Foreign key: `sourceAccountId` → `sourceAccounts.id` (cascade delete)
- Unique constraint ensures one campaign record per source account + external campaign combination
- Indexes optimize queries on account + date range

### 4. Source Accounts Routes (UPDATED)

**File**: `apps/api/src/routes/source-accounts.ts`

**New Endpoint**:

```
POST /api/v1/source-accounts/:id/sync
```

**Purpose**: Manually trigger campaign sync for a source account.

**Request Parameters**:
- `id` (path param): Source account UUID

**Response**:
```json
{
  "success": true,
  "campaignCount": 42
}
```

**Status Codes**:
- `200 OK`: Sync completed successfully
- `400 Bad Request`: Account not active
- `404 Not Found`: Account not found
- `500 Internal Server Error`: Sync failed

**Validation**:
- Verifies account belongs to authenticated user
- Requires account status to be 'active' or 'connected'

---

## Services Architecture

### Campaign Sync Service

```
┌─────────────────────────────┐
│   Job Scheduler (30 min)    │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  CampaignSyncService        │
├─────────────────────────────┤
│ syncAll()                   │  → Processes all active accounts
│ syncAccount(accountId)      │  → Processes single account
└──────────────┬──────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌──────────────┐   ┌──────────────────┐
│ Traffic      │   │ Database         │
│ Source API   │   │ (campaign_syncs) │
└──────────────┘   └──────────────────┘
```

### Error Handling Flow

```
syncAll() / syncAccount()
    │
    ├─ Success → Update lastSyncAt, clear lastError
    │
    └─ Error → Record lastError, continue processing
        (Does not throw, returns result object)
```

---

## API Integration Points

### Traffic Sources

Each source adapter provides:
```typescript
interface TrafficSourceAdapter {
  getCampaigns(options: { status: 'all' | 'active' | 'paused' }): Promise<NormalizedCampaign[]>
  updateCampaign(campaignId: string, updates: Partial<Campaign>): Promise<void>
  // ... other methods
}
```

**Supported Sources**:
- Revcontent
- Taboola
- Outbrain
- MGID

### Database Operations

**Upsert Logic**:
```typescript
await db
  .insert(campaignSyncs)
  .values({ ... })
  .onConflictDoUpdate({
    target: [campaignSyncs.sourceAccountId, campaignSyncs.externalCampaignId],
    set: { /* updated fields */ }
  })
```

---

## Testing

### Campaign Sync Service Tests

**File**: `apps/api/src/services/campaign-sync.test.ts`

**Test Suites**:
1. **syncAccount()** - 6 tests
   - Fetches and upserts campaigns
   - Updates existing campaigns on re-sync
   - Updates lastSyncAt timestamp
   - Clears lastError on success
   - Handles unlimited budgets
   - Throws error on traffic source failure

2. **syncAll()** - 5 tests
   - Syncs all active accounts
   - Skips non-active accounts
   - Continues on individual account failure
   - Records error messages
   - Returns empty result when no active accounts

**Mocking Strategy**:
- Mocks `getAuthenticatedSource()` function
- Creates test source accounts via `sourceAccountService`
- Uses actual database (in-memory SQLite via Vitest)
- Fixtures: `createMockCampaign()` helper

**Coverage**:
- Lines: 78%
- Branches: 85%
- Functions: 100%

---

## Type Definitions

**File**: `packages/shared/src/types`

```typescript
// Campaign types
interface NormalizedCampaign {
  id: string
  externalId: string
  sourceId: 'revcontent' | 'taboola' | 'outbrain' | 'mgid'
  sourceAccountId: string
  name: string
  status: 'active' | 'paused' | 'archived'
  enabled: boolean
  budget: number | 'unlimited'
  bid: number
  metrics: {
    spend: number
    impressions: number
    clicks: number
    conversions: number
    ctr: number
    cpa: number
    cpc: number
  }
  createdAt: ISO8601String
  updatedAt: ISO8601String
}

interface SyncResult {
  synced: number
  failed: number
  details: Array<{
    accountId: string
    success: boolean
    error?: string
    campaignCount?: number
  }>
}
```

---

## Configuration

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host/dbname

# Traffic Source APIs
REVCONTENT_API_KEY=xxx
REVCONTENT_API_SECRET=xxx
TABOOLA_API_KEY=xxx
TABOOLA_API_SECRET=xxx
OUTBRAIN_API_KEY=xxx
OUTBRAIN_API_SECRET=xxx
MGID_API_KEY=xxx
MGID_API_SECRET=xxx

# Session
SESSION_SECRET=random-secret-key
```

### Sync Configuration

Located in `scheduler.ts`:
- Sync interval: `*/30 * * * *` (every 30 minutes)
- Rate limit delay: `2000ms` between accounts
- Timezone: UTC

---

## Performance Characteristics

### Database Queries

| Operation | Complexity | Index |
|-----------|-----------|-------|
| Sync to DB (upsert) | O(1) | PK: id |
| Query by account + date | O(log n) | idx_campaign_syncs_account_date |
| Query by campaign ID | O(log n) | idx_campaign_syncs_campaign |

### Sync Performance

- **2 accounts**: ~4 seconds (2 * 2s delay)
- **10 accounts**: ~20 seconds (9 * 2s delay)
- **50 accounts**: ~100 seconds (49 * 2s delay + API calls)

**Optimization**: Rate limit delays (2s) prevent API throttling but can be adjusted per traffic source.

---

## Dependency Graph

```
campaignSyncService
  ├── db (drizzle)
  ├── sourceAccounts (schema)
  ├── campaignSyncs (schema)
  ├── getAuthenticatedSource (traffic-sources)
  ├── logger (pino)
  └── TimeoutError exceptions

scheduler
  ├── campaignSyncService
  ├── optimizerService
  ├── node-cron
  └── logger

sourceAccountRoutes
  ├── sourceAccountService
  ├── campaignSyncService
  ├── logger
  └── Zod validation
```

---

## Recent Changes (Phase 09 - Frontend Dashboard)

### New Components
1. `/apps/web/src/components/ui/Skeleton.tsx` - Loading skeleton variants
2. `/apps/web/src/components/ui/EmptyState.tsx` - Empty state placeholder
3. `/apps/web/src/components/ui/Modal.tsx` - Modal dialog component
4. `/apps/web/src/stores/themeStore.ts` - Theme persistence store
5. `/apps/web/src/hooks/useToast.ts` - Toast notification hook

### Updated Pages
1. `/apps/web/src/pages/Dashboard.tsx` - Loading skeleton integration
2. `/apps/web/src/pages/Campaigns.tsx` - Filter & loading states
3. `/apps/web/src/pages/Settings.tsx` - Theme toggle implementation
4. `/apps/web/src/pages/WidgetBlacklist.tsx` - Modal add/remove functionality

### Enhanced Hooks
1. `/apps/web/src/hooks/useCampaigns.ts` - Toast integration
2. `/apps/web/src/hooks/useSourceAccounts.ts` - Enhanced state management
3. `/apps/web/src/hooks/useOptimizer.ts` - Improved hook structure

### Documentation
1. `/docs/PHASE-09-SUMMARY.md` - Comprehensive phase completion report
2. Updated `/docs/codebase-summary.md` - Frontend architecture addition
3. Updated `/docs/system-architecture.md` - Presentation layer enhancement
4. Updated `/docs/INDEX.md` - Phase 09 documentation reference

### Testing & Quality
- 72/72 tests passing (100%)
- Build successful with no errors
- Accessibility audit: WCAG 2.1 AA compliant
- Security: Input validation & localStorage security implemented

---

## Recent Changes (Phase 11 - Production Monitoring & Alerting)

### New Files - Phase 11

**Monitoring Stack**:
1. `/apps/api/src/lib/metrics.ts` - Prometheus metrics registry
2. `/apps/api/src/middleware/metrics.ts` - Request timing middleware
3. `/docker/prometheus/prometheus.yml` - Prometheus scrape config
4. `/docker/prometheus/alert-rules.yml` - 7 alert rules
5. `/docker/alertmanager/alertmanager.yml` - Discord notifications
6. `/docker/grafana/provisioning/datasources/prometheus.yml` - Auto-config
7. `/docker/grafana/provisioning/dashboards/dashboard.yml` - Dashboard provisioning
8. `/docker/grafana/dashboards/nativehub-overview.json` - Main monitoring dashboard

### Metrics Implemented

**HTTP Request Metrics**:
- `nativehub_http_request_duration_seconds` - Histogram (9 buckets: 0.01-10s)
- `nativehub_http_requests_total` - Counter (method, route, status)
- `nativehub_http_errors_total` - Counter (method, route, error_type)
- `nativehub_http_active_requests` - Gauge (current in-flight)

**Job Queue Metrics**:
- `nativehub_jobs_processed_total` - Counter (job_name, status)
- `nativehub_job_duration_seconds` - Histogram (8 buckets: 0.1-120s)

**System Metrics**:
- `nativehub_nodejs_heap_size_*` - Memory usage
- `nativehub_nodejs_gc_*` - GC events
- `nativehub_nodejs_eventloop_*` - Event loop lag
- `nativehub_app_info` - Version info

### Alert Rules (7 configured)

1. **HighErrorRate** - Error rate >5% (5m) - Critical
2. **HighLatency** - p95 latency >1s - Warning
3. **NativeHubApiDown** - Service unreachable >1m - Critical
4. **HighMemoryUsage** - Heap >80% for 5m - Warning
5. **TooManyActiveRequests** - Active requests >100 for 1m - Warning
6. **SlowDatabaseQueries** - p95 DB latency >0.5s for 5m - Warning
7. **JobProcessingFailures** - Job failure rate >0.1/sec (15m) - Warning

### Updated Files - Phase 11
1. `/apps/api/src/index.ts` - Added /metrics endpoint
2. `/apps/api/package.json` - Added prom-client dependency
3. `/docker/docker-stack.yml` - Added monitoring services (prometheus, alertmanager, grafana)
4. `/docker/.env.production.example` - Added DISCORD_WEBHOOK_URL
5. `/docs/codebase-summary.md` - Updated project structure
6. `/docs/system-architecture.md` - Added monitoring section
7. `/docs/PHASE-11-SUMMARY.md` - Phase 11 completion report

### Monitoring URLs

| Service | URL | Purpose |
|---------|-----|---------|
| API Metrics | http://api:3001/metrics | Prometheus scrape target |
| Prometheus | http://prometheus:9090 | Metric database (internal) |
| AlertManager | http://alertmanager:9093 | Alert routing (internal) |
| Grafana | https://grafana-nativehub.arakakileo.com | Dashboards |

### Features

- **High-resolution timing**: performance.now() for sub-ms precision
- **Low cardinality**: Route normalization prevents metric explosion
- **Self-protection**: /metrics endpoint skipped to prevent recursion
- **Error tracking**: Captures 4xx, 5xx, and unhandled errors
- **Inhibition rules**: Suppresses cascading alerts when service down
- **Discord integration**: Instant notifications for critical issues
- **Grafana dashboards**: Auto-provisioned overview dashboards

---

## Recent Changes (Phase 10 - E2E Testing & Performance)

### New Files - Phase 10
1. `/apps/web/playwright.config.ts` - Playwright E2E configuration
2. `/apps/web/e2e/dashboard.spec.ts` - Dashboard E2E tests (4 tests)
3. `/apps/web/e2e/navigation.spec.ts` - Navigation E2E tests (3 tests)
4. `/apps/web/lighthouse-report.report.html` - Performance audit report
5. `/apps/web/lighthouse-report.report.json` - Performance data

### Performance Results
- **Lighthouse Overall**: 95/100 (Excellent)
- **Performance**: 99/100 - FCP 1.7s, LCP 1.8s, SI 1.7s
- **Accessibility**: 98/100 - WCAG 2.1 AA compliant
- **Best Practices**: 96/100 - No deprecated APIs
- **Bundle Size**: 148KB gzipped

### E2E Test Results
- **Total Tests**: 7
- **Passed**: 6
- **Skipped**: 1 (auth mock required)
- **Success Rate**: 85.7%

---

## Next Steps (Phase 12+)

- [ ] Enhanced E2E coverage (authenticated flows)
- [ ] Real User Monitoring (RUM) setup
- [ ] SEO structured data (JSON-LD)
- [ ] Analytics integration
- [ ] PWA features (offline mode)
- [ ] Real-time WebSocket updates
- [ ] Advanced filtering with saved presets
- [ ] Campaign data export (CSV/PDF)
- [ ] Keyboard shortcuts for power users
