/**
 * Small Excel-like formula engine for Marks tables.
 * Cell keys use A1 notation. Formulas start with `=`.
 */

export const EXCEL_CYCLE = '#CYCLE!';
export const EXCEL_DIV = '#DIV/0!';
export const EXCEL_REF = '#REF!';
export const EXCEL_VALUE = '#VALUE!';
export const EXCEL_NAME = '#NAME?';

export type ExcelError =
  | typeof EXCEL_CYCLE
  | typeof EXCEL_DIV
  | typeof EXCEL_REF
  | typeof EXCEL_VALUE
  | typeof EXCEL_NAME;

export type ExcelValue = number | string | boolean | ExcelError;

export type ExcelSheet = {
  colCount: number;
  rowCount: number;
  cells: Record<string, { raw: string } | string>;
};

type TokenKind =
  | 'number'
  | 'string'
  | 'cell'
  | 'range'
  | 'ident'
  | 'op'
  | 'comma'
  | 'lparen'
  | 'rparen'
  | 'eof';

type Token = { kind: TokenKind; value: string };

const A1_RE = /^([A-Za-z]+)(\d+)$/;

export function isExcelError(value: unknown): value is ExcelError {
  return (
    value === EXCEL_CYCLE ||
    value === EXCEL_DIV ||
    value === EXCEL_REF ||
    value === EXCEL_VALUE ||
    value === EXCEL_NAME
  );
}

export function colIndexToLetters(index: number): string {
  if (!Number.isFinite(index) || index < 0) return '';
  let n = Math.floor(index) + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function lettersToColIndex(letters: string): number {
  const raw = letters.trim().toUpperCase();
  if (!raw || !/^[A-Z]+$/.test(raw)) return -1;
  let n = 0;
  for (const ch of raw) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function cellKey(col: number, row: number): string {
  return `${colIndexToLetters(col)}${row + 1}`;
}

export function parseA1(ref: string): { col: number; row: number } | null {
  const match = A1_RE.exec(ref.trim());
  if (!match) return null;
  const col = lettersToColIndex(match[1] ?? '');
  const row = Number(match[2]) - 1;
  if (col < 0 || !Number.isFinite(row) || row < 0) return null;
  return { col, row };
}

export function expandRange(
  start: { col: number; row: number },
  end: { col: number; row: number }
): { col: number; row: number }[] {
  const c0 = Math.min(start.col, end.col);
  const c1 = Math.max(start.col, end.col);
  const r0 = Math.min(start.row, end.row);
  const r1 = Math.max(start.row, end.row);
  const out: { col: number; row: number }[] = [];
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) out.push({ col, row });
  }
  return out;
}

export function formatExcelValue(value: ExcelValue): string {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return EXCEL_DIV;
    if (Object.is(value, -0)) return '0';
    if (Number.isInteger(value)) return String(value);
    const rounded = Math.round(value * 1e10) / 1e10;
    return String(rounded);
  }
  return String(value);
}

function cellRaw(sheet: ExcelSheet, key: string): string {
  const row = sheet.cells[key] ?? sheet.cells[key.toUpperCase()];
  if (row == null) return '';
  return typeof row === 'string' ? row : row.raw ?? '';
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;
  const peek = (offset = 0) => source[i + offset] ?? '';

  while (i < n) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"') {
      i += 1;
      let text = '';
      while (i < n) {
        if (source[i] === '"') {
          if (source[i + 1] === '"') {
            text += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        text += source[i];
        i += 1;
      }
      tokens.push({ kind: 'string', value: text });
      continue;
    }
    if (ch === ',' ) {
      tokens.push({ kind: 'comma', value: ',' });
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen', value: '(' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', value: ')' });
      i += 1;
      continue;
    }
    if (ch === '<' || ch === '>' || ch === '=') {
      if (ch === '<' && peek(1) === '>') {
        tokens.push({ kind: 'op', value: '<>' });
        i += 2;
        continue;
      }
      if ((ch === '<' || ch === '>') && peek(1) === '=') {
        tokens.push({ kind: 'op', value: `${ch}=` });
        i += 2;
        continue;
      }
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }
    if ('+-*/^&'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < n && /[0-9.]/.test(source[i]!)) i += 1;
      if (source[i] === 'e' || source[i] === 'E') {
        i += 1;
        if (source[i] === '+' || source[i] === '-') i += 1;
        while (i < n && /[0-9]/.test(source[i]!)) i += 1;
      }
      const raw = source.slice(start, i);
      if (raw === '.' || !Number.isFinite(Number(raw))) {
        throw new Error(EXCEL_VALUE);
      }
      tokens.push({ kind: 'number', value: raw });
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z]/.test(source[i]!)) i += 1;
      const letters = source.slice(start, i);
      let digits = '';
      while (i < n && /[0-9]/.test(source[i]!)) {
        digits += source[i];
        i += 1;
      }
      if (digits && peek() === ':' && /[A-Za-z]/.test(peek(1))) {
        i += 1;
        const secondStart = i;
        while (i < n && /[A-Za-z]/.test(source[i]!)) i += 1;
        const letters2 = source.slice(secondStart, i);
        let digits2 = '';
        while (i < n && /[0-9]/.test(source[i]!)) {
          digits2 += source[i];
          i += 1;
        }
        if (!digits2) throw new Error(EXCEL_REF);
        tokens.push({ kind: 'range', value: `${letters}${digits}:${letters2}${digits2}` });
        continue;
      }
      if (digits) {
        tokens.push({ kind: 'cell', value: `${letters}${digits}`.toUpperCase() });
        continue;
      }
      tokens.push({ kind: 'ident', value: letters });
      continue;
    }
    throw new Error(EXCEL_VALUE);
  }
  tokens.push({ kind: 'eof', value: '' });
  return tokens;
}

