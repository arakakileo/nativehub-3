# Outbrain API 500 Error Analysis

**Date**: 2026-01-07
**Issue**: Publishers endpoint returning 500 errors
**URL**: `https://api.outbrain.com/amplify/v0.1/marketers/.../publishers?offset=0&limit=50`
**Error**: `{ message: 'Our servers encountered an error while processing your request' }`

---

## Executive Summary

Outbrain publishers endpoint (`/marketers/{marketerId}/campaigns/{campaignId}/publishers`) returns 500 Internal Server Errors. Investigation reveals potential causes: deprecated endpoint usage, incorrect API structure, missing marketerId, or Outbrain server-side issues.

**Root Cause Candidates** (ranked by likelihood):
1. **Deprecated Endpoint** - Publishers/sections endpoints deprecated since 2017
2. **Missing CampaignId Parameter** - Endpoint requires campaignId in path
3. **Invalid MarketerId** - Token restored without marketerId validation
4. **Outbrain Infrastructure Issues** - Known API stability problems

---

## Technical Analysis

### 1. Code Implementation Review

**File**: `apps/api/src/traffic-sources/outbrain/index.ts`

#### Authentication Flow
```typescript
// Lines 53-68: Pre-obtained token support
if (credentials.clientId && credentials.clientId.length > 100) {
  this.accessToken = credentials.clientId
  this.marketerId = credentials.accountId || ''  // ⚠️ Could be empty
}

// Lines 34-41: Token restoration without marketerId validation
override setStoredToken(token: string, expiresAt: Date, externalAccountId?: string): void {
  super.setStoredToken(token, expiresAt, externalAccountId)
  this.marketerId = externalAccountId || ''
  if (!this.marketerId) {
    logger.warn({ sourceId: this.sourceId }, 'Outbrain token restored without marketerId')
  }
}
```

**Issue**: MarketerId can be empty when tokens are restored from cache/DB without externalAccountId.

#### Publishers Endpoint Call
```typescript
// Lines 303-327: getWidgets() method
const response = await makeRequest<{ publishers: OutbrainPublisher[] }>(
  buildUrl(config.baseUrl, `/marketers/${this.marketerId}/campaigns/${options.campaignId}/publishers`, {
    offset: options.page ? (options.page - 1) * limit : 0,
    limit,
  }),
  { headers: { 'OB-TOKEN-V1': this.accessToken! } }
)
```

**Observations**:
- ✅ Correct endpoint structure with campaignId
- ✅ Rate limiter applied (30 req/sec)
- ✅ Retry logic with exponential backoff
- ✅ MarketerId validation via `validateMarketerId()` at line 305
- ❌ No Content-Type header specified (defaults to `application/json`)
- ❌ No error-specific handling for 500 responses

### 2. Request Headers Analysis

**Current Headers** (from `request-helpers.ts:12-19`):
```typescript
const headers: HeadersInit = {
  'Content-Type': 'application/json',
  ...options.headers,
}
```

**Sent Headers**:
- `Content-Type: application/json`
- `OB-TOKEN-V1: {token}`

**Missing Headers**:
- `Accept: application/json` (recommended)
- `AMPLIFY-REQUEST-ID` tracking (for debugging)

### 3. API Endpoint Structure Verification

**Current Implementation**:
```
GET https://api.outbrain.com/amplify/v0.1/marketers/{marketerId}/campaigns/{campaignId}/publishers?offset=0&limit=50
```

**Expected Parameters**:
- ✅ `marketerId` - Account identifier
- ✅ `campaignId` - Campaign identifier
- ✅ `offset` - Pagination offset
- ✅ `limit` - Result limit (max 50)

**Potential Issue**: Outbrain deprecated publishers/sections endpoints in 2017 per Google Groups discussion. New performance reporting endpoints replaced them, but campaign-level publisher listing may still use old structure.

### 4. Authentication & Token Issues

**Token Management**:
- Tokens valid for 30 days
- Login rate limit: 2 req/hour (very strict)
- Refresh buffer: 1 day (86400s) before expiry

