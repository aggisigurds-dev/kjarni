import { describe, expect, it } from 'vitest';
import { applyMarksQuery, allTags, parseTags, addFilter, applySavedFilter } from './filters';
import { mergeBookmarkImport, parseBookmarkHtml, parsePastedUrls, countImported } from './import-bookmarks';
import { extractLinkPreview, resolvePreviewUrl, screenshotCoverUrl } from './preview';
import { detectVideo, hoverVideoFor, youtubeId } from './video';
import {
  addButton,
  addCategory,
  addLink,
  descendantIds,
  emptyDoc,
  hostOf,
  layoutMissingPositions,
  moveCategory,
  moveLink,
  normalizeDoc,
  normalizeUrl,
  removeCategory,
  seedDoc,
  wouldCycle,
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

  it('promotes protocol-relative URLs', () => {
    expect(normalizeUrl('//example.com/a')).toBe('https://example.com/a');
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
    expect(seeded.filters.length).toBeGreaterThan(0);

    const withCat = addCategory(seeded, 'Personal');
    const personal = withCat.categories.find((category) => category.name === 'Personal');
    expect(personal).toBeTruthy();

    const withLink = addLink(withCat, {
      categoryId: personal!.id,
      title: 'Drive',
      url: 'drive.google.com',
    });
    expect(withLink.links.some((link) => link.url === 'https://drive.google.com')).toBe(true);

    const filtered = applyMarksQuery(withLink, { query: 'drive' });
    expect(filtered.links).toHaveLength(1);
    expect(filtered.categories).toHaveLength(1);

    const gone = removeCategory(withLink, personal!.id);
    expect(gone.categories.some((category) => category.id === personal!.id)).toBe(false);
    expect(gone.links.some((link) => link.categoryId === personal!.id)).toBe(false);
  });

  it('normalizes an old flat home board without filters or positions', () => {
    const raw = {
      updatedAt: 4,
      categories: [{ id: 'cat_kjarni', name: 'Kjarni', sort: 0 }],
      links: [{ id: 'lnk_hub', categoryId: 'cat_kjarni', title: 'Hub', url: '/kjarni', note: '', sort: 0 }],
    };
    const doc = normalizeDoc(raw);
    expect(doc?.filters).toEqual([]);
    expect(doc?.categories[0]?.parentId).toBeNull();
    expect(doc?.links[0]?.showImage).toBe(true);
    expect(doc?.links[0]?.tags).toEqual([]);
    const laid = layoutMissingPositions(doc!);
    expect(laid.categories[0]?.x).toBeGreaterThanOrEqual(0);
  });
});

describe('nested folder moves', () => {
  it('nests a folder and refuses a cycle', () => {
    let doc = seedDoc(1);
    doc = addCategory(doc, 'Inner', 'cat_kjarni');
    const inner = doc.categories.find((category) => category.name === 'Inner');
    expect(inner?.parentId).toBe('cat_kjarni');

    doc = addCategory(doc, 'Deep', inner!.id);
    const deep = doc.categories.find((category) => category.name === 'Deep');
    expect(descendantIds(doc, 'cat_kjarni')).toEqual(expect.arrayContaining([inner!.id, deep!.id]));
    expect(wouldCycle(doc, 'cat_kjarni', deep!.id)).toBe(true);

    const cycled = moveCategory(doc, 'cat_kjarni', deep!.id);
    expect(cycled).toBe(doc);

    const moved = moveCategory(doc, deep!.id, 'cat_apps');
    expect(moved.categories.find((category) => category.id === deep!.id)?.parentId).toBe('cat_apps');

    const rooted = moveCategory(moved, inner!.id, null);
    expect(rooted.categories.find((category) => category.id === inner!.id)?.parentId).toBeNull();
  });

  it('moves a link between folders and onto the board', () => {
    const seeded = seedDoc(1);
    const moved = moveLink(seeded, 'lnk_3dwork', 'cat_apps');
    expect(moved.links.find((link) => link.id === 'lnk_3dwork')?.categoryId).toBe('cat_apps');

    const loose = moveLink(moved, 'lnk_3dwork', '');
    expect(loose.links.find((link) => link.id === 'lnk_3dwork')?.categoryId).toBe('');

    const missing = moveLink(seeded, 'lnk_3dwork', 'cat_missing');
    expect(missing).toBe(seeded);
  });

  it('removes a folder and promotes nested children', () => {
    let doc = seedDoc(1);
    doc = addCategory(doc, 'Inner', 'cat_kjarni');
    const inner = doc.categories.find((category) => category.name === 'Inner')!;
    doc = addLink(doc, { categoryId: inner.id, title: 'Nested', url: 'https://example.com' });
    const gone = removeCategory(doc, 'cat_kjarni');
    expect(gone.categories.some((category) => category.id === 'cat_kjarni')).toBe(false);
    expect(gone.categories.some((category) => category.id === inner.id)).toBe(true);
    expect(gone.categories.find((category) => category.id === inner.id)?.parentId).toBeNull();
    expect(gone.links.some((link) => link.title === 'Nested')).toBe(true);
  });
});

