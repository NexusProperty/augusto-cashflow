import { describe, it, expect } from 'vitest'
import { buildCsv, escapeCsvField, type ExportArgs } from '@/lib/forecast/export'
import type { FlatRow } from '@/lib/forecast/flat-rows'
import type { Category, ForecastLine, Period, WeekSummary } from '@/lib/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkPeriod(idx: number): Period {
  return { id: `p${idx}`, weekEnding: `2026-01-0${idx + 1}`, isActual: false }
}

function mkCategory(
  id: string,
  name: string,
  opts: Partial<Category> = {},
): Category {
  return {
    id,
    parentId: opts.parentId ?? null,
    name,
    code: id,
    sectionNumber: opts.sectionNumber ?? null,
    sortOrder: opts.sortOrder ?? 0,
    flowDirection: opts.flowDirection ?? 'inflow',
  }
}

function mkLine(
  id: string,
  categoryId: string,
  periodId: string,
  amount: number,
  opts: { counterparty?: string | null; notes?: string | null } = {},
): ForecastLine {
  return {
    id,
    entityId: 'e1',
    categoryId,
    periodId,
    amount,
    confidence: 100,
    source: 'manual',
    counterparty: opts.counterparty ?? null,
    notes: opts.notes ?? null,
    sourceDocumentId: null,
    sourceRuleId: null,
    sourcePipelineProjectId: null,
    lineStatus: 'none',
    formula: null,
  }
}

function mkItemRow(
  rowIdx: number,
  sectionId: string,
  lines: ForecastLine[],
  opts: { counterparty?: string | null; notes?: string | null } = {},
): FlatRow & { kind: 'item' } {
  const lineByPeriod = new Map(lines.map((l) => [l.periodId, l]))
  return {
    kind: 'item',
    sectionId,
    itemKey: `key_${rowIdx}`,
    lineIds: lines.map((l) => l.id),
    lineByPeriod,
    isPipeline: false,
  }
}

function mkSubtotalRow(
  sectionId: string,
  subId: string,
  subCategoryIds: string[],
): FlatRow & { kind: 'subtotal' } {
  return {
    kind: 'subtotal',
    sectionId,
    subId,
    subCategoryIds,
    editable: true,
  }
}

function mkSectionHeaderRow(sectionId: string): FlatRow & { kind: 'sectionHeader' } {
  return { kind: 'sectionHeader', sectionId }
}

// Shared data used across most tests.
const periods: Period[] = [mkPeriod(0), mkPeriod(1), mkPeriod(2)]

const secA = mkCategory('secA', 'Inflows', { flowDirection: 'inflow' })
const subA1 = mkCategory('subA1', 'Operating', { parentId: 'secA' })

const categories: Category[] = [secA, subA1]

// ── Test helpers ──────────────────────────────────────────────────────────────

function baseArgs(overrides: Partial<ExportArgs> = {}): ExportArgs {
  const line0 = mkLine('l1', 'subA1', 'p0', 1000, { counterparty: 'Acme Corp' })
  const line1 = mkLine('l2', 'subA1', 'p1', 2000, { counterparty: 'Acme Corp' })
  const flatRows: FlatRow[] = [
    mkSectionHeaderRow('secA'),
    mkSubtotalRow('secA', 'subA1', ['subA1']),
    mkItemRow(2, 'secA', [line0, line1]),
  ]
  return {
    flatRows,
    periods,
    localLines: [line0, line1],
    categories,
    scope: 'all',
    ...overrides,
  }
}

function parseCsv(csv: string): string[][] {
  // Strip BOM if present.
  const stripped = csv.startsWith('\uFEFF') ? csv.slice(1) : csv
  return stripped.split('\r\n').map((r) => r.split(','))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildCsv — BOM', () => {
  it('1. CSV starts with UTF-8 BOM', () => {
    const csv = buildCsv(baseArgs())
    expect(csv.startsWith('\uFEFF')).toBe(true)
  })
})

describe('buildCsv — scope: all', () => {
  it('2. emits section header, subtotal, and item rows', () => {
    const csv = buildCsv(baseArgs({ scope: 'all' }))
    const rows = parseCsv(csv)
    // Row 0: header
    expect(rows[0]![0]).toBe('Item / Description')
    // Row 1: section header (Inflows)
    expect(rows[1]![0]).toBe('Inflows')
    // Row 2: subtotal (Operating)
    expect(rows[2]![0]).toBe('Operating')
    // Row 3: item (Acme Corp)
    expect(rows[3]![0]).toBe('Acme Corp')
    // Should have at least 4 rows (header + 3 data rows)
    expect(rows.length).toBeGreaterThanOrEqual(4)
  })

  it('2b. subtotal row amounts are computed sums', () => {
    const csv = buildCsv(baseArgs({ scope: 'all' }))
    const rows = parseCsv(csv)
    // Period 0 subtotal: 1000. Period 1 subtotal: 2000. Period 2: 0.
    const subtotalRow = rows[2]!
    expect(Number(subtotalRow[1])).toBe(1000)
    expect(Number(subtotalRow[2])).toBe(2000)
    expect(Number(subtotalRow[3])).toBe(0)
  })

  it('2c. item row amounts are raw line amounts', () => {
    const csv = buildCsv(baseArgs({ scope: 'all' }))
    const rows = parseCsv(csv)
    const itemRow = rows[3]!
    expect(Number(itemRow[1])).toBe(1000)
    expect(Number(itemRow[2])).toBe(2000)
    expect(Number(itemRow[3])).toBe(0)
  })
})