type RangeVal = { kind: 'range'; cells: { col: number; row: number }[] };
type EvalVal = ExcelValue | RangeVal;

class Parser {
  private i = 0;
  constructor(
    private tokens: Token[],
    private evalCell: (key: string) => ExcelValue
  ) {}

  parse(): ExcelValue {
    const value = this.comparison();
    if (this.peek().kind !== 'eof') throw new Error(EXCEL_VALUE);
    return this.materialize(value);
  }

  private peek(): Token {
    return this.tokens[this.i] ?? { kind: 'eof', value: '' };
  }

  private eat(kind?: TokenKind, value?: string): Token {
    const token = this.peek();
    if (kind && token.kind !== kind) throw new Error(EXCEL_VALUE);
    if (value != null && token.value !== value) throw new Error(EXCEL_VALUE);
    this.i += 1;
    return token;
  }

  private comparison(): EvalVal {
    let left = this.concat();
    while (['=', '<>', '<', '>', '<=', '>='].includes(this.peek().value) && this.peek().kind === 'op') {
      const op = this.eat('op').value;
      const right = this.concat();
      left = compareValues(this.materialize(left), this.materialize(right), op);
    }
    return left;
  }

  private concat(): EvalVal {
    let left = this.additive();
    while (this.peek().kind === 'op' && this.peek().value === '&') {
      this.eat('op');
      const right = this.additive();
      const a = this.materialize(left);
      const b = this.materialize(right);
      if (isExcelError(a)) return a;
      if (isExcelError(b)) return b;
      left = `${stringify(a)}${stringify(b)}`;
    }
    return left;
  }

  private additive(): EvalVal {
    let left = this.term();
    while (this.peek().kind === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.eat('op').value;
      const right = this.term();
      left = applyMath(this.materialize(left), this.materialize(right), op);
    }
    return left;
  }

  private term(): EvalVal {
    let left = this.power();
    while (this.peek().kind === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.eat('op').value;
      const right = this.power();
      left = applyMath(this.materialize(left), this.materialize(right), op);
    }
    return left;
  }

  private power(): EvalVal {
    const left = this.unary();
    if (this.peek().kind === 'op' && this.peek().value === '^') {
      this.eat('op');
      const right = this.power();
      return applyMath(this.materialize(left), this.materialize(right), '^');
    }
    return left;
  }

  private unary(): EvalVal {
    if (this.peek().kind === 'op' && this.peek().value === '+') {
      this.eat('op');
      return this.unary();
    }
    if (this.peek().kind === 'op' && this.peek().value === '-') {
      this.eat('op');
      const value = this.materialize(this.unary());
      if (isExcelError(value)) return value;
      const num = toNumber(value);
      if (num == null) return EXCEL_VALUE;
      return -num;
    }
    return this.primary();
  }

