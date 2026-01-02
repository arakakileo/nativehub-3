# NativeHub 3.0 Documentation Index

**Last Updated**: January 2, 2026
**Current Phase**: Phase 06 - Traffic Source Adapters (Complete)
**Next Phase**: Phase 07 - Campaign Sync Service

---

## Overview Documents

### [README.md](./README.md)
Quick start guide for developers. Getting the project running.

### [project-overview-pdr.md](./project-overview-pdr.md)
Comprehensive project overview including:
- Executive summary and status
- Phase progress tracking
- Project goals and key features
- Technology stack
- Architecture overview
- Phase breakdown and timeline
- Product Development Requirements (PDR)
- Success metrics and risk mitigation

**Best For**: Understanding project scope, architecture, and requirements.

---

## Architecture & Design

### [system-architecture.md](./system-architecture.md)
Deep-dive into system design and implementation:
- Architectural layers (presentation, API, service, data access)
- Route handlers and middleware
- Service layer implementation
- Traffic source integration layer
- Data access layer (Drizzle ORM)
- Database schema and relationships
- Data flow diagrams
- Deployment architecture
- Security architecture
- Scalability patterns
- Monitoring and observability
- Testing architecture

**Best For**: Understanding system design, data flows, and patterns.

### [code-standards.md](./code-standards.md)
Development guidelines and conventions:
- Code organization
- Naming conventions
- File structure
- Service layer patterns
- Error handling
- Testing conventions
- Documentation standards
- Security best practices

**Best For**: Writing code that follows project standards.

---

## API Documentation

### [api-docs.md](./api-docs.md)
Complete API reference documentation:
- Authentication and JWT tokens
- **Campaigns API** (2 endpoints)
  - GET /campaigns - List all campaigns
  - GET /campaigns/:sourceAccountId/:externalCampaignId - Campaign details with history
- **Widgets API** (3 endpoints)
  - GET /widgets/blacklist - List blacklisted widgets
  - POST /widgets/blacklist - Add widget to blacklist
  - DELETE /widgets/blacklist/:id - Remove from blacklist
- **Optimizer API** (5 endpoints)
  - GET /optimizer/campaigns - List campaigns
  - GET /optimizer/campaigns/:id - Get campaign with rules
  - POST /optimizer/campaigns - Create campaign
  - PATCH /optimizer/campaigns/:id - Update campaign
  - GET /optimizer/campaigns/:id/actions - Get action history
- Error handling and status codes
- Rate limiting
- CORS configuration
- Health check endpoint

**Contains**:
- Complete request/response examples
- Parameter documentation
- Status code matrix
- Curl examples for all endpoints

**Best For**: Integrating with the API, understanding endpoints, debugging.

### [QUICK-START-API.md](./QUICK-START-API.md)
Quick reference for API development:
- Starting the API server
- Getting authentication tokens
- Common curl commands for all endpoints
- Response patterns
- Environment variables
- Database setup
- Debugging tips
- Performance tips
- Troubleshooting guide
- Quick commands reference

**Best For**: Quick API testing, common tasks, troubleshooting.

---

## Phase & Implementation Documents

### [PHASE-03-SUMMARY.md](./PHASE-03-SUMMARY.md)
Phase 03 - Backend Integration Tests:
- Test infrastructure overview
- Integration test files (4 test modules, 65 tests)
- Test statistics and coverage
- Key testing features
- Test data seeding
- TDD approach for route implementation
- Documentation updates
- Next steps for Phase 04

**Best For**: Understanding integration test suite and what they cover.

### [PHASE-05-SUMMARY.md](./PHASE-05-SUMMARY.md)
Phase 05 - API Routes Implementation (Complete):
- Overview of implementation
- **Campaign Routes** (2 endpoints)
  - GET /campaigns - List campaigns
  - GET /campaigns/:sourceAccountId/:externalCampaignId - Campaign with history
- **Widget Blacklist Routes** (3 endpoints)
  - GET /widgets/blacklist - List blacklist
  - POST /widgets/blacklist - Add to blacklist
  - DELETE /widgets/blacklist/:id - Remove from blacklist
- **Optimizer Routes** (5 endpoints)
  - Campaign CRUD
  - Rule management
  - Action history
- Main index file updates
- Authentication and security
- Database operations
- Integration with test suite
- Performance considerations
- Next steps for Phase 06

**Best For**: Understanding API route implementation details.

### [PHASE-06-SUMMARY.md](./PHASE-06-SUMMARY.md)
Phase 06 - Traffic Source Adapters (CURRENT):
- Overview of 4 traffic source implementations
- **Taboola Adapter**
  - OAuth2 authentication with account ID
  - Campaign and widget management
  - Rate limiting (100 req/min)
