import { describe, expect, it } from 'vitest';
import { overKeyForFolder, resolveDropFolder } from './hold-move';

describe('overKeyForFolder', () => {
  it('uses the unfiled sentinel for empty and null', () => {
    expect(overKeyForFolder(null)).toBe('__unfiled__');
    expect(overKeyForFolder('')).toBe('__unfiled__');
  });

  it('keeps a real folder id', () => {
    expect(overKeyForFolder('cat_kjarni')).toBe('cat_kjarni');
  });
});

describe('resolveDropFolder', () => {
  it('returns undefined when nothing has data-drop-folder', () => {
    const node = document.createElement('div');
    expect(resolveDropFolder(node)).toBeUndefined();
    expect(resolveDropFolder(null)).toBeUndefined();
  });

  it('reads Unfiled from an empty data-drop-folder', () => {
    const section = document.createElement('section');
    section.setAttribute('data-drop-folder', '');
    const child = document.createElement('span');
    section.append(child);
    expect(resolveDropFolder(child)).toBeNull();
  });

  it('reads a folder id from the closest host', () => {
    const section = document.createElement('section');
    section.setAttribute('data-drop-folder', 'cat_apps');
    const row = document.createElement('li');
    section.append(row);
    expect(resolveDropFolder(row)).toBe('cat_apps');
  });
});
