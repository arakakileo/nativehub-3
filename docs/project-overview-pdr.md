# Project Overview & PDR - NativeHub 3.0

## Executive Summary

NativeHub 3.0 is a unified management platform for native advertising campaigns across multiple traffic sources (Revcontent, Taboola, Outbrain, MGID). It provides automated bidding optimization, widget blacklisting, and cross-source rule management in a single dashboard.

**Status**: Phase 01 - Authentication System Complete (Phase 06 in parallel)
**Team**: Full-stack development team
**Repository**: Private GitHub repository

## Phase Progress

| Phase | Title | Status | Deliverables | Date |
|-------|-------|--------|---|------|
| Phase 01 | Authentication System | Complete | Better Auth, Session Management, Rate Limiting | Jan 2 |
| Phase 02 | Backend Unit Tests | Complete | 78 tests | Jan 1 |
| Phase 03 | Backend Integration Tests | Complete | 65 tests | Jan 2 |
| Phase 04 | Route Implementations | Complete | Core routes | Jan 2 |
| Phase 05 | API Routes Implementation | Complete | Campaign/Widget/Optimizer APIs | Jan 2 |
| Phase 06 | Traffic Source Adapters | Complete | 4 sources integrated | Jan 2 |
| Phase 07 | Campaign Sync Service | Pending | Auto-sync scheduler | - |
| Phase 08 | Frontend Development | Pending | Dashboard + Auth UI | - |
| Phase 09 | E2E Testing | Pending | Full user flows | - |
| Phase 10 | Production Deployment | Pending | VPS deployment | - |

## Project Goals

1. **Unify Campaign Management**: Single dashboard for all traffic sources
2. **Automate Optimization**: Intelligent bid adjustments and rule execution
3. **Maximize ROI**: Target cost-per-acquisition (CPA) based optimization
4. **Prevent Waste**: Publisher blacklisting and performance filtering
5. **Scalability**: Support multiple users and thousands of campaigns

## Key Features

### 1. User Authentication & Security
- Email/password authentication with Better Auth framework
- Session-based authentication (HTTP-only cookies)
- 7-day session expiration with automatic renewal
- Password minimum length: 8 characters
- Rate limiting: 10 auth attempts per 15 minutes per IP
- Secure password storage with industry best practices

### 2. Multi-Source Support
- Connect accounts from Revcontent, Taboola, Outbrain, MGID
- Unified authentication and credential management
- Real-time campaign synchronization
- Cross-source campaign grouping

### 3. Unified Dashboard
- View all campaigns across sources simultaneously
- Filter by source, status, performance metrics
- Campaign performance analytics and charts
- Real-time metrics sync (refreshed hourly)

### 4. Automated Optimization
- Template-based optimization rules
- Custom rule creation with conditions
- Hourly automated rule execution
- A/B testing for rule effectiveness

### 5. Smart Bidding
- Target CPA based adjustments
- Dynamic bid scaling (% or fixed amount)
- Min/max bid constraints
- Bid history and audit trail

### 6. Publisher Management
- Widget blacklist (publisher blocking)
- Auto-blacklisting based on metrics
- Cross-source blacklist sharing
- Blacklist metrics snapshot

### 7. Alerts & Notifications
- Performance degradation alerts
- Budget threshold warnings
- Rule execution notifications
- Error and sync failure alerts

## Technology Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Hono (lightweight HTTP framework)
- **Database**: PostgreSQL (Supabase)
- **ORM**: Drizzle ORM (TypeScript-first)
- **Job Queue**: node-cron + pg-boss
- **Encryption**: Native crypto (AES-256-GCM)
- **Testing**: Vitest + PGlite
- **Deployment**: Docker + GitHub Actions

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: TailwindCSS + Shadcn/ui
- **Animations**: Framer Motion
- **State**: React Query + Context API
- **Forms**: React Hook Form + Zod validation
- **Testing**: Vitest + React Testing Library

### Infrastructure
- **Container**: Docker Compose
- **Registry**: Docker Hub / GitHub Container Registry
- **Reverse Proxy**: Traefik
- **Monitoring**: Prometheus + Grafana (optional)
- **CI/CD**: GitHub Actions

## Architecture Overview

