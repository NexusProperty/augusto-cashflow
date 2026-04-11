'use client'

import { useState, useRef } from 'react'
import { cn, formatCurrency } from '@/lib/utils'

interface InlineCellProps {
  value: number
  onSave: (newValue: number) => void
  isNegative?: boolean
  isComputed?: boolean
  className?: string
}

export function InlineCell({ value, onSave, isNegative, isComputed, className }: InlineCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  if (isComputed) {
    return (
      <td className={cn('px-2.5 py-1.5 text-right text-sm', isNegative && 'text-negative', className)}>
        {formatCurrency(value)}
      </td>
    )
  }

  if (editing) {
    return (
      <td className={cn('px-1 py-1', className)}>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const num = parseFloat(draft)
            if (!isNaN(num) && num !== value) onSave(num)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-full rounded border border-border-active bg-surface px-2 py-1 text-right text-sm text-text-primary focus:outline-none"
          autoFocus
        />
      </td>
    )
  }

  return (
    <td
      className={cn(
        'cursor-text px-2.5 py-1.5 text-right text-sm hover:bg-surface-overlay',
        isNegative && 'text-negative',
        value === 0 && 'text-text-muted',
        className,
      )}
      onClick={() => {
        setDraft(String(value))
        setEditing(true)
      }}
    >
      {value === 0 ? '—' : formatCurrency(value)}
    </td>
  )
}
