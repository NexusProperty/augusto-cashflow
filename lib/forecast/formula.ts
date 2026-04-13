/**
 * Arithmetic + cell-reference formula parser for cash-flow forecast overrides.
 *
 * Supports:
 *   - Arithmetic: + - * / parentheses, numeric literals (ints + decimals), unary minus/plus.
 *   - Column refs: W<n>  (1-based period index, e.g. W1 = periods[0])
 *   - Row-prefixed refs: @<label>:W<n>  (cell on the named row)
 *   - Ranges: W<a>:W<b>  or  @<label>:W<a>:W<b>
 *   - Functions: SUM AVG MAX MIN IF  (case-insensitive)
 *   - Comparison operators: > < >= <= == !=  (for IF conditions)
 *
 * Does NOT use eval() or Function(). Pure recursive-descent.
 *
 * Back-compat: plain arithmetic (e.g. =1500*4) still works with no context.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type FormulaResult =
  | { ok: true; value: number }
  | { ok: false; error: string }

import type { FlatRow } from '@/lib/forecast/flat-rows'

export interface EvalContext {
  /** The row this formula belongs to — used for un-prefixed W<n> refs. */
  currentRow: FlatRow & { kind: 'item' }
  /** All rows in the grid, for @label lookups. */
  flatRows: FlatRow[]
  /** Ordered list of period objects — index 0 = W1. */
  periods: Array<{ id: string }>
  /** Cell-value getter: (itemKey, periodId) → amount (0 if missing). */
  getAmount: (itemKey: string, periodId: string) => number
}

// ─────────────────────────────────────────────────────────────────────────────
// Token types
// ─────────────────────────────────────────────────────────────────────────────

type TokenType =
  | 'NUMBER'
  | '+'
  | '-'
  | '*'
  | '/'
  | '('
  | ')'
  | ','
  | ':'
  | '>='
  | '<='
  | '=='
  | '!='
  | '>'
  | '<'
  | 'WCOL'     // W<n> column reference — value = 1-based index
  | 'ATREF'    // @<label> row identifier — raw = the label string
  | 'FUNCNAME' // known function name — raw = normalised uppercase name
  | 'EOF'

interface Token {
  type: TokenType
  /** Numeric value for NUMBER and WCOL tokens. */
  value?: number
  /** String payload for ATREF and FUNCNAME tokens. */
  raw?: string
  pos: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokeniser
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_FUNCTIONS = new Set(['SUM', 'AVG', 'MAX', 'MIN', 'IF'])

function tokenise(input: string): Token[] | { error: string } {
  const tokens: Token[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    const ch = input[i]!

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // Two-character comparison operators (must check before single-char)
    if (i + 1 < n) {
      const two = input.slice(i, i + 2)
      if (two === '>=' || two === '<=' || two === '==' || two === '!=') {
        tokens.push({ type: two as TokenType, pos: i })
        i += 2
        continue
      }
    }

    // Single-character operators / punctuation
    if (
      ch === '+' || ch === '-' || ch === '*' || ch === '/' ||
      ch === '(' || ch === ')' || ch === ',' || ch === ':'
    ) {
      tokens.push({ type: ch as TokenType, pos: i })
      i++
      continue
    }

    if (ch === '>' || ch === '<') {
      tokens.push({ type: ch as TokenType, pos: i })
      i++
      continue
    }

    // Numbers: digits with optional single decimal point
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      const start = i
      let sawDot = ch === '.'
      let sawDigit = ch >= '0' && ch <= '9'
      i++
      while (i < n) {
        const c = input[i]!
        if (c >= '0' && c <= '9') {
          sawDigit = true
          i++
        } else if (c === '.' && !sawDot) {
          sawDot = true
          i++
        } else {
          break
        }
      }
      if (!sawDigit) {
        return { error: `Invalid number at position ${start}` }
      }
      const raw = input.slice(start, i)
      const num = Number(raw)
      if (!Number.isFinite(num)) {
        return { error: `Invalid number "${raw}"` }
      }
      tokens.push({ type: 'NUMBER', value: num, pos: start })
      continue
    }

    // W<n> — column reference, e.g. W1, W18
    if ((ch === 'W' || ch === 'w') && i + 1 < n && input[i + 1]! >= '0' && input[i + 1]! <= '9') {
      const start = i
      i++ // skip 'W'
      let numStr = ''
      while (i < n && input[i]! >= '0' && input[i]! <= '9') {
        numStr += input[i]!
        i++
      }
      const col = parseInt(numStr, 10)
      if (col < 1) return { error: `Column reference W${col} must be ≥ 1 at position ${start}` }
      tokens.push({ type: 'WCOL', value: col, pos: start })
      continue
    }

    // @ row reference: @<label> where label = [A-Za-z0-9 _-]+
    if (ch === '@') {
      const start = i
      i++ // skip '@'
      let label = ''
      while (i < n) {
        const c = input[i]!
        if (
          (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
          (c >= '0' && c <= '9') || c === ' ' || c === '_' || c === '-'
        ) {
          label += c
          i++
        } else {
          break
        }
      }
      label = label.trim()
      if (!label) return { error: `Empty row label after '@' at position ${start}` }
      tokens.push({ type: 'ATREF', raw: label, pos: start })
      continue
    }

    // Identifiers: function names or unknown tokens
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      const start = i
      let ident = ''
      while (i < n) {
        const c = input[i]!
        if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '_') {
          ident += c
          i++
        } else {
          break
        }
      }
      const upper = ident.toUpperCase()
      if (!KNOWN_FUNCTIONS.has(upper)) {
        return { error: `Unknown identifier "${ident}" at position ${start}. Only SUM, AVG, MAX, MIN, IF are allowed.` }
      }
      tokens.push({ type: 'FUNCNAME', raw: upper, pos: start })
      continue
    }

