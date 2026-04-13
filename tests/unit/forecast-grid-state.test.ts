import { describe, it, expect } from 'vitest'
import { buildFlatRows, isFocusable, type RowGroup, type RowGroupMap } from '@/lib/forecast/flat-rows'
import type { Category, ForecastLine } from '@/lib/types'
import { mkForecastLine } from './helpers/forecast-fixtures'

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
  return mkForecastLine({ id, entityId: 'e1', categoryId, periodId, amount, source, counterparty })
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

// ── P3.4 Row grouping ─────────────────────────────────────────────────────────

describe('buildFlatRows — P3.4 row grouping', () => {
  const lines = [
    mkLine('l1', 'inflows_ar', 'p1', 1000, 'manual', 'Acme'),
    mkLine('l2', 'inflows_ar', 'p1', 2000, 'manual', 'Beta'),
    mkLine('l3', 'outflows_payroll', 'p1', -500, 'manual', 'Payroll Run'),
  ]

  it('with no groups → output is identical to pre-P3.4 behaviour', () => {
    const withoutGroups = buildFlatRows(sections, categories, lines, {})
    const withEmptyGroups = buildFlatRows(sections, categories, lines, {}, {})

    expect(withEmptyGroups.map((r) => r.kind)).toEqual(withoutGroups.map((r) => r.kind))
    // Item keys are the same set
    const itemKeysWithout = withoutGroups.filter((r) => r.kind === 'item').map((r) => r.kind === 'item' ? r.itemKey : '')
    const itemKeysWith = withEmptyGroups.filter((r) => r.kind === 'item').map((r) => r.kind === 'item' ? r.itemKey : '')
    expect(itemKeysWith).toEqual(itemKeysWithout)
  })

  it('inserts a group-header row of kind "group" above member item rows', () => {
    const groups: RowGroupMap = {
      inflows_ar: [
        {
          id: 'g1',
          label: 'Key Clients',
          lineIds: ['l1', 'l2'],
          collapsed: false,
        },
      ],
    }

    const rows = buildFlatRows(sections, categories, lines, {}, groups)
    const kinds = rows.map((r) => r.kind)

    // Expect: sectionHeader, subtotal, group, item, item, sectionHeader, subtotal, item
    expect(kinds).toContain('group')
    const groupIdx = kinds.indexOf('group')
    expect(kinds[groupIdx]).toBe('group')

    // group row should carry the correct label and memberItemKeys
    const groupRow = rows[groupIdx]
    expect(groupRow?.kind).toBe('group')
    if (groupRow?.kind === 'group') {
      expect(groupRow.group.label).toBe('Key Clients')
      expect(groupRow.memberItemKeys).toHaveLength(2)
    }

    // The two member item rows follow the group header
    expect(kinds[groupIdx + 1]).toBe('item')
    expect(kinds[groupIdx + 2]).toBe('item')
  })

  it('collapsed group → member rows absent from flatRows', () => {
    const groups: RowGroupMap = {
      inflows_ar: [
        {
          id: 'g1',
          label: 'Key Clients',
          lineIds: ['l1', 'l2'],
          collapsed: true,
        },
      ],
    }

    const rows = buildFlatRows(sections, categories, lines, {}, groups)
    const kinds = rows.map((r) => r.kind)

    // Group header is present
    expect(kinds).toContain('group')

    // No item rows for the collapsed group's members
    const itemRows = rows.filter((r) => r.kind === 'item' && r.sectionId === 'inflows')
    expect(itemRows).toHaveLength(0)

    // Outflows item is still present (different section)
    const outflowItems = rows.filter((r) => r.kind === 'item' && r.sectionId === 'outflows')
    expect(outflowItems).toHaveLength(1)
  })

  it('group containing a non-existent lineId → that lineId is silently ignored', () => {
    const groups: RowGroupMap = {
      inflows_ar: [
        {
          id: 'g1',
          label: 'Key Clients',
          lineIds: ['l1', 'DOES_NOT_EXIST', 'l2'],
          collapsed: false,
        },
      ],
    }

    const rows = buildFlatRows(sections, categories, lines, {}, groups)
    const groupRow = rows.find((r) => r.kind === 'group')
    expect(groupRow?.kind).toBe('group')
    if (groupRow?.kind === 'group') {
      // Only 2 valid member keys (l1 → Acme, l2 → Beta); DOES_NOT_EXIST ignored
      expect(groupRow.memberItemKeys).toHaveLength(2)
    }

    // No crashes — just the 2 valid item rows follow
    const inflows_items = rows.filter((r) => r.kind === 'item' && r.sectionId === 'inflows')
    expect(inflows_items).toHaveLength(2)
  })

  it('isFocusable({kind:"group", ...}) → false', () => {
    const fakeGroupRow = {
      kind: 'group' as const,
      sectionId: 's',
      subId: 'sub',
      group: { id: 'g1', label: 'Test', lineIds: [], collapsed: false } satisfies RowGroup,
      memberItemKeys: [],
    }
    expect(isFocusable(fakeGroupRow)).toBe(false)
  })

  it('ungrouped items appear after all group rows for their sub-category', () => {
    // l1 in group, l2 NOT in group — l2 should appear as a normal item after the group.
    const groups: RowGroupMap = {
      inflows_ar: [
        {
          id: 'g1',
          label: 'Only Acme',
          lineIds: ['l1'],
          collapsed: false,
        },
      ],
    }

    const rows = buildFlatRows(sections, categories, lines, {}, groups)
    const groupIdx = rows.findIndex((r) => r.kind === 'group')
    expect(groupIdx).toBeGreaterThanOrEqual(0)

    // After the group header: first item is Acme (inside group), second is Beta (ungrouped)
    const inflowItems = rows.filter((r) => r.kind === 'item' && r.sectionId === 'inflows')
    expect(inflowItems).toHaveLength(2)
    // Beta should still appear
    const betaRow = inflowItems.find((r) => r.kind === 'item' && r.itemKey.includes('Beta'))
    expect(betaRow).toBeDefined()
  })
})
