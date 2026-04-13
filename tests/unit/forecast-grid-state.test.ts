import { describe, it, expect } from 'vitest'
import { buildFlatRows, isFocusable } from '@/lib/forecast/flat-rows'
import type { Category, ForecastLine } from '@/lib/types'

const categories: Category[] = [
  { id: 'inflows', parentId: null, name: 'Inflows', code: 'inflows', sectionNumber: '2', sortOrder: 200, flowDirection: 'inflow' },
  { id: 'inflows_ar', parentId: 'inflows', name: 'AR', code: 'inflows_ar', sectionNumber: '2a', sortOrder: 210, flowDirection: 'inflow' },
  { id: 'outflows', parentId: null, name: 'Outflows', code: 'outflows', sectionNumber: '3', sortOrder: 300, flowDirection: 'outflow' },
  { id: 'outflows_payroll', parentId: 'outflows', name: 'Payroll', code: 'outflows_payroll', sectionNumber: '3a', sortOrder: 310, flowDirection: 'outflow' },
]

const sections = categories
  .filter((c) => c.parentId === null && c.flowDirection !== 'computed')
  .sort((a, b) => a.sortOrder - b.sortOrder)

function mkLine(
  id: string,
  categoryId: string,
  periodId: string,
  amount: number,
  source: ForecastLine['source'] = 'manual',
  counterparty: string | null = null,
): ForecastLine {
  return {
    id,
    entityId: 'e1',
    categoryId,
    periodId,
    amount,
    confidence: 100,
    source,
    counterparty,
    notes: null,
    sourceDocumentId: null,
    sourceRuleId: null,
    sourcePipelineProjectId: null,
    lineStatus: 'none',
    formula: null,
  }
}

describe('buildFlatRows', () => {
  it('emits header + subtotal + item rows in section/sub order', () => {
    const lines = [
      mkLine('l1', 'inflows_ar', 'p1', 1000, 'manual', 'Acme'),
      mkLine('l2', 'outflows_payroll', 'p1', -500, 'manual', 'Payroll Run'),
    ]

    const rows = buildFlatRows(sections, categories, lines, {})

    const kinds = rows.map((r) => r.kind)
    expect(kinds).toEqual([
      'sectionHeader',
      'subtotal',
      'item',
      'sectionHeader',
      'subtotal',
      'item',
    ])
  })

  it('marks subtotal editable when at least one non-pipeline line exists', () => {
    const lines = [mkLine('l1', 'inflows_ar', 'p1', 1000, 'manual', 'Acme')]

    const rows = buildFlatRows(sections, categories, lines, {})
    const sub = rows.find((r) => r.kind === 'subtotal' && r.subId === 'inflows_ar')
    expect(sub?.kind).toBe('subtotal')
    if (sub?.kind === 'subtotal') {
      expect(sub.editable).toBe(true)
      expect(sub.subCategoryIds).toContain('inflows_ar')
    }
  })

  it('marks subtotal NOT editable when all lines are pipeline-sourced', () => {
    const lines = [mkLine('l1', 'inflows_ar', 'p1', 1000, 'pipeline', 'Pipeline Deal')]

    const rows = buildFlatRows(sections, categories, lines, {})
    const sub = rows.find((r) => r.kind === 'subtotal' && r.subId === 'inflows_ar')
    if (sub?.kind === 'subtotal') {
      expect(sub.editable).toBe(false)
    }
  })

  it('skips body rows of collapsed sections (only header emitted)', () => {
    const lines = [
      mkLine('l1', 'inflows_ar', 'p1', 1000, 'manual', 'Acme'),
      mkLine('l2', 'outflows_payroll', 'p1', -500, 'manual', 'Payroll'),
    ]

    const rows = buildFlatRows(sections, categories, lines, { inflows: true })

    // inflows collapsed: only header. outflows open: header + subtotal + item.
    expect(rows.map((r) => r.kind)).toEqual([
      'sectionHeader',
      'sectionHeader',
      'subtotal',
      'item',
    ])
  })

  it('isFocusable treats headers as non-navigable, items as navigable unless pipeline, and subtotals as navigable only when editable', () => {
    expect(isFocusable({ kind: 'sectionHeader', sectionId: 's' })).toBe(false)
    expect(
      isFocusable({
        kind: 'subtotal',
        sectionId: 's',
        subId: 'sub',
        subCategoryIds: [],
        editable: true,
      }),
    ).toBe(true)
    expect(
      isFocusable({
        kind: 'subtotal',
        sectionId: 's',
        subId: 'sub',
        subCategoryIds: [],
        editable: false,
      }),
    ).toBe(false)
    expect(
      isFocusable({
        kind: 'item',
        sectionId: 's',
        itemKey: 'k',
        lineIds: [],
        lineByPeriod: new Map(),
        isPipeline: false,
      }),
    ).toBe(true)
    expect(
      isFocusable({
        kind: 'item',
        sectionId: 's',
        itemKey: 'k',
        lineIds: [],
        lineByPeriod: new Map(),
        isPipeline: true,
      }),
    ).toBe(false)
    expect(isFocusable(undefined)).toBe(false)
  })

  it('flags pipeline item rows so they can be excluded from focus navigation', () => {
    const lines = [
      mkLine('l1', 'inflows_ar', 'p1', 1000, 'manual', 'Acme'),
      mkLine('l2', 'inflows_ar', 'p1', 500, 'pipeline', 'Pipeline Deal'),
    ]

    const rows = buildFlatRows(sections, categories, lines, {})
    const items = rows.filter((r) => r.kind === 'item')
    expect(items).toHaveLength(2)
    const acme = items.find((r) => r.kind === 'item' && r.itemKey.includes('Acme'))
    const pipeline = items.find((r) => r.kind === 'item' && r.itemKey.includes('Pipeline Deal'))
    if (acme?.kind === 'item') expect(acme.isPipeline).toBe(false)
    if (pipeline?.kind === 'item') expect(pipeline.isPipeline).toBe(true)
  })

  it('treats a row as non-pipeline when manual AND pipeline lines share the same counterparty', () => {
    // Same category + same counterparty → grouped into one row.
    // If ANY line is manual, the row must stay editable so the user can
    // edit the manual entries. Per-cell save logic skips pipeline cells.
    const lines = [
      mkLine('l1', 'inflows_ar', 'p1', 1000, 'pipeline', 'Mixed Client'),
      mkLine('l2', 'inflows_ar', 'p2', 500, 'manual', 'Mixed Client'),
    ]

    const rows = buildFlatRows(sections, categories, lines, {})
    const mixed = rows.find((r) => r.kind === 'item' && r.itemKey.includes('Mixed Client'))
    expect(mixed?.kind).toBe('item')
    if (mixed?.kind === 'item') {
      expect(mixed.isPipeline).toBe(false)
      expect(isFocusable(mixed)).toBe(true)
    }
  })
})
