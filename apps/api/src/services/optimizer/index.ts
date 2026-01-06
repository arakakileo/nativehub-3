export { optimizerService } from './optimizer.service.js'
export { RuleEngine, type WidgetData, type GeneratedAction } from './rule-engine.js'
export { ActionExecutor, type ExecutionResult } from './action-executor.js'
export { RULE_TEMPLATES, getRuleTemplate, getRuleTemplatesByCategory, type RuleTemplate } from './rule-templates.js'

// Optimizer Adapters - Source-specific wrappers with constraints
export {
  createOptimizerAdapter,
  hasOptimizerSupport,
  getSupportedSourceIds,
  OutbrainOptimizerAdapter,
  TaboolaOptimizerAdapter,
  MGIDOptimizerAdapter,
  RevcontentOptimizerAdapter,
  type OptimizerAdapter,
  type PlacementMetrics,
  type BlockResult,
  type BidResult,
  type SourceConstraints,
} from './adapters/index.js'

// Source-Aware Rule Engine - Phase 2 additions
export {
  SourceAwareRuleEngine,
  sourceAwareRuleEngine,
  type RuleEngineContext,
  type SourceAwareAction,
} from './source-aware-rule-engine.js'

// Source-Specific Rule Templates
export {
  getTemplatesForSource,
  getSourceTemplate,
  getSourceTemplatesByCategory,
  applyTargetCpaToSourceCondition,
  OUTBRAIN_TEMPLATES,
  TABOOLA_TEMPLATES,
  MGID_TEMPLATES,
  REVCONTENT_TEMPLATES,
  UNIVERSAL_TEMPLATES,
  ALL_SOURCE_TEMPLATES,
  type SourceRuleTemplate,
} from './source-rule-templates.js'

// Source-Aware Action Executor - Phase 3 additions
export {
  SourceAwareActionExecutor,
  categorizeError,
  isRetryableError,
  type ActionErrorType,
  type ActionExecutionResult,
  type BatchExecutionOptions,
  type BatchExecutionResult,
} from './source-aware-action-executor.js'

// Phase 4: Advanced Features
export {
  BidRecommendationsService,
  bidRecommendationsService,
  type BidRecommendation,
  type PlacementPerformance,
} from './bid-recommendations.service.js'

export {
  AnomalyDetectionService,
  anomalyDetectionService,
  type Anomaly,
  type AnomalyType,
  type AnomalySeverity,
} from './anomaly-detection.service.js'

export {
  ABTestingService,
  abTestingService,
  type Experiment,
  type ExperimentVariant,
  type ExperimentResult,
  type ExperimentStatus,
} from './ab-testing.service.js'

export {
  RuleBuilderService,
  ruleBuilderService,
  type CustomRule,
  type RuleCondition,
  type RuleAction,
  type RuleEvaluationResult,
  type RuleValidationResult,
} from './rule-builder.service.js'
