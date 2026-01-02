# Code Standards & Architecture - NativeHub 3.0

## Project Structure

```
nativehub-3/
├── apps/
│   ├── api/                    # Hono backend (Node.js)
│   │   ├── src/
│   │   │   ├── index.ts       # Application entry point
│   │   │   ├── lib/
│   │   │   │   ├── db.ts      # Drizzle ORM instance
│   │   │   │   ├── crypto.ts  # Encryption/decryption utilities
│   │   │   │   └── logger.ts  # Structured logging
│   │   │   ├── db/
│   │   │   │   └── schema.ts  # Drizzle schema definitions
│   │   │   ├── routes/        # API endpoint handlers
│   │   │   ├── services/      # Business logic layer
│   │   │   │   ├── source-account.service.ts
│   │   │   │   └── optimizer/
│   │   │   │       ├── optimizer.service.ts
│   │   │   │       ├── action-executor.ts
│   │   │   │       └── rule-engine.ts
│   │   │   ├── traffic-sources/  # Traffic source integrations
│   │   │   │   ├── revcontent/
│   │   │   │   ├── taboola/
│   │   │   │   ├── outbrain/
│   │   │   │   ├── mgid/
│   │   │   │   └── index.ts
│   │   │   ├── middleware/    # Express/Hono middleware
│   │   │   ├── jobs/          # Background jobs
│   │   │   ├── test/          # Test infrastructure
│   │   │   │   ├── setup.ts
│   │   │   │   ├── fixtures/
│   │   │   │   └── mocks/
│   │   │   └── types/         # TypeScript type definitions
│   │   ├── vitest.config.ts
│   │   └── package.json
│   └── web/                    # React frontend (Vite)
│       ├── src/
│       │   ├── main.tsx
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── services/
│       │   └── types/
│       ├── vite.config.ts
│       └── package.json
├── packages/
│   └── shared/                 # Shared types and schemas
│       ├── src/
│       │   ├── types/
│       │   ├── schemas/
│       │   └── constants/
│       └── package.json
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── entrypoint.sh
├── .github/
│   └── workflows/              # CI/CD pipelines
├── README.md
└── CLAUDE.md
```

## Code Style & Conventions

### TypeScript

- **Target**: ES2020 with strict mode enabled
- **Format**: Use Prettier with 2-space indentation
- **Naming**:
  - Classes: PascalCase (e.g., `OptimizerService`)
  - Functions: camelCase (e.g., `validateCredentials()`)
  - Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_TIMEOUT`)
  - Private members: _prefix (e.g., `_internalState`)

### File Naming

- **Services**: `{domain}.service.ts` (e.g., `source-account.service.ts`)
- **Tests**: `{file}.test.ts` (e.g., `source-account.service.test.ts`)
- **Utilities**: `{function}.ts` or `{domain}.utils.ts`
- **Middleware**: `{name}.middleware.ts` or `{name}.ts` in middleware/ folder
- **Routes**: `{resource}.routes.ts` or organized in routes/ folder

### Imports/Exports

- Use ES6 module syntax (`import`/`export`)
- Group imports: standard lib → npm packages → local modules
- Use absolute imports with `@/` alias where configured
- Avoid circular dependencies

```typescript
// Good
import { Router } from 'hono'
import { db } from '../lib/db.js'
import { sourceAccountService } from './source-account.service.js'
import type { SourceAccount } from '../types/index.js'

// Bad
import Router from 'hono'  // Use named imports
import { sourceAccountService } from '../../../services/source-account.service.js'  // Use aliases
```

## Service Layer Architecture

### Service Responsibilities

Services encapsulate business logic and database operations:

1. **Data Access**: Query database via Drizzle ORM
2. **Validation**: Validate inputs before operations
3. **Transformation**: Convert between API and domain models
4. **Side Effects**: Handle encryption, external API calls
5. **Error Handling**: Provide meaningful error messages

### Service Template

```typescript
import { db } from '../lib/db.js'
import { sourceAccounts } from '../db/schema.js'
import type { CreateSourceAccountInput } from '../types/index.js'
import { eq } from 'drizzle-orm'

