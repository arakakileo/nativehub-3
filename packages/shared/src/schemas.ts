import { z } from 'zod'

// Traffic source schema
export const TrafficSourceIdSchema = z.enum(['revcontent', 'taboola', 'outbrain', 'mgid'])

// Source account schemas
export const CreateSourceAccountSchema = z.object({
  sourceId: TrafficSourceIdSchema,
  name: z.string().min(1).max(100),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  accountId: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
})

export type CreateSourceAccountDTO = z.infer<typeof CreateSourceAccountSchema>

// Campaign list params
export const CampaignListParamsSchema = z.object({
  sourceAccountId: z.string().uuid().optional(),
  status: z.enum(['active', 'paused', 'deleted', 'pending']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
})

export type CampaignListParams = z.infer<typeof CampaignListParamsSchema>

// Optimizer campaign schemas
export const UpdateOptimizerCampaignSchema = z.object({
  enabled: z.boolean().optional(),
  targetCpa: z.number().positive().optional(),
  bidStrategy: z.enum(['target_cpa', 'maximize_conversions', 'manual']).optional(),
  bidStrategyConfig: z.record(z.unknown()).optional(),
  customThresholds: z.record(z.number()).optional(),
})

export type UpdateOptimizerCampaignDTO = z.infer<typeof UpdateOptimizerCampaignSchema>

// Rule condition schema
export const RuleConditionSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.object({
      metric: z.string(),
      operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
      value: z.number(),
      timeframe: z.enum(['1d', '3d', '7d', '14d', '30d']).optional(),
    }),
    z.object({
      and: z.array(RuleConditionSchema),
    }),
    z.object({
      or: z.array(RuleConditionSchema),
    }),
  ])
)

// Rule action schema
export const RuleActionSchema = z.object({
  type: z.enum(['blacklist', 'whitelist', 'bid_increase', 'bid_decrease', 'pause', 'enable']),
  value: z.number().optional(),
})

// Create rule schema
export const CreateRuleSchema = z.object({
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(100).default(10),
  ruleType: z.enum(['template', 'custom']),
  templateId: z.string().optional(),
  condition: RuleConditionSchema.optional(),
  action: RuleActionSchema,
})

export type CreateRuleDTO = z.infer<typeof CreateRuleSchema>

// Widget blacklist schema
export const AddBlacklistSchema = z.object({
  sourceAccountId: z.string().uuid(),
  campaignId: z.string().optional(),
  widgetId: z.string().min(1),
  widgetDomain: z.string().optional(),
  reason: z.string().optional(),
})

export type AddBlacklistDTO = z.infer<typeof AddBlacklistSchema>
