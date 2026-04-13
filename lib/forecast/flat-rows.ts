/**
 * Pure helpers for building the flat focus-navigable row list used by the
 * forecast grid. Extracted to a .ts module (no JSX) so it can be unit-tested
 * without pulling React / JSX parsing into the test transform pipeline.
 */

import type { Category, ForecastLine } from '@/lib/types'

// ── Group types (P3.4) ────────────────────────────────────────────────────────

/** A single user-defined row group within a sub-category. */
export interface RowGroup {
  /** Unique ID for this group within its sub-category. */
  id: string
  /** Display label shown on the group-header row. */
  label: string
  /** IDs of the item rows (ForecastLine.id values) that belong to this group. */
  lineIds: string[]
  /** When true, member rows are excluded from flatRows entirely. */
  collapsed: boolean
}

/**
 * Groups map: keyed by sub-category ID, each value is an ordered array of
 * groups within that sub-category. Persisted to
 * `localStorage['forecast.groups.v1']`.
 */
export type RowGroupMap = Record<string, RowGroup[]>

// ── FlatRow union ─────────────────────────────────────────────────────────────

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
  | {
      kind: 'group'
      sectionId: string
      /** The sub-category that owns this group. */
      subId: string
      /** The RowGroup definition (id, label, lineIds, collapsed). */
      group: RowGroup
      /**
       * Resolved member item keys (itemKey strings) that exist in the current
       * localLines. Computed during buildFlatRows for rendering (sums etc.).
       */
      memberItemKeys: string[]
    }

/** Build the unique item key used by buildFlatRows (category::label). */
function itemKey(categoryId: string, label: string): string {
  return `${categoryId}::${label}`
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
  // O(1) category lookup instead of Array.find per line × per section.
  const categoryById = new Map<string, Category>()
  for (const c of categories) categoryById.set(c.id, c)
  const childIds = new Set<string>(sectionChildren.map((sc) => sc.id))

  const sectionLines = lines.filter((l) => {
    const cat = categoryById.get(l.categoryId)
    if (!cat) return false
    return (
      cat.parentId === section.id ||
      (cat.parentId !== null && childIds.has(cat.parentId)) ||
      childIds.has(cat.id)
    )
  })

  const itemMap = new Map<string, ForecastLine[]>()
  for (const l of sectionLines) {
    const label = l.counterparty ?? l.notes ?? 'Line item'
    const key = itemKey(l.categoryId, label)
    if (!itemMap.has(key)) itemMap.set(key, [])
    itemMap.get(key)!.push(l)
  }

  return { sectionLines, itemMap }
}

/**
 * Build the flat focus-navigable row list. Headers are emitted but are not
 * themselves focus-navigable — arrow navigation skips them. Collapsed
 * section bodies are omitted entirely.
 *
 * Emission order per section:
 *   sectionHeader
 *   for each sub-category (in sortOrder):
 *     subtotal
 *     group headers + their member items (P3.4)
 *     ungrouped items whose parent sub is this sub
 *
 * Items are pinned under their parent sub-category's subtotal, so rendering
 * never makes a line created under one sub appear to belong to another
 * (e.g. a Payroll line showing under the trailing Credit Cards subtotal).
 */