describe('bookmark import', () => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<Title>Bookmarks</Title>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Work</H3>
    <DL><p>
        <DT><A HREF="https://brunaholf.netlify.app">Brunahólf</A>
        <DT><H3>Nested</H3>
        <DL><p>
            <DT><A HREF="https://github.com/aggisigurds-dev/kjarni">kjarni</A>
        </DL><p>
    </DL><p>
    <DT><A HREF="https://slokkvitaeki.netlify.app">Slökkvitæki</A>
</DL>`;

  it('parses nested Netscape / Chrome folders', () => {
    const imported = parseBookmarkHtml(html);
    expect(imported.folders.map((folder) => folder.name)).toEqual(['Work']);
    expect(imported.folders[0]?.links[0]?.url).toBe('https://brunaholf.netlify.app');
    expect(imported.folders[0]?.folders[0]?.name).toBe('Nested');
    expect(imported.folders[0]?.folders[0]?.links[0]?.title).toBe('kjarni');
    expect(imported.links).toHaveLength(1);
    expect(countImported(imported)).toEqual({ folders: 2, links: 3 });
  });

  it('merges an import onto the board and keeps nesting', () => {
    const imported = parseBookmarkHtml(html);
    const next = mergeBookmarkImport(emptyDoc(0), imported);
    const work = next.categories.find((category) => category.name === 'Work');
    const nested = next.categories.find((category) => category.name === 'Nested');
    expect(work).toBeTruthy();
    expect(nested?.parentId).toBe(work?.id);
    expect(next.links.some((link) => link.url === 'https://github.com/aggisigurds-dev/kjarni')).toBe(true);
    expect(next.links.some((link) => !link.categoryId && link.url.includes('slokkvitaeki'))).toBe(true);
  });

  it('parses a pasted list of URLs', () => {
    const links = parsePastedUrls(`brunaholf.netlify.app Hub
https://slokkvitaeki.netlify.app
https://github.com/aggisigurds-dev/kjarni https://vercel.com/kjarni`);
    expect(links.map((link) => link.url)).toEqual([
      'https://brunaholf.netlify.app',
      'https://slokkvitaeki.netlify.app',
      'https://github.com/aggisigurds-dev/kjarni',
      'https://vercel.com/kjarni',
    ]);
    expect(links[0]?.title).toBe('Hub');
  });
});

describe('tags and filters', () => {
  it('parses tags and applies saved chips', () => {
    expect(parseTags('#Work, Home  CODE')).toEqual(['work', 'home', 'code']);
    let doc = seedDoc(1);
    expect(allTags(doc)).toEqual(['app', 'code', 'kjarni']);

    const kjarni = applyMarksQuery(doc, { tag: 'kjarni' });
    expect(kjarni.links.every((link) => link.tags.includes('kjarni'))).toBe(true);
    expect(kjarni.links.length).toBeGreaterThan(0);

    const apps = applySavedFilter(doc, doc.filters.find((filter) => filter.name === 'Apps')!);
    expect(apps.links.every((link) => link.categoryId === 'cat_apps')).toBe(true);

    doc = addFilter(doc, { name: 'Git', query: 'github' });
    const git = doc.filters.find((filter) => filter.name === 'Git');
    expect(git).toBeTruthy();
    expect(applySavedFilter(doc, git!).links).toHaveLength(1);
  });
});

describe('preview meta', () => {
  it('reads og:image and twitter:image', () => {
    const og = extractLinkPreview(
      `<html><head>
        <meta property="og:image" content="/cover.png">
        <meta property="og:title" content="Hello">
      </head></html>`,
      'https://example.com/page'
    );
    expect(og.image).toBe('https://example.com/cover.png');
    expect(og.source).toBe('og');
    expect(og.title).toBe('Hello');

    const twitter = extractLinkPreview(
      `<meta name="twitter:image" content="https://cdn.example.com/a.jpg">`
    );
    expect(twitter.source).toBe('twitter');
    expect(resolvePreviewUrl('//cdn.example.com/a.jpg', 'https://example.com')).toBe(
      'https://cdn.example.com/a.jpg'
    );
    expect(screenshotCoverUrl('example.com')).toContain('mshots');
  });
});

describe('buttons', () => {
  it('adds a toolbar button and a folder button', () => {
    const seeded = seedDoc(1);
    expect(seeded.buttons.some((button) => button.label === 'Hub')).toBe(true);
    const next = addButton(seeded, {
      folderId: 'cat_apps',
      label: 'Apps tag',
      kind: 'filter-tag',
      tag: 'app',
    });
    expect(next.buttons.some((button) => button.folderId === 'cat_apps' && button.kind === 'filter-tag')).toBe(
      true
    );
  });
});

describe('video hover', () => {
  it('detects YouTube, Vimeo, and a file', () => {
    expect(youtubeId('https://youtu.be/dQw4w9wgGcQ')).toBe('dQw4w9wgGcQ');
    expect(detectVideo('https://www.youtube.com/watch?v=dQw4w9wgGcQ')?.kind).toBe('youtube');
    expect(detectVideo('https://vimeo.com/123456789')?.kind).toBe('vimeo');
    expect(detectVideo('https://files.example.com/clip.mp4')?.kind).toBe('file');
    expect(hoverVideoFor({ url: 'https://example.com', videoUrl: 'https://youtu.be/dQw4w9wgGcQ' })?.kind).toBe(
      'youtube'
    );
    expect(detectVideo('https://example.com')).toBeNull();
  });
});
