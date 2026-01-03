# Research: Node.js Job Queue Solutions for Campaign Sync

**Date**: 2026-01-03 | **Status**: Complete | **Context**: NativeHub 3.0 campaign sync service

## Executive Summary

For NativeHub 3.0's campaign sync service (Revcontent, Taboola, Outbrain, MGID every 30 minutes), **pg-boss** is the recommended solution. It provides PostgreSQL-backed persistence, exponential backoff retries, and zero additional infrastructure dependencies. Aligns perfectly with existing Drizzle ORM stack, requires minimal setup (single table schema auto-created), and handles 30-min scheduled syncs with reliability guarantees via SKIP LOCKED mechanism.

**Recommendation ranking**: 1) pg-boss | 2) Agenda (if MongoDB available) | 3) BullMQ (if Redis available) | 4) node-cron (for non-critical tasks only).

---

## Comparison Matrix

| Feature | pg-boss | BullMQ | Agenda | node-cron |
|---------|---------|---------|--------|-----------|
| **Backend** | PostgreSQL | Redis | MongoDB | In-memory |
| **Persistence** | ✅ Native | ✅ Native | ✅ Native | ❌ None |
| **Retry Logic** | ✅ Exp. backoff | ✅ Exp. backoff | ✅ Basic | ❌ Manual |
| **Cron Scheduling** | ✅ Yes | ⚠️ Limited | ✅ Full | ✅ Yes |
| **Job Survive Restarts** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Additional Dependency** | None (uses existing PG) | Redis required | MongoDB required | None |
| **Drizzle Integration** | ✅ Seamless (shared pool) | ❌ Separate | ❌ Separate | ✅ Seamless |
| **Deployment Complexity** | 🟢 Low | 🟡 Medium | 🟡 Medium | 🟢 Low |
| **Production Ready** | ✅ Yes (Hey.com, millions/day) | ✅ Yes | ✅ Yes | ⚠️ Limited |

---

## Detailed Analysis

### pg-boss (RECOMMENDED)

**Pros:**
- Uses PostgreSQL's SKIP LOCKED feature → exactly-once delivery guarantee
- Auto-creates schema on first run (no manual setup)
- Transactional job creation (atomic with app data)
- Exponential backoff with configurable `retryDelay` parameter
- Dead letter queue support for failed jobs
- Zero additional infrastructure (already using PostgreSQL)
- Shared connection pool with Drizzle ORM
- Multi-master support (Kubernetes-ready)
- Queryable jobs via SQL

**Cons:**
- Requires pgcrypto extension (superuser usually adds this)
- Exponential backoff can grow large (40-90 hours for later retries) unless capped manually
- Max job throughput lower than Redis-based solutions (still >1000 jobs/sec for campaign sync)

**Exponential Backoff Example:**
```javascript
const boss = new PgBoss(process.env.DATABASE_URL);
await boss.start();

// Schedule job with exponential backoff
await boss.send('sync-campaigns', {}, {
  startAfter: 30, // 30 sec delay before first attempt
  retryLimit: 5,
  retryDelay: 5, // 5 sec base, grows exponentially: 5, 10, 20, 40, 80 sec
  retryBackoff: true
});

// Handle job
boss.subscribe('sync-campaigns', async (job) => {
  try {
    await syncCampaigns(job.data);
    return { success: true };
  } catch (err) {
    throw err; // Triggers retry
  }
});
```

**Drizzle Integration:**
```typescript
// Single database setup with both Drizzle + pg-boss
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool });
export const boss = new PgBoss(process.env.DATABASE_URL);

// Both use same PostgreSQL database
await boss.start();
```

---

### BullMQ (Alternative if Redis available)

**Pros:**
- Highest throughput (Redis in-memory)
- Most advanced scheduling API (delays, priorities, rate limits)
- Strong TypeScript support
- Active maintenance, large community
- Job dependencies & sagas support

**Cons:**
- **Requires Redis** (additional infrastructure/cost)
- Separate connection management from Drizzle
- More complex for simple 30-min scheduled tasks
- Redis failures = job loss (unless persistence enabled)

