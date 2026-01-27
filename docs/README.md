# NativeHub 3.0 Documentation

Central documentation for NativeHub 3.0 - Native Advertising Management Platform.

## Quick Start

### For New Developers

1. **Start here**: [Testing Guide](./testing-guide.md) - Understand how tests work
2. **Then read**: [Code Standards](./code-standards.md) - Learn coding conventions
3. **Reference**: [System Architecture](./system-architecture.md) - Understand the system design

### For Project Managers

1. **Overview**: [Project Overview & PDR](./project-overview-pdr.md) - Goals, requirements, timeline

### For System Architects

1. **Design**: [System Architecture](./system-architecture.md) - Detailed technical architecture
2. **Deployment**: [Deployment Guide](./deployment-guide.md) - Infrastructure and deployment

## Documentation Structure

### Core Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| **[Testing Guide](./testing-guide.md)** | Test infrastructure, patterns, and how to run tests | Developers, QA |
| **[Code Standards](./code-standards.md)** | Coding conventions, architecture patterns, best practices | All developers |
| **[System Architecture](./system-architecture.md)** | System design, data flows, database schema, security | Architects, Senior devs |
| **[Project Overview & PDR](./project-overview-pdr.md)** | Project goals, requirements, timeline, phases | PMs, Team leads |
| **[Deployment Guide](./deployment-guide.md)** | Production setup, Docker, CI/CD, monitoring | DevOps, Senior devs |
| **[Project Roadmap](./project-roadmap.md)** | Feature roadmap, future phases, priorities | PMs, Leadership |

### Supplementary Documents

| Document | Purpose |
|----------|---------|
| **[Design Guidelines](./design-guidelines.md)** | UI/UX design patterns and component library |
| **[API Documentation](./api-docs.md)** | REST API endpoints, request/response formats |

## Phase Status

**Current Phase**: Phase 02 - Backend Unit Tests ✓ Complete

- Phase 01: Core Backend & Database ✓
- Phase 02: Backend Unit Tests ✓
  - 78 unit tests across services, middleware, utilities
  - 85%+ line coverage, 80%+ branch coverage
  - Vitest + PGlite integration testing
- Phase 03: Traffic Source Integrations (Planned)
- Phase 04: Optimizer Engine (Planned)
- Phase 05: Frontend Dashboard (Planned)
- Phase 06: Jobs & Notifications (Planned)
- Phase 07: Deployment & DevOps (Planned)
- Phase 08: Advanced Features (Optional)

## Key Sections by Role

### Frontend Developers
- [Code Standards](./code-standards.md) - Code style and API design
- [System Architecture](./system-architecture.md) - API contracts and data flows
- [Testing Guide](./testing-guide.md) - Testing patterns

### Backend Developers
- [Code Standards](./code-standards.md) - Service layer, database patterns
- [System Architecture](./system-architecture.md) - Detailed service designs
- [Testing Guide](./testing-guide.md) - Writing backend tests

### DevOps Engineers
- [Deployment Guide](./deployment-guide.md) - Docker, Kubernetes, CI/CD
- [System Architecture](./system-architecture.md) - Infrastructure overview

### Project Managers
- [Project Overview & PDR](./project-overview-pdr.md) - Requirements and timeline
- [Project Roadmap](./project-roadmap.md) - Feature priorities

## Key Concepts

### Test Infrastructure (Phase 02)

```
Vitest (test runner)
  ├── PGlite (in-memory PostgreSQL)
  │   └── 8 test tables with relationships
  ├── Module aliases (db mocking)
  ├── Test setup/teardown
  └── 78 unit tests
```

**Running Tests**:
```bash
npm run test --workspace=apps/api          # Run all tests
npm run test -- --watch                    # Watch mode
npm run test:coverage --workspace=apps/api # With coverage
```

### Service Architecture

```
Route Handler
  → Service Layer (Business Logic)
    → Data Access Layer (Drizzle ORM)
      → PostgreSQL Database
```