**Potential Token Problems**:
1. Token expired but not refreshed (pre-obtained tokens can't refresh)
2. Token valid but marketerId mismatched
3. Token permissions insufficient for publishers endpoint

### 5. Known API Issues (Web Search Findings)

**Google Groups Reports**:
- HTTP 500/503/504 errors on various endpoints
- "Service is overloaded" 503 responses
- "500 Internal Server Error on POST /reports/content"
- API instability reported Sep 2024+

**Rate Limiting**:
- Login: 2 req/hour per user
- Single token: 30 req/sec
- Performance reporting: 10 req/min per marketer (**Critical**)

**Sources**:
- [Outbrain-AmplifyApi Google Group](https://groups.google.com/g/outbrain-amplifyapi)
- [Amplify API Documentation](https://developer.outbrain.com/home-page/amplify-api/documentation/)
- [How to use Outbrain API](https://www.outbrain.com/help/advertisers/amplify-api/)

---

## Root Cause Hypotheses

### Hypothesis 1: Deprecated Endpoint (HIGH CONFIDENCE)
**Evidence**:
- Web search shows publishers/sections endpoints deprecated 2017
- New performance reporting endpoints replaced old structure
- Current code uses legacy `/publishers` path

**Likelihood**: 75%

### Hypothesis 2: Missing/Invalid MarketerId (MEDIUM CONFIDENCE)
**Evidence**:
- Token restoration allows empty marketerId (line 36)
- Warning logged but request proceeds
- 500 error could be validation failure on server

**Likelihood**: 60%

### Hypothesis 3: Rate Limit Exceeded (LOW CONFIDENCE)
**Evidence**:
- Performance API limited to 10 req/min
- Publishers endpoint may count against this limit
- Retry logic should catch 429, not 500

**Likelihood**: 20%

### Hypothesis 4: Outbrain Server Issues (MEDIUM CONFIDENCE)
**Evidence**:
- Multiple reports of 500/503/504 errors in Google Groups
- Generic error message suggests infrastructure problem
- Intermittent behavior reported by users

**Likelihood**: 50%

### Hypothesis 5: Incorrect API Version (LOW CONFIDENCE)
**Evidence**:
- Using v0.1 endpoint
- No evidence of v1.0+ for publishers
- Base URL correct per docs

**Likelihood**: 10%

---

## Recommended Fixes (Priority Order)

### Fix 1: Verify Endpoint with Outbrain Support (CRITICAL)
**Action**: Post to [Outbrain Google Group](https://groups.google.com/forum/#!forum/outbrain-amplifyapi) with:
- AMPLIFY-REQUEST-ID header from response
- Full error details
- Confirm current publishers endpoint structure

**Code Change**: Add request ID logging
```typescript
const response = await makeRequest(url, { headers })
const requestId = response.headers?.get('AMPLIFY-REQUEST-ID')
logger.error({ requestId, url, status }, 'Outbrain API error')
```

### Fix 2: Add Accept Header (QUICK WIN)
**Rationale**: Some APIs require explicit Accept header

**Code Change** (`request-helpers.ts`):
```typescript
const headers: HeadersInit = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  ...options.headers,
}
```

### Fix 3: Enforce MarketerId Validation on Token Restoration (CRITICAL)
**Current Issue**: Token can be restored with empty marketerId

**Code Change** (`outbrain/index.ts:34-41`):
```typescript
override setStoredToken(token: string, expiresAt: Date, externalAccountId?: string): void {
  if (!externalAccountId || externalAccountId.trim() === '') {
    throw new Error('Outbrain token restoration requires marketerId (externalAccountId)')
  }
  super.setStoredToken(token, expiresAt, externalAccountId)
  this.marketerId = externalAccountId
  logger.debug({ sourceId: this.sourceId, marketerId: this.marketerId }, 'Restored Outbrain token')
}
```

### Fix 4: Migrate to New Performance Endpoints (LONG-TERM)
**If publishers endpoint is deprecated**, replace with:
```
GET /reports/marketers/{marketerId}/campaigns/{campaignId}/periodic?breakdown=publisherId
```

**Research Required**: Confirm new endpoint structure via Apiary docs

### Fix 5: Enhanced Error Handling for 500 Errors
**Add specific 500 error logging**:

```typescript
// In api-error.ts
export class ApiError extends Error {
  isServerError(): boolean {
    return this.statusCode >= 500
  }

  // New method
  shouldNotifySupport(): boolean {
    return this.statusCode === 500 &&
           typeof this.responseBody === 'object' &&
           'message' in this.responseBody
  }
}
```

### Fix 6: Retry Strategy for Server Errors
**Current**: Retries on rate limits + server errors (isServerError)
**Issue**: 500 might not be transient

**Code Change** (`retry.ts:54-65`):
```typescript
function defaultRetryCondition(error: Error): boolean {
  if (error instanceof ApiError) {
    // Don't retry 500 with generic message (not transient)
    if (error.statusCode === 500 &&
        error.responseBody?.message?.includes('encountered an error')) {
      return false // Requires investigation, not retry
    }
    return error.isRateLimit() || error.isServerError()
  }
  return error.message.includes('fetch') || error.message.includes('network')
}
```

---

## Testing Strategy

### 1. Validate MarketerId
```typescript
// Add test to outbrain/index.test.ts
it('should throw error when restoring token without marketerId', () => {
  expect(() => {
    source.setStoredToken('valid-token', new Date(), '')
  }).toThrow('requires marketerId')
})
```

### 2. Test Publisher Endpoint with curl
```bash
curl -X GET \
  "https://api.outbrain.com/amplify/v0.1/marketers/{MARKETER_ID}/campaigns/{CAMPAIGN_ID}/publishers?offset=0&limit=5" \
  -H "OB-TOKEN-V1: {YOUR_TOKEN}" \
  -H "Accept: application/json" \
  -v
```

### 3. Check Alternative Endpoints
```bash
# Try sections instead of publishers
curl -X GET \
  "https://api.outbrain.com/amplify/v0.1/marketers/{MARKETER_ID}/campaigns/{CAMPAIGN_ID}/sections" \
  -H "OB-TOKEN-V1: {YOUR_TOKEN}"
```

---

## Evidence Collection Checklist

- [ ] Capture AMPLIFY-REQUEST-ID from 500 response
- [ ] Log full request URL with marketerId/campaignId
- [ ] Verify token is not expired (check tokenExpiresAt)
- [ ] Confirm marketerId is set before request
- [ ] Check if campaignId exists in account
- [ ] Test with different campaigns (rule out campaign-specific issue)
- [ ] Monitor for intermittent success (infrastructure issue)
- [ ] Compare with Taboola/Revcontent widget fetching (working pattern)

---

## Next Steps

1. **Immediate** (Developer):
   - Add Accept header
   - Enforce marketerId validation on token restore
   - Log AMPLIFY-REQUEST-ID on 500 errors

2. **Short-Term** (24-48 hours):
   - Test endpoint with curl using real credentials
   - Post to Outbrain Google Group with error details
   - Review Apiary docs for current publisher endpoint spec

3. **Long-Term** (If endpoint deprecated):
   - Migrate to new performance reporting endpoints
   - Update widget fetching logic
   - Add deprecation warning in code

---

## Related Files

- `apps/api/src/traffic-sources/outbrain/index.ts` (lines 303-327, 34-41)
- `apps/api/src/traffic-sources/utils/request-helpers.ts` (lines 1-35)
- `apps/api/src/traffic-sources/utils/retry.ts` (lines 54-65)
- `apps/api/src/traffic-sources/utils/api-error.ts` (lines 26-28)
- `apps/api/src/traffic-sources/config.ts` (lines 15-20)

---

## Unresolved Questions

1. **Is `/marketers/{m}/campaigns/{c}/publishers` endpoint still supported?** - Need Outbrain confirmation
2. **What is the current endpoint for campaign publisher/widget listing?** - Check Apiary docs or support
3. **Does Outbrain use "publishers" vs "sections" vs "widgets"?** - Terminology unclear in docs
4. **Are there permissions required for publishers endpoint?** - Token may lack scope
5. **Is 500 error intermittent or consistent?** - Need production logs analysis
6. **Does the error occur for all campaigns or specific ones?** - Test with multiple campaignIds
7. **What is the correct breakdown parameter for new endpoints?** - `publisherId`, `publisher`, or `section`?

---

## Sources

- [Outbrain Amplify API Help](https://www.outbrain.com/help/advertisers/amplify-api/)
- [Amplify API Documentation Hub](https://developer.outbrain.com/home-page/amplify-api/documentation/)
- [Outbrain-AmplifyApi Google Group](https://groups.google.com/g/outbrain-amplifyapi)
- [Amplify API on Apiary](https://amplifyv01.docs.apiary.io/)
- Internal Research: `plans/260104-1715-campaigns-filters-sorting/research/outbrain-api-research.md`
