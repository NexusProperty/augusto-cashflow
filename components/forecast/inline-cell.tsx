'use client'

import { useState, useRef, useEffect, memo, type KeyboardEvent } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  interpretKeyEditing,
  interpretKeyNotEditing,
  type Direction,
} from './inline-cell-keys'
import { evaluateFormula } from '@/lib/forecast/formula'

type ParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

function parseInput(draft: string): ParseResult {
  const trimmed = draft.trim()
  if (!trimmed) return { ok: false, error: 'Empty' }
  if (trimmed.startsWith('=')) return evaluateFormula(trimmed)
  const num = parseFloat(trimmed)
  if (isNaN(num)) return { ok: false, error: 'Not a number' }
  return { ok: true, value: num }
}

export { interpretKeyEditing, interpretKeyNotEditing } from './inline-cell-keys'
export type {
  Direction,
  InterpretEditingResult,
  InterpretNotEditingResult,
} from './inline-cell-keys'

type LineStatus = 'none' | 'confirmed' | 'tbc' | 'awaiting_payment' | 'paid' | 'remittance_received' | 'speculative' | 'awaiting_budget_approval'

const statusStyles: Record<LineStatus, string> = {
  none: 'hover:bg-zinc-50',
  confirmed: 'bg-emerald-50 hover:bg-emerald-100',
  tbc: 'bg-sky-50 hover:bg-sky-100',
  awaiting_payment: 'bg-violet-50 hover:bg-violet-100',
  paid: 'bg-green-100 hover:bg-green-200',
  remittance_received: 'bg-teal-50 hover:bg-teal-100',
  speculative: 'bg-rose-50 hover:bg-rose-100',
  awaiting_budget_approval: 'bg-orange-50 hover:bg-orange-100',
}

interface InlineCellProps {
  value: number
  onSave: (newValue: number) => void
  isNegative?: boolean
  isComputed?: boolean
  lineStatus?: LineStatus
  className?: string
  onMoveFocus?: (direction: Direction) => void
  onClear?: () => void
  isFocused?: boolean
  /** Row index in `flatRows` — emitted as `data-row` for selection tracking. */
  rowIdx?: number
  /** Col index in `periods` — emitted as `data-col` for selection tracking. */
  colIdx?: number
  /** True when this cell is part of the current multi-cell selection range. */
  inSelectionRange?: boolean
  /** True when this cell is the selection anchor (first clicked / origin). */
  isAnchor?: boolean
}

export const InlineCell = memo(function InlineCell({
  value,
  onSave,
  isNegative,
  isComputed,
  lineStatus,
  className,
  onMoveFocus,
  onClear,
  isFocused,
  rowIdx,
  colIdx,
  inSelectionRange,
  isAnchor,
}: InlineCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cellRef = useRef<HTMLTableCellElement>(null)

  // Auto-focus the cell when parent marks it focused (and we're not editing).
  useEffect(() => {
    if (isFocused && !editing && cellRef.current) {
      // Avoid stealing focus from the input when editing.
      if (document.activeElement !== cellRef.current) {
        cellRef.current.focus()
      }
    }
  }, [isFocused, editing])

  // Clear transient error ring after ~2s
  useEffect(() => {
    if (!inputError) return
    const t = setTimeout(() => setInputError(null), 2000)
    return () => clearTimeout(t)
  }, [inputError])

  // Returns true on successful save (or no-op), false on parse error (stay editing).
  const commitDraft = (): boolean => {
    const parsed = parseInput(draft)
    if (!parsed.ok) {
      setInputError(parsed.error)
      return false
    }
    if (parsed.value !== value) onSave(parsed.value)
    return true
  }

  if (isComputed) {
    return (
      <td
        ref={cellRef}
        tabIndex={0}
        data-row={rowIdx}
        data-col={colIdx}
        className={cn(
          'px-2.5 py-1.5 text-right text-sm tabular-nums outline-none',
          isNegative && 'text-red-600',
          inSelectionRange && !isFocused && (isAnchor ? 'bg-indigo-100' : 'bg-indigo-50'),
          isFocused && 'ring-2 ring-indigo-500',
          className,
        )}
        onKeyDown={(e) => {
          // Read-only cells still support navigation.
          const result = interpretKeyNotEditing(e)
          if (result.type === 'move') {
            e.preventDefault()
            onMoveFocus?.(result.direction)
          }
        }}
      >
        {formatCurrency(value)}
      </td>
    )
  }

  if (editing) {
    return (
      <td data-row={rowIdx} data-col={colIdx} className={cn('px-1 py-1', className)}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          title={inputError ?? undefined}
          onChange={(e) => {
            setDraft(e.target.value)
            if (inputError) setInputError(null)
          }}
          onBlur={() => {
            // On blur, attempt commit. If parse fails, swallow silently and exit
            // edit mode (blur is ambiguous — user may have clicked elsewhere).
            commitDraft()
            setEditing(false)
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            const result = interpretKeyEditing(e)
            if (result.type === 'saveAndMove') {
              e.preventDefault()
              const ok = commitDraft()
              if (!ok) return // stay in edit mode so user can fix
              setEditing(false)
              onMoveFocus?.(result.direction)
            } else if (result.type === 'cancel') {
              e.preventDefault()
              setDraft('')
              setInputError(null)
              setEditing(false)
            }
          }}
          className={cn(
            'w-full rounded border bg-white px-2 py-1 text-right text-sm text-zinc-900 shadow-sm focus:outline-none',
            inputError
              ? 'border-red-500 ring-2 ring-red-500 focus:ring-red-500'
              : 'border-indigo-500 focus:ring-1 focus:ring-indigo-500',
          )}
          autoFocus
        />
      </td>
    )
  }

  const statusBg = value !== 0 ? statusStyles[lineStatus ?? 'none'] : 'hover:bg-zinc-50'

  const enterEdit = (initialDraft?: string) => {
    setDraft(initialDraft ?? String(value))
    setEditing(true)
  }

  return (
    <td
      ref={cellRef}
      tabIndex={0}
      data-row={rowIdx}
      data-col={colIdx}
      className={cn(
        'cursor-text px-2.5 py-1.5 text-right text-sm tabular-nums outline-none',
        statusBg,
        isNegative && 'text-red-600',
        value === 0 && 'text-zinc-400',
        inSelectionRange && !isFocused && (isAnchor ? 'bg-indigo-100' : 'bg-indigo-50'),
        isFocused && 'ring-2 ring-indigo-500',
        className,
      )}
      onClick={() => enterEdit(String(value))}
      onKeyDown={(e) => {
        const result = interpretKeyNotEditing(e)
        switch (result.type) {
          case 'enterEdit':
            e.preventDefault()
            enterEdit(result.initialDraft)
            break
          case 'move':
            e.preventDefault()
            onMoveFocus?.(result.direction)
            break
          case 'clear':
            if (onClear) {
              e.preventDefault()
              onClear()
            }
            break
          case 'ignore':
          default:
            // Let the event bubble/default.
            break
        }
      }}
    >
      {value === 0 ? '—' : formatCurrency(value)}
    </td>
  )
})
