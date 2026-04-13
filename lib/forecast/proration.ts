import type { ForecastLine } from '@/lib/types'

export interface ProrateResult {
  updated: ForecastLine[]
  changed: Array<{ id: string; amount: number }>
  skippedPipeline: number
  reason?: 'no-lines' | 'all-pipeline' | 'ok'
}

/**
 * Prorate a new subtotal across editable forecast lines that belong to a set
 * of sub-categories within a single period.
 *
 * Pipeline-sourced lines are skipped — they'd be overwritten by the next sync.
 *
 * - If current total !== 0: proportional scaling (rounded to nearest int).
 * - If current total === 0: even split, last line absorbs rounding so the
 *   editable lines sum to exactly `newTotal`.
 *
 * Input is not mutated. Unchanged lines preserve reference identity in the
 * returned `updated` array.
 */
export function prorateSubtotal(
  lines: ForecastLine[],
  subCategoryIds: string[],
  periodId: string,
  newTotal: number,
): ProrateResult {
  const categorySet = new Set(subCategoryIds)

  // Partition into matching (right period + right category set) vs untouched
  const matchingIndices: number[] = []
  const pipelineIndices: number[] = []
  const editableIndices: number[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.periodId !== periodId) continue
    if (!categorySet.has(line.categoryId)) continue
    matchingIndices.push(i)
    if (line.source === 'pipeline') {
      pipelineIndices.push(i)
    } else {
      editableIndices.push(i)
    }
  }

  const skippedPipeline = pipelineIndices.length

  // No matching lines at all
  if (matchingIndices.length === 0) {
    return { updated: lines.slice(), changed: [], skippedPipeline: 0, reason: 'no-lines' }
  }

  // Matching lines exist but all are pipeline
  if (editableIndices.length === 0) {
    return { updated: lines.slice(), changed: [], skippedPipeline, reason: 'all-pipeline' }
  }

  const editableLines = editableIndices.map((i) => lines[i]!)
  const currentTotal = editableLines.reduce((sum, l) => sum + l.amount, 0)

  // Compute new amounts per editable line
  const newAmounts = new Map<string, number>() // line id -> new amount

  if (currentTotal !== 0) {
    // Proportional scaling
    const scale = newTotal / currentTotal
    for (const line of editableLines) {
      newAmounts.set(line.id, Math.round(line.amount * scale))
    }
  } else {
    // Even split with rounding absorbed by last line
    const n = editableLines.length
    const perLine = Math.round(newTotal / n)
    let runningSum = 0
    for (let k = 0; k < n; k++) {
      const line = editableLines[k]!
      if (k === n - 1) {
        newAmounts.set(line.id, newTotal - runningSum)
      } else {
        newAmounts.set(line.id, perLine)
        runningSum += perLine
      }
    }
  }

  // Build result, preserving order. Keep reference identity for unchanged lines.
  const updated: ForecastLine[] = new Array(lines.length)
  const changed: Array<{ id: string; amount: number }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const next = newAmounts.get(line.id)
    if (next !== undefined && next !== line.amount) {
      updated[i] = { ...line, amount: next }
      changed.push({ id: line.id, amount: next })
    } else {
      updated[i] = line
    }
  }

  return { updated, changed, skippedPipeline, reason: 'ok' }
}
