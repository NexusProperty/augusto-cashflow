/**
 * Pure helpers for Excel-compatible clipboard (TSV) interop in the forecast
 * grid. Serialises a rectangular cell selection to TSV that Excel / Google
 * Sheets paste natively, and parses TSV coming back in. Lives in a .ts module
 * so it can be unit-tested without React.
 */

export interface ClipboardCell {
  value: number | null
  rawString: string
}

/**
 * Serialise a 2D array of cells to TSV.
 *
 * - Numeric cells → raw `String(value)` (no `$`, no thousands separators).
 * - `null` cells → empty string.
 * - Rows separated by `\n` (single LF — Excel accepts LF and CRLF).
 * - Columns separated by `\t`.
 */
export function toTSV(rows: Array<Array<number | null>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (cell === null ? '' : String(cell)))
        .join('\t'),
    )
    .join('\n')
}

/**
 * Parse TSV into a 2D string grid.
 *
 * - Splits rows on `\r?\n` (so Windows CRLF clipboards work).
 * - Splits columns on `\t`.
 * - Drops a trailing all-empty row (common with Excel copies that trail a LF).
 * - Empty input → `[]`.
 * - No trimming of individual cell contents.
 */
export function parseTSV(input: string): string[][] {
  if (input === '') return []
  const lines = input.split(/\r?\n/)
  const rows = lines.map((line) => line.split('\t'))
  // Drop trailing all-empty row (e.g. trailing newline from Excel).
  if (rows.length > 0) {
    const last = rows[rows.length - 1]!
    if (last.length === 1 && last[0] === '') {
      rows.pop()
    } else if (last.every((c) => c === '')) {
      rows.pop()
    }
  }
  return rows
}

/**
 * Best-effort numeric parse for a clipboard cell string.
 *
 * - Strips `$`, `,`, and whitespace.
 * - `(1,234)` → `-1234` (accounting-style negatives).
 * - Empty / non-numeric → `null`.
 * - `"0"` → `0` (NOT null).
 */
export function parseClipboardNumber(s: string): number | null {
  if (typeof s !== 'string') return null
  let t = s.trim()
  if (t === '') return null

  // Detect accounting-style negative wrapped in parentheses.
  let negative = false
  if (t.startsWith('(') && t.endsWith(')')) {
    negative = true
    t = t.slice(1, -1)
  }

  // Strip currency, thousands separators, whitespace.
  t = t.replace(/[\s$,]/g, '')

  if (t === '') return null

  // Forbid anything that isn't a valid numeric literal (optional leading
  // sign, digits, optional decimal part, optional exponent). This rejects
  // hex (0x...), plain letters, etc. — Number('0x10') would otherwise succeed.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null

  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}