export function buildFlatRows(
  sections: Category[],
  categories: Category[],
  lines: ForecastLine[],
  collapsed: Record<string, boolean>,
  groups?: RowGroupMap,
): FlatRow[] {
  const rows: FlatRow[] = []
  const categoryById = new Map<string, Category>()
  for (const c of categories) categoryById.set(c.id, c)

  for (const section of sections) {
    rows.push({ kind: 'sectionHeader', sectionId: section.id })
    if (collapsed[section.id]) continue

    const children = categories
      .filter((c) => c.parentId === section.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const childIds = new Set(children.map((c) => c.id))

    const { itemMap } = buildItemRows(section, children, categories, lines)

    // Map each itemKey → parent sub.id for this section, so we can interleave
    // items under their owning subtotal. An item's parent sub is either:
    //   - the line's categoryId itself (line posted directly to a sub), or
    //   - the parentId of the line's category (line posted to a grandchild).
    const itemKeyToSubId = new Map<string, string>()
    for (const [key, itemLines] of itemMap) {
      const first = itemLines[0]
      if (!first) continue
      if (childIds.has(first.categoryId)) {
        itemKeyToSubId.set(key, first.categoryId)
        continue
      }
      const parentId = categoryById.get(first.categoryId)?.parentId ?? null
      if (parentId && childIds.has(parentId)) {
        itemKeyToSubId.set(key, parentId)
      }
    }

    // Reverse lookup: lineId → itemKey, used to resolve group membership.
    const lineIdToItemKey = new Map<string, string>()
    for (const [key, itemLines] of itemMap) {
      for (const l of itemLines) lineIdToItemKey.set(l.id, key)
    }

    const subGroups = groups ?? {}
    const emittedItemKeys = new Set<string>()

    const pushItemRow = (key: string) => {
      const itemLines = itemMap.get(key)
      if (!itemLines) return
      // A row is "pipeline-only" only when EVERY line is pipeline-sourced.
      // A mixed row (manual + pipeline for the same counterparty/category)
      // stays navigable; per-cell save logic skips pipeline cells while
      // letting the user edit the manual ones.
      const isPipeline = itemLines.every((l) => l.source === 'pipeline')
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

    for (const sub of children) {
      const subCategoryIds = [
        sub.id,
        ...categories.filter((c) => c.parentId === sub.id).map((c) => c.id),
      ]
      const subCategoryIdSet = new Set(subCategoryIds)
      const subLines = lines.filter((l) => subCategoryIdSet.has(l.categoryId))
      // Empty subcategories stay editable so the user can type a value into
      // the subtotal cell and have the grid create the first line for them.
      // Only "all pipeline" truly locks the row.
      const editable =
        subLines.length === 0 || subLines.some((l) => l.source !== 'pipeline')
      rows.push({
        kind: 'subtotal',
        sectionId: section.id,
        subId: sub.id,
        subCategoryIds,
        editable,
      })

      // Groups for this sub.
      const groupsForSub = subGroups[sub.id] ?? []
      for (const group of groupsForSub) {
        const memberItemKeys: string[] = []
        for (const lineId of group.lineIds) {
          const key = lineIdToItemKey.get(lineId)
          if (key && !memberItemKeys.includes(key)) memberItemKeys.push(key)
        }

        rows.push({
          kind: 'group',
          sectionId: section.id,
          subId: sub.id,
          group,
          memberItemKeys,
        })

        if (!group.collapsed) {
          for (const key of memberItemKeys) {
            if (emittedItemKeys.has(key)) continue
            emittedItemKeys.add(key)
            pushItemRow(key)
          }
        } else {
          for (const key of memberItemKeys) emittedItemKeys.add(key)
        }
      }

      // Ungrouped items that belong to this sub (preserve itemMap order).
      for (const [key] of itemMap) {
        if (emittedItemKeys.has(key)) continue
        if (itemKeyToSubId.get(key) !== sub.id) continue
        emittedItemKeys.add(key)
        pushItemRow(key)
      }
    }

    // Safety net: any item whose parent sub could not be resolved (e.g. a
    // line whose category is the section itself). Emit at section end so
    // it's still visible and navigable rather than dropped silently.
    for (const [key] of itemMap) {
      if (emittedItemKeys.has(key)) continue
      emittedItemKeys.add(key)
      pushItemRow(key)
    }
  }

  return rows
}

/** Is a flat row navigable as a focus target? */
export function isFocusable(row: FlatRow | undefined): boolean {
  if (!row) return false
  if (row.kind === 'item') return !row.isPipeline
  if (row.kind === 'subtotal') return row.editable
  // 'sectionHeader' and 'group' rows are not focus targets.
  return false
}
