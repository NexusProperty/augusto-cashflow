'use client'

import { cn } from '@/lib/utils'
import { isInRange, type Selection } from '@/lib/pipeline/summary-selection'
import type { MetricRowSpec } from '@/lib/pipeline/summary-flat-rows'

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function fmt(n: number): string {
  if (n === 0) return ''
  return n.toLocaleString('en-NZ', { maximumFractionDigits: 0 })
}

function sumArray(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0)
}

// ---------------------------------------------------------------------------
// Cell — applies selection state to a single data cell.
// ---------------------------------------------------------------------------

interface CellProps {
  flatRow: number | null
  col: number
  selection: Selection | null
  onMouseDown: (e: React.MouseEvent, row: number, col: number) => void
  onMouseEnter: (row: number, col: number) => void
  className?: string
  children: React.ReactNode
}

export function Cell({
  flatRow,
  col,
  selection,
  onMouseDown,
  onMouseEnter,
  className,
  children,
}: CellProps) {
  const selectable = flatRow !== null
  const selected =
    selectable && selection ? isInRange(flatRow, col, selection) : false
  const isFocus =
    selectable && selection
      ? selection.focus.row === flatRow && selection.focus.col === col
      : false

  return (
    <td
      {...(selected ? { 'aria-selected': true as const } : {})}
      onMouseDown={
        selectable ? (e) => onMouseDown(e, flatRow, col) : undefined
      }
      onMouseEnter={
        selectable ? () => onMouseEnter(flatRow, col) : undefined
      }
      className={cn(
        className,
        selectable && 'cursor-cell select-none',
        selected && 'bg-blue-100/70',
        isFocus && 'ring-1 ring-blue-500 ring-inset',
      )}
    >
      {children}
    </td>
  )
}

// ---------------------------------------------------------------------------
// Unified MetricRow — branches internally on spec.variant.
// ---------------------------------------------------------------------------

interface MetricRowProps {
  spec: MetricRowSpec
  values: number[]
  groupTotal?: boolean
  flatRow: number | null
  selection: Selection | null
  onMouseDown: (e: React.MouseEvent, row: number, col: number) => void
  onMouseEnter: (row: number, col: number) => void
}

export function MetricRow({
  spec,
  values,
  groupTotal = false,
  flatRow,
  selection,
  onMouseDown,
  onMouseEnter,
}: MetricRowProps) {
  const total = sumArray(values)
  const bgClass = groupTotal ? 'bg-zinc-50' : 'bg-white'
  const totalCol = values.length
  const isVariance = spec.variant === 'variance'
  const { bold, italic, highlight, label } = spec

  const varianceColor = (v: number) =>
    v === 0 ? 'text-zinc-300' : v < 0 ? 'text-red-600' : 'text-emerald-600'

  return (
    <tr className="hover:bg-zinc-50/50">
      <td
        className={cn(
          'sticky left-0 z-10 px-3 py-1.5 pl-6 text-xs text-zinc-600 hover:bg-zinc-50/50',
          bgClass,
          !isVariance && bold && 'font-semibold',
          !isVariance && italic && 'italic',
        )}
      >
        {label}
      </td>
      {values.map((v, i) => (
        <Cell
          key={i}
          flatRow={flatRow}
          col={i}
          selection={selection}
          onMouseDown={onMouseDown}
          onMouseEnter={onMouseEnter}
          className={cn(
            'px-2.5 py-1.5 text-right tabular-nums text-sm',
            groupTotal && 'bg-zinc-50',
            isVariance
              ? varianceColor(v)
              : cn(
                  bold && 'font-semibold',
                  italic && 'italic',
                  highlight && v !== 0 ? 'text-emerald-600' : 'text-zinc-900',
                ),
          )}
        >
          {isVariance
            ? v === 0
              ? '—'
              : fmt(v)
            : v === 0
              ? <span className="text-zinc-300">—</span>
              : fmt(v)}
        </Cell>
      ))}
      <Cell
        flatRow={flatRow}
        col={totalCol}
        selection={selection}
        onMouseDown={onMouseDown}
        onMouseEnter={onMouseEnter}
        className={cn(
          'px-3 py-1.5 text-right tabular-nums text-sm',
          groupTotal && 'bg-zinc-50',
          isVariance
            ? varianceColor(total)
            : cn(
                bold && 'font-semibold',
                italic && 'italic',
                highlight && total !== 0 ? 'text-emerald-600' : 'text-zinc-900',
              ),
        )}
      >
        {isVariance
          ? total === 0
            ? '—'
            : fmt(total)
          : total === 0
            ? <span className="text-zinc-300">—</span>
            : fmt(total)}
      </Cell>
    </tr>
  )
}
