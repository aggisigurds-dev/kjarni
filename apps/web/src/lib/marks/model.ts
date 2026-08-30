/**
 * Marks — folders, links, buttons, and filter chips on a structured board.
 *
 * Stored as jsonb on `marks_boards.doc`. Older docs used flat `categories` +
 * `links[].note`. `normalizeDoc` lifts those fields.
 *
 * Folder delete default: the folder row is removed; its links, buttons, and
 * child folders move to the parent (or Unfiled when the folder was top-level).
 * Nested grandchildren stay inside the promoted child folders.
 *
 * `categories` is the persisted folder list (`parentId: null` = top-level).
 * `x`/`y` are leftover fields from an older canvas experiment — the live
 * board is nested folder columns, not free-position cards.
 */

export const MARKS_BOARD_ID = 'home';

export type MarksClock = {
  now: () => number;
  nextId: (prefix: string) => string;
};

let idSeq = 0;

/** Incrementing ids. Safe to define at import time — nothing calls Date.now. */
export function createId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_n${idSeq}`;
}

export function testClock(now = 1_700_000_000_000): MarksClock {
  let seq = 0;
  return {
    now: () => now,
    nextId: (prefix) => `${prefix}_t${++seq}`,
  };
}

export function createClientClock(): MarksClock {
  return {
    now: () => Date.now(),
    nextId: (prefix) => createId(prefix),
  };
}

const fallbackClock: MarksClock = {
  now: () => Date.now(),
  nextId: (prefix) => createId(prefix),
};

export interface MarkCategory {
  id: string;
  name: string;
  sort: number;
  parentId: string | null;
  collapsed: boolean;
  coverUrl: string;
  showCover: boolean;
  x: number;
  y: number;
}

export type MarksFolder = MarkCategory;

export interface MarkLink {
  id: string;
  /** Empty string = unfiled. */
  categoryId: string;
  title: string;
  url: string;
  note: string;
  sort: number;
  tags: string[];
  videoUrl: string;
  coverUrl: string;
  showImage: boolean;
  showUrl: boolean;
  showDescription: boolean;
  x: number;
  y: number;
  /** Aliases written so newer readers can use folder language. */
  folderId?: string;
  description?: string;
  cover?: string;
  hideUrl?: boolean;
  hideDescription?: boolean;
}

export type MarksButtonKind = 'url' | 'filter-tag' | 'open-folder';

export interface MarksButton {
  id: string;
  /** Empty = board toolbar. */
  folderId: string;
  label: string;
  kind: MarksButtonKind;
  url: string;
  tag: string;
  targetFolderId: string;
  icon: string;
  color: string;
  sort: number;
}

export interface MarksFilter {
  id: string;
  name: string;
  query: string;
  tag: string;
  categoryId: string;
}

export interface MarkTableCell {
  raw: string;
}

export interface MarkTable {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  colCount: number;
  rowCount: number;
  cols?: { width: number }[];
  cells: Record<string, MarkTableCell>;
}

export interface MarksDoc {
  /** Site name. Home is "Home"; new sites start empty under their own title. */
  title: string;
  categories: MarkCategory[];
  links: MarkLink[];
  buttons: MarksButton[];
  filters: MarksFilter[];
  tables: MarkTable[];
  updatedAt: number;
  folders?: MarkCategory[];
}

export const DEFAULT_TABLE_COL_COUNT = 8;
export const DEFAULT_TABLE_ROW_COUNT = 14;
export const MAX_TABLE_COL_COUNT = 30;
export const MAX_TABLE_ROW_COUNT = 50;
export const DEFAULT_TABLE_W = 560;
export const DEFAULT_TABLE_H = 420;

const SITE_ID_RE = /^site_[a-z0-9]+$/i;

export function isMarksBoardId(id: string): boolean {
  return id === MARKS_BOARD_ID || SITE_ID_RE.test(id);
}

export function marksHref(id: string): string {
  return !id || id === MARKS_BOARD_ID ? '/marks' : `/marks/${id}`;
}

export function createSiteId(clock: MarksClock = fallbackClock): string {
  return clock.nextId('site');
}

export function siteTitle(
  doc: Pick<MarksDoc, 'title'> | null | undefined,
  fallback = 'Untitled'
): string {
  const title = doc?.title?.trim() ?? '';
  return title || fallback;
}

export const BUTTON_COLORS = ['#047857', '#1d4ed8', '#b45309', '#be123c', '#6d28d9', '#44403c'] as const;

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

export function looksLikeUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) return true;
  return /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function nextSort(items: { sort: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sort), -1) + 1;
}

export function defaultCategory(
  partial: Partial<MarkCategory> & Pick<MarkCategory, 'id' | 'name'>
): MarkCategory {
  return {
    sort: 0,
    collapsed: false,
    coverUrl: '',
    showCover: true,
    x: 0,
    y: 0,
    ...partial,
    parentId: partial.parentId === undefined ? null : partial.parentId,
  };
}

export function defaultLink(partial: Partial<MarkLink> & Pick<MarkLink, 'id' | 'url'>): MarkLink {
  const url = normalizeUrl(partial.url);
  const note = asString(partial.note) || asString(partial.description);
  const categoryId =
    partial.categoryId !== undefined ? asString(partial.categoryId) : asString(partial.folderId);
  const showUrl = partial.showUrl ?? (partial.hideUrl != null ? !partial.hideUrl : true);
  const showDescription =
    partial.showDescription ?? (partial.hideDescription != null ? !partial.hideDescription : true);
  return {
    title: (partial.title ?? '').trim() || hostOf(url) || url,
    sort: 0,
    tags: Array.isArray(partial.tags) ? partial.tags : [],
    videoUrl: asString(partial.videoUrl),
    coverUrl: asString(partial.coverUrl) || asString(partial.cover),
    showImage: partial.showImage ?? true,
    showUrl,
    showDescription,
    ...partial,
    url,
    categoryId,
    note,
    x: typeof partial.x === 'number' ? partial.x : 0,
    y: typeof partial.y === 'number' ? partial.y : 0,
    folderId: categoryId,
    description: note,
    cover: asString(partial.coverUrl) || asString(partial.cover),
    hideUrl: !showUrl,
    hideDescription: !showDescription,
  };
}

export function defaultFilter(
  partial: Partial<MarksFilter> & Pick<MarksFilter, 'id' | 'name'>
): MarksFilter {
  return {
    query: '',
    tag: '',
    categoryId: '',
    ...partial,
  };
}

export function defaultButton(
  partial: Partial<MarksButton> & Pick<MarksButton, 'id' | 'label'>
): MarksButton {
  return {
    folderId: '',
    kind: 'url',
    url: '',
    tag: '',
    targetFolderId: '',
    icon: '',
    color: BUTTON_COLORS[0],
    sort: 0,
    ...partial,
  };
}

export function latestAdded<T extends { id: string }>(before: T[], after: T[]): T | undefined {
  const known = new Set(before.map((row) => row.id));
  return after.find((row) => !known.has(row.id));
}

const SLOT_W = 340;
const SLOT_H = 280;

export function nextBoardSlot(doc: MarksDoc): { x: number; y: number } {
  const roots = doc.categories.filter((category) => !category.parentId);
  const n = roots.length;
  return { x: (n % 3) * SLOT_W, y: Math.floor(n / 3) * SLOT_H };
}

export function layoutMissingPositions(doc: MarksDoc): MarksDoc {
  let n = 0;
  return {
    ...doc,
    categories: doc.categories.map((category) => {
      if (category.parentId) return category;
      if (category.x || category.y) return category;
      const x = (n % 3) * SLOT_W;
      const y = Math.floor(n / 3) * SLOT_H;
      n += 1;
      return { ...category, x, y };
    }),
  };
}

export function emptyDoc(now = 0, title = ''): MarksDoc {
  return { title, categories: [], links: [], buttons: [], filters: [], tables: [], updatedAt: now };
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function defaultTable(partial: Partial<MarkTable> & Pick<MarkTable, 'id'>): MarkTable {
  const incoming = partial.cells ?? {};
  const cells: Record<string, MarkTableCell> = {};
  for (const [key, cell] of Object.entries(incoming)) {
    const raw = typeof cell === 'string' ? cell : asString(cell?.raw);
    if (raw) cells[key.toUpperCase()] = { raw };
  }
  return {
    title: 'Table',
    x: 0,
    y: 0,
    w: DEFAULT_TABLE_W,
    h: DEFAULT_TABLE_H,
    colCount: DEFAULT_TABLE_COL_COUNT,
    rowCount: DEFAULT_TABLE_ROW_COUNT,
    cells,
    ...partial,
    title: (partial.title ?? 'Table').trim() || 'Table',
    colCount: clampInt(partial.colCount ?? DEFAULT_TABLE_COL_COUNT, 1, MAX_TABLE_COL_COUNT, DEFAULT_TABLE_COL_COUNT),
    rowCount: clampInt(partial.rowCount ?? DEFAULT_TABLE_ROW_COUNT, 1, MAX_TABLE_ROW_COUNT, DEFAULT_TABLE_ROW_COUNT),
    cells,
  };
}

export function persistDoc(doc: MarksDoc): MarksDoc {
  return {
    ...doc,
    title: asString(doc.title).trim(),
    tables: doc.tables ?? [],
    folders: doc.categories,
    links: doc.links.map((link) => ({
      ...link,
      folderId: link.categoryId,
      description: link.note,
      cover: link.coverUrl,
      hideUrl: !link.showUrl,
      hideDescription: !link.showDescription,
    })),
  };
}

export function isMarksDoc(value: unknown): value is MarksDoc {
  const doc = asRecord(value);
  if (!doc) return false;
  const folders = doc.categories ?? doc.folders;
  return Array.isArray(folders) && Array.isArray(doc.links);
}

function normalizeCategory(value: unknown, index: number): MarkCategory | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id);
  const name = asString(row.name).trim();
  if (!id || !name) return null;
  const parentRaw = row.parentId;
  const parentId =
    parentRaw == null || parentRaw === '' ? null : asString(parentRaw);
  return defaultCategory({
    id,
    name,
    sort: asNumber(row.sort, index),
    parentId,
    collapsed: asBoolean(row.collapsed),
    coverUrl: asString(row.coverUrl),
    showCover: asBoolean(row.showCover),
    x: asNumber(row.x),
    y: asNumber(row.y),
  });
}

function normalizeLinkRow(value: unknown, index: number): MarkLink | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id);
  const url = normalizeUrl(asString(row.url));
  if (!id || !url) return null;
  const tags = Array.isArray(row.tags)
    ? [...new Set(row.tags.map((tag) => asString(tag).trim().toLowerCase()).filter(Boolean))]
    : [];
  return defaultLink({
    id,
    url,
    title: asString(row.title),
    note: asString(row.note) || asString(row.description),
    categoryId: asString(row.categoryId) || asString(row.folderId),
    sort: asNumber(row.sort, index),
    tags,
    videoUrl: asString(row.videoUrl),
    coverUrl: asString(row.coverUrl) || asString(row.cover),
    showImage: asBoolean(row.showImage, true),
    showUrl: row.showUrl != null ? asBoolean(row.showUrl, true) : !asBoolean(row.hideUrl),
    showDescription:
      row.showDescription != null ? asBoolean(row.showDescription, true) : !asBoolean(row.hideDescription),
    x: asNumber(row.x),
    y: asNumber(row.y),
  });
}

function normalizeButtonRow(value: unknown, index: number): MarksButton | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id);
  const label = asString(row.label).trim();
  if (!id || !label) return null;
  const kindRaw = asString(row.kind);
  const kind: MarksButtonKind =
    kindRaw === 'filter-tag' || kindRaw === 'open-folder' ? kindRaw : 'url';
  return defaultButton({
    id,
    label,
    folderId: asString(row.folderId),
    kind,
    url: asString(row.url),
    tag: asString(row.tag).trim().toLowerCase(),
    targetFolderId: asString(row.targetFolderId),
    icon: asString(row.icon),
    color: asString(row.color, BUTTON_COLORS[0]),
    sort: asNumber(row.sort, index),
  });
}

function normalizeTableRow(value: unknown, index: number): MarkTable | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id) || `tbl_${index}`;
  if (!id) return null;
  const cells: Record<string, MarkTableCell> = {};
  const rawCells = asRecord(row.cells);
  if (rawCells) {
    for (const [key, cell] of Object.entries(rawCells)) {
      const a1 = key.toUpperCase();
      if (!/^[A-Z]+[1-9]\d*$/.test(a1)) continue;
      const rec = asRecord(cell);
      const raw = rec ? asString(rec.raw) : asString(cell);
      if (raw) cells[a1] = { raw };
    }
  }
  const cols = Array.isArray(row.cols)
    ? row.cols
        .map((col) => {
          const rec = asRecord(col);
          const width = rec ? asNumber(rec.width, 0) : 0;
          return width > 0 ? { width } : null;
        })
        .filter((col): col is { width: number } => Boolean(col))
    : undefined;
  return defaultTable({
    id,
    title: asString(row.title, 'Table'),
    x: asNumber(row.x),
    y: asNumber(row.y),
    w: asNumber(row.w, DEFAULT_TABLE_W),
    h: asNumber(row.h, DEFAULT_TABLE_H),
    z: row.z == null ? undefined : asNumber(row.z),
    colCount: asNumber(row.colCount, DEFAULT_TABLE_COL_COUNT),
    rowCount: asNumber(row.rowCount, DEFAULT_TABLE_ROW_COUNT),
    cols: cols?.length ? cols : undefined,
    cells,
  });
}

function normalizeFilterRow(value: unknown, index: number): MarksFilter | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id) || `flt_${index}`;
  const name = asString(row.name).trim();
  if (!name) return null;
  return defaultFilter({
    id,
    name,
    query: asString(row.query),
    tag: asString(row.tag).trim().toLowerCase(),
    categoryId: asString(row.categoryId),
  });
}

export function normalizeDoc(value: unknown, now = 0): MarksDoc | null {
  const doc = asRecord(value);
  if (!doc) return null;
  const folderSource = Array.isArray(doc.categories)
    ? doc.categories
    : Array.isArray(doc.folders)
      ? doc.folders
      : null;
  if (!folderSource || !Array.isArray(doc.links)) return null;
  const categories = folderSource
    .map((row, index) => normalizeCategory(row, index))
    .filter((row): row is MarkCategory => Boolean(row));
  const ids = new Set(categories.map((category) => category.id));
  const links = doc.links
    .map((row, index) => normalizeLinkRow(row, index))
    .filter((row): row is MarkLink => Boolean(row))
    .map((link) => ({
      ...link,
      categoryId: !link.categoryId || ids.has(link.categoryId) ? link.categoryId : '',
    }));
  const buttons = (Array.isArray(doc.buttons) ? doc.buttons : [])
    .map((row, index) => normalizeButtonRow(row, index))
    .filter((row): row is MarksButton => Boolean(row));
  const filters = (Array.isArray(doc.filters) ? doc.filters : [])
    .map((row, index) => normalizeFilterRow(row, index))
    .filter((row): row is MarksFilter => Boolean(row));
  const tables = (Array.isArray(doc.tables) ? doc.tables : [])
    .map((row, index) => normalizeTableRow(row, index))
    .filter((row): row is MarkTable => Boolean(row));
  return persistDoc({
    title: asString(doc.title).trim(),
    categories,
    links,
    buttons,
    filters,
    tables,
    updatedAt: asNumber(doc.updatedAt, now),
  });
}

function linkAt(
  id: string,
  categoryId: string,
  title: string,
  url: string,
  note: string,
  sort: number,
  tags: string[]
): MarkLink {
  return defaultLink({ id, categoryId, title, url, note, sort, tags });
}

/** First-run kjarni sites, grouped so the front page is useful immediately. */
export function seedDoc(now = 1): MarksDoc {
  const kjarni = defaultCategory({ id: 'cat_kjarni', name: 'Kjarni', sort: 0, x: 0, y: 0 });
  const apps = defaultCategory({ id: 'cat_apps', name: 'Apps', sort: 1, x: SLOT_W, y: 0 });
  const shop = defaultCategory({ id: 'cat_build', name: 'Build', sort: 2, x: SLOT_W * 2, y: 0 });
  const links: MarkLink[] = [
    linkAt('lnk_3dwork', kjarni.id, '3dwork', 'https://kjarni-3dwork.vercel.app/3dwork', 'STL / 3MF bench', 0, [
      'kjarni',
    ]),
    linkAt('lnk_marks', kjarni.id, 'Marks', '/marks', 'This start page', 1, ['kjarni']),
    linkAt(
      'lnk_paint',
      kjarni.id,
      'TurboPaint',
      'https://slokkvitaeki.netlify.app/kjarni/turbopaint',
      'Floor plans',
      2,
      ['kjarni']
    ),
    linkAt('lnk_hub', kjarni.id, 'Kjarni hub', 'https://slokkvitaeki.netlify.app/kjarni', 'Stjórnstöð', 3, [
      'kjarni',
    ]),
    linkAt('lnk_slokk', apps.id, 'Slökkvitæki', 'https://slokkvitaeki.netlify.app', '', 0, ['app']),
    linkAt('lnk_bruna', apps.id, 'Brunahólf', 'https://brunaholf.netlify.app', '', 1, ['app']),
    linkAt('lnk_github', shop.id, 'GitHub · kjarni', 'https://github.com/aggisigurds-dev/kjarni', 'Website code', 0, [
      'code',
    ]),
    linkAt('lnk_vercel', shop.id, 'Vercel', 'https://vercel.com/kjarni', '', 1, []),
  ];
  const filters: MarksFilter[] = [
    defaultFilter({ id: 'flt_apps', name: 'Apps', categoryId: apps.id }),
    defaultFilter({ id: 'flt_kjarni', name: 'Kjarni', tag: 'kjarni' }),
  ];
  const buttons: MarksButton[] = [
    defaultButton({
      id: 'btn_hub',
      label: 'Hub',
      kind: 'url',
      url: 'https://slokkvitaeki.netlify.app/kjarni',
      color: BUTTON_COLORS[0],
    }),
  ];
  return persistDoc({
    title: 'Home',
    categories: [kjarni, apps, shop],
    links,
    buttons,
    filters,
    tables: [],
    updatedAt: now,
  });
}

export const UNFILED_ID = '';

export function categoryById(doc: MarksDoc, id: string): MarkCategory | undefined {
  return doc.categories.find((category) => category.id === id);
}

export function folderById(doc: MarksDoc, id: string): MarkCategory | undefined {
  return categoryById(doc, id);
}

export function rootCategories(doc: MarksDoc): MarkCategory[] {
  return childCategories(doc, null);
}

export function looseLinks(doc: MarksDoc): MarkLink[] {
  return linksInCategory(doc, '');
}

export function childCategories(doc: MarksDoc, parentId: string | null): MarkCategory[] {
  return doc.categories
    .filter((category) => (category.parentId ?? null) === (parentId ?? null))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function foldersWithParent(doc: MarksDoc, parentId: string): MarkCategory[] {
  return childCategories(doc, parentId || null);
}

export function sortedCategories(doc: MarksDoc): MarkCategory[] {
  return [...doc.categories].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

export function sortedFolders(doc: MarksDoc): MarkCategory[] {
  return sortedCategories(doc);
}

export function linksInCategory(doc: MarksDoc, categoryId: string): MarkLink[] {
  return doc.links
    .filter((link) => link.categoryId === categoryId)
    .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}

export function linksInFolder(doc: MarksDoc, folderId: string): MarkLink[] {
  return linksInCategory(doc, folderId);
}

export function buttonsInFolder(doc: MarksDoc, folderId: string): MarksButton[] {
  return (doc.buttons ?? [])
    .filter((button) => button.folderId === folderId)
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}

export function ancestorIds(doc: MarksDoc, id: string): string[] {
  const ids: string[] = [];
  let current = categoryById(doc, id);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    ids.push(current.parentId);
    current = categoryById(doc, current.parentId);
  }
  return ids;
}

export function descendantIds(doc: MarksDoc, id: string): string[] {
  const ids: string[] = [];
  const walk = (parentId: string) => {
    for (const child of childCategories(doc, parentId)) {
      ids.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return ids;
}

export function wouldCycle(doc: MarksDoc, movingId: string, newParentId: string | null): boolean {
  if (!newParentId) return false;
  if (movingId === newParentId) return true;
  return descendantIds(doc, movingId).includes(newParentId);
}

export function isFolderDescendant(doc: MarksDoc, ancestorId: string, maybeChildId: string): boolean {
  if (!ancestorId || !maybeChildId) return false;
  return ancestorId === maybeChildId || descendantIds(doc, ancestorId).includes(maybeChildId);
}

export function folderOptions(
  doc: MarksDoc,
  opts?: { includeUnfiled?: boolean; excludeId?: string }
): { id: string; name: string; depth: number }[] {
  const rows: { id: string; name: string; depth: number }[] = [];
  if (opts?.includeUnfiled) rows.push({ id: '', name: 'Unfiled', depth: 0 });
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of childCategories(doc, parentId)) {
      if (opts?.excludeId && isFolderDescendant(doc, opts.excludeId, folder.id)) continue;
      rows.push({ id: folder.id, name: folder.name, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, opts?.includeUnfiled ? 1 : 0);
  return rows;
}

export function filterDoc(doc: MarksDoc, query: string): MarksDoc {
  const q = query.trim().toLowerCase();
  if (!q) return doc;
  const links = doc.links.filter((link) => {
    const hay = `${link.title} ${link.url} ${link.note} ${link.tags.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
  const buttons = (doc.buttons ?? []).filter((button) =>
    `${button.label} ${button.url} ${button.tag}`.toLowerCase().includes(q)
  );
  const keep = new Set<string>();
  const mark = (id: string) => {
    if (!id || keep.has(id)) return;
    keep.add(id);
    for (const ancestor of ancestorIds(doc, id)) keep.add(ancestor);
  };
  for (const link of links) mark(link.categoryId);
  for (const button of buttons) mark(button.folderId);
  for (const category of doc.categories) {
    if (category.name.toLowerCase().includes(q)) {
      mark(category.id);
      for (const child of descendantIds(doc, category.id)) keep.add(child);
    }
  }
  return {
    ...doc,
    links,
    buttons,
    categories: doc.categories
      .filter((category) => keep.has(category.id))
      .map((category) => ({ ...category, collapsed: false })),
  };
}

