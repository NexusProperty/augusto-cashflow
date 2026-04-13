import { describe, it, expect } from 'vitest'
import { interpretKeyEditing, interpretKeyNotEditing } from '@/components/forecast/inline-cell-keys'

const k = (key: string, shiftKey = false) => ({ key, shiftKey })

describe('interpretKeyEditing', () => {
  it('Enter → saveAndMove down', () => {
    expect(interpretKeyEditing(k('Enter'))).toEqual({ type: 'saveAndMove', direction: 'down' })
  })

  it('Shift+Enter → saveAndMove up', () => {
    expect(interpretKeyEditing(k('Enter', true))).toEqual({ type: 'saveAndMove', direction: 'up' })
  })

  it('Tab → saveAndMove right', () => {
    expect(interpretKeyEditing(k('Tab'))).toEqual({ type: 'saveAndMove', direction: 'right' })
  })

  it('Shift+Tab → saveAndMove left', () => {
    expect(interpretKeyEditing(k('Tab', true))).toEqual({ type: 'saveAndMove', direction: 'left' })
  })

  it('Escape → cancel', () => {
    expect(interpretKeyEditing(k('Escape'))).toEqual({ type: 'cancel' })
  })

  it('regular character → ignore (input handles it)', () => {
    expect(interpretKeyEditing(k('5'))).toEqual({ type: 'ignore' })
    expect(interpretKeyEditing(k('a'))).toEqual({ type: 'ignore' })
    expect(interpretKeyEditing(k('.'))).toEqual({ type: 'ignore' })
  })

  it('ArrowUp while editing → ignore (cursor movement in input)', () => {
    expect(interpretKeyEditing(k('ArrowUp'))).toEqual({ type: 'ignore' })
    expect(interpretKeyEditing(k('ArrowLeft'))).toEqual({ type: 'ignore' })
  })
})

describe('interpretKeyNotEditing', () => {
  it('Enter → enterEdit (no initial draft)', () => {
    expect(interpretKeyNotEditing(k('Enter'))).toEqual({ type: 'enterEdit' })
  })

  it('F2 → enterEdit', () => {
    expect(interpretKeyNotEditing(k('F2'))).toEqual({ type: 'enterEdit' })
  })

  it('digit 5 → enterEdit with initialDraft "5"', () => {
    expect(interpretKeyNotEditing(k('5'))).toEqual({ type: 'enterEdit', initialDraft: '5' })
  })

  it('digit 0 → enterEdit with initialDraft "0"', () => {
    expect(interpretKeyNotEditing(k('0'))).toEqual({ type: 'enterEdit', initialDraft: '0' })
  })

  it('"-" → enterEdit with initialDraft "-"', () => {
    expect(interpretKeyNotEditing(k('-'))).toEqual({ type: 'enterEdit', initialDraft: '-' })
  })

  it('"." → enterEdit with initialDraft "."', () => {
    expect(interpretKeyNotEditing(k('.'))).toEqual({ type: 'enterEdit', initialDraft: '.' })
  })

  it('"=" → enterEdit with initialDraft "=" (formula prefix)', () => {
    expect(interpretKeyNotEditing(k('='))).toEqual({ type: 'enterEdit', initialDraft: '=' })
  })

  it('ArrowUp → move up', () => {
    expect(interpretKeyNotEditing(k('ArrowUp'))).toEqual({ type: 'move', direction: 'up' })
  })

  it('ArrowDown → move down', () => {
    expect(interpretKeyNotEditing(k('ArrowDown'))).toEqual({ type: 'move', direction: 'down' })
  })

  it('ArrowLeft → move left', () => {
    expect(interpretKeyNotEditing(k('ArrowLeft'))).toEqual({ type: 'move', direction: 'left' })
  })

  it('ArrowRight → move right', () => {
    expect(interpretKeyNotEditing(k('ArrowRight'))).toEqual({ type: 'move', direction: 'right' })
  })

  it('Tab → move right', () => {
    expect(interpretKeyNotEditing(k('Tab'))).toEqual({ type: 'move', direction: 'right' })
  })

  it('Shift+Tab → move left', () => {
    expect(interpretKeyNotEditing(k('Tab', true))).toEqual({ type: 'move', direction: 'left' })
  })

  it('Delete → clear', () => {
    expect(interpretKeyNotEditing(k('Delete'))).toEqual({ type: 'clear' })
  })

  it('Backspace → clear', () => {
    expect(interpretKeyNotEditing(k('Backspace'))).toEqual({ type: 'clear' })
  })

  it('letter "a" → ignore (does not open edit)', () => {
    expect(interpretKeyNotEditing(k('a'))).toEqual({ type: 'ignore' })
  })

  it('letter "Z" → ignore', () => {
    expect(interpretKeyNotEditing(k('Z'))).toEqual({ type: 'ignore' })
  })

  it('Shift (modifier alone) → ignore', () => {
    expect(interpretKeyNotEditing(k('Shift', true))).toEqual({ type: 'ignore' })
  })
})