class SourceAccountService {
  async create(userId: string, input: CreateSourceAccountInput) {
    // Validate inputs
    if (!userId || !input.sourceId) {
      throw new Error('Missing required fields')
    }

    // Transform input
    const { encrypted, iv } = encryptCredentials(input.credentials)

    // Execute query
    const [result] = await db.insert(sourceAccounts).values({
      userId,
      sourceId: input.sourceId,
      credentialsEncrypted: encrypted,
      credentialsIv: iv,
    }).returning()

    return result
  }

  async get(id: string) {
    const [account] = await db.select().from(sourceAccounts)
      .where(eq(sourceAccounts.id, id))
    return account
  }
}

export const sourceAccountService = new SourceAccountService()
```

### Error Handling

Services throw descriptive errors:

```typescript
class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`)
    this.name = 'NotFoundError'
  }
}
```

## Database Access

### Schema Definition

Use Drizzle ORM with strict TypeScript:

```typescript
// db/schema.ts
import { pgTable, text, uuid, numeric, boolean, timestamp } from 'drizzle-orm/pg-core'

export const sourceAccounts = pgTable('source_accounts', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid().notNull(),
  sourceId: text().notNull(),
  name: text().notNull(),
  credentialsEncrypted: text().notNull(),
  credentialsIv: text().notNull(),
  status: text().notNull().default('pending'),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp().defaultNow().notNull(),
}, (table) => ({
  // Indexes and constraints
  uniqueUserSourceName: unique().on(table.userId, table.sourceId, table.name),
}))
```

### Query Patterns

- Use Drizzle ORM for type safety
- Always specify columns explicitly for large tables
- Use relationships for joins (if defined)
- Implement pagination for list operations

```typescript
// Good
const accounts = await db.select({
  id: sourceAccounts.id,
  name: sourceAccounts.name,
  sourceId: sourceAccounts.sourceId,
}).from(sourceAccounts)
  .where(eq(sourceAccounts.userId, userId))
  .limit(50)

// Avoid - no pagination
const allAccounts = await db.select().from(sourceAccounts)
```

## API Design

### Endpoint Conventions

- **REST**: Use standard methods (GET/POST/PUT/DELETE)
- **Versioning**: Include version in path `/api/v1/`
- **Naming**: Use plural nouns for collections

### Response Format

All API responses follow this format:

```typescript
// Success (2xx)
{
  "success": true,
  "data": { /* resource */ }
}

// Error (4xx, 5xx)
{
  "success": false,
  "error": "Descriptive error message",
  "code": "ERROR_CODE"
}
```

### Status Codes

- `200 OK` - Successful GET/PUT
- `201 Created` - Successful POST
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing/invalid auth
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate/constraint violation
- `500 Internal Server Error` - Unexpected error

## Testing Standards

### Test Structure

Every service and utility should have tests:

```
services/
├── source-account.service.ts
└── source-account.service.test.ts   # Same folder as service

lib/
├── crypto.ts
└── crypto.test.ts                    # Same folder as implementation
```

### Test Organization

Use `describe()` blocks to organize tests:

```typescript
describe('SourceAccountService', () => {
  describe('create', () => {
    it('should create a source account', async () => {
      // Arrange
      const input = { sourceId: 'revcontent', ... }

      // Act
      const result = await sourceAccountService.create(userId, input)

      // Assert
      expect(result.id).toBeDefined()
      expect(result.sourceId).toBe('revcontent')
    })

    it('should encrypt credentials', async () => {
      // ...
    })
  })

  describe('list', () => {
    // ...
  })
})
```

### Naming Conventions

- Test names start with "should"
- Describe the behavior and expected outcome
- Use positive and negative cases

```typescript
// Good
it('should create account with encrypted credentials', async () => {})
it('should throw error if sourceId is missing', async () => {})
it('should return only user\'s accounts', async () => {})

// Bad
it('test account creation', async () => {})
it('createAccount', async () => {})
```

### Coverage Requirements

- **Lines**: 85%
- **Functions**: 85%
- **Branches**: 80% (conditional logic)
- **Statements**: 85%