function touch(doc: MarksDoc, clock: MarksClock, patch: Partial<MarksDoc>): MarksDoc {
  return persistDoc({ ...doc, ...patch, updatedAt: clock.now() });
}

export function setSiteTitle(
  doc: MarksDoc,
  title: string,
  clock: MarksClock = fallbackClock
): MarksDoc {
  const trimmed = title.trim();
  if (!trimmed || doc.title === trimmed) return doc;
  return touch(doc, clock, { title: trimmed });
}

export function addCategory(
  doc: MarksDoc,
  name: string,
  parentId: string | null = null,
  clock: MarksClock = fallbackClock
): MarksDoc {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  if (parentId && !categoryById(doc, parentId)) return doc;
  const siblings = childCategories(doc, parentId);
  const slot = parentId ? { x: 0, y: 0 } : nextBoardSlot(doc);
  const category = defaultCategory({
    id: clock.nextId('cat'),
    name: trimmed,
    parentId,
    sort: nextSort(siblings),
    x: slot.x,
    y: slot.y,
  });
  return touch(doc, clock, { categories: [...doc.categories, category] });
}

export function addFolder(
  doc: MarksDoc,
  input: { name: string; parentId?: string | null },
  clock: MarksClock = fallbackClock
): MarksDoc {
  return addCategory(doc, input.name, input.parentId ?? null, clock);
}

