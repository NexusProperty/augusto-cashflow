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
  | { ok: true; value: number; isFormula: boolean; formulaText: string | null }
  | { ok: false; error: string }

function parseInput(draft: string, currentValue?: number): ParseResult {
  const trimmed = draft.trim()
  if (!trimmed) return { ok: false, error: 'Empty' }
  if (trimmed.startsWith('=')) {
    const result = evaluateFormula(trimmed)
    if (!result.ok) {
      // If the only failure reason is missing context (cell references), allow
      // the formula to be stored anyway — the grid's cascade will evaluate it
      // with full context on the next render. Use the current cell value as
      // the amount placeholder so the display doesn't flicker to 0.
      if (result.error.includes('context') || result.error.includes('Context')) {
        return {
          ok: true,
          value: currentValue ?? 0,
          isFormula: true,
          formulaText: trimmed,
        }
      }
      return result
    }
    return { ok: true, value: result.value, isFormula: true, formulaText: trimmed }
  }
  const num = parseFloat(trimmed)
  if (isNaN(num)) return { ok: false, error: 'Not a number' }
  return { ok: true, value: num, isFormula: false, formulaText: null }
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
  /**
   * Called when the user commits an edit.
   * - `newValue` is the evaluated numeric result.
   * - `formula` is the formula text (e.g. `=SUM(W1:W4)`) when the input
   *   started with `=`; `null` when the user typed a plain number (clears
   *   any previously stored formula on the line).
   */
  onSave: (newValue: number, formula: string | null) => void
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
  /** True when this cell sits in the fill-handle preview area but NOT in the source selection. */
  isFillPreview?: boolean
  /** True when this cell is the bottom-right of the selection (renders the handle). */
  showFillHandle?: boolean
  /** Called on mousedown of the fill handle to start a fill-drag. */
  onFillStart?: (e: React.MouseEvent) => void
  /** Called on double-click of the fill handle to auto-fill downward. */
  onFillDoubleClick?: (e: React.MouseEvent) => void
  /** True when this cell is the current Find match — renders a yellow ring flash. */
  isFindHighlight?: boolean
  /** Optional note from forecast_lines.notes — renders an amber dot indicator. */
  note?: string | null
  /**
   * When set, the cell becomes position:sticky with this left offset (px).
   * Used for the freeze-columns feature. Hardcoded: 280px label + 100px per week col.
   */
  stickyLeft?: number
  /** Right-click handler — used by forecast-grid to open the split-cell modal. */
  onContextMenu?: (e: React.MouseEvent) => void
  /**
   * Optional formula stored on this cell's forecast line (e.g. `=SUM(W1:W4)`).
   * When set, an `=` indicator is rendered at the top-left of the cell, and
   * entering edit mode pre-populates the editor with the formula text.
   */
  formula?: string | null
}