describe('buildCsv — scope: view, hideEmpty', () => {
  it('3a. rows with all-zero amounts are omitted when hideEmpty is true', () => {
    const lineAllZero = mkLine('lz', 'subA1', 'p0', 0, { counterparty: 'Empty Row' })
    const lineNonZero = mkLine('ln', 'subA1', 'p1', 500, { counterparty: 'Real Row' })
    const flatRows: FlatRow[] = [
      mkSectionHeaderRow('secA'),
      mkItemRow(1, 'secA', [lineAllZero]),
      mkItemRow(2, 'secA', [lineNonZero]),
    ]
    const csv = buildCsv({
      flatRows,
      periods,
      localLines: [lineAllZero, lineNonZero],
      categories,
      scope: 'view',
      hideEmpty: true,
    })
    expect(csv).not.toContain('Empty Row')
    expect(csv).toContain('Real Row')
  })

  it('3b. rows with at least one non-zero amount are kept', () => {
    const linePartial = mkLine('lp', 'subA1', 'p2', 999, { counterparty: 'Partial Row' })
    const flatRows: FlatRow[] = [
      mkSectionHeaderRow('secA'),
      mkItemRow(1, 'secA', [linePartial]),
    ]
    const csv = buildCsv({
      flatRows,
      periods,
      localLines: [linePartial],
      categories,
      scope: 'view',
      hideEmpty: true,
    })
    expect(csv).toContain('Partial Row')
  })
})

describe('buildCsv — scope: view, collapsed', () => {
  it('4. body rows under collapsed section are omitted (including section header)', () => {
    const line = mkLine('lx', 'subA1', 'p0', 100, { counterparty: 'Visible Row' })
    const flatRows: FlatRow[] = [
      mkSectionHeaderRow('secA'),
      mkSubtotalRow('secA', 'subA1', ['subA1']),
      mkItemRow(2, 'secA', [line]),
    ]
    const csv = buildCsv({
      flatRows,
      periods,
      localLines: [line],
      categories,
      scope: 'view',
      collapsed: { secA: true },
    })
    // Section header itself is skipped too (design choice: skip entirely when collapsed).
    const rows = parseCsv(csv)
    // Only the header row should remain (the section + its children are all skipped).
    const dataRows = rows.slice(1)
    expect(dataRows.every((r) => r[0] !== 'Inflows')).toBe(true)
    expect(dataRows.every((r) => r[0] !== 'Operating')).toBe(true)
    expect(dataRows.every((r) => r[0] !== 'Visible Row')).toBe(true)
  })
})

describe('buildCsv — scope: view, filterRowSet', () => {
  it('5. only rows at specified indices are emitted', () => {
    const lineA = mkLine('la', 'subA1', 'p0', 100, { counterparty: 'Row A' })
    const lineB = mkLine('lb', 'subA1', 'p1', 200, { counterparty: 'Row B' })
    const lineC = mkLine('lc', 'subA1', 'p2', 300, { counterparty: 'Row C' })
    const flatRows: FlatRow[] = [
      mkSectionHeaderRow('secA'),    // idx 0
      mkItemRow(1, 'secA', [lineA]), // idx 1
      mkItemRow(2, 'secA', [lineB]), // idx 2
      mkItemRow(3, 'secA', [lineC]), // idx 3
    ]
    // Only show rows at flat index 1 and 3 (Row A and Row C).
    const csv = buildCsv({
      flatRows,
      periods,
      localLines: [lineA, lineB, lineC],
      categories,
      scope: 'view',
      filterRowSet: new Set([1, 3]),
    })
    expect(csv).toContain('Row A')
    expect(csv).not.toContain('Row B')
    expect(csv).toContain('Row C')
  })
})

describe('buildCsv — scope: selection', () => {
  it('6. emits only selected rows and only selected columns', () => {
    const l0p0 = mkLine('l0p0', 'subA1', 'p0', 10, { counterparty: 'Alpha' })
    const l0p1 = mkLine('l0p1', 'subA1', 'p1', 20, { counterparty: 'Alpha' })
    const l0p2 = mkLine('l0p2', 'subA1', 'p2', 30, { counterparty: 'Alpha' })
    const l1p0 = mkLine('l1p0', 'subA1', 'p0', 40, { counterparty: 'Beta' })
    const flatRows: FlatRow[] = [
      mkItemRow(0, 'secA', [l0p0, l0p1, l0p2]), // rowIdx 0
      mkItemRow(1, 'secA', [l1p0]),              // rowIdx 1
    ]
    // Select row 0, cols 0 and 2 only.
    const csv = buildCsv({
      flatRows,
      periods,
      localLines: [l0p0, l0p1, l0p2, l1p0],
      categories,
      scope: 'selection',
      selectedCellKeys: new Set(['0:0', '0:2']),
    })
    const rows = parseCsv(csv)
    // Header: label + 2 period columns (p0 and p2 only).
    expect(rows[0]!.length).toBe(3)
    expect(rows[0]![1]).toBe('2026-01-01') // p0
    expect(rows[0]![2]).toBe('2026-01-03') // p2
    // One data row (row 0 = Alpha), no row for Beta.
    expect(rows.length).toBe(2)
    expect(rows[1]![0]).toBe('Alpha')
    expect(Number(rows[1]![1])).toBe(10) // p0
    expect(Number(rows[1]![2])).toBe(30) // p2
  })
})

