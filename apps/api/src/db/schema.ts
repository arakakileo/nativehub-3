import {
  pgTable,
  uuid,
  text,
  boolean,
  numeric,
  bigint,
  timestamp,
  jsonb,
  customType,
  unique,
  index,
  integer,
} from 'drizzle-orm/pg-core'

// Custom bytea type for binary data (encrypted credentials)
const bytea = customType<{ data: Buffer; notNull: true; default: false }>({
  dataType() {
    return 'bytea'
  },
  toDriver(value: Buffer): string {
    return `\\x${value.toString('hex')}`
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value
    if (typeof value === 'string') {
      // Handle hex format from Postgres
      const hex = value.startsWith('\\x') ? value.slice(2) : value
      return Buffer.from(hex, 'hex')
    }
    throw new Error(`Invalid bytea value: ${typeof value}`)
  },
})

// Source Accounts - Store traffic source credentials
export const sourceAccounts = pgTable('source_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  sourceId: text('source_id').notNull(), // revcontent, taboola, outbrain, mgid
  name: text('name').notNull(),

  // Encrypted credentials (AES-256-GCM)
  credentialsEncrypted: bytea('credentials_encrypted').notNull(),
  credentialsIv: bytea('credentials_iv').notNull(),

  // Token state
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),

  // Metadata
  externalAccountId: text('external_account_id'),
  status: text('status').notNull().default('pending'), // pending, connected, error, revoked
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_source_accounts_user').on(table.userId),
  sourceIdx: index('idx_source_accounts_source').on(table.sourceId),
  statusIdx: index('idx_source_accounts_status').on(table.status),
  uniqueUserSourceName: unique().on(table.userId, table.sourceId, table.name),
}))

// Campaign Syncs - Performance history snapshots
export const campaignSyncs = pgTable('campaign_syncs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceAccountId: uuid('source_account_id').notNull().references(() => sourceAccounts.id, { onDelete: 'cascade' }),

  externalCampaignId: text('external_campaign_id').notNull(),
  campaignName: text('campaign_name').notNull(),

  // Status
  status: text('status').notNull(),
  enabled: boolean('enabled').notNull(),
  budget: numeric('budget'),
  bid: numeric('bid').notNull(),

  // Metrics
  spend: numeric('spend').notNull().default('0'),
  impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
  clicks: bigint('clicks', { mode: 'number' }).notNull().default(0),
  conversions: integer('conversions').notNull().default(0),
  ctr: numeric('ctr').notNull().default('0'),
  cpa: numeric('cpa').notNull().default('0'),

  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  accountDateIdx: index('idx_campaign_syncs_account_date').on(table.sourceAccountId, table.syncedAt),
  campaignIdx: index('idx_campaign_syncs_campaign').on(table.externalCampaignId, table.syncedAt),
}))

// Widget Blacklist
export const widgetBlacklist = pgTable('widget_blacklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceAccountId: uuid('source_account_id').notNull().references(() => sourceAccounts.id, { onDelete: 'cascade' }),

  externalCampaignId: text('external_campaign_id'), // NULL = account-wide
  widgetId: text('widget_id').notNull(),
  widgetDomain: text('widget_domain'),

  reason: text('reason'),
  autoBlacklisted: boolean('auto_blacklisted').notNull().default(false),
  metricsAtBlacklist: jsonb('metrics_at_blacklist'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  accountIdx: index('idx_widget_blacklist_account').on(table.sourceAccountId),
  campaignIdx: index('idx_widget_blacklist_campaign').on(table.sourceAccountId, table.externalCampaignId),
  uniqueWidget: unique().on(table.sourceAccountId, table.externalCampaignId, table.widgetId),
}))

// Optimizer Campaigns
export const optimizerCampaigns = pgTable('optimizer_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceAccountId: uuid('source_account_id').notNull().references(() => sourceAccounts.id, { onDelete: 'cascade' }),
  externalCampaignId: text('external_campaign_id').notNull(),

  enabled: boolean('enabled').notNull().default(true),
  targetCpa: numeric('target_cpa').notNull(),

  bidStrategy: text('bid_strategy').notNull().default('target_cpa'), // target_cpa, maximize_conversions, manual
  bidStrategyConfig: jsonb('bid_strategy_config').notNull().default({}),

  customThresholds: jsonb('custom_thresholds'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueCampaign: unique().on(table.sourceAccountId, table.externalCampaignId),
}))

// Optimizer Rules
export const optimizerRules = pgTable('optimizer_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  optimizerCampaignId: uuid('optimizer_campaign_id').notNull().references(() => optimizerCampaigns.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  priority: integer('priority').notNull().default(10),

  ruleType: text('rule_type').notNull(), // template, custom
  templateId: text('template_id'),

  condition: jsonb('condition'), // { metric, operator, value, timeframe }
  action: jsonb('action').notNull(), // { type, value }

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Optimizer Actions (History)
export const optimizerActions = pgTable('optimizer_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  optimizerCampaignId: uuid('optimizer_campaign_id').notNull().references(() => optimizerCampaigns.id, { onDelete: 'cascade' }),
  ruleId: uuid('rule_id').references(() => optimizerRules.id, { onDelete: 'set null' }),

  actionType: text('action_type').notNull(), // blacklist, bid_increase, bid_decrease, pause
  targetType: text('target_type').notNull(), // widget, campaign, content
  targetId: text('target_id').notNull(),
  targetName: text('target_name'),

  previousValue: numeric('previous_value'),
  newValue: numeric('new_value'),
  reason: text('reason').notNull(),

  metrics: jsonb('metrics').notNull(), // { spend, conversions, cpa, etc. }
  confidenceScore: numeric('confidence_score'),

  executed: boolean('executed').notNull().default(false),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  error: text('error'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  campaignIdx: index('idx_optimizer_actions_campaign').on(table.optimizerCampaignId, table.createdAt),
}))

// Alerts
export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  sourceAccountId: uuid('source_account_id').references(() => sourceAccounts.id, { onDelete: 'cascade' }),
  optimizerCampaignId: uuid('optimizer_campaign_id').references(() => optimizerCampaigns.id, { onDelete: 'cascade' }),

  alertType: text('alert_type').notNull(), // budget_exhaustion, cpa_spike, no_conversions
  severity: text('severity').notNull(), // info, warning, critical

  title: text('title').notNull(),
  message: text('message').notNull(),
  data: jsonb('data'),

  acknowledged: boolean('acknowledged').notNull().default(false),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_alerts_user').on(table.userId, table.createdAt),
  unreadIdx: index('idx_alerts_unread').on(table.userId, table.acknowledged),
}))

// Type exports
export type SourceAccount = typeof sourceAccounts.$inferSelect
export type NewSourceAccount = typeof sourceAccounts.$inferInsert
export type CampaignSync = typeof campaignSyncs.$inferSelect
export type WidgetBlacklistEntry = typeof widgetBlacklist.$inferSelect
export type OptimizerCampaign = typeof optimizerCampaigns.$inferSelect
export type OptimizerRule = typeof optimizerRules.$inferSelect
export type OptimizerAction = typeof optimizerActions.$inferSelect
export type Alert = typeof alerts.$inferSelect