Focus on critical paths over edge cases.

### Mocking Strategy

1. **Database**: Use PGlite in-memory instance (auto-mocked via vitest config)
2. **External APIs**: Mock with `vi.mock()`
3. **Date/Time**: Mock `Date` if time-sensitive
4. **Crypto**: Test real encryption, mock external auth

```typescript
// Mock traffic source
vi.mock('../../traffic-sources/index.js', () => ({
  getAuthenticatedSource: vi.fn().mockResolvedValue({
    fetchCampaigns: vi.fn(),
  }),
}))
```

## Middleware

### Purpose

Middleware intercepts requests to:
- Validate authentication
- Log requests
- Handle errors
- Transform payloads
- Rate limit

### Structure

```typescript
import { Context, Next } from 'hono'

export async function authMiddleware(c: Context, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const payload = verifyToken(token)
    c.set('userId', payload.sub)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}
```

### Application

```typescript
const app = new Hono()

// Apply globally
app.use(authMiddleware)
app.use(errorHandler)

// Or to specific routes
app.post('/accounts', authMiddleware, createAccount)
```

## Environment Variables

### Backend (apps/api/.env)

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/nativehub

# Encryption
ENCRYPTION_KEY=0123456789abcdef...  # 64-char hex string
JWT_SECRET=your-jwt-secret-key

# External APIs
REVCONTENT_CLIENT_ID=...
REVCONTENT_CLIENT_SECRET=...
TABOOLA_CLIENT_ID=...
# ... other sources

# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

## Encryption

### Requirements

- Store sensitive credentials encrypted at rest
- Use AES-256-GCM for encryption
- Never log plaintext credentials
- Decrypt only when needed for API calls

### Implementation

```typescript
import crypto from 'crypto'

export function encryptCredentials(credentials: object): { encrypted: string; iv: string } {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = crypto.randomBytes(16)

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return {
    encrypted: encrypted + ':' + authTag.toString('hex'),
    iv: iv.toString('hex'),
  }
}

export function decryptCredentials(encrypted: string, iv: string): object {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const [encryptedData, authTag] = encrypted.split(':')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(authTag, 'hex'))

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return JSON.parse(decrypted)
}
```

## Logging

### Standards

- Use structured logging (JSON format)
- Include request ID for tracing
- Log at appropriate levels: error, warn, info, debug
- Never log PII or credentials

```typescript
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
})

// Usage
logger.info({ userId, accountId }, 'Syncing campaigns')
logger.error({ error: err.message }, 'Sync failed')
```

## Git Commit Messages

Format: `type(scope): subject`

```
feat(optimizer): add rule template system
fix(auth): validate JWT expiration correctly
refactor(db): use drizzle relations for joins
test(service): add source account tests
docs: update testing guide
chore: update dependencies
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code reorganization
- `test` - Test additions/fixes
- `docs` - Documentation
- `chore` - Build/dependency updates

## Performance Guidelines

### Database Queries

- Use indexes on foreign keys and frequent filters
- Pagination for list endpoints (default 50 items)
- Select only needed columns
- Use batch operations for bulk writes

### API Responses

- Limit response payload size
- Use compression (gzip)
- Cache static resources
- Implement rate limiting

### Optimization

- Profile before optimizing
- Use database explain plans
- Monitor slow queries (> 100ms)
- Implement caching strategically

## Security Best Practices

1. **Input Validation**: Validate all inputs before processing
2. **Authentication**: Use JWT with expiration
3. **Authorization**: Check permissions in every endpoint
4. **Encryption**: Encrypt credentials at rest
5. **SQL Injection**: Use parameterized queries (Drizzle ORM)
6. **CORS**: Restrict origins in production
7. **Rate Limiting**: Prevent abuse with request throttling
8. **Secrets**: Use environment variables, never commit keys

## Related Documents

- [Testing Guide](./testing-guide.md) - Test infrastructure and patterns
- [System Architecture](./system-architecture.md) - Service layer design
- [Deployment Guide](./deployment-guide.md) - Production configuration
