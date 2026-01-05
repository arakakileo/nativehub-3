/**
 * Optimizer Adapters - Factory and Exports
 *
 * Creates source-specific optimizer adapters that wrap traffic sources
 * with constraint handling, normalized metrics, and error handling.
 */

import type { TrafficSource } from '../../../traffic-sources/interface.js'
import type { OptimizerAdapter } from './interface.js'
import { OutbrainOptimizerAdapter } from './outbrain-adapter.js'
import { TaboolaOptimizerAdapter } from './taboola-adapter.js'
import { MGIDOptimizerAdapter } from './mgid-adapter.js'
import { RevcontentOptimizerAdapter } from './revcontent-adapter.js'
import type { OutbrainSource } from '../../../traffic-sources/outbrain/index.js'
import type { TaboolaSource } from '../../../traffic-sources/taboola/index.js'
import type { MgidSource } from '../../../traffic-sources/mgid/index.js'
import type { RevcontentSource } from '../../../traffic-sources/revcontent/index.js'

/**
 * Create an optimizer adapter for a traffic source
 *
 * @param sourceId - The traffic source identifier (outbrain, taboola, mgid, revcontent)
 * @param source - The authenticated traffic source instance
 * @returns OptimizerAdapter for the source
 * @throws Error if sourceId is not supported
 */
export function createOptimizerAdapter(sourceId: string, source: TrafficSource): OptimizerAdapter {
  switch (sourceId) {
    case 'outbrain':
      return new OutbrainOptimizerAdapter(source as OutbrainSource)
    case 'taboola':
      return new TaboolaOptimizerAdapter(source as TaboolaSource)
    case 'mgid':
      return new MGIDOptimizerAdapter(source as MgidSource)
    case 'revcontent':
      return new RevcontentOptimizerAdapter(source as RevcontentSource)
    default:
      throw new Error(`No optimizer adapter for source: ${sourceId}`)
  }
}

/**
 * Check if a source has optimizer adapter support
 */
export function hasOptimizerSupport(sourceId: string): boolean {
  return ['outbrain', 'taboola', 'mgid', 'revcontent'].includes(sourceId)
}

/**
 * Get all supported source IDs for optimization
 */
export function getSupportedSourceIds(): string[] {
  return ['outbrain', 'taboola', 'mgid', 'revcontent']
}

// Re-export types and interfaces
export * from './interface.js'

// Re-export adapter classes for direct instantiation if needed
export { OutbrainOptimizerAdapter } from './outbrain-adapter.js'
export { TaboolaOptimizerAdapter } from './taboola-adapter.js'
export { MGIDOptimizerAdapter } from './mgid-adapter.js'
export { RevcontentOptimizerAdapter } from './revcontent-adapter.js'
