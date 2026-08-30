/**
 * Marks — categorized bookmarks for the kjarni start page.
 */

export interface MarkCategory {
  id: string;
  name: string;
  sort: number;
}

export interface MarkLink {
  id: string;
  categoryId: string;
  title: string;
  url: string;
  note: string;
  sort: number;
}

export interface MarksDoc {
  categories: MarkCategory[];
  links: MarkLink[];
  updatedAt: number;
}

export const MARKS_BOARD_ID = 'home';

const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function faviconUrl(url: string): string {
  const host = hostOf(url);
  if (!host) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

export function emptyDoc(now = 0): MarksDoc {
  return { categories: [], links: [], updatedAt: now };
}

/** First-run kjarni sites, grouped so the front page is useful immediately. */
export function seedDoc(now = 1): MarksDoc {
  const kjarni = { id: 'cat_kjarni', name: 'Kjarni', sort: 0 };
  const apps = { id: 'cat_apps', name: 'Apps', sort: 1 };
  const shop = { id: 'cat_build', name: 'Build', sort: 2 };
  const links: MarkLink[] = [
    {
      id: 'lnk_3dwork',
      categoryId: kjarni.id,
      title: '3dwork',
      url: 'https://kjarni-3dwork.vercel.app/3dwork',
      note: 'STL / 3MF bench',
      sort: 0,
    },
    {
      id: 'lnk_marks',
      categoryId: kjarni.id,
      title: 'Marks',
      url: '/marks',
      note: 'This start page',
      sort: 1,
    },
    {
      id: 'lnk_paint',
      categoryId: kjarni.id,
      title: 'TurboPaint',
      url: 'https://slokkvitaeki.netlify.app/kjarni/turbopaint',
      note: 'Floor plans',
      sort: 2,
    },
    {
      id: 'lnk_hub',
      categoryId: kjarni.id,
      title: 'Kjarni hub',
      url: 'https://slokkvitaeki.netlify.app/kjarni',
      note: 'Stjórnstöð',
      sort: 3,
    },
    {
      id: 'lnk_slokk',
      categoryId: apps.id,
      title: 'Slökkvitæki',
      url: 'https://slokkvitaeki.netlify.app',
      note: '',
      sort: 0,
    },
    {
      id: 'lnk_bruna',
      categoryId: apps.id,
      title: 'Brunahólf',
      url: 'https://brunaholf.netlify.app',
      note: '',
      sort: 1,
    },
    {
      id: 'lnk_github',
      categoryId: shop.id,
      title: 'GitHub · kjarni',
      url: 'https://github.com/aggisigurds-dev/kjarni',
      note: 'Website code',
      sort: 0,
    },
    {
      id: 'lnk_vercel',
      categoryId: shop.id,
      title: 'Vercel',
      url: 'https://vercel.com/kjarni',
      note: '',
      sort: 1,
    },
  ];
  return { categories: [kjarni, apps, shop], links, updatedAt: now };
}

export function sortedCategories(doc: MarksDoc): MarkCategory[] {
  return [...doc.categories].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function linksInCategory(doc: MarksDoc, categoryId: string): MarkLink[] {
  return doc.links
    .filter((link) => link.categoryId === categoryId)
    .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}

export function filterDoc(doc: MarksDoc, query: string): MarksDoc {
  const q = query.trim().toLowerCase();
  if (!q) return doc;
  const links = doc.links.filter((link) => {
    const hay = `${link.title} ${link.url} ${link.note}`.toLowerCase();
    return hay.includes(q);
  });
  const used = new Set(links.map((link) => link.categoryId));
  return {
    ...doc,
    links,
    categories: doc.categories.filter((category) => used.has(category.id)),
  };
}

export function addCategory(doc: MarksDoc, name: string): MarksDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  const sort = doc.categories.reduce((max, category) => Math.max(max, category.sort), -1) + 1;
  return {
    ...doc,
    updatedAt: Date.now(),
    categories: [...doc.categories, { id: newId('cat'), name: trimmed, sort }],
  };
}

export function renameCategory(doc: MarksDoc, id: string, name: string): MarksDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  return {
    ...doc,
    updatedAt: Date.now(),
    categories: doc.categories.map((category) =>
      category.id === id ? { ...category, name: trimmed } : category
    ),
  };
}

export function removeCategory(doc: MarksDoc, id: string): MarksDoc {
  return {
    ...doc,
    updatedAt: Date.now(),
    categories: doc.categories.filter((category) => category.id !== id),
    links: doc.links.filter((link) => link.categoryId !== id),
  };
}

export function addLink(
  doc: MarksDoc,
  input: { categoryId: string; title: string; url: string; note?: string }
): MarksDoc {
  const url = normalizeUrl(input.url);
  const title = input.title.trim() || hostOf(url) || url;
  if (!url || !doc.categories.some((category) => category.id === input.categoryId)) return doc;
  const siblings = doc.links.filter((link) => link.categoryId === input.categoryId);
  const sort = siblings.reduce((max, link) => Math.max(max, link.sort), -1) + 1;
  return {
    ...doc,
    updatedAt: Date.now(),
    links: [
      ...doc.links,
      {
        id: newId('lnk'),
        categoryId: input.categoryId,
        title,
        url,
        note: (input.note ?? '').trim(),
        sort,
      },
    ],
  };
}

export function updateLink(
  doc: MarksDoc,
  id: string,
  patch: Partial<Pick<MarkLink, 'title' | 'url' | 'note' | 'categoryId'>>
): MarksDoc {
  return {
    ...doc,
    updatedAt: Date.now(),
    links: doc.links.map((link) => {
      if (link.id !== id) return link;
      const url = patch.url != null ? normalizeUrl(patch.url) : link.url;
      const title = patch.title != null ? patch.title.trim() || hostOf(url) || url : link.title;
      return {
        ...link,
        ...patch,
        url,
        title,
        note: patch.note != null ? patch.note.trim() : link.note,
      };
    }),
  };
}

export function removeLink(doc: MarksDoc, id: string): MarksDoc {
  return {
    ...doc,
    updatedAt: Date.now(),
    links: doc.links.filter((link) => link.id !== id),
  };
}

export function isMarksDoc(value: unknown): value is MarksDoc {
  if (!value || typeof value !== 'object') return false;
  const doc = value as MarksDoc;
  return Array.isArray(doc.categories) && Array.isArray(doc.links);
}
