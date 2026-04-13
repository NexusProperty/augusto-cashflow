/**
 * Pure CSV builder for the Augusto Cashflow forecast grid.
 * No React, no DOM, no Supabase — safe for unit tests.
 *
 * The returned string starts with a UTF-8 BOM (\uFEFF) so Excel opens it
 * correctly. Lines are separated by \r\n and fields by commas. Fields that
 * contain commas, double-quotes, or newlines are RFC-4180 quoted (surrounded
 * with " and internal " doubled to "").
 */

import type { Category, ForecastLine, Period, WeekSummary } from '@/lib/types'
import type { FlatRow } from './flat-rows'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExportArgs {
  flatRows: FlatRow[]
  periods: Period[]
  localLines: ForecastLine[]
  categories: Category[]
  summaries?: WeekSummary[]
  scope: 'all' | 'view' | 'selection'
  // For 'view':
  hideEmpty?: boolean
  collapsed?: Record<string, boolean>
  filterRowSet?: Set<number> | null
  // For 'selection':
  selectedCellKeys?: Set<string>
}

// ── CSV encoding ───────────────────────────────────────────────────────────────

/**
 * Escape a single field value per RFC 4180:
 *   - If the value contains a comma, double-quote, or newline → surround with
 *     double-quotes and double any internal double-quotes.
 *   - Otherwise → emit as-is.
 */
