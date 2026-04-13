'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BUSummaryRow } from '@/lib/pipeline/types'
import {
  buildFlatSummaryRows,
  type FlatSummaryRow,
  type SummaryMetricKey,
} from '@/lib/pipeline/summary-flat-rows'
import {
  buildMatchList,
  nextMatchIndex,
  prevMatchIndex,
  type FindMatch,
} from '@/lib/pipeline/summary-find'
import type { Selection } from '@/lib/pipeline/summary-selection'

export interface FlatRowIndex {
  byEntity: Map<string, Map<SummaryMetricKey, number>>
  groupTotal: Map<SummaryMetricKey, number>
}

interface UseSummaryFindArgs {
  rows: BUSummaryRow[]
  months: string[]
  collapsed: Record<string, boolean>
  setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setSelection: React.Dispatch<React.SetStateAction<Selection | null>>
}

export interface UseSummaryFindResult {
  findOpen: boolean
  findQuery: string
  setFindQuery: (q: string) => void
  matches: FindMatch[]
  findCursor: number | null
  currentMatchCellKey: string | null
  otherMatchCells: Set<string>
  flashOn: boolean
  openFind: () => void
  closeFind: () => void
  findNext: () => void
  findPrev: () => void
  onlyMatching: boolean
  setOnlyMatching: (v: boolean) => void
  matchedEntities: Set<string>
  effectiveCollapsed: Record<string, boolean>
  flatRows: FlatSummaryRow[]
  flatRowIndex: FlatRowIndex
}