export function renameCategory(
  doc: MarksDoc,
  id: string,
  name: string,
  clock: MarksClock = fallbackClock
): MarksDoc {
  const trimmed = name.trim();
  if (!trimmed || !categoryById(doc, id)) return doc;
  return touch(doc, clock, {
    categories: doc.categories.map((category) =>
      category.id === id ? { ...category, name: trimmed } : category
    ),
  });
}

export function renameFolder(
  doc: MarksDoc,
  id: string,
  name: string,
  clock: MarksClock = fallbackClock
): MarksDoc {
  return renameCategory(doc, id, name, clock);
}

export function updateCategory(
  doc: MarksDoc,
  id: string,
  patch: Partial<Pick<MarkCategory, 'name' | 'coverUrl' | 'showCover' | 'collapsed' | 'parentId'>>,
  clock: MarksClock = fallbackClock
): MarksDoc {
  if (!categoryById(doc, id)) return doc;
  return touch(doc, clock, {
    categories: doc.categories.map((category) => (category.id === id ? { ...category, ...patch } : category)),
  });
}

export function setFolderCollapsed(
  doc: MarksDoc,
  id: string,
  collapsed: boolean,
  clock: MarksClock = fallbackClock
): MarksDoc {
  return updateCategory(doc, id, { collapsed }, clock);
}