### Layered Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│           Dashboard, Rules, Campaigns UI             │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP REST API
┌──────────────────────▼──────────────────────────────┐
│              API Gateway & Middleware                │
│          Auth, Error Handling, Rate Limiting         │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Route Handlers / Controllers            │
│         Transform requests to service calls         │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│         Service Layer (Business Logic)              │
│  - SourceAccountService                             │
│  - OptimizerService & RuleEngine                    │
│  - CampaignSyncService                              │
│  - AlertService                                     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│         Traffic Source Integration Layer            │
│  - Revcontent API client                            │
│  - Taboola API client                               │
│  - Outbrain API client                              │
│  - MGID API client                                  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Data Access Layer (Drizzle)            │
│           PostgreSQL Database Operations            │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│          PostgreSQL Database (Supabase)             │
└─────────────────────────────────────────────────────┘
```

### Database Schema

**Core Entities**:
- `source_accounts` - Connected traffic source accounts
- `campaign_syncs` - Campaign metrics snapshots
- `widget_blacklist` - Blacklisted publishers
- `optimizer_campaigns` - Campaign optimization configuration
- `optimizer_rules` - Optimization rules (templates + custom)
- `optimizer_actions` - Action execution history
- `alerts` - User-facing alerts

**Relationships**:
```
source_accounts (1) ──── (*) campaign_syncs
                  ├────── (*) widget_blacklist
                  └────── (*) optimizer_campaigns
                                        │
                                        └────── (*) optimizer_rules
                                        └────── (*) optimizer_actions