export function useSummaryFind({
  rows,
  months,
  collapsed,
  setCollapsed,
  setSelection,
}: UseSummaryFindArgs): UseSummaryFindResult {
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findCursor, setFindCursor] = useState<number | null>(null)
  const [onlyMatching, setOnlyMatching] = useState(false)
  const [flashOn, setFlashOn] = useState(false)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerFlash = useCallback(() => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    setFlashOn(true)
    flashTimeoutRef.current = setTimeout(() => {
      setFlashOn(false)
      flashTimeoutRef.current = null
    }, 500)
  }, [])

  // Fully-expanded flat rows — used ONLY as the search corpus so collapsed
  // entities are still findable.
  const expandedFlatRows = useMemo(
    () => buildFlatSummaryRows(rows, {}),
    [rows],
  )

  const matches = useMemo<FindMatch[]>(
    () => (findOpen ? buildMatchList(expandedFlatRows, months.length, findQuery) : []),
    [findOpen, expandedFlatRows, months.length, findQuery],
  )

  const matchedEntities = useMemo(() => {
    const s = new Set<string>()
    for (const m of matches) {
      const fr = expandedFlatRows[m.row]
      if (!fr) continue
      s.add(fr.entityId ?? '__group_total__')
    }
    return s
  }, [matches, expandedFlatRows])

  const effectiveCollapsed = useMemo(() => {
    if (!findOpen || !onlyMatching) return collapsed
    const out: Record<string, boolean> = { ...collapsed }
    for (const r of rows) {
      if (!matchedEntities.has(r.entityId)) out[r.entityId] = true
      else out[r.entityId] = false
    }
    return out
  }, [findOpen, onlyMatching, collapsed, rows, matchedEntities])

  const flatRows = useMemo(
    () => buildFlatSummaryRows(rows, effectiveCollapsed),
    [rows, effectiveCollapsed],
  )

  const flatRowIndex = useMemo<FlatRowIndex>(() => {
    const byEntity = new Map<string, Map<SummaryMetricKey, number>>()
    const groupTotal = new Map<SummaryMetricKey, number>()
    flatRows.forEach((fr, i) => {
      if (fr.kind === 'entity-metric' && fr.entityId) {
        let inner = byEntity.get(fr.entityId)
        if (!inner) {
          inner = new Map()
          byEntity.set(fr.entityId, inner)
        }
        inner.set(fr.metricKey, i)
      } else if (fr.kind === 'group-total-metric') {
        groupTotal.set(fr.metricKey, i)
      }
    })
    return { byEntity, groupTotal }
  }, [flatRows])

  const resolveMatchDisplay = useCallback(
    (m: FindMatch): { row: number; col: number | null; entityId: string | null } | null => {
      const fr = expandedFlatRows[m.row]
      if (!fr) return null
      const idx = fr.entityId
        ? flatRowIndex.byEntity.get(fr.entityId)?.get(fr.metricKey) ?? null
        : flatRowIndex.groupTotal.get(fr.metricKey) ?? null
      if (idx === null) return null
      return { row: idx, col: m.col, entityId: fr.entityId }
    },
    [expandedFlatRows, flatRowIndex],
  )

  const currentDisplayMatch = useMemo(() => {
    if (!findOpen || findCursor === null || matches.length === 0) return null
    const m = matches[findCursor]
    if (!m) return null
    return resolveMatchDisplay(m)
  }, [findOpen, findCursor, matches, resolveMatchDisplay])

  const otherMatchCells = useMemo(() => {
    if (!findOpen) return new Set<string>()
    const s = new Set<string>()
    matches.forEach((m, i) => {
      if (i === findCursor) return
      const d = resolveMatchDisplay(m)
      if (!d || d.col === null) return
      s.add(`${d.row}:${d.col}`)
    })
    return s
  }, [findOpen, matches, findCursor, resolveMatchDisplay])

  const currentMatchCellKey = currentDisplayMatch
    ? `${currentDisplayMatch.row}:${currentDisplayMatch.col ?? 0}`
    : null

  // Reset cursor when matches list changes meaningfully.
  useEffect(() => {
    if (!findOpen) {
      setFindCursor(null)
      return
    }
    if (matches.length === 0) {
      setFindCursor(null)
    } else if (findCursor === null || findCursor >= matches.length) {
      setFindCursor(0)
    }
  }, [findOpen, matches.length, findCursor])

  const jumpToCursor = useCallback(
    (cursor: number) => {
      setFindCursor(cursor)
      triggerFlash()
    },
    [triggerFlash],
  )

  // After display-list updates, sync selection + scroll-into-view.
  useEffect(() => {
    if (!currentDisplayMatch) return
    const { row, col } = currentDisplayMatch
    const cellCol = col === null ? 0 : col
    setSelection({
      anchor: { row, col: cellCol },
      focus: { row, col: cellCol },
    })
  }, [currentDisplayMatch, setSelection])

  const findNext = useCallback(() => {
    if (matches.length === 0) return
    const nx = nextMatchIndex(findCursor, matches.length)
    jumpToCursor(nx)
  }, [matches.length, findCursor, jumpToCursor])

  const findPrev = useCallback(() => {
    if (matches.length === 0) return
    const nx = prevMatchIndex(findCursor, matches.length)
    jumpToCursor(nx)
  }, [matches.length, findCursor, jumpToCursor])

  const openFind = useCallback(() => {
    setFindOpen(true)
  }, [])

  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindQuery('')
    setFindCursor(null)
    setOnlyMatching(false)
    setSelection(null)
  }, [setSelection])

  // Whenever the cursor lands on a match, expand the target entity if
  // collapsed and fire the flash pulse.
  useEffect(() => {
    if (!findOpen) return
    if (findCursor === null) return
    const m = matches[findCursor]
    if (!m) return
    const fr = expandedFlatRows[m.row]
    if (!fr) return
    if (fr.entityId && collapsed[fr.entityId]) {
      setCollapsed((prev) => ({ ...prev, [fr.entityId!]: false }))
    }
    triggerFlash()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen, findCursor, matches])

  // Flash-timer cleanup.
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    }
  }, [])

  return {
    findOpen,
    findQuery,
    setFindQuery,
    matches,
    findCursor,
    currentMatchCellKey,
    otherMatchCells,
    flashOn,
    openFind,
    closeFind,
    findNext,
    findPrev,
    onlyMatching,
    setOnlyMatching,
    matchedEntities,
    effectiveCollapsed,
    flatRows,
    flatRowIndex,
  }
}