export function revealFolder(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  if (!categoryById(doc, id)) return doc;
  const open = new Set([id, ...ancestorIds(doc, id)]);
  return touch(doc, clock, {
    categories: doc.categories.map((category) =>
      open.has(category.id) ? { ...category, collapsed: false } : category
    ),
  });
}

export function reorderCategory(
  doc: MarksDoc,
  id: string,
  parentId: string | null,
  index: number,
  clock: MarksClock = fallbackClock
): MarksDoc {
  const category = categoryById(doc, id);
  if (!category) return doc;
  const nextParent = parentId || null;
  if (nextParent && !categoryById(doc, nextParent)) return doc;
  if (wouldCycle(doc, id, nextParent)) return doc;
  const siblings = childCategories(doc, nextParent).filter((row) => row.id !== id);
  const clamped = Math.max(0, Math.min(Math.floor(index), siblings.length));
  const ordered = [...siblings.slice(0, clamped), category, ...siblings.slice(clamped)];
  const sortOf = new Map(ordered.map((row, sort) => [row.id, sort]));
  return touch(doc, clock, {
    categories: doc.categories.map((row) => {
      if (row.id === id) return { ...row, parentId: nextParent, sort: clamped };
      const sort = sortOf.get(row.id);
      return sort === undefined ? row : { ...row, sort };
    }),
  });
}

