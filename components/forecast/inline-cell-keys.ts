/**
 * Pure key interpreters for InlineCell. Kept in a separate .ts module (no JSX)
 * so they can be unit-tested without pulling in React / JSX parsing.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

export type InterpretNotEditingResult =
  | { type: 'enterEdit'; initialDraft?: string }
  | { type: 'move'; direction: Direction }
  | { type: 'clear' }
  | { type: 'ignore' }

export type InterpretEditingResult =
  | { type: 'saveAndMove'; direction: Direction }
  | { type: 'cancel' }
  | { type: 'ignore' }

/** Interpret a key event when the cell is NOT in edit mode. */
export function interpretKeyNotEditing(
  e: { key: string; shiftKey: boolean },
): InterpretNotEditingResult {
  const { key, shiftKey } = e

  if (key === 'Enter' || key === 'F2') {
    return { type: 'enterEdit' }
  }

  if (key === 'Tab') {
    return { type: 'move', direction: shiftKey ? 'left' : 'right' }
  }

  if (key === 'ArrowUp') return { type: 'move', direction: 'up' }
  if (key === 'ArrowDown') return { type: 'move', direction: 'down' }
  if (key === 'ArrowLeft') return { type: 'move', direction: 'left' }
  if (key === 'ArrowRight') return { type: 'move', direction: 'right' }

  if (key === 'Delete' || key === 'Backspace') {
    return { type: 'clear' }
  }

  // Excel-like: digit / - / . / = replaces content and enters edit mode.
  if (key.length === 1 && /[0-9\-.=]/.test(key)) {
    return { type: 'enterEdit', initialDraft: key }
  }

  return { type: 'ignore' }
}

/** Interpret a key event while the cell IS in edit mode (input focused). */
export function interpretKeyEditing(
  e: { key: string; shiftKey: boolean },
): InterpretEditingResult {
  const { key, shiftKey } = e

  if (key === 'Enter') {
    return { type: 'saveAndMove', direction: shiftKey ? 'up' : 'down' }
  }
  if (key === 'Tab') {
    return { type: 'saveAndMove', direction: shiftKey ? 'left' : 'right' }
  }
  if (key === 'Escape') {
    return { type: 'cancel' }
  }
  return { type: 'ignore' }
}
