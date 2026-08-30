import {
  addCategory,
  addLink,
  defaultCategory,
  defaultLink,
  hostOf,
  latestAdded,
  nextBoardSlot,
  normalizeUrl,
  type MarksDoc,
} from './model';

export interface ImportedLink {
  title: string;
  url: string;
  note: string;
}

export interface ImportedFolder {
  name: string;
  folders: ImportedFolder[];
  links: ImportedLink[];
}

export interface BookmarkImport {
  folders: ImportedFolder[];
  links: ImportedLink[];
}

const TOKEN =
  /<\/?DL\b[^>]*>|<H3\b([^>]*)>([\s\S]*?)<\/H3>|<A\b([^>]*)>([\s\S]*?)<\/A>/gi;

function attr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[2] ?? match[3] ?? match[4] ?? '') : '';
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .trim();
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  return /^(https?:\/\/|\/\/|[a-z0-9-]+(\.[a-z0-9-]+)+)/i.test(trimmed);
}

/** Netscape / Chrome / Firefox bookmarks.html export. Nested H3+DL become subfolders. */
export function parseBookmarkHtml(html: string): BookmarkImport {
  const root: ImportedFolder = { name: '', folders: [], links: [] };
  const stack: ImportedFolder[] = [root];
  let pending: ImportedFolder | null = null;

  const flushPending = () => {
    if (!pending) return;
    stack[stack.length - 1].folders.push(pending);
    pending = null;
  };

  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(html))) {
    const raw = match[0];
    if (/^<DL/i.test(raw)) {
      if (pending) {
        stack[stack.length - 1].folders.push(pending);
        stack.push(pending);
        pending = null;
      }
      continue;
    }
    if (/^<\/DL/i.test(raw)) {
      flushPending();
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (/^<H3/i.test(raw)) {
      flushPending();
      pending = {
        name: decodeHtmlEntities(match[2] ?? '') || 'Folder',
        folders: [],
        links: [],
      };
      continue;
    }
    if (/^<A/i.test(raw)) {
      flushPending();
      const href = attr(match[3] ?? '', 'HREF');
      const url = normalizeUrl(href);
      if (!url || url.toLowerCase().startsWith('javascript:')) continue;
      const title = decodeHtmlEntities(match[4] ?? '') || hostOf(url) || url;
      stack[stack.length - 1].links.push({ title, url, note: '' });
    }
  }
  flushPending();

  return { folders: root.folders, links: root.links };
}

export function parsePastedUrls(text: string): ImportedLink[] {
  const out: ImportedLink[] = [];
  const seen = new Set<string>();

  const push = (urlRaw: string, titleRaw = '') => {
    const url = normalizeUrl(urlRaw.replace(/^[<[]+|[>\]]+$/g, ''));
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({
      title: titleRaw.trim() || hostOf(url) || url,
      url,
      note: '',
    });
  };

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const urlTokens = tokens.filter((token) => looksLikeUrl(token));
    if (urlTokens.length >= 2) {
      for (const token of urlTokens) push(token);
      continue;
    }
    if (looksLikeUrl(tokens[0] ?? '')) {
      push(tokens[0] ?? '', tokens.slice(1).join(' '));
      continue;
    }
    const found = trimmed.match(/https?:\/\/[^\s,<>]+/gi) ?? [];
    for (const url of found) push(url);
  }

  if (out.length === 0) {
    const found = text.match(/https?:\/\/[^\s,<>]+/gi) ?? [];
    for (const url of found) push(url);
  }

  return out;
}

export function looksLikeBookmarkHtml(text: string): boolean {
  return /NETSCAPE-Bookmark-file|<\s*DL\b|<\s*H3\b/i.test(text);
}

function mergeFolder(
  doc: MarksDoc,
  folder: ImportedFolder,
  parentId: string | null
): MarksDoc {
  let next = addCategory(doc, folder.name || 'Folder', parentId);
  const created = latestAdded(doc.categories, next.categories);
  if (!created) return next;
  for (const link of folder.links) {
    next = addLink(next, {
      categoryId: created.id,
      title: link.title,
      url: link.url,
      note: link.note,
    });
  }
  for (const child of folder.folders) {
    next = mergeFolder(next, child, created.id);
  }
  return next;
}

export function mergeBookmarkImport(
  doc: MarksDoc,
  imported: BookmarkImport,
  parentId: string | null = null
): MarksDoc {
  let next = doc;
  for (const folder of imported.folders) {
    next = mergeFolder(next, folder, parentId);
  }
  for (const link of imported.links) {
    next = addLink(next, {
      categoryId: parentId ?? '',
      title: link.title,
      url: link.url,
      note: link.note,
    });
  }
  return next;
}

export function countImported(imported: BookmarkImport): { folders: number; links: number } {
  let folders = 0;
  let links = imported.links.length;
  const walk = (folder: ImportedFolder) => {
    folders += 1;
    links += folder.links.length;
    folder.folders.forEach(walk);
  };
  imported.folders.forEach(walk);
  return { folders, links };
}

/** Place newly created root folders that still sit on 0,0. */
export function placeNewRoots(before: MarksDoc, after: MarksDoc): MarksDoc {
  const known = new Set(before.categories.map((category) => category.id));
  let next: MarksDoc = after;
  for (const category of after.categories) {
    if (known.has(category.id) || category.parentId) continue;
    if (category.x || category.y) continue;
    const slot = nextBoardSlot(next);
    next = {
      ...next,
      categories: next.categories.map((row) =>
        row.id === category.id ? { ...row, x: slot.x, y: slot.y } : row
      ),
    };
  }
  return next;
}

export function emptyImportedFolder(name: string): ImportedFolder {
  return { name, folders: [], links: [] };
}

export function importedFolderFromScratch(
  name: string,
  links: ImportedLink[],
  folders: ImportedFolder[] = []
): ImportedFolder {
  return { name, folders, links };
}

/** Helper used when a user adds another folder after an import. */
export function addImportedFolder(
  doc: MarksDoc,
  name: string,
  parentId: string | null = null
): MarksDoc {
  return addCategory(doc, name, parentId);
}

export function seedCategoryAt(
  doc: MarksDoc,
  name: string,
  parentId: string | null,
  id: string,
  x: number,
  y: number
): MarksDoc {
  const siblings = doc.categories.filter((category) => (category.parentId ?? null) === parentId);
  const sort = siblings.reduce((max, category) => Math.max(max, category.sort), -1) + 1;
  return {
    ...doc,
    categories: [...doc.categories, defaultCategory({ id, name, parentId, sort, x, y })],
  };
}

export function seedLinkAt(
  doc: MarksDoc,
  input: { id: string; categoryId: string; title: string; url: string }
): MarksDoc {
  const siblings = doc.links.filter((link) => link.categoryId === input.categoryId);
  const sort = siblings.reduce((max, link) => Math.max(max, link.sort), -1) + 1;
  return {
    ...doc,
    links: [
      ...doc.links,
      defaultLink({
        id: input.id,
        categoryId: input.categoryId,
        title: input.title,
        url: normalizeUrl(input.url),
        sort,
      }),
    ],
  };
}