export function moveCategory(
  doc: MarksDoc,
  id: string,
  parentId: string | null,
  clock: MarksClock = fallbackClock
): MarksDoc {
  return reorderCategory(doc, id, parentId, Number.POSITIVE_INFINITY, clock);
}

export function moveFolder(
  doc: MarksDoc,
  id: string,
  parentId: string,
  clock: MarksClock = fallbackClock
): MarksDoc {
  return moveCategory(doc, id, parentId || null, clock);
}

/**
 * Deletes the folder only. Links, buttons, and child folders move to the
 * parent (Unfiled when this was a top-level folder).
 */
export function removeCategory(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  const category = categoryById(doc, id);
  if (!category) return doc;
  const parentId = category.parentId ?? '';
  const parentKey = category.parentId;
  return touch(doc, clock, {
    categories: doc.categories
      .filter((row) => row.id !== id)
      .map((row) => (row.parentId === id ? { ...row, parentId: parentKey } : row)),
    links: doc.links.map((link) => (link.categoryId === id ? { ...link, categoryId: parentId } : link)),
    buttons: (doc.buttons ?? []).map((button) =>
      button.folderId === id ? { ...button, folderId: parentId } : button
    ),
  });
}

export function removeFolder(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  return removeCategory(doc, id, clock);
}