optimizer_rules (1) ──── (*) optimizer_actions
```

## Phase Breakdown

### Phase 01: Core Backend & Database
- [x] Hono server setup
- [x] PostgreSQL schema and Drizzle ORM
- [x] Encryption/decryption utilities
- [x] Authentication middleware (JWT)
- [x] Source account management API
- [x] Campaign sync service (data structure)
- [x] Basic error handling

### Phase 02: Backend Unit Tests (CURRENT)
- [x] Vitest configuration with PGlite
- [x] Test infrastructure and setup
- [x] Source Account Service tests (18 tests)
- [x] Optimizer Service tests (14 tests)
- [x] Action Executor tests (12 tests)
- [x] Rule Engine enhancement (ruleId nullable)
- [x] Traffic source integration tests (13 tests)
- [x] Middleware tests (12 tests)
- [x] Utility tests (9 tests)
- [x] Target coverage: 85% lines/functions, 80% branches
- **Total: 78 unit tests across services, middleware, utilities**

### Phase 03: Traffic Source Integrations
- [ ] Implement Revcontent API client
- [ ] Implement Taboola API client
- [ ] Implement Outbrain API client
- [ ] Implement MGID API client
- [ ] Campaign sync scheduler (hourly)
- [ ] Rate limiting per source
- [ ] Error retry logic with backoff
- [ ] API response parsing and validation
- [ ] Metrics normalization across sources

### Phase 04: Optimizer Engine
- [ ] Rule engine implementation
- [ ] Condition evaluation system
- [ ] Action execution engine
- [ ] Bid adjustment logic
- [ ] Widget blacklist automation
- [ ] Template-based rules
- [ ] Custom rule creation
- [ ] Action history and audit trail
- [ ] Metrics calculation and tracking

### Phase 05: Frontend Dashboard
- [ ] React app setup with Vite
- [ ] Authentication flow (login, logout)
- [ ] Campaigns page (list, filter, search)
- [ ] Account management (connect, disconnect)
- [ ] Campaign detail page with metrics
- [ ] Optimization rules management
- [ ] Blacklist management UI
- [ ] Alerts and notifications
- [ ] Settings and preferences

### Phase 06: Jobs & Notifications
- [ ] Implement pg-boss job queue
- [ ] Campaign sync jobs (hourly)
- [ ] Optimization run jobs (hourly)
- [ ] Alert generation
- [ ] Email notifications
- [ ] Push notifications (optional)
- [ ] Job monitoring and retry logic

### Phase 07: Deployment & DevOps
- [ ] Docker containerization
- [ ] Docker Compose orchestration
- [ ] GitHub Actions CI/CD pipeline
- [ ] Database migrations strategy
- [ ] Environment configuration
- [ ] Health checks and monitoring
- [ ] Logging and error tracking
- [ ] Performance optimization

### Phase 08: Advanced Features (Optional)
- [ ] A/B testing for rules
- [ ] Machine learning based recommendations
- [ ] Advanced analytics and reporting
- [ ] API rate limiting per user
- [ ] Webhook integrations
- [ ] CSV import/export
- [ ] Multi-user teams and permissions

## Product Development Requirements

### Functional Requirements

#### FR1: Authentication & Authorization
- **FR1.1**: Users can register and login with email/password
- **FR1.2**: JWT tokens expire after 24 hours
- **FR1.3**: Users can only access their own data
- **FR1.4**: Admin users can manage other users (future)

#### FR2: Source Account Management
- **FR2.1**: Users can connect multiple traffic source accounts
- **FR2.2**: Credentials are encrypted at rest
- **FR2.3**: Users can disconnect accounts and delete data
- **FR2.4**: Account connection status is tracked (pending, connected, error)
- **FR2.5**: Sync errors are logged and displayed to users

#### FR3: Campaign Management
- **FR3.1**: Campaigns are automatically synced hourly
- **FR3.2**: Campaign metrics (spend, impressions, clicks, conversions) are tracked
- **FR3.3**: Users can filter campaigns by source, status, performance
- **FR3.4**: Campaign history is preserved for analytics

#### FR4: Optimization Rules
- **FR4.1**: Users can create custom optimization rules
- **FR4.2**: Rules support conditions (e.g., CPA > target)
- **FR4.3**: Rules support actions (bid adjust, blacklist)
- **FR4.4**: Rules can be enabled/disabled per campaign
- **FR4.5**: Rule execution history is tracked

#### FR5: Widget Blacklist
- **FR5.1**: Users can manually blacklist underperforming publishers
- **FR5.2**: Rules can auto-blacklist based on metrics
- **FR5.3**: Blacklists are campaign-specific or account-wide
- **FR5.4**: Blacklist metrics snapshot is captured

#### FR6: Alerts & Notifications
- **FR6.1**: Alerts are generated for sync failures
- **FR6.2**: Alerts for performance degradation (CPA spike)
- **FR6.3**: Budget threshold alerts
- **FR6.4**: Rule execution status notifications

### Non-Functional Requirements

#### NFR1: Performance
- **NFR1.1**: API response time < 500ms for 95th percentile
- **NFR1.2**: Campaign list loads in < 2 seconds (1000 campaigns)
- **NFR1.3**: Database queries use appropriate indexes
- **NFR1.4**: Pagination for large datasets (default 50 items)

#### NFR2: Security
- **NFR2.1**: All credentials encrypted with AES-256-GCM
- **NFR2.2**: No credentials logged or exposed in error messages
- **NFR2.3**: Rate limiting to prevent abuse (100 req/min per IP)
- **NFR2.4**: CORS restricted to trusted domains
- **NFR2.5**: HTTPS enforced in production
- **NFR2.6**: SQL injection prevented via parameterized queries

#### NFR3: Reliability
- **NFR3.1**: Uptime target: 99.5%
- **NFR3.2**: Automatic retry on transient API failures
- **NFR3.3**: Graceful degradation when traffic sources are down
- **NFR3.4**: Database backups daily (Supabase managed)
- **NFR3.5**: Error tracking and alerting

#### NFR4: Scalability
- **NFR4.1**: Support 1000+ campaigns per user
- **NFR4.2**: Support 10,000+ concurrent users
- **NFR4.3**: Database connection pooling
- **NFR4.4**: Horizontal scaling ready
- **NFR4.5**: Stateless architecture for easy scaling

#### NFR5: Testability
- **NFR5.1**: Unit test coverage 85% (lines/functions)
- **NFR5.2**: Integration test coverage 70%
- **NFR5.3**: Test execution time < 60 seconds
- **NFR5.4**: E2E tests for critical flows

#### NFR6: Maintainability
- **NFR6.1**: Code documented with JSDoc comments
- **NFR6.2**: Architecture documentation up-to-date
- **NFR6.3**: Error messages clear and actionable
- **NFR6.4**: Configuration via environment variables

### Acceptance Criteria

#### Phase 02 Acceptance Criteria (CURRENT)

1. **Test Infrastructure**
   - [x] Vitest configured with global test setup
   - [x] PGlite database initialized in test environment
   - [x] Module aliases resolve test mocks correctly
   - [x] All tests pass with npm run test

2. **Service Tests**
   - [x] SourceAccountService: 18 tests covering CRUD operations
   - [x] OptimizerService: 14 tests covering campaign and rule management
   - [x] ActionExecutor: 12 tests covering bid adjustments and blacklisting
   - [x] Rule Engine: Fixed ruleId type (string | null)
   - [x] Traffic sources: 13 tests for API integration
   - [x] Middleware: 12 tests for auth and error handling
   - [x] Utilities: 9 tests for rate limiting and helpers

3. **Code Quality**
   - [x] All critical paths have tests
   - [x] Encryption/decryption tested
   - [x] Database operations isolated
   - [x] Mocks for external APIs
   - [x] No console.log in production code

4. **Coverage Metrics**
   - [x] Lines: 85%+
   - [x] Functions: 85%+
   - [x] Branches: 80%+
   - [x] Statements: 85%+

5. **Documentation**
   - [x] Testing guide created
   - [x] Code standards documented
   - [x] Test fixtures well-organized
   - [x] Examples in documentation

6. **CI/CD Integration**
   - [x] Tests run on every push
   - [x] Coverage reports generated
   - [x] Test suite completes in < 60s
   - [x] Failed tests block merges

## Success Metrics

### Development Metrics
- Test coverage: 85%+ lines and functions
- All critical paths tested
- Test execution time: < 60 seconds
- Zero flaky tests

### Operational Metrics
- API response time: < 500ms (p95)
- Error rate: < 0.1%
- Uptime: 99.5%+
- Sync success rate: 99%+

### Business Metrics
- Campaign optimization: 15%+ ROI improvement (target)
- User retention: 80%+ (target)
- Feature adoption: 60%+ for optimization rules (target)
- Support tickets: < 5 per 1000 campaigns (target)

## Timeline

```
Week 1-2 (Jan 2-15): Phase 02 - Backend Unit Tests ✓
Week 3-4 (Jan 16-29): Phase 03 - Traffic Source Integrations
Week 5-6 (Feb 2-13): Phase 04 - Optimizer Engine
Week 7-8 (Feb 16-27): Phase 05 - Frontend Dashboard
Week 9-10 (Mar 2-13): Phase 06 - Jobs & Notifications
Week 11-12 (Mar 16-27): Phase 07 - Deployment & DevOps
Week 13+: Phase 08 - Advanced Features (Optional)
```

## Risk & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| API rate limit exceeded | Platform unusable | Medium | Implement queue, backoff, fallback |
| Database performance degradation | Slow queries, timeouts | Low | Proper indexing, query optimization |
| Credential decryption failure | Data loss, security issue | Low | Encryption tests, backup strategy |
| Multi-source API incompatibility | Feature delays | Medium | Early integration testing |
| Test coverage gaps | Bugs in production | Low | Code review checklist for tests |

## Success Definition

Phase 02 is successful when:
1. ✓ All 78 unit tests pass consistently
2. ✓ Code coverage meets targets (85% lines/functions, 80% branches)
3. ✓ Documentation is complete and accurate
4. ✓ CI/CD pipeline validates tests on every commit
5. ✓ Team understands testing patterns and can write new tests
6. ✓ Foundation ready for Phase 03 integration testing

## Next Steps

1. **Phase 03 Planning**: Detailed traffic source integration requirements
2. **API Client Design**: Finalize API client architecture before implementation
3. **Integration Tests**: Plan integration test suite for Phase 03
4. **Documentation Review**: Peer review of testing guide and code standards

## Related Documents

- [Testing Guide](./testing-guide.md) - Test infrastructure details
- [Code Standards](./code-standards.md) - Development conventions
- [System Architecture](./system-architecture.md) - System design
- [Deployment Guide](./deployment-guide.md) - Production setup
- [Project Roadmap](./project-roadmap.md) - Full roadmap
