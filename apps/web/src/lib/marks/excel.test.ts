import { describe, expect, it } from 'vitest';
import {
  EXCEL_CYCLE,
  EXCEL_DIV,
  EXCEL_NAME,
  EXCEL_VALUE,
  evaluateFormula,
  evaluateSheet,
  formatExcelValue,
} from './excel';
import { addTable, emptyDoc, normalizeDoc, seedDoc, testClock } from './model';

describe('Marks excel engine', () => {
  it('adds literals', () => {
    expect(evaluateFormula('=1+2')).toBe(3);
  });

  it('adds cell refs case-insensitively', () => {
    expect(evaluateFormula('=A1+B1', { A1: '2', B1: '3' })).toBe(5);
    expect(evaluateFormula('=a1+b1', { a1: '2', b1: '3' })).toBe(5);
  });

  it('sums a range', () => {
    expect(evaluateFormula('=SUM(A1:A3)', { A1: '1', A2: '2', A3: '3' })).toBe(6);
  });

  it('evaluates IF with a comparison', () => {
    expect(evaluateFormula('=IF(A1>1, 10, 0)', { A1: '2' })).toBe(10);
    expect(evaluateFormula('=IF(A1>1, 10, 0)', { A1: '1' })).toBe(0);
  });

  it('reports a circular reference', () => {
    expect(evaluateFormula('=A1', { A1: '=A1' })).toBe(EXCEL_CYCLE);
    expect(
      evaluateSheet({
        colCount: 2,
        rowCount: 2,
        cells: { A1: { raw: '=B1' }, B1: { raw: '=A1' } },
      }).A1
    ).toBe(EXCEL_CYCLE);
  });

  it('reports division by zero', () => {
    expect(evaluateFormula('=1/0')).toBe(EXCEL_DIV);
  });

  it('covers common functions, concat, and errors', () => {
    expect(evaluateFormula('=AVERAGE(A1:A2)', { A1: '4', A2: '6' })).toBe(5);
    expect(evaluateFormula('=MIN(3, 1, 2)')).toBe(1);
    expect(evaluateFormula('=MAX(A1:B1)', { A1: '2', B1: '9' })).toBe(9);
    expect(evaluateFormula('=COUNT(A1:A3)', { A1: '1', A2: 'x', A3: '2' })).toBe(2);
    expect(evaluateFormula('=ROUND(2.36, 1)')).toBe(2.4);
    expect(evaluateFormula('=ABS(-4)')).toBe(4);
    expect(evaluateFormula('=SQRT(9)')).toBe(3);
    expect(evaluateFormula('="A"&"B"')).toBe('AB');
    expect(evaluateFormula('=CONCAT(A1, "!", B1)', { A1: 'hi', B1: '2' })).toBe('hi!2');
    expect(evaluateFormula('=NOPE()')).toBe(EXCEL_NAME);
    expect(evaluateFormula('=1+"x"')).toBe(EXCEL_VALUE);
    expect(formatExcelValue(evaluateFormula('=2^3') as number)).toBe('8');
  });
});

describe('normalizeDoc tables', () => {
  it('defaults tables to [] on old docs and empty/seed boards', () => {
    const raw = {
      updatedAt: 4,
      categories: [{ id: 'cat_kjarni', name: 'Kjarni', sort: 0 }],
      links: [{ id: 'lnk_hub', categoryId: 'cat_kjarni', title: 'Hub', url: '/kjarni', note: '', sort: 0 }],
    };
    expect(normalizeDoc(raw)?.tables).toEqual([]);
    expect(emptyDoc(0).tables).toEqual([]);
    expect(seedDoc(1).tables).toEqual([]);
    const added = addTable(emptyDoc(0), 'Table', testClock());
    expect(added.tables[0]?.id.startsWith('tbl_')).toBe(true);
    expect(added.tables[0]?.colCount).toBeGreaterThan(0);
    expect(added.tables[0]?.cells).toEqual({});
  });
});
