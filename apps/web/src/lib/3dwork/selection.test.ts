import { describe, expect, it } from 'vitest';
import {
  clickSelection,
  invertSelection,
  makePrimary,
  pickedIds,
  selectAll,
  type PartSelection,
} from './selection';

const pick = (selectedId: string | null, ...marked: string[]): PartSelection => ({
  selectedId,
  marked: new Set(marked),
});

const sorted = (selection: PartSelection) => pickedIds(selection).sort();

describe('clickSelection', () => {
  it('starts over on a plain click on a part that is not picked', () => {
    const next = clickSelection(pick('a', 'b'), 'c', false);
    expect(next.selectedId).toBe('c');
    expect(sorted(next)).toEqual(['c']);
  });

  it('keeps the others on a plain click on a part that is already picked', () => {
    const next = clickSelection(pick('a', 'b', 'c'), 'b', false);
    expect(next.selectedId).toBe('b');
    expect(sorted(next)).toEqual(['a', 'b', 'c']);
  });

  it('clears everything on a plain click on nothing', () => {
    expect(sorted(clickSelection(pick('a', 'b'), null, false))).toEqual([]);
  });

  it('adds a part and keeps the one picked before it', () => {
    const next = clickSelection(pick('a'), 'b', true);
    expect(next.selectedId).toBe('b');
    expect(sorted(next)).toEqual(['a', 'b']);
  });

  it('takes a marked part away again', () => {
    expect(sorted(clickSelection(pick('a', 'b', 'c'), 'b', true))).toEqual(['a', 'c']);
  });

  it('takes the primary away and hands over to the part added last', () => {
    const next = clickSelection(pick('c', 'a', 'b'), 'c', true);
    expect(next.selectedId).toBe('b');
    expect(sorted(next)).toEqual(['a', 'b']);
  });

  it('takes the primary away even when it was also marked', () => {
    const next = clickSelection(pick('b', 'a', 'b'), 'b', true);
    expect(next.selectedId).toBe('a');
    expect(sorted(next)).toEqual(['a']);
  });

  it('keeps the selection when an additive click hits nothing', () => {
    expect(sorted(clickSelection(pick('a', 'b'), null, true))).toEqual(['a', 'b']);
  });
});

describe('makePrimary', () => {
  it('keeps the old primary picked', () => {
    const next = makePrimary(pick('a', 'b'), 'c');
    expect(next.selectedId).toBe('c');
    expect(sorted(next)).toEqual(['a', 'b', 'c']);
  });
});

describe('selectAll and invertSelection', () => {
  it('picks every part and keeps the primary', () => {
    const next = selectAll(['a', 'b', 'c'], pick('b'));
    expect(next.selectedId).toBe('b');
    expect(sorted(next)).toEqual(['a', 'b', 'c']);
  });

  it('makes the first part primary when nothing was picked', () => {
    expect(selectAll(['a', 'b'], pick(null)).selectedId).toBe('a');
  });

  it('picks what was not picked, and only that', () => {
    const next = invertSelection(['a', 'b', 'c', 'd'], pick('a', 'c'));
    expect(next.selectedId).toBe('b');
    expect(sorted(next)).toEqual(['b', 'd']);
  });

  it('lists the primary first', () => {
    expect(pickedIds(pick('b', 'a', 'c'))).toEqual(['b', 'a', 'c']);
  });
});