export type LinkInput = {
  categoryId?: string;
  folderId?: string;
  title?: string;
  url: string;
  note?: string;
  description?: string;
  tags?: string[] | string;
  videoUrl?: string;
  coverUrl?: string;
  cover?: string;
  showImage?: boolean;
  showUrl?: boolean;
  showDescription?: boolean;
  hideUrl?: boolean;
  hideDescription?: boolean;
  x?: number;
  y?: number;
};

function tagsFrom(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  }
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[,#\s]+/g)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function addLink(doc: MarksDoc, input: LinkInput, clock: MarksClock = fallbackClock): MarksDoc {
  const url = normalizeUrl(input.url);
  const categoryId = input.categoryId ?? input.folderId ?? '';
  if (!url) return doc;
  if (categoryId && !categoryById(doc, categoryId)) return doc;
  const siblings = linksInCategory(doc, categoryId);
  const link = defaultLink({
    id: clock.nextId('lnk'),
    categoryId,
    url,
    title: input.title,
    note: input.note ?? input.description,
    sort: nextSort(siblings),
    tags: tagsFrom(input.tags),
    videoUrl: input.videoUrl,
    coverUrl: input.coverUrl ?? input.cover,
    showImage: input.showImage,
    showUrl: input.showUrl ?? (input.hideUrl != null ? !input.hideUrl : undefined),
    showDescription:
      input.showDescription ?? (input.hideDescription != null ? !input.hideDescription : undefined),
  });
  return touch(doc, clock, { links: [...doc.links, link] });
}

export function updateLink(
  doc: MarksDoc,
  id: string,
  patch: Partial<LinkInput>,
  clock: MarksClock = fallbackClock
): MarksDoc {
  if (!doc.links.some((link) => link.id === id)) return doc;
  const nextCategory = patch.categoryId ?? patch.folderId;
  if (nextCategory && !categoryById(doc, nextCategory)) return doc;
  return touch(doc, clock, {
    links: doc.links.map((link) => {
      if (link.id !== id) return link;
      return defaultLink({
        ...link,
        url: patch.url ?? link.url,
        title: patch.title ?? link.title,
        note: patch.note ?? patch.description ?? link.note,
        categoryId: nextCategory ?? link.categoryId,
        tags: patch.tags != null ? tagsFrom(patch.tags) : link.tags,
        videoUrl: patch.videoUrl ?? link.videoUrl,
        coverUrl: patch.coverUrl ?? patch.cover ?? link.coverUrl,
        showImage: patch.showImage ?? link.showImage,
        showUrl: patch.showUrl ?? (patch.hideUrl != null ? !patch.hideUrl : link.showUrl),
        showDescription:
          patch.showDescription ??
          (patch.hideDescription != null ? !patch.hideDescription : link.showDescription),
        x: patch.x ?? link.x,
        y: patch.y ?? link.y,
      });
    }),
  });
}