- **Outbrain Adapter**
  - Basic auth with 30-day tokens
  - Strict rate limiting (30 req/sec, 2 logins/hour)
  - Special token refresh strategy
- **MGID Adapter**
  - API key authentication (no token exchange)
  - Simplest integration
  - No login rate limits
- **Shared Utilities**
  - `extractMetrics()` DRY utility for all sources
  - `makeRequest()` for HTTP calls
  - `buildUrl()` for query parameters
  - Rate limiting and retry logic
- Authentication flows and token management
- Metrics extraction and normalization
- Error handling patterns
- Testing strategy
- Integration with system
- Performance characteristics
- DRY improvements

**Best For**: Understanding traffic source adapters and implementation patterns.

### [TRAFFIC-SOURCES-QUICK-REFERENCE.md](./TRAFFIC-SOURCES-QUICK-REFERENCE.md)
Quick reference guide for traffic sources:
- Source comparison matrix (auth, rate limits, endpoints)
- Credential configuration examples
- Common operations (authenticate, list campaigns, blacklist widgets)
- Error handling patterns
- Rate limiting information
- Metrics extraction details
- Token management
- Status mapping
- Testing information
- Common code patterns

**Best For**: Quick lookup for traffic source details and code patterns.

---

## Testing & Quality

### [testing-guide.md](./testing-guide.md)
Comprehensive testing documentation:
- Test infrastructure setup
- Unit tests (Phase 02)
  - Service layer tests (39 tests)
  - Middleware tests (12 tests)
  - Utility tests (9 tests)
  - Total: 78 tests
- Integration tests (Phase 03)
  - Source accounts (18 tests)
  - Campaigns (11 tests)
  - Widgets (16 tests)
  - Optimizer (21 tests)
  - Total: 65 tests
- Test helpers and fixtures
- Running tests
- Coverage goals (85% lines/functions, 80% branches)
- Test patterns and best practices

**Best For**: Understanding test infrastructure, writing tests, checking coverage.

---

## Quick Navigation

### By Role

**Project Manager**:
1. [project-overview-pdr.md](./project-overview-pdr.md) - Project status and roadmap
2. [PHASE-05-SUMMARY.md](./PHASE-05-SUMMARY.md) - Current phase completion

**Backend Developer**:
1. [api-docs.md](./api-docs.md) - API endpoint reference
2. [QUICK-START-API.md](./QUICK-START-API.md) - Quick testing guide
3. [system-architecture.md](./system-architecture.md) - Design patterns
4. [code-standards.md](./code-standards.md) - Development standards

**Frontend Developer**:
1. [api-docs.md](./api-docs.md) - API integration guide
2. [QUICK-START-API.md](./QUICK-START-API.md) - Testing endpoints
3. [project-overview-pdr.md](./project-overview-pdr.md) - System overview

**QA/Tester**:
1. [testing-guide.md](./testing-guide.md) - Test infrastructure
2. [PHASE-05-SUMMARY.md](./PHASE-05-SUMMARY.md) - What was tested
3. [QUICK-START-API.md](./QUICK-START-API.md) - API testing examples

**DevOps**:
1. [system-architecture.md](./system-architecture.md) - Deployment architecture
2. [project-overview-pdr.md](./project-overview-pdr.md) - Technology stack
3. [code-standards.md](./code-standards.md) - Build and deployment standards

### By Task

**Setting up local development**:
1. [README.md](./README.md) - Quick start
2. [QUICK-START-API.md](./QUICK-START-API.md) - API server setup

**Implementing new endpoints**:
1. [system-architecture.md](./system-architecture.md) - Route patterns
2. [code-standards.md](./code-standards.md) - Code organization
3. [testing-guide.md](./testing-guide.md) - Testing patterns

**Integrating with API**:
1. [api-docs.md](./api-docs.md) - Endpoint reference
2. [QUICK-START-API.md](./QUICK-START-API.md) - Examples
3. [system-architecture.md](./system-architecture.md) - Authentication flow

**Understanding database**:
1. [system-architecture.md](./system-architecture.md) - Schema and design
2. [PHASE-05-SUMMARY.md](./PHASE-05-SUMMARY.md) - Database operations

**Debugging issues**:
1. [QUICK-START-API.md](./QUICK-START-API.md) - Troubleshooting guide
2. [api-docs.md](./api-docs.md) - Error codes
3. [system-architecture.md](./system-architecture.md) - System design

---

## Document Statistics

