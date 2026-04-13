import { describe, it, expect } from 'vitest';
import { evaluateFormula, type EvalContext } from '@/lib/forecast/formula';
import type { FlatRow } from '@/lib/forecast/flat-rows';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal EvalContext for tests. */
function makeCtx(overrides?: Partial<EvalContext>): EvalContext {
  // Two item rows: "Payroll" and "Revenue"
  const payrollKey = 'cat-1::Payroll'
  const revenueKey = 'cat-2::Revenue'

  const periods = [
    { id: 'p1' },
    { id: 'p2' },
    { id: 'p3' },
    { id: 'p4' },
    { id: 'p5' },
    { id: 'p6' },
  ]

  // Cell values: row × period
  const amounts: Record<string, number> = {
    [`${payrollKey}:p1`]: 1000,
    [`${payrollKey}:p2`]: 2000,
    [`${payrollKey}:p3`]: 3000,
    [`${payrollKey}:p4`]: 4000,
    [`${payrollKey}:p5`]: 5000,
    [`${payrollKey}:p6`]: 6000,
    [`${revenueKey}:p1`]: 500,
    [`${revenueKey}:p2`]: 600,
    [`${revenueKey}:p3`]: 700,
    [`${revenueKey}:p4`]: 800,
    [`${revenueKey}:p5`]: 900,
    [`${revenueKey}:p6`]: 1000,
  }

  const payrollLine = {
    id: 'line-pay-p1',
    entityId: 'ent-1',
    categoryId: 'cat-1',
    periodId: 'p1',
    amount: 1000,
    confidence: 100,
    source: 'manual' as const,
    counterparty: 'Payroll',
    notes: null,
    sourceDocumentId: null,
    sourceRuleId: null,
    sourcePipelineProjectId: null,
    lineStatus: 'confirmed' as const,
    formula: null,
  }

  const currentRow: FlatRow & { kind: 'item' } = {
    kind: 'item',
    sectionId: 'sec-1',
    itemKey: payrollKey,
    lineIds: ['line-pay-p1'],
    lineByPeriod: new Map([['p1', payrollLine]]),
    isPipeline: false,
  }

  const revenueRow: FlatRow = {
    kind: 'item',
    sectionId: 'sec-2',
    itemKey: revenueKey,
    lineIds: [],
    lineByPeriod: new Map(),
    isPipeline: false,
  }

  const flatRows: FlatRow[] = [
    { kind: 'sectionHeader', sectionId: 'sec-1' },
    currentRow,
    { kind: 'sectionHeader', sectionId: 'sec-2' },
    revenueRow,
  ]

  return {
    currentRow,
    flatRows,
    periods,
    getAmount: (itemKey, periodId) => amounts[`${itemKey}:${periodId}`] ?? 0,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Existing arithmetic tests (preserved for back-compat)
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateFormula — arithmetic (back-compat)', () => {
  it('evaluates multiplication with leading =', () => {
    expect(evaluateFormula('=1500*4')).toEqual({ ok: true, value: 6000 });
  });

  it('evaluates multiplication without leading =', () => {
    expect(evaluateFormula('1500*4')).toEqual({ ok: true, value: 6000 });
  });

  it('evaluates parenthesised division', () => {
    expect(evaluateFormula('=(5000+250)/2')).toEqual({ ok: true, value: 2625 });
  });

  it('evaluates unary minus on a literal', () => {
    expect(evaluateFormula('=-3200')).toEqual({ ok: true, value: -3200 });
  });

  it('evaluates subtraction', () => {
    expect(evaluateFormula('=100-50')).toEqual({ ok: true, value: 50 });
  });

  it('respects operator precedence (mul before add)', () => {
    expect(evaluateFormula('=2+3*4')).toEqual({ ok: true, value: 14 });
  });

  it('respects parenthesised precedence', () => {
    expect(evaluateFormula('=(2+3)*4')).toEqual({ ok: true, value: 20 });
  });

  it('handles decimal literals', () => {
    expect(evaluateFormula('=1.5*2')).toEqual({ ok: true, value: 3 });
  });

  it('handles leading-dot decimal', () => {
    expect(evaluateFormula('=.5+.25')).toEqual({ ok: true, value: 0.75 });
  });

  it('handles nested parens', () => {
    expect(evaluateFormula('=((1+2)*(3+4))')).toEqual({ ok: true, value: 21 });
  });

  it('handles unary plus', () => {
    expect(evaluateFormula('=+5')).toEqual({ ok: true, value: 5 });
  });

  it('handles double unary minus as identity', () => {
    expect(evaluateFormula('=--5')).toEqual({ ok: true, value: 5 });
  });

  it('handles 1++2 as 1 + (+2) = 3 (unary plus on right operand)', () => {
    expect(evaluateFormula('=1++2')).toEqual({ ok: true, value: 3 });
  });

  it('handles non-integer division', () => {
    expect(evaluateFormula('=10/4')).toEqual({ ok: true, value: 2.5 });
  });

  it('rejects direct division by zero', () => {
    const r = evaluateFormula('=10/0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/division by zero/i);
  });

  it('rejects division by zero via subexpression', () => {
    const r = evaluateFormula('=10/(2-2)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/division by zero/i);
  });

  it('rejects empty string', () => {
    const r = evaluateFormula('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it('rejects whitespace-only string', () => {
    const r = evaluateFormula('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it('rejects lone "="', () => {
    const r = evaluateFormula('=');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it('rejects mismatched open paren', () => {
    const r = evaluateFormula('=(1+2');
    expect(r.ok).toBe(false);
  });

  it('rejects mismatched close paren', () => {
    const r = evaluateFormula('=1+2)');
    expect(r.ok).toBe(false);
  });

  it('rejects trailing operator', () => {
    const r = evaluateFormula('=1+');
    expect(r.ok).toBe(false);
  });

  it('rejects dangling binary operator with nothing on left', () => {
    const r = evaluateFormula('=*5');
    expect(r.ok).toBe(false);
  });

  it('handles large multiplication', () => {
    expect(evaluateFormula('=999999*999999')).toEqual({
      ok: true,
      value: 999999 * 999999,
    });
  });

  it('does not throw for alphabetic input', () => {
    const r = evaluateFormula('abc');
    expect(r.ok).toBe(false);
  });

  it('does not throw for currency symbols', () => {
    const r = evaluateFormula('=$100');
    expect(r.ok).toBe(false);
  });

  it('does not throw for random punctuation', () => {
    const r = evaluateFormula('=@#!?');
    expect(r.ok).toBe(false);
  });

  it('tolerates internal whitespace', () => {
    expect(evaluateFormula('=  1 +  2 *  3 ')).toEqual({ ok: true, value: 7 });
  });

  it('rejects results that overflow to Infinity', () => {
    const big = '1e308*1e308';
    const r = evaluateFormula(big);
    expect(r.ok).toBe(false);
  });

  it('rejects deeply nested input without stack overflow', () => {
    const pathological = '='.concat('-'.repeat(5000), '1');
    const r = evaluateFormula(pathological);
    expect(r.ok).toBe(false);
  });

  it('rejects deeply nested parenthesised input without throwing', () => {
    const pathological = '=' + '('.repeat(500) + '1' + ')'.repeat(500);
    const r = evaluateFormula(pathological);
    expect(r.ok).toBe(false);
  });

  it('still allows moderate unary nesting (~10 deep)', () => {
    const r = evaluateFormula('=' + '-'.repeat(10) + '5');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(5);
  });

  // Back-compat: plain arithmetic works WITHOUT a context (P3.1 requirement 14)
  it('=1500*4 works without any context', () => {
    expect(evaluateFormula('=1500*4')).toEqual({ ok: true, value: 6000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase B — Cell-reference formula tests
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateFormula — cell references', () => {
  // 1. W1 — current row, period 0
  it('=W1 returns current row value at period 0', () => {
    const ctx = makeCtx()
    expect(evaluateFormula('=W1', ctx)).toEqual({ ok: true, value: 1000 });
  });

  // 2. W1 + W2
  it('=W1 + W2 sums two cells on current row', () => {
    const ctx = makeCtx()
    expect(evaluateFormula('=W1 + W2', ctx)).toEqual({ ok: true, value: 3000 });
  });

  // 3. SUM(W1:W4)
  it('=SUM(W1:W4) sums 4 cells on current row', () => {
    const ctx = makeCtx()
    // Payroll: 1000 + 2000 + 3000 + 4000 = 10000
    expect(evaluateFormula('=SUM(W1:W4)', ctx)).toEqual({ ok: true, value: 10000 });
  });

  // 4. AVG(W1:W4)
  it('=AVG(W1:W4) averages 4 cells', () => {
    const ctx = makeCtx()
    expect(evaluateFormula('=AVG(W1:W4)', ctx)).toEqual({ ok: true, value: 2500 });
  });

  // 5a. MAX(W1:W3)
  it('=MAX(W1:W3) returns maximum', () => {
    const ctx = makeCtx()
    expect(evaluateFormula('=MAX(W1:W3)', ctx)).toEqual({ ok: true, value: 3000 });
  });

  // 5b. MIN(W1:W3)
  it('=MIN(W1:W3) returns minimum', () => {
    const ctx = makeCtx()
    expect(evaluateFormula('=MIN(W1:W3)', ctx)).toEqual({ ok: true, value: 1000 });
  });

  // 6. @Payroll:W1 — named row, specific period
  it('=@Payroll:W1 reads from the Payroll row, period 0', () => {
    // Switch currentRow to Revenue so we cross-reference Payroll
    const ctx = makeCtx()
    // currentRow is already Payroll in makeCtx — use Revenue as current to test cross-row
    const revenueRow = ctx.flatRows.find(
      (r): r is FlatRow & { kind: 'item' } => r.kind === 'item' && r.itemKey === 'cat-2::Revenue'
    )!
    const ctxFromRevenue = { ...ctx, currentRow: revenueRow }
    // Payroll W1 = 1000
    expect(evaluateFormula('=@Payroll:W1', ctxFromRevenue)).toEqual({ ok: true, value: 1000 });
  });

  // 7. SUM(@Payroll:W1:W4)
  it('=SUM(@Payroll:W1:W4) sums range on Payroll row', () => {
    const ctx = makeCtx()
    expect(evaluateFormula('=SUM(@Payroll:W1:W4)', ctx)).toEqual({ ok: true, value: 10000 });
  });

  // 8. IF(W1 > 1000, W1, 0) — false branch (W1 = 1000, not > 1000)
  it('=IF(W1 > 1000, W1, 0) returns 0 when condition is false', () => {
    const ctx = makeCtx()
    expect(evaluateFormula('=IF(W1 > 1000, W1, 0)', ctx)).toEqual({ ok: true, value: 0 });
  });

  // 8b. IF true branch
  it('=IF(W2 > 1000, W2, 0) returns W2 when condition is true', () => {
    const ctx = makeCtx()
    // W2 = 2000 > 1000 → true
    expect(evaluateFormula('=IF(W2 > 1000, W2, 0)', ctx)).toEqual({ ok: true, value: 2000 });
  });

  // 9. IF with nested SUM
  it('=IF(W1 > 1000, SUM(W1:W3), 0) returns 0 when false', () => {
    const ctx = makeCtx()
    // W1 = 1000, not > 1000 → 0
    expect(evaluateFormula('=IF(W1 > 1000, SUM(W1:W3), 0)', ctx)).toEqual({ ok: true, value: 0 });
  });

  it('=IF(W2 > 1000, SUM(W1:W3), 0) returns SUM when true', () => {
    const ctx = makeCtx()
    // W2 = 2000 > 1000 → SUM(W1:W3) = 6000
    expect(evaluateFormula('=IF(W2 > 1000, SUM(W1:W3), 0)', ctx)).toEqual({ ok: true, value: 6000 });
  });

  // 10. Cross-row range rejected
  it('cross-row range W1:@Other:W4 is a parse error', () => {
    const ctx = makeCtx()
    // W1:@Revenue:W4 — the colon after W1 then ATREF is not valid range syntax
    // Actually this would parse as W1 then trailing :@Revenue:W4 which is unexpected
    const r = evaluateFormula('=W1:@Revenue:W4', ctx);
    expect(r.ok).toBe(false);
  });

  // 11. Unknown counterparty rejected
  it('=@UnknownRow:W1 rejects with unknown row error', () => {
    const ctx = makeCtx()
    const r = evaluateFormula('=@UnknownRow:W1', ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown row/i);
  });

  // 12. Unknown function name rejected
  it('unknown function name is rejected', () => {
    const ctx = makeCtx()
    const r = evaluateFormula('=SQRT(W1)', ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown identifier/i);
  });

  // 13. Out-of-range column W99 (only 6 periods in makeCtx)
  it('=W99 rejects when only 6 periods exist', () => {
    const ctx = makeCtx()
    const r = evaluateFormula('=W99', ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/out of range/i);
  });

  // 14. Back-compat: plain arithmetic without context
  it('=1500*4 still works WITHOUT a context', () => {
    expect(evaluateFormula('=1500*4')).toEqual({ ok: true, value: 6000 });
  });

  // Additional: SUM with individual args
  it('=SUM(W1, W2, W3) sums individual cell args', () => {
    const ctx = makeCtx()
    // 1000 + 2000 + 3000 = 6000
    expect(evaluateFormula('=SUM(W1, W2, W3)', ctx)).toEqual({ ok: true, value: 6000 });
  });

  // Additional: arithmetic mixing literal and cell ref
  it('=W1 * 2 multiplies cell value by literal', () => {
    const ctx = makeCtx()
    expect(evaluateFormula('=W1 * 2', ctx)).toEqual({ ok: true, value: 2000 });
  });

  // Additional: range reversed (a > b)
  it('=SUM(W4:W1) rejects reversed range', () => {
    const ctx = makeCtx()
    const r = evaluateFormula('=SUM(W4:W1)', ctx);
    expect(r.ok).toBe(false);
  });

  // Additional: comparison operators
  it('>=, <=, ==, != comparisons', () => {
    const ctx = makeCtx()
    expect(evaluateFormula('=W1 >= 1000', ctx)).toEqual({ ok: true, value: 1 });
    expect(evaluateFormula('=W1 <= 999', ctx)).toEqual({ ok: true, value: 0 });
    expect(evaluateFormula('=W1 == 1000', ctx)).toEqual({ ok: true, value: 1 });
    expect(evaluateFormula('=W1 != 1000', ctx)).toEqual({ ok: true, value: 0 });
  });

  // Additional: cell ref without context errors gracefully
  it('=W1 without context returns error (not a throw)', () => {
    const r = evaluateFormula('=W1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/context/i);
  });

  // Additional: @label without colon/W is a parse error
  it('@label alone (no :W<n>) is a parse error', () => {
    const ctx = makeCtx()
    const r = evaluateFormula('=@Payroll', ctx);
    expect(r.ok).toBe(false);
  });
});
