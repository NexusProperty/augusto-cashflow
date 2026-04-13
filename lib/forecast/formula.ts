/**
 * Tiny arithmetic formula parser for cash-flow forecast overrides.
 *
 * Supports: + - * / parentheses, numeric literals (ints + decimals), unary minus/plus.
 * Does NOT support: cell references, functions, names.
 *
 * Implemented as a recursive-descent parser. Does NOT use eval() or Function().
 */

export type FormulaResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

type TokenType = 'NUMBER' | '+' | '-' | '*' | '/' | '(' | ')' | 'EOF';

interface Token {
  type: TokenType;
  value?: number;
  pos: number;
}

function tokenise(input: string): Token[] | { error: string } {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i]!;

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Single-character operators / parens
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push({ type: ch as TokenType, pos: i });
      i++;
      continue;
    }

    // Numbers: digits with optional single decimal point
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      const start = i;
      let sawDot = ch === '.';
      let sawDigit = ch >= '0' && ch <= '9';
      i++;
      while (i < n) {
        const c = input[i]!;
        if (c >= '0' && c <= '9') {
          sawDigit = true;
          i++;
        } else if (c === '.' && !sawDot) {
          sawDot = true;
          i++;
        } else {
          break;
        }
      }
      if (!sawDigit) {
        return { error: `Invalid number at position ${start}` };
      }
      const raw = input.slice(start, i);
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        return { error: `Invalid number "${raw}"` };
      }
      tokens.push({ type: 'NUMBER', value: num, pos: start });
      continue;
    }

    // Unknown character
    return { error: `Unexpected character "${ch}" at position ${i}` };
  }

  tokens.push({ type: 'EOF', pos: n });
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private consume(): Token {
    return this.tokens[this.pos++]!;
  }

  // expr := term (('+' | '-') term)*
  parseExpr(): number {
    let left = this.parseTerm();
    while (this.peek().type === '+' || this.peek().type === '-') {
      const op = this.consume().type;
      const right = this.parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  // term := factor (('*' | '/') factor)*
  private parseTerm(): number {
    let left = this.parseFactor();
    while (this.peek().type === '*' || this.peek().type === '/') {
      const op = this.consume().type;
      const right = this.parseFactor();
      if (op === '*') {
        left = left * right;
      } else {
        if (right === 0) {
          throw new FormulaError('Division by zero');
        }
        left = left / right;
      }
    }
    return left;
  }

  // factor := NUMBER | '(' expr ')' | '-' factor | '+' factor
  private parseFactor(): number {
    const tok = this.peek();

    if (tok.type === '-') {
      this.consume();
      return -this.parseFactor();
    }
    if (tok.type === '+') {
      this.consume();
      return this.parseFactor();
    }
    if (tok.type === 'NUMBER') {
      this.consume();
      return tok.value!;
    }
    if (tok.type === '(') {
      this.consume();
      const value = this.parseExpr();
      const close = this.peek();
      if (close.type !== ')') {
        throw new FormulaError(`Expected ')' at position ${close.pos}`);
      }
      this.consume();
      return value;
    }
    if (tok.type === 'EOF') {
      throw new FormulaError('Unexpected end of input');
    }
    throw new FormulaError(`Unexpected token "${tok.type}" at position ${tok.pos}`);
  }

  expectEnd(): void {
    const tok = this.peek();
    if (tok.type !== 'EOF') {
      throw new FormulaError(`Unexpected trailing token "${tok.type}" at position ${tok.pos}`);
    }
  }
}

class FormulaError extends Error {}

/**
 * Evaluates a formula string. Input may or may not start with '='.
 */
export function evaluateFormula(input: string): FormulaResult {
  try {
    if (typeof input !== 'string') {
      return { ok: false, error: 'Empty formula' };
    }

    let trimmed = input.trim();
    if (trimmed.startsWith('=')) {
      trimmed = trimmed.slice(1).trim();
    }

    if (trimmed.length === 0) {
      return { ok: false, error: 'Empty formula' };
    }

    const tokResult = tokenise(trimmed);
    if (!Array.isArray(tokResult)) {
      return { ok: false, error: tokResult.error };
    }

    const parser = new Parser(tokResult);
    const value = parser.parseExpr();
    parser.expectEnd();

    if (!Number.isFinite(value)) {
      return { ok: false, error: 'Invalid result' };
    }

    return { ok: true, value };
  } catch (err) {
    if (err instanceof FormulaError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Parse error' };
  }
}
