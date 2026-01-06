import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { db, pgClient, testDb } from './mocks/db.js'

// Re-export for tests that need direct access
export { db, pgClient, testDb }

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes'
process.env.NODE_ENV = 'test'

// Initialize PGlite before all tests
beforeAll(async () => {
  // Create tables - use TEXT instead of BYTEA for PGlite compatibility
  // (bytea works in production with postgres-js but PGlite has issues)
  await pgClient.exec(`
    CREATE TABLE IF NOT EXISTS source_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      source_id TEXT NOT NULL,
      name TEXT NOT NULL,
      credentials_encrypted TEXT NOT NULL,
      credentials_iv TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMPTZ,
      external_account_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      last_sync_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, source_id, name)
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_account_id UUID REFERENCES source_accounts(id) ON DELETE CASCADE,
      triggered_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      duration_ms INTEGER,
      campaigns_total INTEGER DEFAULT 0,
      campaigns_synced INTEGER DEFAULT 0,
      campaigns_failed INTEGER DEFAULT 0,
      widgets_synced INTEGER DEFAULT 0,
      error TEXT,
      metadata JSONB
    );

    CREATE TABLE IF NOT EXISTS campaign_syncs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_account_id UUID NOT NULL REFERENCES source_accounts(id) ON DELETE CASCADE,
      external_campaign_id TEXT NOT NULL,
      campaign_name TEXT NOT NULL,
      status TEXT NOT NULL,
      enabled BOOLEAN NOT NULL,
      budget NUMERIC,
      bid NUMERIC NOT NULL,
      spend NUMERIC NOT NULL DEFAULT 0,
      impressions BIGINT NOT NULL DEFAULT 0,
      clicks BIGINT NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      ctr NUMERIC NOT NULL DEFAULT 0,
      cpa NUMERIC NOT NULL DEFAULT 0,
      sync_status TEXT DEFAULT 'idle',
      sync_started_at TIMESTAMPTZ,
      sync_error TEXT,
      last_sync_run_id UUID REFERENCES sync_runs(id) ON DELETE SET NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_account_id, external_campaign_id)
    );

    CREATE TABLE IF NOT EXISTS widget_syncs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sync_run_id UUID REFERENCES sync_runs(id) ON DELETE CASCADE,
      campaign_sync_id UUID REFERENCES campaign_syncs(id) ON DELETE CASCADE,
      widget_id TEXT NOT NULL,
      widget_name TEXT,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      spend NUMERIC(12, 4) DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      revenue NUMERIC(12, 4) DEFAULT 0,
      ctr NUMERIC(8, 6),
      cpc NUMERIC(10, 4),
      cpa NUMERIC(10, 4),
      roas NUMERIC(10, 4),
      enabled BOOLEAN DEFAULT true,
      bid_modifier NUMERIC(5, 2),
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS widget_blacklist (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_account_id UUID NOT NULL REFERENCES source_accounts(id) ON DELETE CASCADE,
      external_campaign_id TEXT,
      widget_id TEXT NOT NULL,
      widget_domain TEXT,
      reason TEXT,
      auto_blacklisted BOOLEAN NOT NULL DEFAULT false,
      metrics_at_blacklist JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_account_id, external_campaign_id, widget_id)
    );

    CREATE TABLE IF NOT EXISTS optimizer_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_account_id UUID NOT NULL REFERENCES source_accounts(id) ON DELETE CASCADE,
      external_campaign_id TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      target_cpa NUMERIC NOT NULL,
      bid_strategy TEXT NOT NULL DEFAULT 'target_cpa',
      bid_strategy_config JSONB NOT NULL DEFAULT '{}',
      custom_thresholds JSONB,
      last_run_at TIMESTAMPTZ,
      last_run_status TEXT,
      last_run_summary JSONB,
      last_run_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_account_id, external_campaign_id)
    );

    CREATE TABLE IF NOT EXISTS optimizer_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      optimizer_campaign_id UUID NOT NULL REFERENCES optimizer_campaigns(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      priority INTEGER NOT NULL DEFAULT 10,
      rule_type TEXT NOT NULL,
      template_id TEXT,
      condition JSONB,
      action JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS optimizer_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      optimizer_campaign_id UUID NOT NULL REFERENCES optimizer_campaigns(id) ON DELETE CASCADE,
      rule_id UUID REFERENCES optimizer_rules(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_name TEXT,
      previous_value NUMERIC,
      new_value NUMERIC,
      reason TEXT NOT NULL,
      metrics JSONB NOT NULL,
      confidence_score NUMERIC,
      executed BOOLEAN NOT NULL DEFAULT false,
      executed_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      source_account_id UUID REFERENCES source_accounts(id) ON DELETE CASCADE,
      optimizer_campaign_id UUID REFERENCES optimizer_campaigns(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      data JSONB,
      acknowledged BOOLEAN NOT NULL DEFAULT false,
      acknowledged_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  console.log('PGlite test database initialized')
})

// Clean tables between tests
beforeEach(async () => {
  // Clear all tables in reverse dependency order
  await pgClient.exec(`
    DELETE FROM alerts;
    DELETE FROM optimizer_actions;
    DELETE FROM optimizer_rules;
    DELETE FROM optimizer_campaigns;
    DELETE FROM widget_blacklist;
    DELETE FROM widget_syncs;
    DELETE FROM campaign_syncs;
    DELETE FROM sync_runs;
    DELETE FROM source_accounts;
  `)
})

afterEach(() => {
  vi.clearAllMocks()
})

afterAll(async () => {
  await pgClient.close()
  console.log('PGlite test database closed')
})
