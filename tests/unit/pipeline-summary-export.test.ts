import { describe, it, expect } from 'vitest'
import {
  buildSummaryCsv,
  escapeCsvField,
} from '@/lib/pipeline/export-summary'
import type { BUSummaryRow } from '@/lib/pipeline/types'
import { buildFlatSummaryRows, METRIC_ROWS } from '@/lib/pipeline/summary-flat-rows'

const months = ['2026-07-01', '2026-08-01', '2026-09-01']

function mkRow(overrides: Partial<BUSummaryRow> & { entityId: string; entityName: string }): BUSummaryRow {
  return {
    confirmedAndAwaiting: [100, 200, 300],
    upcomingAndSpeculative: [10, 20, 30],
    totalForecast: [110, 220, 330],
    target: [100, 200, 300],
    variance: [10, 20, 30],
    pnlForecast: [110, 220, 330],
    ...overrides,
  }
}

describe('buildSummaryCsv — all scope', () => {
  it('emits header + per-entity block with 6 metric rows', () => {
    const rows: BUSummaryRow[] = [mkRow({ entityId: 'e1', entityName: 'Alpha' })]
    const csv = buildSummaryCsv({ rows, months, scope: 'all' })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Entity / Metric,JUL,AUG,SEP,Total')
    expect(lines[1]).toBe('Alpha,,,,')
    // 6 metric rows after entity header
    expect(lines.length).toBe(1 + 1 + 6)
    expect(lines[2]).toBe('Confirmed + Awaiting,100,200,300,600')
    expect(lines[4]).toBe('Total Forecast,110,220,330,660')
  })

  it('emits GROUP TOTAL block when rows.length > 1', () => {
    const rows: BUSummaryRow[] = [
      mkRow({ entityId: 'e1', entityName: 'Alpha' }),
      mkRow({ entityId: 'e2', entityName: 'Beta' }),
    ]
    const csv = buildSummaryCsv({ rows, months, scope: 'all' })
    expect(csv).toContain('GROUP TOTAL,,,,')
    // sum: Confirmed+Awaiting = 200/400/600
    expect(csv).toContain('Confirmed + Awaiting,200,400,600,1200')
  })

  it('omits GROUP TOTAL when single entity', () => {
    const rows: BUSummaryRow[] = [mkRow({ entityId: 'e1', entityName: 'Alpha' })]
    const csv = buildSummaryCsv({ rows, months, scope: 'all' })
    expect(csv).not.toContain('GROUP TOTAL')
  })

  it('empty rows → header only', () => {
    const csv = buildSummaryCsv({ rows: [], months, scope: 'all' })
    expect(csv).toBe('\uFEFFEntity / Metric,JUL,AUG,SEP,Total')
  })
})

describe('buildSummaryCsv — view scope', () => {
  it('skips entities collapsed in the collapsed map', () => {
    const rows: BUSummaryRow[] = [
      mkRow({ entityId: 'e1', entityName: 'Alpha' }),
      mkRow({ entityId: 'e2', entityName: 'Beta' }),
    ]
    const csv = buildSummaryCsv({
      rows,
      months,
      scope: 'view',
      collapsed: { e1: true },
    })
    expect(csv).not.toContain('Alpha,,,,')
    expect(csv).toContain('Beta,,,,')
    // GROUP TOTAL still emits when original rows.length > 1
    expect(csv).toContain('GROUP TOTAL')
  })

  it('includes non-collapsed entities', () => {
    const rows: BUSummaryRow[] = [
      mkRow({ entityId: 'e1', entityName: 'Alpha' }),
    ]
    const csv = buildSummaryCsv({
      rows,
      months,
      scope: 'view',
      collapsed: { e1: false },
    })
    expect(csv).toContain('Alpha,,,,')
  })
})

describe('buildSummaryCsv — selection scope', () => {
  it('emits flat entity/metric/month/value rows', () => {
    const rows: BUSummaryRow[] = [mkRow({ entityId: 'e1', entityName: 'Alpha' })]
    const flatRows = buildFlatSummaryRows(rows, {})
    // Select first metric row (Confirmed + Awaiting), all 3 month columns.
    const csv = buildSummaryCsv({
      flatRows,
      months,
      selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 2 } },
      scope: 'selection',
    })
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Entity,Metric,Month,Value')
    expect(lines[1]).toBe('Alpha,Confirmed + Awaiting,JUL,100')
    expect(lines[2]).toBe('Alpha,Confirmed + Awaiting,AUG,200')
    expect(lines[3]).toBe('Alpha,Confirmed + Awaiting,SEP,300')
  })

  it('emits Total column label correctly', () => {
    const rows: BUSummaryRow[] = [mkRow({ entityId: 'e1', entityName: 'Alpha' })]
    const flatRows = buildFlatSummaryRows(rows, {})
    // col = months.length → Total column
    const csv = buildSummaryCsv({
      flatRows,
      months,
      selection: { anchor: { row: 0, col: 3 }, focus: { row: 0, col: 3 } },
      scope: 'selection',
    })
    const lines = csv.slice(1).split('\r\n')
    expect(lines[1]).toBe('Alpha,Confirmed + Awaiting,Total,600')
  })

  it('includes zero-valued cells (determinism)', () => {
    const rows: BUSummaryRow[] = [
      mkRow({
        entityId: 'e1',
        entityName: 'Alpha',
        confirmedAndAwaiting: [0, 0, 0],
      }),
    ]
    const flatRows = buildFlatSummaryRows(rows, {})
    const csv = buildSummaryCsv({
      flatRows,
      months,
      selection: { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 2 } },
      scope: 'selection',
    })
    const lines = csv.slice(1).split('\r\n')
    expect(lines.length).toBe(1 + 3) // header + 3 month rows all with 0
    expect(lines[1]).toBe('Alpha,Confirmed + Awaiting,JUL,0')
  })
})

describe('RFC-4180 escaping', () => {
  it('quotes entity names containing commas', () => {
    const rows: BUSummaryRow[] = [
      mkRow({ entityId: 'e1', entityName: 'Dark Doris, Nets' }),
    ]
    const csv = buildSummaryCsv({ rows, months, scope: 'all' })
    expect(csv).toContain('"Dark Doris, Nets",,,,')
  })

  it('doubles internal double-quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes fields containing newlines', () => {
    expect(escapeCsvField('a\nb')).toBe('"a\nb"')
  })

  it('leaves plain strings unquoted', () => {
    expect(escapeCsvField('plain')).toBe('plain')
  })
})

describe('BOM + metric order', () => {
  it('emits BOM exactly once at byte 0', () => {
    const rows: BUSummaryRow[] = [mkRow({ entityId: 'e1', entityName: 'Alpha' })]
    const csv = buildSummaryCsv({ rows, months, scope: 'all' })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1).indexOf('\uFEFF')).toBe(-1)
  })

  it('uses METRIC_ROWS order and labels', () => {
    const rows: BUSummaryRow[] = [mkRow({ entityId: 'e1', entityName: 'Alpha' })]
    const csv = buildSummaryCsv({ rows, months, scope: 'all' })
    const lines = csv.slice(1).split('\r\n')
    // lines[1] is entity header, lines[2..7] are 6 metrics
    for (let i = 0; i < METRIC_ROWS.length; i++) {
      expect(lines[2 + i]!.startsWith(METRIC_ROWS[i]!.label + ',')).toBe(true)
    }
  })
})
