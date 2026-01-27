/**
 * Source Rule Templates Tests
 *
 * Tests for source-specific rule templates:
 * - Template retrieval by source
 * - Template retrieval by category
 * - Target CPA application to conditions
 */

import { describe, it, expect } from 'vitest'
import {
  getTemplatesForSource,
  getSourceTemplate,
  getSourceTemplatesByCategory,
  applyTargetCpaToSourceCondition,
  OUTBRAIN_TEMPLATES,
  TABOOLA_TEMPLATES,
  MGID_TEMPLATES,
  REVCONTENT_TEMPLATES,
  UNIVERSAL_TEMPLATES,
  HIGH_TICKET_TEMPLATES,
  ALL_SOURCE_TEMPLATES,
} from './source-rule-templates.js'
import type { RuleCondition, CompoundCondition } from '@nativehub/shared'

describe('Source Rule Templates', () => {
  describe('Template Collections', () => {
    it('should have Outbrain templates with publisher terminology', () => {
      expect(OUTBRAIN_TEMPLATES.length).toBeGreaterThan(0)
      OUTBRAIN_TEMPLATES.forEach((t) => {
        expect(t.applicableSources).toContain('outbrain')
        expect(t.id).toMatch(/^outbrain_/)
      })
    })

    it('should have Taboola templates with site terminology', () => {
      expect(TABOOLA_TEMPLATES.length).toBeGreaterThan(0)
      TABOOLA_TEMPLATES.forEach((t) => {
        expect(t.applicableSources).toContain('taboola')
        expect(t.id).toMatch(/^taboola_/)
      })
    })

    it('should have MGID templates without bid adjustment', () => {
      expect(MGID_TEMPLATES.length).toBeGreaterThan(0)
      MGID_TEMPLATES.forEach((t) => {
        expect(t.applicableSources).toContain('mgid')
        expect(t.id).toMatch(/^mgid_/)
        // MGID shouldn't have bid templates (doesn't support widget-level bids)
        expect(t.category).not.toBe('bid')
      })
    })

    it('should have Revcontent templates', () => {
      expect(REVCONTENT_TEMPLATES.length).toBeGreaterThan(0)
      REVCONTENT_TEMPLATES.forEach((t) => {
        expect(t.applicableSources).toContain('revcontent')
        expect(t.id).toMatch(/^revcontent_/)
      })
    })

    it('should have universal templates for all sources', () => {
      expect(UNIVERSAL_TEMPLATES.length).toBeGreaterThan(0)
      UNIVERSAL_TEMPLATES.forEach((t) => {
        expect(t.applicableSources).toContain('outbrain')
        expect(t.applicableSources).toContain('taboola')
        expect(t.applicableSources).toContain('mgid')
        expect(t.applicableSources).toContain('revcontent')
      })
    })

    it('should have all templates in ALL_SOURCE_TEMPLATES', () => {
      const expectedCount =
        OUTBRAIN_TEMPLATES.length +
        TABOOLA_TEMPLATES.length +
        MGID_TEMPLATES.length +
        REVCONTENT_TEMPLATES.length +
        UNIVERSAL_TEMPLATES.length +
        HIGH_TICKET_TEMPLATES.length

      expect(ALL_SOURCE_TEMPLATES.length).toBe(expectedCount)
    })

    it('should have high-ticket templates for aggressive optimization', () => {
      expect(HIGH_TICKET_TEMPLATES.length).toBeGreaterThan(0)
      HIGH_TICKET_TEMPLATES.forEach((t) => {
        expect(t.id).toMatch(/^universal_/)
        // High-ticket templates apply to all sources
        expect(t.applicableSources).toContain('outbrain')
        expect(t.applicableSources).toContain('taboola')
      })
    })
  })

  describe('getTemplatesForSource', () => {
    it('should return Outbrain templates including universal', () => {
      const templates = getTemplatesForSource('outbrain')

      expect(templates.length).toBeGreaterThan(OUTBRAIN_TEMPLATES.length)

      // Should include Outbrain-specific
      expect(templates.some((t) => t.id.startsWith('outbrain_'))).toBe(true)

      // Should include universal
      expect(templates.some((t) => t.id.startsWith('universal_'))).toBe(true)

      // Should NOT include other sources
      expect(templates.some((t) => t.id.startsWith('taboola_'))).toBe(false)
      expect(templates.some((t) => t.id.startsWith('mgid_'))).toBe(false)
    })

    it('should return Taboola templates including universal', () => {
      const templates = getTemplatesForSource('taboola')

      expect(templates.some((t) => t.id.startsWith('taboola_'))).toBe(true)
      expect(templates.some((t) => t.id.startsWith('universal_'))).toBe(true)
      expect(templates.some((t) => t.id.startsWith('outbrain_'))).toBe(false)
    })

    it('should return MGID templates including universal', () => {
      const templates = getTemplatesForSource('mgid')

      expect(templates.some((t) => t.id.startsWith('mgid_'))).toBe(true)
      expect(templates.some((t) => t.id.startsWith('universal_'))).toBe(true)
    })

    it('should return Revcontent templates including universal', () => {
      const templates = getTemplatesForSource('revcontent')

      expect(templates.some((t) => t.id.startsWith('revcontent_'))).toBe(true)
      expect(templates.some((t) => t.id.startsWith('universal_'))).toBe(true)
    })

    it('should return empty array for unknown source', () => {
      const templates = getTemplatesForSource('unknown')

      // Only universal templates apply to all
      expect(templates).toHaveLength(0)
    })
  })

  describe('getSourceTemplate', () => {
    it('should return template by ID', () => {
      const template = getSourceTemplate('outbrain_block_no_conv_spending')

      expect(template).toBeDefined()
      expect(template?.id).toBe('outbrain_block_no_conv_spending')
      expect(template?.applicableSources).toContain('outbrain')
    })

    it('should return undefined for unknown ID', () => {
      const template = getSourceTemplate('nonexistent_template')

      expect(template).toBeUndefined()
    })
  })

  describe('getSourceTemplatesByCategory', () => {
    it('should return blacklist templates for Outbrain', () => {
      const templates = getSourceTemplatesByCategory('outbrain', 'blacklist')

      expect(templates.length).toBeGreaterThan(0)
      templates.forEach((t) => {
        expect(t.category).toBe('blacklist')
        expect(t.applicableSources.includes('outbrain') || t.applicableSources.includes('all')).toBe(true)
      })
    })

    it('should return bid templates for Outbrain', () => {
      const templates = getSourceTemplatesByCategory('outbrain', 'bid')

      expect(templates.length).toBeGreaterThan(0)
      templates.forEach((t) => {
        expect(t.category).toBe('bid')
      })
    })

    it('should return no bid templates for MGID', () => {
      const templates = getSourceTemplatesByCategory('mgid', 'bid')

      // MGID doesn't support widget-level bids
      expect(templates).toHaveLength(0)
    })

    it('should return pause templates from universal', () => {
      const templates = getSourceTemplatesByCategory('outbrain', 'pause')

      expect(templates.length).toBeGreaterThan(0)
      expect(templates.some((t) => t.id.startsWith('universal_'))).toBe(true)
    })
  })

  describe('applyTargetCpaToSourceCondition', () => {
    it('should replace CPA threshold with targetCpa * multiplier', () => {
      const template = getSourceTemplate('outbrain_block_high_cpa')!
      const targetCpa = 30

      const result = applyTargetCpaToSourceCondition(template.condition, targetCpa, template)

      // Find the CPA condition
      const andConditions = (result as CompoundCondition).and!
      const cpaCondition = andConditions.find((c) => (c as RuleCondition).metric === 'cpa') as RuleCondition

      expect(cpaCondition).toBeDefined()
      expect(cpaCondition.value).toBe(60) // 30 * 2
    })

    it('should replace spend threshold for pause template', () => {
      const template = getSourceTemplate('universal_pause_bleeding')!
      const targetCpa = 50

      const result = applyTargetCpaToSourceCondition(template.condition, targetCpa, template)

      // Find the spend condition
      const andConditions = (result as CompoundCondition).and!
      const spendCondition = andConditions.find((c) => (c as RuleCondition).metric === 'spend') as RuleCondition

      expect(spendCondition).toBeDefined()
      expect(spendCondition.value).toBe(150) // 50 * 3
    })

    it('should not modify original condition', () => {
      const template = getSourceTemplate('outbrain_block_high_cpa')!
      const originalCondition = JSON.parse(JSON.stringify(template.condition))
      const targetCpa = 30

      applyTargetCpaToSourceCondition(template.condition, targetCpa, template)

      // Original should be unchanged
      expect(template.condition).toEqual(originalCondition)
    })

    it('should handle templates with good CPA threshold (below target)', () => {
      const template = getSourceTemplate('outbrain_raise_bid_good_performer')!
      const targetCpa = 50

      const result = applyTargetCpaToSourceCondition(template.condition, targetCpa, template)

      const andConditions = (result as CompoundCondition).and!
      const cpaCondition = andConditions.find((c) => (c as RuleCondition).metric === 'cpa') as RuleCondition

      expect(cpaCondition.value).toBe(40) // 50 * 0.8
    })
  })

  describe('Template Structure Validation', () => {
    it('all templates should have required fields', () => {
      ALL_SOURCE_TEMPLATES.forEach((t) => {
        expect(t.id).toBeTruthy()
        expect(t.name).toBeTruthy()
        expect(t.description).toBeTruthy()
        expect(t.applicableSources.length).toBeGreaterThan(0)
        expect(['blacklist', 'bid', 'pause']).toContain(t.category)
        expect(t.condition).toBeTruthy()
        expect(t.action).toBeTruthy()
        expect(typeof t.priority).toBe('number')
      })
    })

    it('blacklist templates should have blacklist action', () => {
      ALL_SOURCE_TEMPLATES.filter((t) => t.category === 'blacklist').forEach((t) => {
        expect(t.action.type).toBe('blacklist')
      })
    })

    it('bid templates should have bid_increase or bid_decrease action', () => {
      ALL_SOURCE_TEMPLATES.filter((t) => t.category === 'bid').forEach((t) => {
        expect(['bid_increase', 'bid_decrease']).toContain(t.action.type)
        expect(t.action.value).toBeDefined()
      })
    })

    it('pause templates should have pause action', () => {
      ALL_SOURCE_TEMPLATES.filter((t) => t.category === 'pause').forEach((t) => {
        expect(t.action.type).toBe('pause')
      })
    })

    it('templates should have unique IDs', () => {
      const ids = ALL_SOURCE_TEMPLATES.map((t) => t.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })
  })
})
