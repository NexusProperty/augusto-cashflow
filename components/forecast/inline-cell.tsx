'use client'

import { useState, useRef, useEffect, memo, type KeyboardEvent } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  interpretKeyEditing,
  interpretKeyNotEditing,
  type Direction,
} from './inline-cell-keys'

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
}: InlineCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
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

  const commitDraft = () => {
    const num = parseFloat(draft)
    if (!isNaN(num) && num !== value) onSave(num)
  }

  if (isComputed) {
    return (
      <td
        ref={cellRef}
        tabIndex={0}
        className={cn(
          'px-2.5 py-1.5 text-right text-sm tabular-nums outline-none',
          isNegative && 'text-red-600',
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
      <td className={cn('px-1 py-1', className)}>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            commitDraft()
            setEditing(false)
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            const result = interpretKeyEditing(e)
            if (result.type === 'saveAndMove') {
              e.preventDefault()
              commitDraft()
              setEditing(false)
              onMoveFocus?.(result.direction)
            } else if (result.type === 'cancel') {
              e.preventDefault()
              setDraft('')
              setEditing(false)
            }
          }}
          className="w-full rounded border border-indigo-500 bg-white px-2 py-1 text-right text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
      className={cn(
        'cursor-text px-2.5 py-1.5 text-right text-sm tabular-nums outline-none',
        statusBg,
        isNegative && 'text-red-600',
        value === 0 && 'text-zinc-400',
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