| Document | Lines | Type | Date |
|----------|-------|------|------|
| project-overview-pdr.md | 445 | Comprehensive | Jan 2 |
| system-architecture.md | 800+ | Architecture | Jan 2 |
| code-standards.md | ~250 | Standards | Jan 1 |
| api-docs.md | 950+ | API Reference | Jan 2 |
| PHASE-03-SUMMARY.md | 215 | Phase Summary | Jan 2 |
| PHASE-05-SUMMARY.md | 1200+ | Implementation | Jan 2 |
| PHASE-06-SUMMARY.md | 2500+ | Implementation | Jan 2 |
| TRAFFIC-SOURCES-QUICK-REFERENCE.md | 450+ | Quick Reference | Jan 2 |
| QUICK-START-API.md | 350+ | Quick Reference | Jan 2 |
| testing-guide.md | ~500 | Testing | Jan 2 |

**Total Documentation**: 7,650+ lines

---

## Phase Timeline & Status

```
Phase 01: Project Setup & Core Models             ✓ Complete (Dec 31)
Phase 02: Backend Unit Tests (78 tests)            ✓ Complete (Jan 1)
Phase 03: Backend Integration Tests (65 tests)     ✓ Complete (Jan 2)
Phase 04: Route Integration Tests (65 tests)       ✓ Complete (Jan 2)
Phase 05: API Routes Implementation               ✓ Complete (Jan 2)
Phase 06: Traffic Source Adapters (4 sources)     ✓ Complete (Jan 2)
Phase 07: Campaign Sync Service                    In Progress
Phase 08: Frontend Development                    Pending
Phase 09: E2E Testing                            Pending
Phase 10: Production Deployment                  Pending
```

---

## Key Metrics

### API Implementation
- **Endpoints**: 13 fully functional
- **Routes**: 3 modules (campaigns, widgets, optimizer)
- **Authentication**: JWT-based with user isolation
- **Test Coverage**: 65 integration tests (100% pass rate)

### Code Quality
- **Unit Tests**: 78 (85%+ coverage)
- **Integration Tests**: 65
- **Total Tests**: 143
- **Coverage Target**: 85% lines/functions, 80% branches

### Documentation
- **Total Documents**: 8
- **Total Lines**: 4,400+
- **API Examples**: 13 curl examples
- **Response Schemas**: Complete for all endpoints

---

## Getting Started Checklist

- [ ] Read [README.md](./README.md) for quick start
- [ ] Review [project-overview-pdr.md](./project-overview-pdr.md) for project context
- [ ] Start API server with `npm run dev --workspace=apps/api`
- [ ] Read [QUICK-START-API.md](./QUICK-START-API.md) for common tasks
- [ ] Test endpoints using curl examples
- [ ] Review [api-docs.md](./api-docs.md) for complete reference
- [ ] Check [system-architecture.md](./system-architecture.md) for design patterns
- [ ] Run tests with `npm run test --workspace=apps/api`

---

## Support & Questions

For questions or clarifications about:

- **API Endpoints**: See [api-docs.md](./api-docs.md)
- **Implementation Details**: See [PHASE-05-SUMMARY.md](./PHASE-05-SUMMARY.md)
- **System Design**: See [system-architecture.md](./system-architecture.md)
- **Testing**: See [testing-guide.md](./testing-guide.md)
- **Code Standards**: See [code-standards.md](./code-standards.md)
- **Quick Answers**: See [QUICK-START-API.md](./QUICK-START-API.md)

---

## Related Files Outside Docs

### Test Files
- `apps/api/src/test/` - Integration test suite
- `apps/api/src/routes/*.test.ts` - Route-specific tests

### Source Code
- `apps/api/src/routes/campaigns.ts` - Campaign endpoints
- `apps/api/src/routes/widgets.ts` - Widget blacklist endpoints
- `apps/api/src/routes/optimizer.ts` - Optimizer endpoints
- `apps/api/src/index.ts` - Server setup and routing

### Configuration
- `.env.example` - Environment variable template
- `apps/api/tsconfig.json` - TypeScript configuration
- `apps/api/vitest.config.ts` - Test configuration

---

## Document Maintenance

**Last Review**: January 2, 2026
**Documentation Status**: Current with Phase 06
**Next Review**: Upon Phase 07 completion

### To Update Documentation:
1. Modify relevant document
2. Update this INDEX.md with any changes
3. Run tests to verify examples still work
4. Commit documentation changes with feature code

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | Jan 2 | Added Phase 06 Traffic Source Adapters documentation |
| 1.0 | Jan 2 | Initial Phase 05 documentation |

---

**Happy coding!** 🚀
