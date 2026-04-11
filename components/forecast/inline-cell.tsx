'use client'

import { useState, useRef } from 'react'
import { cn, formatCurrency } from '@/lib/utils'

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
}

export function InlineCell({ value, onSave, isNegative, isComputed, lineStatus, className }: InlineCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  if (isComputed) {
    return (
      <td className={cn('px-2.5 py-1.5 text-right text-sm tabular-nums', isNegative && 'text-red-600', className)}>
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
          className="w-full rounded border border-indigo-500 bg-white px-2 py-1 text-right text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          autoFocus
        />
      </td>
    )
  }

  const statusBg = value !== 0 ? statusStyles[lineStatus ?? 'none'] : 'hover:bg-zinc-50'

  return (
    <td
      className={cn(
        'cursor-text px-2.5 py-1.5 text-right text-sm tabular-nums',
        statusBg,
        isNegative && 'text-red-600',
        value === 0 && 'text-zinc-400',
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
