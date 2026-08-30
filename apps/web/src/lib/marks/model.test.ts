import { describe, expect, it } from 'vitest';
import {
  addCategory,
  addLink,
  filterDoc,
  hostOf,
  normalizeUrl,
  removeCategory,
  seedDoc,
} from './model';

describe('normalizeUrl', () => {
  it('adds https when the scheme is missing', () => {
    expect(normalizeUrl('brunaholf.netlify.app')).toBe('https://brunaholf.netlify.app');
  });

  it('keeps an existing scheme', () => {
    expect(normalizeUrl('http://localhost:3000/marks')).toBe('http://localhost:3000/marks');
  });

  it('keeps a same-origin path', () => {
    expect(normalizeUrl('/marks')).toBe('/marks');
  });
});

describe('hostOf', () => {
  it('drops www', () => {
    expect(hostOf('https://www.github.com/aggisigurds-dev/kjarni')).toBe('github.com');
  });
});

describe('organizer', () => {
  it('seeds kjarni categories and keeps add/remove consistent', () => {
    const seeded = seedDoc(1);
    expect(seeded.categories.map((category) => category.name)).toEqual(['Kjarni', 'Apps', 'Build']);
    expect(seeded.links.length).toBeGreaterThan(3);

    const withCat = addCategory(seeded, 'Personal');
    const personal = withCat.categories.find((category) => category.name === 'Personal');
    expect(personal).toBeTruthy();

    const withLink = addLink(withCat, {
      categoryId: personal!.id,
      title: 'Drive',
      url: 'drive.google.com',
    });
    expect(withLink.links.some((link) => link.url === 'https://drive.google.com')).toBe(true);

    const filtered = filterDoc(withLink, 'drive');
    expect(filtered.links).toHaveLength(1);
    expect(filtered.categories).toHaveLength(1);

    const gone = removeCategory(withLink, personal!.id);
    expect(gone.categories.some((category) => category.id === personal!.id)).toBe(false);
    expect(gone.links.some((link) => link.categoryId === personal!.id)).toBe(false);
  });
});