export function reorderLink(
  doc: MarksDoc,
  id: string,
  categoryId: string,
  index: number,
  clock: MarksClock = fallbackClock
): MarksDoc {
  const link = doc.links.find((row) => row.id === id);
  if (!link) return doc;
  if (categoryId && !categoryById(doc, categoryId)) return doc;
  const siblings = linksInCategory(doc, categoryId).filter((row) => row.id !== id);
  const clamped = Math.max(0, Math.min(Math.floor(index), siblings.length));
  const ordered = [...siblings.slice(0, clamped), link, ...siblings.slice(clamped)];
  const sortOf = new Map(ordered.map((row, sort) => [row.id, sort]));
  return touch(doc, clock, {
    links: doc.links.map((row) => {
      if (row.id === id) return defaultLink({ ...row, categoryId, sort: clamped });
      const sort = sortOf.get(row.id);
      return sort === undefined ? row : { ...row, sort };
    }),
  });
}

export function moveLink(
  doc: MarksDoc,
  id: string,
  categoryId: string,
  clock: MarksClock = fallbackClock
): MarksDoc {
  return reorderLink(doc, id, categoryId, Number.POSITIVE_INFINITY, clock);
}

export function setCategoryPos(
  doc: MarksDoc,
  id: string,
  x: number,
  y: number,
  clock: MarksClock = fallbackClock
): MarksDoc {
  if (!categoryById(doc, id)) return doc;
  return touch(doc, clock, {
    categories: doc.categories.map((category) => (category.id === id ? { ...category, x, y } : category)),
  });
}

export function setLinkPos(
  doc: MarksDoc,
  id: string,
  x: number,
  y: number,
  clock: MarksClock = fallbackClock
): MarksDoc {
  return updateLink(doc, id, { x, y }, clock);
}

export function removeLink(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  if (!doc.links.some((link) => link.id === id)) return doc;
  return touch(doc, clock, { links: doc.links.filter((link) => link.id !== id) });
}

export type ButtonInput = {
  folderId?: string;
  label: string;
  kind?: MarksButtonKind;
  url?: string;
  tag?: string;
  targetFolderId?: string;
  icon?: string;
  color?: string;
};

function buttonFromInput(input: ButtonInput, id: string, sort: number): MarksButton | null {
  const label = input.label.trim();
  if (!label) return null;
  const kind = input.kind ?? 'url';
  const url = kind === 'url' ? normalizeUrl(input.url ?? '') : '';
  if (kind === 'url' && !url) return null;
  const tag = (input.tag ?? '').trim().toLowerCase();
  if (kind === 'filter-tag' && !tag) return null;
  const targetFolderId = input.targetFolderId ?? '';
  if (kind === 'open-folder' && !targetFolderId) return null;
  return defaultButton({
    id,
    folderId: input.folderId ?? '',
    label,
    kind,
    url,
    tag,
    targetFolderId,
    icon: (input.icon ?? '').trim(),
    color: (input.color ?? BUTTON_COLORS[0]).trim() || BUTTON_COLORS[0],
    sort,
  });
}

export function addButton(doc: MarksDoc, input: ButtonInput, clock: MarksClock = fallbackClock): MarksDoc {
  const folderId = input.folderId ?? '';
  if (folderId && !categoryById(doc, folderId)) return doc;
  if (input.kind === 'open-folder' && input.targetFolderId && !categoryById(doc, input.targetFolderId)) {
    return doc;
  }
  const button = buttonFromInput(input, clock.nextId('btn'), nextSort(buttonsInFolder(doc, folderId)));
  if (!button) return doc;
  return touch(doc, clock, { buttons: [...(doc.buttons ?? []), button] });
}

export function updateButton(
  doc: MarksDoc,
  id: string,
  patch: Partial<ButtonInput>,
  clock: MarksClock = fallbackClock
): MarksDoc {
  const current = (doc.buttons ?? []).find((button) => button.id === id);
  if (!current) return doc;
  const folderId = patch.folderId ?? current.folderId;
  if (folderId && !categoryById(doc, folderId)) return doc;
  const next = buttonFromInput(
    {
      folderId,
      label: patch.label ?? current.label,
      kind: patch.kind ?? current.kind,
      url: patch.url ?? current.url,
      tag: patch.tag ?? current.tag,
      targetFolderId: patch.targetFolderId ?? current.targetFolderId,
      icon: patch.icon ?? current.icon,
      color: patch.color ?? current.color,
    },
    current.id,
    current.sort
  );
  if (!next) return doc;
  return touch(doc, clock, {
    buttons: (doc.buttons ?? []).map((button) => (button.id === id ? next : button)),
  });
}

export function moveButton(
  doc: MarksDoc,
  id: string,
  folderId: string,
  clock: MarksClock = fallbackClock
): MarksDoc {
  return updateButton(doc, id, { folderId }, clock);
}