**Best for:** High-throughput async processing with complex job orchestration.

---

### Agenda (Alternative if MongoDB available)

**Pros:**
- Simple API, low learning curve
- Full cron syntax support
- MongoDB persistence
- Lock mechanism prevents duplicate execution

**Cons:**
- **Requires MongoDB** (additional infrastructure)
- Last major release November 2022 (maintenance risk)
- No priority queues or rate limiting
- Slower than Redis-based solutions

**Best for:** MongoDB-heavy stacks needing simple scheduling.

---

### node-cron (Not Recommended)

**Critical Limitations:**
- ❌ No persistence → jobs lost on restart
- ❌ No built-in retry logic → requires manual implementation
- ❌ No monitoring/alerting
- ❌ Concurrency issues if tasks overlap

**Use case:** Dev/test only or non-critical monitoring tasks.

---

## Implementation Recommendation for NativeHub 3.0

### Option 1: pg-boss (CHOOSE THIS)

**Installation:**
```bash
npm install pg-boss
npm install -D @types/pg-boss
```

**Setup (30-min campaign sync):**
```typescript
// services/jobQueue.ts
import PgBoss from 'pg-boss';

export const boss = new PgBoss(process.env.DATABASE_URL);

export async function initJobQueue() {
  await boss.start();

  // Subscribe to sync job
  boss.subscribe('sync-campaigns', async (job) => {
    console.log(`[${job.id}] Syncing campaigns...`);
    try {
      await Promise.all([
        syncRevcontent(),
        syncTaboola(),
        syncOutbrain(),
        syncMGID()
      ]);
    } catch (err) {
      console.error(`[${job.id}] Sync failed:`, err);
      throw err; // Retries with exponential backoff
    }
  });

  // Schedule recurring sync every 30 minutes
  await boss.schedule('sync-campaigns', {}, { repeat: { minutes: 30 } });
}
```

**Costs:** $0 (uses existing PostgreSQL)

---

### Option 2: BullMQ (If Redis needed for other services)

Only consider if you already have Redis for caching/sessions. For campaign sync alone, adds unnecessary infrastructure.

---

## Migration Path (if changing solutions later)

pg-boss → BullMQ: Requires Redis setup, minimal code changes (job handling interface similar)

pg-boss → Agenda: Requires MongoDB, requires schema migration

---

## Unresolved Questions

1. **Max retry delay cap**: pg-boss exponential backoff grows unbounded. Should we cap at 15-min max delay? (Current growth: 5sec → 40-90hrs)
2. **Dead letter queue monitoring**: How to alert when jobs enter DLQ after max retries?
3. **Campaign sync error granularity**: Should each source (Revcontent, Taboola, etc.) fail independently or cascade?

---

## Sources

- [pg-boss GitHub](https://github.com/timgit/pg-boss)
- [pg-boss npm](https://www.npmjs.com/package/pg-boss)
- [Node.js Job Queue with PostgreSQL & pg-boss](https://talent500.com/blog/nodejs-job-queue-postgresql-pg-boss/)
- [PostgreSQL Hack for Queueing](https://www.codemotion.com/magazine/backend/queueing-without-a-queue-the-postgresql-hack/)
- [BullMQ vs pg-boss comparison](https://npm-compare.com/agenda,bull,kue,pg-boss)
- [Schedulers Comparison - Better Stack](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/)
- [Job Schedulers: Bull or Agenda - AppSignal](https://blog.appsignal.com/2023/09/06/job-schedulers-for-node-bull-or-agenda.html)
- [pg-boss exponential backoff issues](https://github.com/timgit/pg-boss/issues/441)
- [Drizzle ORM PostgreSQL (2025)](https://orm.drizzle.team/docs/get-started/postgresql-new)
- [LogSnag: Deep Dive into pg-boss](https://logsnag.com/blog/deep-dive-into-background-jobs-with-pg-boss-and-typescript)
