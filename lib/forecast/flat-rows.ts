/**
 * Pure helpers for building the flat focus-navigable row list used by the
 * forecast grid. Extracted to a .ts module (no JSX) so it can be unit-tested
 * without pulling React / JSX parsing into the test transform pipeline.
 */

import type { Category, ForecastLine } from '@/lib/types'

export type FlatRow =
  | { kind: 'sectionHeader'; sectionId: string }
  | {
      kind: 'subtotal'
      sectionId: string
      subId: string
      subCategoryIds: string[]
      editable: boolean
    }
  | {
      kind: 'item'
      sectionId: string
      itemKey: string
      lineIds: string[]
      lineByPeriod: Map<string, ForecastLine>
      isPipeline: boolean
    }

/** Group unique item rows for a section by categoryId + label. */
export function buildItemRows(
  section: Category,
  sectionChildren: Category[],
  categories: Category[],
  lines: ForecastLine[],
): {
  sectionLines: ForecastLine[]
  itemMap: Map<string, ForecastLine[]>
} {
  const sectionLines = lines.filter((l) => {
    const cat = categories.find((c) => c.id === l.categoryId)
    if (!cat) return false
    return (
      cat.parentId === section.id ||
      sectionChildren.some((sc) => sc.id === cat.parentId || sc.id === cat.id)
    )
  })

  const itemMap = new Map<string, ForecastLine[]>()
  for (const l of sectionLines) {
    const label = l.counterparty ?? l.notes ?? 'Line item'
    const key = `${l.categoryId}::${label}`
    if (!itemMap.has(key)) itemMap.set(key, [])
    itemMap.get(key)!.push(l)
  }

  return { sectionLines, itemMap }
}

/**
 * Build the flat focus-navigable row list. Headers are emitted but are not
 * themselves focus-navigable — arrow navigation skips them. Collapsed
 * section bodies are omitted entirely.
 */
export function buildFlatRows(
  sections: Category[],
  categories: Category[],
  lines: ForecastLine[],
  collapsed: Record<string, boolean>,
): FlatRow[] {
  const rows: FlatRow[] = []

  for (const section of sections) {
    rows.push({ kind: 'sectionHeader', sectionId: section.id })
    if (collapsed[section.id]) continue

    const children = categories
      .filter((c) => c.parentId === section.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    for (const sub of children) {
      const subCategoryIds = [
        sub.id,
        ...categories.filter((c) => c.parentId === sub.id).map((c) => c.id),
      ]
      const subLines = lines.filter((l) => subCategoryIds.includes(l.categoryId))
      const editable = subLines.some((l) => l.source !== 'pipeline')
      rows.push({
        kind: 'subtotal',
        sectionId: section.id,
        subId: sub.id,
        subCategoryIds,
        editable,
      })
    }

    const { itemMap } = buildItemRows(section, children, categories, lines)
    for (const [key, itemLines] of itemMap) {
      const firstLine = itemLines[0]!
      const isPipeline = firstLine.source === 'pipeline'
      const lineByPeriod = new Map(itemLines.map((l) => [l.periodId, l]))
      rows.push({
        kind: 'item',
        sectionId: section.id,
        itemKey: key,
        lineIds: itemLines.map((l) => l.id),
        lineByPeriod,
        isPipeline,
      })
    }
  }

  return rows
}

/** Is a flat row navigable as a focus target? */
export function isFocusable(row: FlatRow | undefined): boolean {
  if (!row) return false
  if (row.kind === 'item') return !row.isPipeline
  if (row.kind === 'subtotal') return row.editable
  return false
}