export function escapeCsvField(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function row(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(',')
}

// ── Subtotal computation ──────────────────────────────────────────────────────

/**
 * Compute the sum of all lines for a given set of subCategory IDs on a given
 * period. Mirrors the `periodTotals` calculation in SectionBlock.
 */
function computeSubtotal(
  subCategoryIds: string[],
  periodId: string,
  lines: ForecastLine[],
): number {
  const idSet = new Set(subCategoryIds)
  return lines
    .filter((l) => idSet.has(l.categoryId) && l.periodId === periodId)
    .reduce((sum, l) => sum + l.amount, 0)
}

// ── Row-label helpers ─────────────────────────────────────────────────────────

function sectionLabel(sectionId: string, categories: Category[]): string {
  const cat = categories.find((c) => c.id === sectionId)
  return cat?.name ?? sectionId
}

function subLabel(subId: string, categories: Category[]): string {
  const cat = categories.find((c) => c.id === subId)
  if (!cat) return subId
  return cat.sectionNumber ? `${cat.sectionNumber}. ${cat.name}` : cat.name
}

function itemLabel(fr: FlatRow & { kind: 'item' }): string {
  // Use the first line's counterparty/notes to derive the label, mirroring
  // the `buildItemRows` key-label construction.
  const [firstLine] = fr.lineByPeriod.values()
  if (!firstLine) return 'Line item'
  return firstLine.counterparty ?? firstLine.notes ?? 'Line item'
}

// ── Row visibility helpers ────────────────────────────────────────────────────

function isRowAllZeros(
  fr: FlatRow,
  periodIds: string[],
  lines: ForecastLine[],
): boolean {
  if (fr.kind === 'sectionHeader') return false
  if (fr.kind === 'group') return false  // group headers always emit
  if (fr.kind === 'subtotal') {
    return periodIds.every(
      (pid) => computeSubtotal(fr.subCategoryIds, pid, lines) === 0,
    )
  }
  // item
  return periodIds.every((pid) => {
    const line = fr.lineByPeriod.get(pid)
    return !line || line.amount === 0
  })
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildCsv(args: ExportArgs): string {
  const {
    flatRows,
    periods,
    localLines,
    categories,
    summaries,
    scope,
    hideEmpty = false,
    collapsed = {},
    filterRowSet = null,
    selectedCellKeys,
  } = args

  const periodIds = periods.map((p) => p.id)

  // ── Determine which rows + cols to emit ──────────────────────────────────

  let selectedRowIndices: Set<number> | null = null
  let selectedColIndices: Set<number> | null = null

  if (scope === 'selection' && selectedCellKeys) {
    const rowSet = new Set<number>()
    const colSet = new Set<number>()
    for (const key of selectedCellKeys) {
      const [rowStr, colStr] = key.split(':')
      rowSet.add(Number(rowStr))
      colSet.add(Number(colStr))
    }
    selectedRowIndices = rowSet
    selectedColIndices = colSet
  }

  // Build the period columns to emit (ordered by original period index).
  const activePeriods =
    selectedColIndices !== null
      ? periods.filter((_, i) => selectedColIndices!.has(i))
      : periods

  // ── Header row ───────────────────────────────────────────────────────────

  const headerFields: (string | number)[] = [
    'Item / Description',
    ...activePeriods.map((p) => p.weekEnding),
  ]

  const csvRows: string[] = [row(headerFields)]

  // ── Walk flatRows ─────────────────────────────────────────────────────────

  for (let rowIdx = 0; rowIdx < flatRows.length; rowIdx++) {
    const fr = flatRows[rowIdx]!

    // Selection scope: skip rows not selected.
    if (selectedRowIndices !== null && !selectedRowIndices.has(rowIdx)) {
      continue
    }

    // View scope filters.
    if (scope === 'view') {
      // Collapsed: skip ALL rows in collapsed sections (including headers).
      if (fr.kind !== 'sectionHeader' && collapsed[fr.sectionId]) {
        continue
      }
      // Also skip section headers of collapsed sections.
      if (fr.kind === 'sectionHeader' && collapsed[fr.sectionId]) {
        continue
      }

      // filterRowSet: only item rows are affected by the find filter.
      if (filterRowSet !== null && fr.kind === 'item' && !filterRowSet.has(rowIdx)) {
        continue
      }

      // hideEmpty: skip item/subtotal rows where every amount is zero.
      if (hideEmpty && fr.kind !== 'sectionHeader' && isRowAllZeros(fr, periodIds, localLines)) {
        continue
      }
    }

    // Build the data fields for this row.
    let label: string
    let periodValues: (string | number)[]

    if (fr.kind === 'sectionHeader') {
      label = sectionLabel(fr.sectionId, categories)
      periodValues = activePeriods.map(() => '')
    } else if (fr.kind === 'subtotal') {
      label = subLabel(fr.subId, categories)
      periodValues = activePeriods.map((p) =>
        computeSubtotal(fr.subCategoryIds, p.id, localLines),
      )
    } else if (fr.kind === 'group') {
      // Group header: emit label + empty period values (member rows follow).
      label = `  [Group] ${fr.group.label}`
      periodValues = activePeriods.map(() => '')
    } else {
      // item
      label = itemLabel(fr)
      periodValues = activePeriods.map((p) => {
        const line = fr.lineByPeriod.get(p.id)
        return line?.amount ?? 0
      })
    }

    csvRows.push(row([label, ...periodValues]))
  }

  // ── Summary rows ──────────────────────────────────────────────────────────

  if (summaries && summaries.length > 0) {
    const summaryByPeriod = new Map(summaries.map((s) => [s.periodId, s]))

    const netOps = activePeriods.map((p) => summaryByPeriod.get(p.id)?.netOperating ?? 0)
    const closing = activePeriods.map((p) => summaryByPeriod.get(p.id)?.closingBalance ?? 0)
    const available = activePeriods.map((p) => summaryByPeriod.get(p.id)?.availableCash ?? 0)
    const odStatus = activePeriods.map((p) => {
      const s = summaryByPeriod.get(p.id)
      return s ? (s.isOverdrawn ? 'Overdrawn' : 'OK') : ''
    })

    csvRows.push(row(['Net Operating Cash Flow', ...netOps]))
    csvRows.push(row(['Closing Balance', ...closing]))
    csvRows.push(row(['Available Cash', ...available]))
    csvRows.push(row(['OD Status', ...odStatus]))
  }

  // ── Assemble with BOM ─────────────────────────────────────────────────────

  return '\uFEFF' + csvRows.join('\r\n')
}
