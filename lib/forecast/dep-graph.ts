/**
 * Dependency graph for formula-bearing forecast lines.
 *
 * Pure module — no React, no DOM, no Supabase.
 *
 * Usage:
 *   const graph = buildDependencyGraph(lines, flatRows, periods)
 *   const order = topologicalOrder(graph)
 *   const affected = findDependents(graph, ['line-id-that-changed'])
 */

import type { FlatRow } from '@/lib/forecast/flat-rows'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A forecast line with the minimal fields needed for dep-graph construction. */
export interface DepGraphLine {
  id: string
  formula?: string | null
  /** The row key used in the flat-rows structure. Derived from categoryId + counterparty. */
  categoryId: string
  counterparty: string | null
  notes: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: formula reference extraction (no evaluation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the set of itemKeys that a formula references, WITHOUT evaluating it.
 * We do a lightweight scan for @label:W<n> patterns and W<n> tokens.
 * Errors (unknown label, out-of-range col) are silently ignored here — the
 * full evaluator handles them at evaluation time.
 */
function extractFormulaRefs(
  formula: string,
  currentItemKey: string,
  flatRows: FlatRow[],
): Set<string> {
  const refs = new Set<string>()

  // Always depends on self for plain W<n> refs (current row)
  // We only add specific keys we can detect.

  const text = formula.startsWith('=') ? formula.slice(1) : formula

  // Pattern: @<label>:W<n>  or  @<label>:W<n>:W<m>
  // Capture the label
  const atPattern = /@([A-Za-z0-9 _-]+)\s*:/g
  let m: RegExpExecArray | null
  while ((m = atPattern.exec(text)) !== null) {
    const label = m[1]!.trim().toLowerCase()
    // Find matching row
    for (const row of flatRows) {
      if (row.kind !== 'item') continue
      const parts = row.itemKey.split('::')
      const rowLabel = parts.slice(1).join('::').trim().toLowerCase()
      if (rowLabel === label) {
        refs.add(row.itemKey)
        break
      }
    }
  }

  // Plain W<n> refs (no @ prefix): depend on the current row
  // Use a regex that matches W<digits> NOT preceded by a colon (i.e. already captured in @-refs)
  // Simple approach: if there's any W<n> token, the formula depends on currentItemKey
  if (/W\d+/i.test(text)) {
    refs.add(currentItemKey)
  }

  return refs
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDependencyGraph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a dependency graph from formula-bearing forecast lines.
 *
 * Returns a Map from lineId → array of lineIds it directly depends on.
 * Only lines WITH a formula are included in the map.
 *
 * Note: a formula like =SUM(W1:W4) on the Payroll row depends on other
 * cells of the SAME row. We track this as "the set of line IDs on that row".
 */
export function buildDependencyGraph(
  lines: DepGraphLine[],
  flatRows: FlatRow[],
  periods: Array<{ id: string }>,
): Map<string, string[]> {
  // Build index: itemKey → lineIds
  const itemKeyToLineIds = new Map<string, string[]>()
  for (const line of lines) {
    const label = line.counterparty ?? line.notes ?? 'Line item'
    const itemKey = `${line.categoryId}::${label}`
    if (!itemKeyToLineIds.has(itemKey)) itemKeyToLineIds.set(itemKey, [])
    itemKeyToLineIds.get(itemKey)!.push(line.id)
  }

  const graph = new Map<string, string[]>()

  for (const line of lines) {
    if (!line.formula) continue

    const label = line.counterparty ?? line.notes ?? 'Line item'
    const currentItemKey = `${line.categoryId}::${label}`

    const referencedItemKeys = extractFormulaRefs(line.formula, currentItemKey, flatRows)

    // Collect all lineIds for the referenced itemKeys, excluding self
    const depIds: string[] = []
    for (const key of referencedItemKeys) {
      if (key === currentItemKey) continue // self-deps are handled at eval time (cycle)
      const ids = itemKeyToLineIds.get(key) ?? []
      for (const id of ids) {
        if (id !== line.id) depIds.push(id)
      }
    }

    graph.set(line.id, depIds)
  }

  return graph
}

// ─────────────────────────────────────────────────────────────────────────────
// topologicalOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kahn's algorithm topological sort.
 *
 * Returns `{ ok: true, order }` with lineIds in dependency-first order
 * (a dependency always comes before the formula that reads it), or
 * `{ error, cycleNodes }` if a cycle is detected.
 */
export function topologicalOrder(
  graph: Map<string, string[]>,
): { ok: true; order: string[] } | { error: string; cycleNodes: string[] } {
  // Collect all nodes (both sources and targets)
  const allNodes = new Set<string>()
  for (const [id, deps] of graph) {
    allNodes.add(id)
    for (const dep of deps) allNodes.add(dep)
  }

  // In-degree: count incoming edges (formula → dep means dep has no outgoing edge here,
  // but the formula node has edges TO its deps).
  // For topological order we want deps BEFORE formulas, so edges go dep → formula.
  // i.e. if formula A depends on B, there's an edge B → A.
  // In-degree = number of deps each node has.
  const inDegree = new Map<string, number>()
  // adjacency list: dep → list of formulaIds that depend on it
  const revAdj = new Map<string, string[]>()

  for (const node of allNodes) {
    inDegree.set(node, 0)
    revAdj.set(node, [])
  }

  for (const [formulaId, deps] of graph) {
    for (const dep of deps) {
      // dep → formulaId (dep must come first)
      revAdj.get(dep)!.push(formulaId)
      inDegree.set(formulaId, (inDegree.get(formulaId) ?? 0) + 1)
    }
  }

  // Kahn's BFS
  const queue: string[] = []
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node)
  }

  const order: string[] = []
  while (queue.length > 0) {
    const node = queue.shift()!
    order.push(node)
    for (const dependent of revAdj.get(node) ?? []) {
      const newDeg = (inDegree.get(dependent) ?? 1) - 1
      inDegree.set(dependent, newDeg)
      if (newDeg === 0) queue.push(dependent)
    }
  }

  if (order.length !== allNodes.size) {
    // Cycle detected — collect nodes still with in-degree > 0
    const cycleNodes: string[] = []
    for (const [node, deg] of inDegree) {
      if (deg > 0) cycleNodes.push(node)
    }
    return { error: 'Circular dependency detected', cycleNodes }
  }

  return { ok: true, order }
}

// ─────────────────────────────────────────────────────────────────────────────
// findDependents
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BFS through the REVERSE graph from the changed set.
 * Returns the transitive set of lineIds whose formulas may need re-evaluation
 * (excludes the changed nodes themselves).
 */
export function findDependents(
  graph: Map<string, string[]>,
  changedLineIds: string[],
): string[] {
  // Build reverse adjacency: dep → formulaIds that read it
  const revAdj = new Map<string, string[]>()
  for (const [formulaId, deps] of graph) {
    for (const dep of deps) {
      if (!revAdj.has(dep)) revAdj.set(dep, [])
      revAdj.get(dep)!.push(formulaId)
    }
  }

  const visited = new Set<string>(changedLineIds)
  const queue: string[] = [...changedLineIds]
  const result: string[] = []

  while (queue.length > 0) {
    const node = queue.shift()!
    for (const dependent of revAdj.get(node) ?? []) {
      if (!visited.has(dependent)) {
        visited.add(dependent)
        queue.push(dependent)
        result.push(dependent)
      }
    }
  }

  return result
}
