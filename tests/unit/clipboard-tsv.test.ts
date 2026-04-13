import { describe, it, expect } from 'vitest'
import { toTSV, parseTSV, parseClipboardNumber } from '@/lib/forecast/clipboard'

describe('toTSV', () => {
  it('serialises a single cell', () => {
    expect(toTSV([[100]])).toBe('100')
  })

  it('serialises a single row', () => {
    expect(toTSV([[1, 2, 3]])).toBe('1\t2\t3')
  })

  it('serialises a 2x2 grid', () => {
    expect(toTSV([[1, 2], [3, 4]])).toBe('1\t2\n3\t4')
  })

  it('represents null as empty string', () => {
    expect(toTSV([[1, null, 3]])).toBe('1\t\t3')
  })

  it('preserves negative numbers as raw', () => {
    expect(toTSV([[-100, -1.5]])).toBe('-100\t-1.5')
  })

  it('does NOT add $ or commas', () => {
    // 1234567 must come out as "1234567", not "$1,234,567".
    expect(toTSV([[1234567]])).toBe('1234567')
  })

  it('serialises decimals as raw', () => {
    expect(toTSV([[1234.56]])).toBe('1234.56')
  })
})

describe('parseTSV', () => {
  it('parses a single row', () => {
    expect(parseTSV('1\t2\t3')).toEqual([['1', '2', '3']])
  })

  it('parses multiple rows with LF', () => {
    expect(parseTSV('1\t2\n3\t4')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('accepts Windows CRLF line endings', () => {
    expect(parseTSV('1\t2\r\n3\t4')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('drops trailing empty row from a trailing newline', () => {
    expect(parseTSV('1\t2\n3\t4\n')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('drops trailing all-empty row with multiple columns', () => {
    expect(parseTSV('1\t2\n\t')).toEqual([['1', '2']])
  })

  it('returns [] for empty string', () => {
    expect(parseTSV('')).toEqual([])
  })

  it('preserves interior empty cells', () => {
    expect(parseTSV('1\t\t3')).toEqual([['1', '', '3']])
  })
})

describe('parseClipboardNumber', () => {
  it('parses a plain integer', () => {
    expect(parseClipboardNumber('100')).toBe(100)
  })

  it('parses zero (not null)', () => {
    expect(parseClipboardNumber('0')).toBe(0)
  })

  it('parses a negative integer', () => {
    expect(parseClipboardNumber('-50')).toBe(-50)
  })

  it('strips dollar sign, commas, and decimal', () => {
    expect(parseClipboardNumber('$1,234.56')).toBe(1234.56)
  })

  it('parses thousands-separated integer', () => {
    expect(parseClipboardNumber('1,000')).toBe(1000)
  })

  it('parses accounting-style negative', () => {
    expect(parseClipboardNumber('(500)')).toBe(-500)
  })

  it('parses accounting-style negative with commas and decimal', () => {
    expect(parseClipboardNumber('(1,234.00)')).toBe(-1234)
  })

  it('trims surrounding whitespace', () => {
    expect(parseClipboardNumber(' 42 ')).toBe(42)
  })

  it('returns null for empty string', () => {
    expect(parseClipboardNumber('')).toBe(null)
  })

  it('returns null for whitespace-only string', () => {
    expect(parseClipboardNumber('   ')).toBe(null)
  })

  it('returns null for non-numeric text', () => {
    expect(parseClipboardNumber('abc')).toBe(null)
  })

  it('returns null for partially-numeric text', () => {
    expect(parseClipboardNumber('42abc')).toBe(null)
  })

  it('returns null for hex-looking input', () => {
    // Number('0x10') would parse as 16; we should reject it.
    expect(parseClipboardNumber('0x10')).toBe(null)
  })
})

describe('round-trip (toTSV → parseTSV → parseClipboardNumber)', () => {
  it('preserves numbers and nulls across a round-trip', () => {
    const src: Array<Array<number | null>> = [
      [1, null, 3],
      [4, 5, 6],
    ]
    const tsv = toTSV(src)
    const parsed = parseTSV(tsv)
    expect(parsed).toEqual([
      ['1', '', '3'],
      ['4', '5', '6'],
    ])
    const numeric = parsed.map((row) => row.map((s) => parseClipboardNumber(s)))
    expect(numeric).toEqual([
      [1, null, 3],
      [4, 5, 6],
    ])
  })

  it('preserves negatives, decimals, and zero across round-trip', () => {
    const src: Array<Array<number | null>> = [[-100, 0, 1234.56]]
    const tsv = toTSV(src)
    const parsed = parseTSV(tsv)
    const numeric = parsed.map((row) => row.map((s) => parseClipboardNumber(s)))
    expect(numeric).toEqual([[-100, 0, 1234.56]])
  })
})

describe('parseTSV size caps', () => {
  it('caps rows at MAX_TSV_ROWS (500)', () => {
    const huge = Array.from({ length: 5000 }, (_, i) => `${i}`).join('\n')
    const parsed = parseTSV(huge)
    expect(parsed.length).toBeLessThanOrEqual(500)
  })

  it('caps columns at MAX_TSV_COLS (100) per row', () => {
    const row = Array.from({ length: 1000 }, (_, i) => `${i}`).join('\t')
    const parsed = parseTSV(row)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.length).toBeLessThanOrEqual(100)
  })

  it('does not crash on very large input', () => {
    const megaRow = Array.from({ length: 10000 }, () => 'x').join('\t')
    const mega = Array.from({ length: 2000 }, () => megaRow).join('\n')
    expect(() => parseTSV(mega)).not.toThrow()
  })
})
