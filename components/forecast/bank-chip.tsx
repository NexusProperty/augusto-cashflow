'use client'

import { useEffect, useLayoutEffect, useRef, useState, useCallback, memo } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import type { BankAccount } from '@/lib/types'

// ── Abbreviated labels for MAIN_FORECAST_BANK_NAMES ──────────────────────────
const BANK_ABBREVIATIONS: Record<string, string> = {
  'Augusto Current': 'AC',
  Cornerstore: 'CS',
  'Augusto Commercial': 'AComm',
  'Dark Doris (Nets)': 'DD',
}

function abbreviate(name: string): string {
  const known = BANK_ABBREVIATIONS[name]
  if (known) return known
  const letters = name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4)
  return letters || name.slice(0, 2).toUpperCase()
}

interface BankChipProps {
  currentBankId: string | null | undefined
  banks: BankAccount[]
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
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Position the menu below the chip button, escaping any ancestor overflow.
  useLayoutEffect(() => {
    if (!open) return
    const btn = btnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, left: rect.left })
  }, [open])

  // Reposition on scroll / resize while open.
  useEffect(() => {
    if (!open) return
    const update = () => {
      const btn = btnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, left: rect.left })
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // Outside-click close — treat clicks inside the portal menu as inside.
  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
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

  const menu = open && menuPos && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="w-56 rounded-md border border-zinc-300 bg-white py-1 text-sm shadow-xl"
        >
          {banks.length === 0 && (
            <div className="px-3 py-1.5 text-zinc-500">No banks loaded</div>
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
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-zinc-900 hover:bg-indigo-50 hover:text-indigo-900 focus:bg-indigo-50 focus:text-indigo-900 focus:outline-none',
                  isCurrent && 'bg-indigo-100 font-semibold text-indigo-900',
                )}
              >
                <span className="truncate">{b.name}</span>
                {isCurrent && <span aria-hidden className="text-indigo-600">✓</span>}
              </button>
            )
          })}
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          if (!disabled) setOpen((v) => !v)
        }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={cn(
          'ml-2 inline-flex items-center rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-semibold leading-none text-zinc-700 tabular-nums',
          'hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {label}
      </button>
      {menu}
    </>
  )
})
