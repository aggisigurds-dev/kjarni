/**
 * Google Keep → Marks import.
 *
 * Keep has no official “export all” API for web apps. This reads a Google
 * Takeout Keep dump (zip / folder / .json / .html) and merges notes onto the
 * board. Text-only notes become `keep:` items so they stay editable.
 */

import {
  addCategory,
  addLink,
  hostOf,
  latestAdded,
  normalizeUrl,
  type MarksClock,
  type MarksDoc,
} from './model';

export const KEEP_UNLABELED_FOLDER = 'Keep';
export const KEEP_ARCHIVED_FOLDER = 'Archived';
export const KEEP_MAX_COVER_BYTES = 80_000;

const URL_IN_TEXT = /https?:\/\/[^\s<>"'()]+/gi;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

export interface KeepListItem {
  text: string;
  isChecked: boolean;
}

export interface KeepAnnotation {
  url: string;
  title: string;
  description: string;
}

export interface KeepAttachment {
  filePath: string;
  mimetype: string;
}

export interface KeepNote {
  title: string;
  textContent: string;
  labels: string[];
  annotations: KeepAnnotation[];
  listContent: KeepListItem[];
  color: string;
  isArchived: boolean;
  isTrashed: boolean;
  attachments: KeepAttachment[];
}

export interface KeepSourceFile {
  name: string;
  text?: string;
  bytes?: Uint8Array;
}

export interface KeepImportOptions {
  skipTrashed?: boolean;
  archivedFolder?: string;
  unlabeledFolder?: string;
  maxCoverBytes?: number;
}

export interface KeepImportSummary {
  notes: number;
  links: number;
  foldersCreated: number;
  skipped: number;
}

export interface KeepImportResult {
  doc: MarksDoc;
  summary: KeepImportSummary;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function decodeEntities(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .trim();
}

function labelNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) names.push(item.trim());
    else {
      const row = asRecord(item);
      const name = asString(row?.name).trim();
      if (name) names.push(name);
    }
  }
  return [...new Set(names)];
}

function annotationLinks(raw: unknown): KeepAnnotation[] {
  if (!Array.isArray(raw)) return [];
  const out: KeepAnnotation[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const url = normalizeUrl(asString(row.url) || asString(row.webLink));
    if (!url) continue;
    out.push({
      url,
      title: asString(row.title) || asString(row.description),
      description: asString(row.description),
    });
  }
  return out;
}

function listItems(raw: unknown): KeepListItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = asRecord(item);
      return {
        text: asString(row?.text).trim(),
        isChecked: Boolean(row?.isChecked),
      };
    })
    .filter((item) => item.text);
}

function attachmentsOf(raw: unknown): KeepAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = asRecord(item);
      return {
        filePath: asString(row?.filePath),
        mimetype: asString(row?.mimetype),
      };
    })
    .filter((item) => item.filePath);
}

function urlsInText(text: string): string[] {
  const found = text.match(URL_IN_TEXT) ?? [];
  return [...new Set(found.map((url) => normalizeUrl(url.replace(/[),.;]+$/, ''))).filter(Boolean))];
}

export function parseKeepJson(raw: unknown): KeepNote | null {
  const row = asRecord(raw);
  if (!row) return null;
  const title = asString(row.title).trim();
  const textContent = asString(row.textContent) || asString(row.text);
  const labels = labelNames(row.labels);
  const annotations = annotationLinks(row.annotations);
  const listContent = listItems(row.listContent);
  const attachments = attachmentsOf(row.attachments);
  const isTrashed = Boolean(row.isTrashed);
  const isArchived = Boolean(row.isArchived);
  if (!title && !textContent && annotations.length === 0 && listContent.length === 0 && attachments.length === 0) {
    return null;
  }
  return {
    title,
    textContent,
    labels,
    annotations,
    listContent,
    color: asString(row.color),
    isArchived,
    isTrashed,
    attachments,
  };
}

