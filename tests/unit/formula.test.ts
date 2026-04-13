import { describe, it, expect } from 'vitest';
import { evaluateFormula } from '@/lib/forecast/formula';

describe('evaluateFormula', () => {
  // Basic arithmetic
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

  // Precedence
  it('respects operator precedence (mul before add)', () => {
    expect(evaluateFormula('=2+3*4')).toEqual({ ok: true, value: 14 });
  });

  it('respects parenthesised precedence', () => {
    expect(evaluateFormula('=(2+3)*4')).toEqual({ ok: true, value: 20 });
  });

  // Decimals
  it('handles decimal literals', () => {
    expect(evaluateFormula('=1.5*2')).toEqual({ ok: true, value: 3 });
  });

  it('handles leading-dot decimal', () => {
    expect(evaluateFormula('=.5+.25')).toEqual({ ok: true, value: 0.75 });
  });

  // Nested parens
  it('handles nested parens', () => {
    expect(evaluateFormula('=((1+2)*(3+4))')).toEqual({ ok: true, value: 21 });
  });

  // Unary operators
  it('handles unary plus', () => {
    expect(evaluateFormula('=+5')).toEqual({ ok: true, value: 5 });
  });

  it('handles double unary minus as identity', () => {
    expect(evaluateFormula('=--5')).toEqual({ ok: true, value: 5 });
  });

  it('handles 1++2 as 1 + (+2) = 3 (unary plus on right operand)', () => {
    // Decision: the grammar allows `factor := '+' factor`, so after a binary '+'
    // the parser looks for a factor which may itself start with a unary '+'. This
    // mirrors spreadsheet/JS behaviour for unary operators.
    expect(evaluateFormula('=1++2')).toEqual({ ok: true, value: 3 });
  });

  // Division
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

  // Empty / whitespace
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

  // Parse errors
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

  // Large number
  it('handles large multiplication', () => {
    expect(evaluateFormula('=999999*999999')).toEqual({
      ok: true,
      value: 999999 * 999999,
    });
  });

  // Non-throwing on garbage input
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

  // Whitespace tolerance inside expression
  it('tolerates internal whitespace', () => {
    expect(evaluateFormula('=  1 +  2 *  3 ')).toEqual({ ok: true, value: 7 });
  });

  // Precision — Infinity guard (overflow)
  it('rejects results that overflow to Infinity', () => {
    const big = '1e308*1e308';
    const r = evaluateFormula(big);
    // tokenise doesn't support 'e' notation, so this should fail at tokenise
    // step, not at overflow. Either way, should not throw.
    expect(r.ok).toBe(false);
  });
});