export function removeButton(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  if (!(doc.buttons ?? []).some((button) => button.id === id)) return doc;
  return touch(doc, clock, { buttons: (doc.buttons ?? []).filter((button) => button.id !== id) });
}

function tablesOf(doc: MarksDoc): MarkTable[] {
  return doc.tables ?? [];
}

export function tableById(doc: MarksDoc, id: string): MarkTable | undefined {
  return tablesOf(doc).find((table) => table.id === id);
}

export function nextTableSlot(doc: MarksDoc): { x: number; y: number } {
  const n = rootCategories(doc).length + 1 + tablesOf(doc).length;
  return { x: (n % 3) * SLOT_W, y: Math.floor(n / 3) * SLOT_H };
}

export function addTable(
  doc: MarksDoc,
  title = 'Table',
  clock: MarksClock = fallbackClock
): MarksDoc {
  const slot = nextTableSlot(doc);
  const table = defaultTable({
    id: clock.nextId('tbl'),
    title,
    x: slot.x,
    y: slot.y,
    w: DEFAULT_TABLE_W,
    h: DEFAULT_TABLE_H,
  });
  return touch(doc, clock, { tables: [...tablesOf(doc), table] });
}

export function renameTable(
  doc: MarksDoc,
  id: string,
  title: string,
  clock: MarksClock = fallbackClock
): MarksDoc {
  if (!tableById(doc, id)) return doc;
  const trimmed = title.trim() || 'Table';
  return touch(doc, clock, {
    tables: tablesOf(doc).map((table) => (table.id === id ? { ...table, title: trimmed } : table)),
  });
}

export function updateTable(
  doc: MarksDoc,
  id: string,
  patch: Partial<Pick<MarkTable, 'title' | 'colCount' | 'rowCount' | 'cols' | 'cells' | 'z'>>,
  clock: MarksClock = fallbackClock
): MarksDoc {
  const current = tableById(doc, id);
  if (!current) return doc;
  return touch(doc, clock, {
    tables: tablesOf(doc).map((table) =>
      table.id === id
        ? defaultTable({
            ...table,
            ...patch,
            cells: patch.cells ?? table.cells,
          })
        : table
    ),
  });
}

export function setTableCell(
  doc: MarksDoc,
  tableId: string,
  key: string,
  raw: string,
  clock: MarksClock = fallbackClock
): MarksDoc {
  const table = tableById(doc, tableId);
  const a1 = key.toUpperCase();
  if (!table || !/^[A-Z]+[1-9]\d*$/.test(a1)) return doc;
  const cells = { ...table.cells };
  if (raw) cells[a1] = { raw };
  else delete cells[a1];
  return updateTable(doc, tableId, { cells }, clock);
}

export function setTableCells(
  doc: MarksDoc,
  tableId: string,
  entries: Record<string, string>,
  clock: MarksClock = fallbackClock
): MarksDoc {
  const table = tableById(doc, tableId);
  if (!table) return doc;
  const cells = { ...table.cells };
  for (const [key, raw] of Object.entries(entries)) {
    const a1 = key.toUpperCase();
    if (!/^[A-Z]+[1-9]\d*$/.test(a1)) continue;
    if (raw) cells[a1] = { raw };
    else delete cells[a1];
  }
  return updateTable(doc, tableId, { cells }, clock);
}

function pruneCells(table: MarkTable, colCount: number, rowCount: number): Record<string, MarkTableCell> {
  const cells: Record<string, MarkTableCell> = {};
  for (const [key, cell] of Object.entries(table.cells)) {
    const match = /^([A-Z]+)(\d+)$/.exec(key);
    if (!match) continue;
    let col = 0;
    for (const ch of match[1] ?? '') col = col * 26 + (ch.charCodeAt(0) - 64);
    const row = Number(match[2]);
    if (col < 1 || col > colCount || row < 1 || row > rowCount) continue;
    cells[key] = cell;
  }
  return cells;
}

export function addTableRow(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  const table = tableById(doc, id);
  if (!table || table.rowCount >= MAX_TABLE_ROW_COUNT) return doc;
  return updateTable(doc, id, { rowCount: table.rowCount + 1 }, clock);
}

export function addTableCol(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  const table = tableById(doc, id);
  if (!table || table.colCount >= MAX_TABLE_COL_COUNT) return doc;
  return updateTable(doc, id, { colCount: table.colCount + 1 }, clock);
}

export function removeTableRow(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  const table = tableById(doc, id);
  if (!table || table.rowCount <= 1) return doc;
  const rowCount = table.rowCount - 1;
  return updateTable(doc, id, { rowCount, cells: pruneCells(table, table.colCount, rowCount) }, clock);
}

export function removeTableCol(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  const table = tableById(doc, id);
  if (!table || table.colCount <= 1) return doc;
  const colCount = table.colCount - 1;
  return updateTable(doc, id, { colCount, cells: pruneCells(table, colCount, table.rowCount) }, clock);
}

export function removeTable(doc: MarksDoc, id: string, clock: MarksClock = fallbackClock): MarksDoc {
  if (!tableById(doc, id)) return doc;
  return touch(doc, clock, { tables: tablesOf(doc).filter((table) => table.id !== id) });
}
