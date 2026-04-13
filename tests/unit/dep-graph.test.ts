import { describe, it, expect } from 'vitest'
import {
  buildDependencyGraph,
  topologicalOrder,
  findDependents,
  type DepGraphLine,
} from '@/lib/forecast/dep-graph'
import type { FlatRow } from '@/lib/forecast/flat-rows'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<DepGraphLine> & Pick<DepGraphLine, 'id'>): DepGraphLine {
  return {
    formula: null,
    categoryId: 'cat-1',
    counterparty: overrides.id, // default label = id for simplicity
    notes: null,
    ...overrides,
  }
}

function makeItemRow(itemKey: string): FlatRow {
  return {
    kind: 'item',
    sectionId: 'sec-1',
    itemKey,
    lineIds: [],
    lineByPeriod: new Map(),
    isPipeline: false,
  }
}

const DEFAULT_PERIODS = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }]

// ─────────────────────────────────────────────────────────────────────────────
// buildDependencyGraph
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDependencyGraph', () => {
  // 1. No formulas → empty graph
  it('returns empty graph when no lines have formulas', () => {
    const lines: DepGraphLine[] = [
      makeLine({ id: 'line-a', categoryId: 'cat-1', counterparty: 'A' }),
      makeLine({ id: 'line-b', categoryId: 'cat-2', counterparty: 'B' }),
    ]
    const flatRows: FlatRow[] = [
      makeItemRow('cat-1::A'),
      makeItemRow('cat-2::B'),
    ]
    const graph = buildDependencyGraph(lines, flatRows, DEFAULT_PERIODS)
    expect(graph.size).toBe(0)
  })

  // 2. Two independent formulas → graph with two entries
  it('two independent formulas produce separate graph entries', () => {
    const lines: DepGraphLine[] = [
      makeLine({ id: 'line-a', categoryId: 'cat-1', counterparty: 'A', formula: '=W1+W2' }),
      makeLine({ id: 'line-b', categoryId: 'cat-2', counterparty: 'B', formula: '=W3*2' }),
    ]
    const flatRows: FlatRow[] = [
      makeItemRow('cat-1::A'),
      makeItemRow('cat-2::B'),
    ]
    const graph = buildDependencyGraph(lines, flatRows, DEFAULT_PERIODS)
    // Both lines have W<n> refs which refer to their own rows (self-dep filtered out)
    // Cross-deps come only from @label refs — none here
    expect(graph.has('line-a')).toBe(true)
    expect(graph.has('line-b')).toBe(true)
    // Self-deps are excluded, so deps should be empty arrays (no cross-refs)
    expect(graph.get('line-a')).toEqual([])
    expect(graph.get('line-b')).toEqual([])
  })

  // 3. Cross-row formula: line-a reads @B
  it('cross-row formula creates dependency edge', () => {
    const lines: DepGraphLine[] = [
      makeLine({ id: 'line-a', categoryId: 'cat-1', counterparty: 'A', formula: '=@B:W1' }),
      makeLine({ id: 'line-b', categoryId: 'cat-2', counterparty: 'B' }),
    ]
    const flatRows: FlatRow[] = [
      makeItemRow('cat-1::A'),
      makeItemRow('cat-2::B'),
    ]
    const graph = buildDependencyGraph(lines, flatRows, DEFAULT_PERIODS)
    // line-a depends on line-b (via @B:W1)
    expect(graph.has('line-a')).toBe(true)
    expect(graph.get('line-a')).toContain('line-b')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// topologicalOrder
// ─────────────────────────────────────────────────────────────────────────────

describe('topologicalOrder', () => {
  // 3. Chain: A depends on B, B depends on C → C before B before A
  it('chain: C before B before A in topological order', () => {
    // line-c is a data source (no formula)
    // line-b formula reads from line-c
    // line-a formula reads from line-b
    const graph = new Map<string, string[]>([
      ['line-b', ['line-c']], // B depends on C
      ['line-a', ['line-b']], // A depends on B
    ])
    const result = topologicalOrder(graph)
    expect(result).toHaveProperty('ok', true)
    if (!('ok' in result)) return
    const order = result.order
    // C must come before B, B before A
    expect(order.indexOf('line-c')).toBeLessThan(order.indexOf('line-b'))
    expect(order.indexOf('line-b')).toBeLessThan(order.indexOf('line-a'))
  })

  // 4. Cycle: A depends on B, B depends on A → error
  it('cycle: A↔B returns error with cycleNodes', () => {
    const graph = new Map<string, string[]>([
      ['line-a', ['line-b']],
      ['line-b', ['line-a']],
    ])
    const result = topologicalOrder(graph)
    expect(result).not.toHaveProperty('ok')
    expect(result).toHaveProperty('error')
    if ('error' in result) {
      expect(result.cycleNodes).toContain('line-a')
      expect(result.cycleNodes).toContain('line-b')
    }
  })

  // Additional: single node with no deps
  it('single node with no deps produces that node in order', () => {
    const graph = new Map<string, string[]>([['line-a', []]])
    const result = topologicalOrder(graph)
    expect(result).toHaveProperty('ok', true)
    if ('ok' in result) {
      expect(result.order).toContain('line-a')
    }
  })

  // Additional: empty graph
  it('empty graph produces empty order', () => {
    const graph = new Map<string, string[]>()
    const result = topologicalOrder(graph)
    expect(result).toHaveProperty('ok', true)
    if ('ok' in result) {
      expect(result.order).toEqual([])
    }
  })

  // Additional: self-loop
  it('self-loop is a cycle', () => {
    const graph = new Map<string, string[]>([['line-a', ['line-a']]])
    const result = topologicalOrder(graph)
    expect(result).not.toHaveProperty('ok')
    if ('error' in result) {
      expect(result.cycleNodes).toContain('line-a')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// findDependents
// ─────────────────────────────────────────────────────────────────────────────

describe('findDependents', () => {
  // 5. findDependents({A}, graph) where B depends on A, C depends on B → [B, C]
  it('returns transitive dependents of changed nodes', () => {
    const graph = new Map<string, string[]>([
      ['line-b', ['line-a']], // B depends on A
      ['line-c', ['line-b']], // C depends on B
    ])
    const result = findDependents(graph, ['line-a'])
    expect(result).toContain('line-b')
    expect(result).toContain('line-c')
    // Should not include the changed node itself
    expect(result).not.toContain('line-a')
  })

  // Additional: no dependents
  it('returns empty array when nothing depends on the changed node', () => {
    const graph = new Map<string, string[]>([
      ['line-a', ['line-b']], // A depends on B, not the other way
    ])
    const result = findDependents(graph, ['line-a'])
    expect(result).toEqual([])
  })

  // Additional: multiple changed nodes
  it('handles multiple changed nodes', () => {
    const graph = new Map<string, string[]>([
      ['line-c', ['line-a', 'line-b']], // C depends on both A and B
    ])
    const result = findDependents(graph, ['line-a', 'line-b'])
    expect(result).toContain('line-c')
    // line-c should appear only once even though both inputs trigger it
    expect(result.filter((x) => x === 'line-c').length).toBe(1)
  })

  // Additional: diamond shape — A→C and A→B→C: C should appear once
  it('diamond dependency: C appears exactly once', () => {
    const graph = new Map<string, string[]>([
      ['line-b', ['line-a']], // B depends on A
      ['line-c', ['line-a', 'line-b']], // C depends on A and B
    ])
    const result = findDependents(graph, ['line-a'])
    expect(result).toContain('line-b')
    expect(result).toContain('line-c')
    expect(result.filter((x) => x === 'line-c').length).toBe(1)
  })
})
