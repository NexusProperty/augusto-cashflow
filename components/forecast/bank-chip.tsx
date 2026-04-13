'use client'

import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { cn } from '@/lib/utils'
import type { BankAccount } from '@/lib/types'

// ── Abbreviated labels for MAIN_FORECAST_BANK_NAMES ──────────────────────────
// Kept local to the chip since it's a pure display concern. If more banks are
// added to MAIN_FORECAST_BANK_NAMES and an abbreviation is missing, we fall
// back to the first two uppercase letters of each word in the name.
const BANK_ABBREVIATIONS: Record<string, string> = {
  'Augusto Current': 'AC',
  Cornerstore: 'CS',
  'Augusto Commercial': 'AComm',
  'Dark Doris (Nets)': 'DD',
}

function abbreviate(name: string): string {
  const known = BANK_ABBREVIATIONS[name]
  if (known) return known
  // Fallback: first letter of each whitespace-separated word, up to 4 chars.
  const letters = name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)
  return letters || name.slice(0, 2).toUpperCase()
}

interface BankChipProps {
  /** Current bank id on the row's lines (may be null/undefined for unrouted). */
  currentBankId: string | null | undefined
  /** Main banks ordered by MAIN_FORECAST_BANK_NAMES. */
  banks: BankAccount[]
  /** Called with the chosen bank id when the user picks a menu item. */
  onPick: (bankAccountId: string) => void
  disabled?: boolean
}

export const BankChip = memo(function BankChip({
  currentBankId,
  banks,
  onPick,
  disabled,
}: BankChipProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Outside-click close — mirrors useSummaryExport.
  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      const el = containerRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  const close = useCallback(() => {
    setOpen(false)
    btnRef.current?.focus()
  }, [])

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
      if (!items || items.length === 0) return
      const active = document.activeElement as HTMLElement | null
      let idx = -1
      items.forEach((el, i) => { if (el === active) idx = i })
      const next = e.key === 'ArrowDown'
        ? (idx + 1) % items.length
        : (idx - 1 + items.length) % items.length
      items[next]?.focus()
    }
  }

  const current = banks.find((b) => b.id === currentBankId)
  const label = current ? abbreviate(current.name) : '—'
  const title = current ? `Bank: ${current.name}` : 'Unassigned bank — click to set'

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          // Prevent clicks from bubbling into the row-label rename trigger.
          e.stopPropagation()
          if (!disabled) setOpen((v) => !v)
        }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={cn(
          'ml-2 inline-flex items-center rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium leading-none text-zinc-600 tabular-nums',
          'hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-indigo-300',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {label}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-30 mt-1 w-56 rounded border border-zinc-200 bg-white py-1 text-xs shadow-lg"
        >
          {banks.length === 0 && (
            <div className="px-3 py-1.5 text-zinc-400">No banks loaded</div>
          )}
          {banks.map((b) => {
            const isCurrent = b.id === currentBankId
            return (
              <button
                key={b.id}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation()
                  if (!isCurrent) onPick(b.id)
                  close()
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none',
                  isCurrent && 'font-semibold text-indigo-700',
                )}
              >
                <span className="truncate">{b.name}</span>
                {isCurrent && <span aria-hidden>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})