describe('escapeCsvField — CSV encoding', () => {
  it('7. comma in a field is surrounded with quotes', () => {
    expect(escapeCsvField('Acme, Inc.')).toBe('"Acme, Inc."')
  })

  it('8. embedded double-quote is escaped as two double-quotes', () => {
    expect(escapeCsvField('Jim "Slim" Jones')).toBe('"Jim ""Slim"" Jones"')
  })

  it('9. field with embedded newline is surrounded with quotes', () => {
    const field = 'line one\nline two'
    const escaped = escapeCsvField(field)
    expect(escaped.startsWith('"')).toBe(true)
    expect(escaped.endsWith('"')).toBe(true)
    expect(escaped).toBe('"line one\nline two"')
  })

  it('9b. field with embedded carriage-return+newline is surrounded with quotes', () => {
    const field = 'line one\r\nline two'
    // \r triggers quoting via the \n check.
    const escaped = escapeCsvField(field)
    expect(escaped.startsWith('"')).toBe(true)
  })
})

describe('buildCsv — summary rows', () => {
  it('10. summary rows appear at the end when summaries are provided', () => {
    const summaries: WeekSummary[] = periods.map((p, i) => ({
      periodId: p.id,
      weekEnding: p.weekEnding,
      openingBalance: 0,
      totalInflows: 1000 * (i + 1),
      totalOutflows: 500 * (i + 1),
      netOperating: 500 * (i + 1),
      loansAndFinancing: 0,
      closingBalance: 5000 + 500 * (i + 1),
      availableCash: 3000 + 500 * (i + 1),
      isOverdrawn: false,
    }))

    const csv = buildCsv(baseArgs({ scope: 'all', summaries }))
    expect(csv).toContain('Net Operating Cash Flow')
    expect(csv).toContain('Closing Balance')
    expect(csv).toContain('Available Cash')
    expect(csv).toContain('OD Status')

    // Verify summary values appear in the right order (Net Operating before Closing).
    const noIdx = csv.indexOf('Net Operating Cash Flow')
    const cbIdx = csv.indexOf('Closing Balance')
    const acIdx = csv.indexOf('Available Cash')
    expect(noIdx).toBeLessThan(cbIdx)
    expect(cbIdx).toBeLessThan(acIdx)
  })

  it('10b. overdrawn period shows "Overdrawn" in OD Status', () => {
    const summaries: WeekSummary[] = [
      {
        periodId: 'p0',
        weekEnding: '2026-01-01',
        openingBalance: 0,
        totalInflows: 0,
        totalOutflows: 1000,
        netOperating: -1000,
        loansAndFinancing: 0,
        closingBalance: -500,
        availableCash: -500,
        isOverdrawn: true,
      },
    ]
    const line = mkLine('lx', 'subA1', 'p0', 0)
    const flatRows: FlatRow[] = [mkItemRow(0, 'secA', [line])]
    const csv = buildCsv({
      flatRows,
      periods: [periods[0]!],
      localLines: [line],
      categories,
      scope: 'all',
      summaries,
    })
    expect(csv).toContain('Overdrawn')
  })
})

describe('buildCsv — edge cases', () => {
  it('11. empty selection produces header-only CSV', () => {
    const csv = buildCsv(
      baseArgs({ scope: 'selection', selectedCellKeys: new Set<string>() }),
    )
    const rows = parseCsv(csv)
    // With no selection, no period columns → single header row.
    expect(rows.length).toBe(1)
    expect(rows[0]![0]).toBe('Item / Description')
  })

  it('12. item row falls back to notes when counterparty is null', () => {
    const line = mkLine('ln', 'subA1', 'p0', 100, { counterparty: null, notes: 'My note' })
    const flatRows: FlatRow[] = [mkItemRow(0, 'secA', [line])]
    const csv = buildCsv({
      flatRows,
      periods,
      localLines: [line],
      categories,
      scope: 'all',
    })
    expect(csv).toContain('My note')
  })

  it('13. item row falls back to "Line item" when both counterparty and notes are null', () => {
    const line = mkLine('ln', 'subA1', 'p0', 50)
    const flatRows: FlatRow[] = [mkItemRow(0, 'secA', [line])]
    const csv = buildCsv({
      flatRows,
      periods,
      localLines: [line],
      categories,
      scope: 'all',
    })
    expect(csv).toContain('Line item')
  })
})