  private primary(): EvalVal {
    const token = this.peek();
    if (token.kind === 'number') {
      this.eat('number');
      return Number(token.value);
    }
    if (token.kind === 'string') {
      this.eat('string');
      return token.value;
    }
    if (token.kind === 'cell') {
      this.eat('cell');
      return this.evalCell(token.value);
    }
    if (token.kind === 'range') {
      this.eat('range');
      const [left, right] = token.value.split(':');
      const a = parseA1(left ?? '');
      const b = parseA1(right ?? '');
      if (!a || !b) return EXCEL_REF;
      return { kind: 'range', cells: expandRange(a, b) };
    }
    if (token.kind === 'ident') {
      this.eat('ident');
      const name = token.value.toUpperCase();
      if (name === 'TRUE') return true;
      if (name === 'FALSE') return false;
      if (this.peek().kind !== 'lparen') return EXCEL_NAME;
      this.eat('lparen');
      const args: EvalVal[] = [];
      if (this.peek().kind !== 'rparen') {
        args.push(this.comparison());
        while (this.peek().kind === 'comma') {
          this.eat('comma');
          args.push(this.comparison());
        }
      }
      this.eat('rparen');
      return this.call(name, args);
    }
    if (token.kind === 'lparen') {
      this.eat('lparen');
      const inner = this.comparison();
      this.eat('rparen');
      return inner;
    }
    throw new Error(EXCEL_VALUE);
  }

  private materialize(value: EvalVal): ExcelValue {
    if (value && typeof value === 'object' && 'kind' in value && value.kind === 'range') {
      const first = value.cells[0];
      if (!first) return 0;
      return this.evalCell(cellKey(first.col, first.row));
    }
    return value;
  }

  private valuesOf(arg: EvalVal): ExcelValue[] {
    if (arg && typeof arg === 'object' && arg.kind === 'range') {
      return arg.cells.map((cell) => this.evalCell(cellKey(cell.col, cell.row)));
    }
    return [arg];
  }

  private call(name: string, args: EvalVal[]): ExcelValue {
    const flat = args.flatMap((arg) => this.valuesOf(arg));
    const firstError = flat.find(isExcelError);
    switch (name) {
      case 'SUM': {
        if (firstError) return firstError;
        return numericArgs(flat).reduce((sum, value) => sum + value, 0);
      }
      case 'AVERAGE':
      case 'AVG': {
        if (firstError) return firstError;
        const nums = numericArgs(flat);
        if (nums.length === 0) return EXCEL_DIV;
        return nums.reduce((sum, value) => sum + value, 0) / nums.length;
      }
      case 'MIN': {
        if (firstError) return firstError;
        const nums = numericArgs(flat);
        return nums.length ? Math.min(...nums) : 0;
      }
      case 'MAX': {
        if (firstError) return firstError;
        const nums = numericArgs(flat);
        return nums.length ? Math.max(...nums) : 0;
      }
      case 'COUNT':
        return numericArgs(flat).length;
      case 'COUNTA':
        return flat.filter((value) => value !== '' && value !== null && value !== undefined).length;
      case 'IF': {
        if (args.length < 2) return EXCEL_VALUE;
        const cond = this.materialize(args[0]!);
        if (isExcelError(cond)) return cond;
        const pick = isTruthy(cond) ? args[1] : (args[2] ?? false);
        return this.materialize(pick ?? false);
      }
      case 'ROUND': {
        const n = toNumber(this.materialize(args[0] ?? EXCEL_VALUE));
        const digits = toNumber(this.materialize(args[1] ?? 0)) ?? 0;
        if (n == null) return firstError ?? EXCEL_VALUE;
        const factor = 10 ** Math.round(digits);
        return Math.sign(n) * Math.round(Math.abs(n) * factor) / factor;
      }
      case 'ABS': {
        const n = toNumber(this.materialize(args[0] ?? EXCEL_VALUE));
        if (n == null) return firstError ?? EXCEL_VALUE;
        return Math.abs(n);
      }
      case 'SQRT': {
        const n = toNumber(this.materialize(args[0] ?? EXCEL_VALUE));
        if (n == null) return firstError ?? EXCEL_VALUE;
        if (n < 0) return EXCEL_VALUE;
        return Math.sqrt(n);
      }
      case 'CONCAT':
      case 'CONCATENATE': {
        if (firstError) return firstError;
        return flat.map(stringify).join('');
      }
      default:
        return EXCEL_NAME;
    }
  }
}

function stringify(value: ExcelValue): string {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value === '') return '';
  return formatExcelValue(value);
}

function toNumber(value: ExcelValue): number | null {
  if (isExcelError(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === '' || value == null) return 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numericArgs(values: ExcelValue[]): number[] {
  const nums: number[] = [];
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) nums.push(value);
    else if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      nums.push(Number(value));
    }
  }
  return nums;
}

function isTruthy(value: ExcelValue): boolean {
  if (isExcelError(value)) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const upper = value.trim().toUpperCase();
    if (!upper || upper === 'FALSE' || upper === '0') return false;
    return true;
  }
  return false;
}

