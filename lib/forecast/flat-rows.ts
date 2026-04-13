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
 * P3.4: accepts an optional `groups` map. For each sub-category that has
 * groups defined, group-header rows are inserted above the member item rows.
 * When a group is collapsed its member rows are excluded from the list
 * entirely (not just hidden via CSS). Items that are not in any group for
 * their sub-category appear after all group headers for that sub-category.
 */
export function buildFlatRows(
  sections: Category[],
  categories: Category[],
  lines: ForecastLine[],
  collapsed: Record<string, boolean>,
  groups?: RowGroupMap,
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
    }

    const { itemMap } = buildItemRows(section, children, categories, lines)

    // ── P3.4: group-aware item row insertion ──────────────────────────────────
    const subGroups = groups ?? {}

    // Build a reverse lookup: lineId → itemKey, so we can determine which
    // item rows are "claimed" by a group.
    const lineIdToItemKey = new Map<string, string>()
    for (const [key, itemLines] of itemMap) {
      for (const l of itemLines) {
        lineIdToItemKey.set(l.id, key)
      }
    }

    // Track which item keys have been emitted (either inside a group or as
    // ungrouped rows) to avoid duplicates.
    const emittedItemKeys = new Set<string>()

    // Emit groups per sub-category, in the order the sub-categories appear.
    for (const sub of children) {
      const groupsForSub = subGroups[sub.id] ?? []
      if (groupsForSub.length === 0) continue

      for (const group of groupsForSub) {
        // Resolve which item keys are members of this group and actually exist.
        const memberItemKeys: string[] = []
        for (const lineId of group.lineIds) {
          const key = lineIdToItemKey.get(lineId)
          if (key && !memberItemKeys.includes(key)) {
            memberItemKeys.push(key)
          }
        }

        // Emit the group header row.
        rows.push({
          kind: 'group',
          sectionId: section.id,
          subId: sub.id,
          group,
          memberItemKeys,
        })

        // If not collapsed, emit each member item row (and mark as emitted).
        if (!group.collapsed) {
          for (const key of memberItemKeys) {
            if (emittedItemKeys.has(key)) continue
            emittedItemKeys.add(key)
            const itemLines = itemMap.get(key)
            if (!itemLines) continue
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
        } else {
          // Collapsed: mark members as emitted so they are not re-emitted below.
          for (const key of memberItemKeys) {
            emittedItemKeys.add(key)
          }
        }
      }
    }

    // Emit ungrouped item rows (not yet emitted).
    for (const [key, itemLines] of itemMap) {
      if (emittedItemKeys.has(key)) continue
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