function FillHandle({
  onFillStart,
  onFillDoubleClick,
}: {
  onFillStart?: (e: React.MouseEvent) => void
  onFillDoubleClick?: (e: React.MouseEvent) => void
}) {
  return (
    <span
      data-fill-handle="true"
      onMouseDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onFillStart?.(e)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onFillDoubleClick?.(e)
      }}
      className="absolute -bottom-[3px] -right-[3px] z-30 h-[7px] w-[7px] cursor-crosshair rounded-sm bg-indigo-600 ring-1 ring-white"
    />
  )
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
  isFillPreview,
  showFillHandle,
  onFillStart,
  onFillDoubleClick,
  isFindHighlight,
  note,
  stickyLeft,
  onContextMenu,
  formula,
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
    const parsed = parseInput(draft, value)
    if (!parsed.ok) {
      setInputError(parsed.error)
      return false
    }
    // Formula path: pass the formula text so the caller can persist it.
    // Plain-number path: pass null to clear any existing formula on this line.
    if (parsed.value !== value || parsed.formulaText !== (formula ?? null)) {
      onSave(parsed.value, parsed.formulaText)
    }
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
          'relative px-2.5 py-1.5 text-right text-sm tabular-nums outline-none',
          isNegative && 'text-red-600',
          inSelectionRange && !isFocused && (isAnchor ? 'bg-indigo-100' : 'bg-indigo-50'),
          isFocused && 'ring-2 ring-indigo-500',
          isFillPreview && 'outline outline-2 outline-dashed outline-indigo-400 -outline-offset-2',
          isFindHighlight && 'ring-2 ring-yellow-400',
          stickyLeft !== undefined && 'sticky z-[15]',
          className,
        )}
        style={stickyLeft !== undefined ? { left: stickyLeft } : undefined}
        onContextMenu={onContextMenu}
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
        {showFillHandle && (
          <FillHandle onFillStart={onFillStart} onFillDoubleClick={onFillDoubleClick} />
        )}
        {note && (
          <span
            title={note}
            aria-label="Has note"
            className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-white pointer-events-none"
          />
        )}
      </td>
    )
  }

  if (editing) {
    return (
      <td
        data-row={rowIdx}
        data-col={colIdx}
        className={cn('px-1 py-1', stickyLeft !== undefined && 'sticky z-[15]', className)}
        style={stickyLeft !== undefined ? { left: stickyLeft } : undefined}
      >
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

  // For frozen cells (stickyLeft defined) we need an opaque background so the
  // cell blocks scrolling content behind it. Apply bg-white as the base; status
  // colours are still applied on top via the statusBg classes.
  const statusBg = value !== 0 ? statusStyles[lineStatus ?? 'none'] : 'hover:bg-zinc-50'
  const frozenBg = stickyLeft !== undefined ? 'bg-white' : undefined

  // When the cell has a formula, open the editor showing the formula text so
  // the user can edit the expression. For plain cells, fall back to the numeric
  // string as before.
  const enterEdit = (initialDraft?: string) => {
    const initial = initialDraft ?? (formula ? formula : String(value))
    setDraft(initial)
    setEditing(true)
  }

  // Compose the title attribute: show formula and/or note, newline-separated.
  const titleParts: string[] = []
  if (formula) titleParts.push(formula)
  if (note) titleParts.push(note)
  const cellTitle = titleParts.length > 0 ? titleParts.join('\n\n') : undefined

  return (
    <td
      ref={cellRef}
      tabIndex={0}
      data-row={rowIdx}
      data-col={colIdx}
      title={cellTitle}
      className={cn(
        'relative cursor-text px-2.5 py-1.5 text-right text-sm tabular-nums outline-none',
        frozenBg,
        statusBg,
        isNegative && 'text-red-600',
        value === 0 && 'text-zinc-400',
        inSelectionRange && !isFocused && (isAnchor ? 'bg-indigo-100' : 'bg-indigo-50'),
        isFocused && 'ring-2 ring-indigo-500',
        isFillPreview && 'outline outline-2 outline-dashed outline-indigo-400 -outline-offset-2',
        isFindHighlight && 'ring-2 ring-yellow-400',
        stickyLeft !== undefined && 'sticky z-[15]',
        className,
      )}
      style={stickyLeft !== undefined ? { left: stickyLeft } : undefined}
      onContextMenu={onContextMenu}
      onClick={(e) => {
        // Modifier-clicks are for selection (grid mousedown handles them).
        if (e.ctrlKey || e.metaKey || e.shiftKey) return
        // For formula cells, open editor with the formula text (not the evaluated number).
        enterEdit(formula ?? String(value))
      }}
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
      {formula && (
        <span
          aria-label="Has formula"
          className="absolute top-0.5 left-1 text-[10px] font-mono text-indigo-500 pointer-events-none leading-none"
        >
          =
        </span>
      )}
      {showFillHandle && (
        <FillHandle onFillStart={onFillStart} onFillDoubleClick={onFillDoubleClick} />
      )}
      {note && (
        <span
          aria-label="Has note"
          className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-white pointer-events-none"
        />
      )}
    </td>
  )
})