function firstClass(html: string, className: string): string {
  const re = new RegExp(
    `<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)</`,
    'i'
  );
  const match = re.exec(html);
  return match ? decodeEntities(match[1] ?? '') : '';
}

function allClass(html: string, className: string): string[] {
  const re = new RegExp(
    `<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)</`,
    'gi'
  );
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const text = decodeEntities(match[1] ?? '');
    if (text) out.push(text);
  }
  return out;
}

export function looksLikeKeepHtml(html: string): boolean {
  if (/NETSCAPE-Bookmark-file/i.test(html)) return false;
  return /class=["'][^"']*\bnote\b/i.test(html) || /class=["'][^"']*\blistcontent\b/i.test(html);
}

export function parseKeepHtml(html: string): KeepNote[] {
  const chunks = html.split(/<div[^>]+class=["'][^"']*\bnote\b[^"']*["'][^>]*>/i).slice(1);
  const sources = chunks.length > 0 ? chunks.map((chunk) => chunk.split(/<\/div>\s*<\/body>/i)[0] ?? chunk) : [html];
  const notes: KeepNote[] = [];
  for (const source of sources) {
    const title = firstClass(source, 'title') || firstClass(source, 'heading');
    const textContent = firstClass(source, 'content') || firstClass(source, 'text');
    const labels = allClass(source, 'label');
    const hrefs = [...source.matchAll(/href=["']([^"']+)["']/gi)].map((match) => normalizeUrl(match[1] ?? ''));
    const annotations = [...new Set(hrefs.filter(Boolean))].map((url) => ({
      url,
      title: '',
      description: '',
    }));
    const checked = [...source.matchAll(/<li[^>]+class=["'][^"']*\bchecked\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].map(
      (match) => ({ text: decodeEntities(match[1] ?? ''), isChecked: true })
    );
    const unchecked = [
      ...source.matchAll(/<li[^>]+class=["'][^"']*\bunchecked\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi),
    ].map((match) => ({ text: decodeEntities(match[1] ?? ''), isChecked: false }));
    const note = parseKeepJson({
      title,
      textContent,
      labels: labels.map((name) => ({ name })),
      annotations,
      listContent: [...unchecked, ...checked],
      isArchived: /class=["'][^"']*\barchived\b/i.test(source),
      isTrashed: /class=["'][^"']*\btrashed\b/i.test(source),
    });
    if (note) notes.push(note);
  }
  return notes;
}

export function parsePastedKeepNotes(text: string): KeepNote[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const notes: KeepNote[] = [];

  const fromBlock = (block: string): KeepNote | null => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    const urls = urlsInText(block);
    const titleLine = lines.find((line) => !/^https?:\/\//i.test(line) && !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(line));
    const body = lines.filter((line) => line !== titleLine && !urlsInText(line).length).join('\n');
    return {
      title: (titleLine ?? '').trim(),
      textContent: body || (urls.length === 0 ? block : ''),
      labels: [],
      annotations: urls.map((url) => ({ url, title: '', description: '' })),
      listContent: [],
      color: '',
      isArchived: false,
      isTrashed: false,
      attachments: [],
    };
  };

  if (blocks.length > 1) {
    for (const block of blocks) {
      const note = fromBlock(block);
      if (note) notes.push(note);
    }
    return notes;
  }

  const lines = text.split(/\r?\n/);
  let pendingTitle = '';
  let pendingBody: string[] = [];
  let pendingUrls: string[] = [];

  const flush = () => {
    if (!pendingTitle && pendingBody.length === 0 && pendingUrls.length === 0) return;
    notes.push({
      title: pendingTitle,
      textContent: pendingBody.join('\n'),
      labels: [],
      annotations: pendingUrls.map((url) => ({ url, title: '', description: '' })),
      listContent: [],
      color: '',
      isArchived: false,
      isTrashed: false,
      attachments: [],
    });
    pendingTitle = '';
    pendingBody = [];
    pendingUrls = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const urls = urlsInText(line);
    if (urls.length > 0) {
      pendingUrls.push(...urls);
      const rest = line.replace(URL_IN_TEXT, '').trim();
      if (rest && !pendingTitle) pendingTitle = rest;
      else if (rest) pendingBody.push(rest);
      continue;
    }
    if (!pendingTitle && pendingUrls.length === 0 && pendingBody.length === 0) {
      pendingTitle = line;
      continue;
    }
    pendingBody.push(line);
  }
  flush();
  return notes;
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

function isKeepJsonName(name: string): boolean {
  const base = basename(name);
  if (!base.toLowerCase().endsWith('.json')) return false;
  if (/(^|\/)(metadata|index|user_settings)\.json$/i.test(name.replace(/\\/g, '/'))) return false;
  return true;
}

function isKeepHtmlName(name: string): boolean {
  return /\.html?$/i.test(basename(name));
}

function isImageName(name: string, mime = ''): boolean {
  if (mime.startsWith('image/')) return true;
  return IMAGE_EXT.test(basename(name));
}

export function notesFromKeepFiles(files: KeepSourceFile[]): {
  notes: KeepNote[];
  attachments: Map<string, Uint8Array>;
} {
  const attachments = new Map<string, Uint8Array>();
  const notes: KeepNote[] = [];
  let hasJson = false;

  for (const file of files) {
    const path = file.name.replace(/\\/g, '/');
    if (file.bytes && isImageName(path)) {
      attachments.set(path, file.bytes);
      attachments.set(basename(path), file.bytes);
    }
    if (!file.text) continue;
    if (isKeepJsonName(path)) {
      try {
        const parsed = JSON.parse(file.text) as unknown;
        const note = parseKeepJson(parsed);
        if (note) {
          notes.push(note);
          hasJson = true;
        }
      } catch {
        /* skip non-note json */
      }
    }
  }

  if (!hasJson) {
    for (const file of files) {
      if (!file.text || !isKeepHtmlName(file.name)) continue;
      if (!looksLikeKeepHtml(file.text) && !/class=["'][^"']*\btitle\b/i.test(file.text)) continue;
      notes.push(...parseKeepHtml(file.text));
    }
  }

  return { notes, attachments };
}

function folderNamed(doc: MarksDoc, name: string): ReturnType<MarksDoc['categories']['find']> {
  return doc.categories.find((category) => category.name.toLowerCase() === name.toLowerCase());
}

function ensureFolder(
  doc: MarksDoc,
  name: string,
  clock: MarksClock
): { doc: MarksDoc; id: string; created: boolean } {
  const existing = folderNamed(doc, name);
  if (existing) return { doc, id: existing.id, created: false };
  const next = addCategory(doc, name, null, clock);
  const created = latestAdded(doc.categories, next.categories);
  if (!created) return { doc, id: '', created: false };
  return { doc: next, id: created.id, created: true };
}

function hasUrlInFolder(doc: MarksDoc, url: string, folderId: string): boolean {
  const normalized = normalizeUrl(url);
  return doc.links.some((link) => link.categoryId === folderId && normalizeUrl(link.url) === normalized);
}

function noteUrls(note: KeepNote): string[] {
  const fromAnnotations = note.annotations.map((item) => item.url);
  const fromText = urlsInText(note.textContent);
  return [...new Set([...fromAnnotations, ...fromText].map((url) => normalizeUrl(url)).filter(Boolean))];
}

function checklistText(note: KeepNote): string {
  if (note.listContent.length === 0) return '';
  return note.listContent.map((item) => `- [${item.isChecked ? 'x' : ' '}] ${item.text}`).join('\n');
}

function noteDescription(note: KeepNote, urls: string[]): string {
  const extraUrls = urls.slice(1);
  const extraAnnotations = note.annotations
    .filter((item) => extraUrls.includes(normalizeUrl(item.url)))
    .map((item) => (item.description ? `${item.url} — ${item.description}` : item.url));
  const leftover = extraUrls.filter((url) => !extraAnnotations.some((line) => line.startsWith(url)));
  return [note.textContent.trim(), checklistText(note), ...extraAnnotations, ...leftover]
    .filter(Boolean)
    .join('\n\n');
}

function noteTitle(note: KeepNote, url: string): string {
  if (note.title.trim()) return note.title.trim();
  const annotation = note.annotations.find((item) => normalizeUrl(item.url) === url);
  if (annotation?.title.trim()) return annotation.title.trim();
  return hostOf(url) || url || 'Untitled note';
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return `data:${mime};base64,${base64}`;
}

function mimeFor(path: string, fallback: string): string {
  if (fallback.startsWith('image/')) return fallback;
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg';
  if (/\.gif$/i.test(path)) return 'image/gif';
  if (/\.webp$/i.test(path)) return 'image/webp';
  if (/\.bmp$/i.test(path)) return 'image/bmp';
  return 'image/png';
}

function coverForNote(
  note: KeepNote,
  attachments: Map<string, Uint8Array>,
  maxBytes: number
): string {
  for (const attachment of note.attachments) {
    const bytes =
      attachments.get(attachment.filePath) ??
      attachments.get(attachment.filePath.replace(/\\/g, '/')) ??
      attachments.get(basename(attachment.filePath));
    if (!bytes || bytes.length === 0 || bytes.length > maxBytes) continue;
    if (!isImageName(attachment.filePath, attachment.mimetype)) continue;
    return bytesToDataUrl(bytes, mimeFor(attachment.filePath, attachment.mimetype));
  }
  return '';
}

function destinationNames(note: KeepNote, options: Required<KeepImportOptions>): string[] {
  if (note.isArchived) return [options.archivedFolder];
  if (note.labels.length > 0) return note.labels;
  return [options.unlabeledFolder];
}

function keepPlaceholderUrl(clock: MarksClock): string {
  return `keep:${clock.nextId('note')}`;
}

export function importKeepNotes(
  doc: MarksDoc,
  notes: KeepNote[],
  clock: MarksClock,
  options: KeepImportOptions = {},
  attachments = new Map<string, Uint8Array>()
): KeepImportResult {
  const opts: Required<KeepImportOptions> = {
    skipTrashed: options.skipTrashed ?? true,
    archivedFolder: options.archivedFolder ?? KEEP_ARCHIVED_FOLDER,
    unlabeledFolder: options.unlabeledFolder ?? KEEP_UNLABELED_FOLDER,
    maxCoverBytes: options.maxCoverBytes ?? KEEP_MAX_COVER_BYTES,
  };

  let next = doc;
  let notesImported = 0;
  let links = 0;
  let foldersCreated = 0;
  let skipped = 0;

  for (const note of notes) {
    if (opts.skipTrashed && note.isTrashed) {
      skipped += 1;
      continue;
    }
    const urls = noteUrls(note);
    const url = urls[0] ?? keepPlaceholderUrl(clock);
    const title = noteTitle(note, urls[0] ?? '');
    const description = noteDescription(note, urls);
    const tags = note.labels.map((label) => label.trim().toLowerCase()).filter(Boolean);
    const coverUrl = coverForNote(note, attachments, opts.maxCoverBytes);
    const folders = destinationNames(note, opts);
    let addedForNote = 0;

    for (const folderName of folders) {
      const folder = ensureFolder(next, folderName, clock);
      next = folder.doc;
      if (folder.created) foldersCreated += 1;
      if (!folder.id) continue;
      if (hasUrlInFolder(next, url, folder.id)) {
        continue;
      }
      const before = next;
      next = addLink(
        next,
        {
          categoryId: folder.id,
          title,
          url,
          note: description,
          tags,
          coverUrl,
          showUrl: !url.startsWith('keep:'),
        },
        clock
      );
      if (next !== before) {
        links += 1;
        addedForNote += 1;
      }
    }

    if (addedForNote > 0) notesImported += 1;
    else skipped += 1;
  }

  return {
    doc: next,
    summary: { notes: notesImported, links, foldersCreated, skipped },
  };
}

export function importKeepFiles(
  doc: MarksDoc,
  files: KeepSourceFile[],
  clock: MarksClock,
  options: KeepImportOptions = {}
): KeepImportResult {
  const { notes, attachments } = notesFromKeepFiles(files);
  if (notes.length === 0) {
    return { doc, summary: { notes: 0, links: 0, foldersCreated: 0, skipped: 0 } };
  }
  return importKeepNotes(doc, notes, clock, options, attachments);
}

export function importPastedKeep(
  doc: MarksDoc,
  text: string,
  clock: MarksClock,
  options: KeepImportOptions = {}
): KeepImportResult {
  const notes = parsePastedKeepNotes(text);
  if (notes.length === 0) {
    return { doc, summary: { notes: 0, links: 0, foldersCreated: 0, skipped: 0 } };
  }
  return importKeepNotes(doc, notes, clock, { ...options, unlabeledFolder: options.unlabeledFolder ?? KEEP_UNLABELED_FOLDER });
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEocd(bytes: Uint8Array): number {
  const view = viewOf(bytes);
  const start = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

async function inflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'function') {
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    const source = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(copy);
        controller.close();
      },
    });
    const stream = source.pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.inflateRawSync(raw));
}

export async function unzipKeepArchive(bytes: Uint8Array): Promise<KeepSourceFile[]> {
  const view = viewOf(bytes);
  const eocd = findEocd(bytes);
  if (eocd < 0) return [];
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files: KeepSourceFile[] = [];
  const decoder = new TextDecoder();

  for (let i = 0; i < entries; i += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) continue;
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compressed > bytes.length) continue;
    const raw = bytes.subarray(dataStart, dataStart + compressed);
    let payload: Uint8Array | null = null;
    if (method === 0) payload = raw;
    else if (method === 8) {
      try {
        payload = await inflateRaw(raw);
      } catch {
        payload = null;
      }
    }
    if (!payload) continue;
    const text =
      /\.(json|html?|txt|md)$/i.test(name) || payload.length < 2_000_000
        ? decoder.decode(payload)
        : undefined;
    files.push({
      name,
      bytes: payload,
      text: /\.(json|html?|txt|md)$/i.test(name) ? text : undefined,
    });
  }
  return files;
}

export function createStoreZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data;
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, data);

    const header = new Uint8Array(46 + name.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x02014b50, true);
    headerView.setUint32(24, data.length, true);
    headerView.setUint32(20, data.length, true);
    headerView.setUint16(28, name.length, true);
    headerView.setUint32(42, offset, true);
    header.set(name, 46);
    central.push(header);
    offset += local.length + data.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  for (const chunk of central) {
    out.set(chunk, at);
    at += chunk.length;
  }
  out.set(end, at);
  return out;
}

export async function filesFromKeepUploads(files: File[]): Promise<KeepSourceFile[]> {
  const out: KeepSourceFile[] = [];
  for (const file of files) {
    const name = file.webkitRelativePath || file.name;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(name) || file.type === 'application/zip') {
      out.push(...(await unzipKeepArchive(bytes)));
      continue;
    }
    const text = /\.(json|html?|txt|md)$/i.test(name) ? new TextDecoder().decode(bytes) : undefined;
    out.push({ name, bytes, text });
  }
  return out;
}

export async function importKeepUploads(
  doc: MarksDoc,
  files: File[],
  clock: MarksClock,
  options: KeepImportOptions = {}
): Promise<KeepImportResult> {
  const sources = await filesFromKeepUploads(files);
  return importKeepFiles(doc, sources, clock, options);
}

export function formatKeepSummary(summary: KeepImportSummary): string {
  return `${summary.notes} notes · ${summary.links} links · ${summary.foldersCreated} folders created · ${summary.skipped} skipped`;
}