    // Unknown character
    return { error: `Unexpected character "${ch}" at position ${i}` }
  }

  tokens.push({ type: 'EOF', pos: n })
  return tokens
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser + Evaluator
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DEPTH = 50

class FormulaError extends Error {}

class Parser {
  private pos = 0
  private depth = 0

  constructor(
    private tokens: Token[],
    private ctx: EvalContext | null,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos]!
  }

  private consume(): Token {
    return this.tokens[this.pos++]!
  }

  private expect(type: TokenType): Token {
    const tok = this.peek()
    if (tok.type !== type) {
      throw new FormulaError(`Expected '${type}' but got '${tok.type}' at position ${tok.pos}`)
    }
    return this.consume()
  }

  // ── Grammar entry point ───────────────────────────────────────────────────

  // expression := comparison
  parseExpr(): number {
    return this.parseComparison()
  }

  // comparison := addsub (('>=' | '<=' | '==' | '!=' | '>' | '<') addsub)?
  private parseComparison(): number {
    let left = this.parseAddSub()
    const op = this.peek().type
    if (op === '>=' || op === '<=' || op === '==' || op === '!=' || op === '>' || op === '<') {
      this.consume()
      const right = this.parseAddSub()
      switch (op) {
        case '>':  return left > right  ? 1 : 0
        case '<':  return left < right  ? 1 : 0
        case '>=': return left >= right ? 1 : 0
        case '<=': return left <= right ? 1 : 0
        case '==': return left === right ? 1 : 0
        case '!=': return left !== right ? 1 : 0
      }
    }
    return left
  }

  // addsub := muldiv (('+' | '-') muldiv)*
  private parseAddSub(): number {
    let left = this.parseMulDiv()
    while (this.peek().type === '+' || this.peek().type === '-') {
      const op = this.consume().type
      const right = this.parseMulDiv()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  // muldiv := unary (('*' | '/') unary)*
  private parseMulDiv(): number {
    let left = this.parseUnary()
    while (this.peek().type === '*' || this.peek().type === '/') {
      const op = this.consume().type
      const right = this.parseUnary()
      if (op === '*') {
        left = left * right
      } else {
        if (right === 0) throw new FormulaError('Division by zero')
        left = left / right
      }
    }
    return left
  }

  // unary := '-'? primary
  private parseUnary(): number {
    this.depth++
    if (this.depth > MAX_DEPTH) throw new FormulaError('Expression too deeply nested')
    try {
      if (this.peek().type === '-') {
        this.consume()
        return -this.parseUnary()
      }
      if (this.peek().type === '+') {
        this.consume()
        return this.parseUnary()
      }
      return this.parsePrimary()
    } finally {
      this.depth--
    }
  }

  // primary := number | funcCall | cellExpr | '(' expr ')'
  private parsePrimary(): number {
    const tok = this.peek()

    if (tok.type === 'NUMBER') {
      this.consume()
      return tok.value!
    }

    if (tok.type === '(') {
      this.consume()
      const value = this.parseExpr()
      this.expect(')')
      return value
    }

    if (tok.type === 'FUNCNAME') {
      return this.parseFuncCall()
    }

    // Cell / range references (W<n> or @label:W<n>)
    if (tok.type === 'WCOL' || tok.type === 'ATREF') {
      return this.parseCellExpr(false)
    }

    if (tok.type === 'EOF') throw new FormulaError('Unexpected end of input')
    throw new FormulaError(`Unexpected token "${tok.type}" at position ${tok.pos}`)
  }

  /**
   * Parse a cell reference or range that may appear as a primary value.
   * Returns the numeric value of the resolved cell (or errors for ranges
   * unless they appear inside a function — controlled by `inFuncArg`).
   *
   * Syntax:
   *   W<n>                   → current-row, period n-1
   *   W<a>:W<b>              → range on current row (only valid in func arg)
   *   @label:W<n>            → named-row, period n-1
   *   @label:W<a>:W<b>       → named-row range (only valid in func arg)
   *
   * When `inFuncArg` is true, ranges are returned as their sum (aggregated
   * externally), but the parser itself needs to handle the range tokens here.
   * Instead, we expose a `parseCellRef` that returns the resolved numeric
   * values as an array and the caller flattens them.
   */
  private parseCellExpr(inFuncArg: boolean): number {
    const vals = this.parseCellRefValues(inFuncArg)
    if (vals.length === 1) return vals[0]!
    // Range outside a function context — error
    throw new FormulaError('Range references (e.g. W1:W4) must be used inside a function like SUM()')
  }

  /**
   * Returns an array of cell values. For single cell refs, length=1.
   * For ranges, length = number of periods in the range.
   * Cross-row ranges are rejected.
   */
  parseCellRefValues(inFuncArg: boolean): number[] {
    const ctx = this.requireContext()

    // @label prefix?
    let rowItemKey: string | null = null
    let atLabel: string | null = null

    if (this.peek().type === 'ATREF') {
      const atTok = this.consume()
      atLabel = atTok.raw!
      this.expect(':')
      // After @label: we must see a W<n>
      if (this.peek().type !== 'WCOL') {
        throw new FormulaError(`Expected W<n> after @${atLabel}: but got '${this.peek().type}'`)
      }
      rowItemKey = this.resolveRowByLabel(atLabel)
    }

    // Now consume W<a>
    const waTok = this.expect('WCOL')
    const colA = waTok.value!
    this.validateColIndex(colA, ctx)

    // Is this a range? Look ahead for ':'
    if (this.peek().type === ':') {
      // Peek further — is it W<b>?
      const savedPos = this.pos
      this.consume() // consume ':'
      if (this.peek().type !== 'WCOL') {
        // Not a range — restore and treat as single cell + trailing colon
        // (let the caller deal with the colon — it's likely a syntax error)
        this.pos = savedPos
        return [this.resolveSingleCell(ctx, rowItemKey, colA)]
      }
      const wbTok = this.consume()
      const colB = wbTok.value!
      this.validateColIndex(colB, ctx)

      if (colB < colA) {
        throw new FormulaError(`Range W${colA}:W${colB} has end before start`)
      }

      // Check for a CROSS-ROW range: @label:W<a>:W<b> is fine,
      // but W<a>:@other:W<b> is a parse error.
      // After consuming W<b>, if the NEXT token is ':' that implies
      // someone wrote W<a>:W<b>:something — reject.
      if (this.peek().type === ':') {
        throw new FormulaError('Cross-row ranges are not supported')
      }

      const effectiveRowKey = rowItemKey ?? ctx.currentRow.itemKey
      const values: number[] = []
      for (let c = colA; c <= colB; c++) {
        const pid = ctx.periods[c - 1]?.id
        if (!pid) throw new FormulaError(`Period index W${c} is out of range`)
        values.push(ctx.getAmount(effectiveRowKey, pid))
      }
      return values
    }

    return [this.resolveSingleCell(ctx, rowItemKey, colA)]
  }

  private resolveSingleCell(ctx: EvalContext, rowItemKey: string | null, col: number): number {
    const pid = ctx.periods[col - 1]?.id
    if (!pid) throw new FormulaError(`Period index W${col} is out of range`)
    const key = rowItemKey ?? ctx.currentRow.itemKey
    return ctx.getAmount(key, pid)
  }

  private validateColIndex(col: number, ctx: EvalContext): void {
    if (col < 1 || col > ctx.periods.length) {
      throw new FormulaError(`Column W${col} is out of range (1–${ctx.periods.length})`)
    }
  }

  private resolveRowByLabel(label: string): string {
    const ctx = this.requireContext()
    const lower = label.toLowerCase()
    for (const row of ctx.flatRows) {
      if (row.kind !== 'item') continue
      // The itemKey is `${categoryId}::${label}` — the label part is counterparty ?? notes ?? 'Line item'
      // We match the row whose display label (counterparty) matches case-insensitively.
      // Extract the display label from itemKey: everything after the last '::'
      const parts = row.itemKey.split('::')
      const rowLabel = parts.slice(1).join('::').trim().toLowerCase()
      if (rowLabel === lower) return row.itemKey
    }
    throw new FormulaError(`Unknown row: ${label}`)
  }

  // ── Function calls ────────────────────────────────────────────────────────

  private parseFuncCall(): number {
    const funcTok = this.consume() // FUNCNAME
    const name = funcTok.raw!
    this.expect('(')

    if (name === 'IF') {
      return this.parseIf()
    }

    // Aggregate function: collect all numeric values from args (including ranges)
    const values = this.parseAggArgs()
    this.expect(')')

    if (values.length === 0) {
      throw new FormulaError(`${name}() requires at least one argument`)
    }

    switch (name) {
      case 'SUM': return values.reduce((a, b) => a + b, 0)
      case 'AVG': return values.reduce((a, b) => a + b, 0) / values.length
      case 'MAX': return Math.max(...values)
      case 'MIN': return Math.min(...values)
      default: throw new FormulaError(`Unknown function ${name}`)
    }
  }

  /** Parse IF(cond, then, else) — exactly 3 comma-separated expressions. */
  private parseIf(): number {
    const cond = this.parseExpr()
    this.expect(',')
    const thenVal = this.parseExpr()
    this.expect(',')
    const elseVal = this.parseExpr()
    this.expect(')')
    return cond !== 0 ? thenVal : elseVal
  }

  /**
   * Parse a comma-separated argument list for aggregate functions.
   * Each argument may be a range (expands to multiple values) or a single expr.
   * Returns the flat array of all numeric values.
   */
  private parseAggArgs(): number[] {
    const all: number[] = []

    if (this.peek().type === ')') return all // empty arg list

    // First arg
    all.push(...this.parseAggArg())

    while (this.peek().type === ',') {
      this.consume() // consume ','
      if (this.peek().type === ')') break // trailing comma — tolerate
      all.push(...this.parseAggArg())
    }

    return all
  }

  /**
   * Parse a single argument — returns multiple numbers if it's a range.
   */
  private parseAggArg(): number[] {
    const tok = this.peek()
    if (tok.type === 'WCOL' || tok.type === 'ATREF') {
      // Could be a cell ref or a range
      return this.parseCellRefValues(true)
    }
    // Otherwise a plain expression (can't be a range)
    return [this.parseExpr()]
  }

  private requireContext(): EvalContext {
    if (!this.ctx) {
      throw new FormulaError(
        'Cell references require an evaluation context (provide EvalContext)',
      )
    }
    return this.ctx
  }

  expectEnd(): void {
    const tok = this.peek()
    if (tok.type !== 'EOF') {
      throw new FormulaError(`Unexpected trailing token "${tok.type}" at position ${tok.pos}`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates a formula string. Input may or may not start with '='.
 *
 * `context` is required for formulas that contain cell/range references.
 * Plain arithmetic (e.g. `=1500*4`) works fine without context.
 */
export function evaluateFormula(input: string, context?: EvalContext): FormulaResult {
  try {
    if (typeof input !== 'string') {
      return { ok: false, error: 'Empty formula' }
    }

    let trimmed = input.trim()
    if (trimmed.startsWith('=')) {
      trimmed = trimmed.slice(1).trim()
    }

    if (trimmed.length === 0) {
      return { ok: false, error: 'Empty formula' }
    }

    const tokResult = tokenise(trimmed)
    if (!Array.isArray(tokResult)) {
      return { ok: false, error: tokResult.error }
    }

    const parser = new Parser(tokResult, context ?? null)
    const value = parser.parseExpr()
    parser.expectEnd()

    if (!Number.isFinite(value)) {
      return { ok: false, error: 'Invalid result' }
    }

    return { ok: true, value }
  } catch (err) {
    if (err instanceof FormulaError) {
      return { ok: false, error: err.message }
    }
    return { ok: false, error: 'Parse error' }
  }
}