function applyMath(left: ExcelValue, right: ExcelValue, op: string): ExcelValue {
  if (isExcelError(left)) return left;
  if (isExcelError(right)) return right;
  const a = toNumber(left);
  const b = toNumber(right);
  if (a == null || b == null) return EXCEL_VALUE;
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  if (op === '/') {
    if (b === 0) return EXCEL_DIV;
    return a / b;
  }
  if (op === '^') return a ** b;
  return EXCEL_VALUE;
}

function compareValues(left: ExcelValue, right: ExcelValue, op: string): ExcelValue {
  if (isExcelError(left)) return left;
  if (isExcelError(right)) return right;
  const ln = typeof left === 'number' || left === '' ? toNumber(left) : null;
  const rn = typeof right === 'number' || right === '' ? toNumber(right) : null;
  let cmp: number;
  if (ln != null && rn != null && (typeof left === 'number' || typeof right === 'number' || left === '' || right === '')) {
    cmp = ln === rn ? 0 : ln < rn ? -1 : 1;
  } else {
    const ls = stringify(left);
    const rs = stringify(right);
    cmp = ls === rs ? 0 : ls < rs ? -1 : 1;
  }
  if (op === '=') return cmp === 0;
  if (op === '<>') return cmp !== 0;
  if (op === '<') return cmp < 0;
  if (op === '>') return cmp > 0;
  if (op === '<=') return cmp <= 0;
  if (op === '>=') return cmp >= 0;
  return EXCEL_VALUE;
}

function parseLiteral(raw: string): ExcelValue {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.toUpperCase() === 'TRUE') return true;
  if (trimmed.toUpperCase() === 'FALSE') return false;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }
  return raw;
}

export function evaluateCell(
  sheet: ExcelSheet,
  key: string,
  visiting = new Set<string>(),
  memo = new Map<string, ExcelValue>()
): ExcelValue {
  const a1 = key.toUpperCase();
  const parsed = parseA1(a1);
  if (!parsed) return EXCEL_REF;
  if (parsed.col >= sheet.colCount || parsed.row >= sheet.rowCount) return EXCEL_REF;
  if (memo.has(a1)) return memo.get(a1)!;
  if (visiting.has(a1)) return EXCEL_CYCLE;
  const raw = cellRaw(sheet, a1);
  if (!raw.trim()) {
    memo.set(a1, '');
    return '';
  }
  if (!raw.startsWith('=')) {
    const literal = parseLiteral(raw);
    memo.set(a1, literal);
    return literal;
  }
  visiting.add(a1);
  let result: ExcelValue;
  try {
    const tokens = tokenize(raw.slice(1));
    const parser = new Parser(tokens, (ref) => evaluateCell(sheet, ref, visiting, memo));
    result = parser.parse();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    result = isExcelError(message) ? message : EXCEL_VALUE;
  }
  visiting.delete(a1);
  memo.set(a1, result);
  return result;
}

export function evaluateSheet(sheet: ExcelSheet): Record<string, ExcelValue> {
  const out: Record<string, ExcelValue> = {};
  const memo = new Map<string, ExcelValue>();
  for (let row = 0; row < sheet.rowCount; row += 1) {
    for (let col = 0; col < sheet.colCount; col += 1) {
      const key = cellKey(col, row);
      if (!cellRaw(sheet, key) && !sheet.cells[key]) continue;
      out[key] = evaluateCell(sheet, key, new Set(), memo);
    }
  }
  return out;
}

export function evaluateFormula(
  formula: string,
  cells: Record<string, string> = {},
  bounds?: { colCount?: number; rowCount?: number }
): ExcelValue {
  const mapped: Record<string, { raw: string }> = {};
  let maxCol = 0;
  let maxRow = 0;
  for (const [key, raw] of Object.entries(cells)) {
    const a1 = key.toUpperCase();
    mapped[a1] = { raw };
    const parsed = parseA1(a1);
    if (parsed) {
      maxCol = Math.max(maxCol, parsed.col + 1);
      maxRow = Math.max(maxRow, parsed.row + 1);
    }
  }
  const sheet: ExcelSheet = {
    colCount: Math.max(bounds?.colCount ?? 0, maxCol, 8),
    rowCount: Math.max(bounds?.rowCount ?? 0, maxRow, 16),
    cells: mapped,
  };
  if (formula.startsWith('=')) {
    const extraCol = sheet.colCount;
    sheet.colCount += 1;
    const scratch = cellKey(extraCol, 0);
    sheet.cells[scratch] = { raw: formula };
    return evaluateCell(sheet, scratch);
  }
  return parseLiteral(formula);
}
