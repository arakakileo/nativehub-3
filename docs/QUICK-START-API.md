# NativeHub API - Quick Start Guide

## Starting the API Server

```bash
# Navigate to project root
cd F:\Claude\projects\nativehub-3

# Install dependencies (if not already done)
npm install

# Start API server (runs on http://localhost:3001)
npm run dev --workspace=apps/api

# Check server is running
curl http://localhost:3001/health
```

## Getting an Authentication Token

You need a JWT token to access API endpoints. This would typically come from your authentication service.

For testing, you can use a test token from the test suite:

```bash
# Set your token
export TOKEN="your-jwt-token-here"

# Or use the token from test fixtures
# See: apps/api/src/test/fixtures/tokens.ts
```

## Making API Requests

### List All Campaigns

```bash
curl -X GET "http://localhost:3001/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Campaign with History

```bash
curl -X GET "http://localhost:3001/api/v1/campaigns/{sourceAccountId}/{externalCampaignId}" \
  -H "Authorization: Bearer $TOKEN"
```

### List Blacklisted Widgets

```bash
curl -X GET "http://localhost:3001/api/v1/widgets/blacklist" \
  -H "Authorization: Bearer $TOKEN"
```

### Add Widget to Blacklist

```bash
curl -X POST "http://localhost:3001/api/v1/widgets/blacklist" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "widgetId": "widget-123",
    "widgetDomain": "publisher.com",
    "reason": "Low CTR performance"
  }'
```

### List Optimizer Campaigns

```bash
curl -X GET "http://localhost:3001/api/v1/optimizer/campaigns" \
  -H "Authorization: Bearer $TOKEN"
```

### Create Optimizer Campaign

```bash
curl -X POST "http://localhost:3001/api/v1/optimizer/campaigns" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "externalCampaignId": "rev-12345",
    "targetCpa": 25.00,
    "bidStrategy": "target_cpa"
  }'
```

### Update Optimizer Campaign

```bash
curl -X PATCH "http://localhost:3001/api/v1/optimizer/campaigns/{id}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetCpa": 30.00,
    "enabled": true
  }'
```

### Get Campaign Action History

```bash
curl -X GET "http://localhost:3001/api/v1/optimizer/campaigns/{id}/actions?limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

### Delete Blacklist Entry

```bash
curl -X DELETE "http://localhost:3001/api/v1/widgets/blacklist/{id}" \
  -H "Authorization: Bearer $TOKEN"
```

## Testing with Integration Tests

```bash
# Run all integration tests
npm run test --workspace=apps/api -- routes/

# Run specific test file
npm run test --workspace=apps/api -- campaigns.test.ts

# Run with coverage
npm run test:coverage --workspace=apps/api
```

## Common Response Patterns

### Success Response

```json
{
  "data": {
    "id": "...",
    "name": "..."
  }
}
```

### Error Response

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

## Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Missing/invalid token
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate resource
- `500 Internal Server Error` - Server error

## Environment Variables

```bash
# .env file for API
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:pass@localhost:5432/nativehub_dev
JWT_SECRET=dev-secret-key
ENCRYPTION_KEY=your-64-char-hex-string
LOG_LEVEL=debug
```

## Database Setup

```bash
# Create test database
createdb nativehub_dev

# Run migrations (if configured)
npm run migrate --workspace=apps/api

# View database (using psql)
psql -d nativehub_dev
```

## Debugging

### View API Logs

```bash
# API logs include request/response traces
npm run dev --workspace=apps/api

# Look for structured JSON logs with:
# - userId, accountId, campaignCount, etc.
# - Request path, method, response status
# - Execution time
```

### Test Database State

```bash
# View integration test database during test run
npm run test --workspace=apps/api -- --inspect-brk

# Then check with psql in another terminal
psql -d test_db
```

### Check Route Registration

```bash
# Routes are registered in apps/api/src/index.ts
# Verify routes are mounted:
cat apps/api/src/index.ts | grep ".route("
```

## Performance Tips

1. **Use Pagination**: Add `limit` parameter to action history endpoint
   ```bash
   /optimizer/campaigns/{id}/actions?limit=50
   ```

2. **Filter Early**: Use query parameters to filter at API level
   ```bash
   /widgets/blacklist?sourceAccountId={id}&externalCampaignId={id}
   ```

3. **Connection Pooling**: Drizzle handles connection pooling automatically

4. **Database Indexes**: Ensure indexes on user_id, sourceAccountId, etc.

## Related Documentation

- **Full API Docs**: `docs/api-docs.md` - Complete endpoint specifications
- **Phase 05 Summary**: `docs/PHASE-05-SUMMARY.md` - Implementation details
- **System Architecture**: `docs/system-architecture.md` - Design patterns
- **Testing Guide**: `docs/testing-guide.md` - Test infrastructure

## Troubleshooting

### "Unauthorized" Error
- Verify JWT token in Authorization header
- Check token hasn't expired (24 hour validity)
- Check token format: `Authorization: Bearer <token>`

### "Campaign not found" (404)
- Verify sourceAccountId and externalCampaignId are correct
- Verify user owns the source account
- Check campaign has been synced (syncedAt timestamp)

### "Duplicate entry" (409)
- Widget already blacklisted for that campaign
- Optimizer campaign already exists for that external campaign
- Try GET first to check existence

### Database Connection Error
- Verify DATABASE_URL environment variable
- Check PostgreSQL is running
- Verify database exists: `psql -l | grep nativehub`

## Next Steps

1. **Start API Server**: `npm run dev --workspace=apps/api`
2. **Test Endpoints**: Use curl examples above
3. **Read Full Docs**: See `docs/api-docs.md` for complete specifications
4. **Run Tests**: `npm run test --workspace=apps/api`
5. **Build Frontend**: Proceed to Phase 06 frontend development

## Quick Commands Reference

```bash
# Development
npm run dev --workspace=apps/api              # Start API
npm run test --workspace=apps/api             # Run tests
npm run test:coverage --workspace=apps/api    # With coverage
npm run lint --workspace=apps/api             # Lint code

# Building
npm run build --workspace=apps/api            # Production build

# Database
npm run migrate --workspace=apps/api          # Run migrations
npm run seed --workspace=apps/api             # Seed test data
```