**Core Services**:
- SourceAccountService - Account & credential management
- OptimizerService - Campaign & rule management
- ActionExecutor - Action execution and logging
- RuleEngine - Condition evaluation
- CampaignSyncService (Phase 03) - API integration

### Database Schema

8 tables with relationships:
- source_accounts → campaign_syncs, widget_blacklist, optimizer_campaigns
- optimizer_campaigns → optimizer_rules, optimizer_actions
- optimizer_rules → optimizer_actions (via rule_id)

## Development Workflow

### Adding a New Feature

1. **Design**: Update [System Architecture](./system-architecture.md) if needed
2. **Implement**: Follow [Code Standards](./code-standards.md)
3. **Test**: Write tests following [Testing Guide](./testing-guide.md)
4. **Document**: Update relevant docs
5. **Deploy**: Follow [Deployment Guide](./deployment-guide.md)

### Writing Tests

1. Create `src/services/my-service.test.ts` in same folder as implementation
2. Follow test structure from [Testing Guide](./testing-guide.md)
3. Use fixtures from `src/test/fixtures/`
4. Mock external APIs with `vi.mock()`
5. Run: `npm run test -- my-service.test.ts`

### Code Review Checklist

- [ ] Tests added/updated for new code
- [ ] Follows [Code Standards](./code-standards.md) naming conventions
- [ ] No hardcoded credentials or secrets
- [ ] Database queries use Drizzle ORM
- [ ] Error handling with meaningful messages
- [ ] Documentation updated if API changed

## Common Tasks

### Run Tests
```bash
npm run test --workspace=apps/api
```

### Generate Coverage Report
```bash
npm run test:coverage --workspace=apps/api
open apps/api/coverage/index.html
```

### View Test Database Schema
See [System Architecture](./system-architecture.md) Database Layer section

### Add New Test
Follow patterns in [Testing Guide](./testing-guide.md) Extending Tests section

### Deploy to Production
See [Deployment Guide](./deployment-guide.md)

### Create New Service
Follow template in [Code Standards](./code-standards.md) Service Layer Architecture

## Troubleshooting

### Tests Failing

See [Testing Guide](./testing-guide.md) Debugging Tests section

### Database Connection Issues

Check [Deployment Guide](./deployment-guide.md) Database Configuration

### API Response Format

See [System Architecture](./system-architecture.md) API Contracts section

## FAQ

**Q: How do I write a test?**
A: See [Testing Guide](./testing-guide.md) Test Structure section

**Q: What's the database schema?**
A: See [System Architecture](./system-architecture.md) Database Layer section

**Q: How do I deploy?**
A: See [Deployment Guide](./deployment-guide.md)

**Q: What are the project goals?**
A: See [Project Overview & PDR](./project-overview-pdr.md) Executive Summary

**Q: How should I name my files?**
A: See [Code Standards](./code-standards.md) File Naming section

**Q: How do I handle errors?**
A: See [Code Standards](./code-standards.md) Error Handling section

## Documentation Statistics

- Total files: 6 core documents
- Total lines: 2,000+ lines of documentation
- Code examples: 25+ examples
- Data flow diagrams: 3 ASCII diagrams
- Database tables documented: 8 tables
- Services documented: 5 core services
- Test suites documented: 7 test suites (78 tests)
- Architectural layers: 7 layers

## Last Updated

- **Testing Guide**: 2026-01-02 (Phase 02)
- **Code Standards**: 2026-01-02 (Phase 02)
- **System Architecture**: 2026-01-02 (Phase 02)
- **Project Overview & PDR**: 2026-01-02 (Phase 02)

## Contributing to Documentation

When updating documentation:

1. Maintain consistent Markdown formatting
2. Update the last updated date
3. Use code examples from actual codebase
4. Add cross-references to related docs
5. Keep related documents in sync

## Related Resources

- **Project Repository**: GitHub (private)
- **Issues & PRs**: GitHub Issues/Pull Requests
- **Team Chat**: Slack #nativehub-3-dev
- **Design System**: Figma (frontend team)

---

**Start with**: [Testing Guide](./testing-guide.md) if you're new to the project
