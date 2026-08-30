import { describe, expect, it } from 'vitest';
import {
  createStoreZip,
  formatKeepSummary,
  importKeepFiles,
  importKeepNotes,
  importPastedKeep,
  parseKeepHtml,
  parseKeepJson,
  parsePastedKeepNotes,
  unzipKeepArchive,
} from './keep';
import { addCategory, addLink, emptyDoc, testClock } from './model';

const workNote = {
  title: 'Brunahólf hub',
  textContent: 'Company hub lives here',
  isTrashed: false,
  isArchived: false,
  labels: [{ name: 'Work' }],
  annotations: [
    {
      url: 'https://brunaholf.netlify.app',
      title: 'Brunahólf',
      description: 'Hub',
    },
  ],
};

const trashNote = {
  title: 'Old junk',
  textContent: 'ignore me',
  isTrashed: true,
  labels: [{ name: 'Work' }],
  annotations: [{ url: 'https://example.com/trashed' }],
};

const archivedNote = {
  title: 'Old recipe',
  textContent: 'Keep this around',
  isArchived: true,
  isTrashed: false,
  labels: [{ name: 'Food' }],
};

const checklistNote = {
  title: 'Shop',
  listContent: [
    { text: 'Milk', isChecked: true },
    { text: 'Bread', isChecked: false },
  ],
  labels: [{ name: 'Errands' }],
};

describe('parseKeepJson', () => {
  it('reads title, labels, and link annotations', () => {
    const note = parseKeepJson(workNote);
    expect(note?.title).toBe('Brunahólf hub');
    expect(note?.labels).toEqual(['Work']);
    expect(note?.annotations[0]?.url).toBe('https://brunaholf.netlify.app');
  });

  it('returns null for an empty object', () => {
    expect(parseKeepJson({})).toBeNull();
  });
});

describe('Keep JSON → MarksDoc', () => {
  it('creates a folder per label and a link from the first URL', () => {
    const clock = testClock();
    const { doc, summary } = importKeepNotes(emptyDoc(0), [parseKeepJson(workNote)!], clock);
    const work = doc.categories.find((category) => category.name === 'Work');
    expect(work).toBeTruthy();
    expect(doc.links).toHaveLength(1);
    expect(doc.links[0]?.url).toBe('https://brunaholf.netlify.app');
    expect(doc.links[0]?.categoryId).toBe(work?.id);
    expect(doc.links[0]?.title).toBe('Brunahólf hub');
    expect(summary).toEqual({ notes: 1, links: 1, foldersCreated: 1, skipped: 0 });
  });

  it('skips trashed notes by default', () => {
    const clock = testClock();
    const { doc, summary } = importKeepNotes(
      emptyDoc(0),
      [parseKeepJson(workNote)!, parseKeepJson(trashNote)!],
      clock
    );
    expect(doc.links.map((link) => link.url)).toEqual(['https://brunaholf.netlify.app']);
    expect(summary.skipped).toBe(1);
    expect(summary.notes).toBe(1);
  });

  it('puts archived notes in Archived even when they have labels', () => {
    const clock = testClock();
    const { doc } = importKeepNotes(emptyDoc(0), [parseKeepJson(archivedNote)!], clock);
    expect(doc.categories.map((category) => category.name)).toEqual(['Archived']);
    expect(doc.links[0]?.url.startsWith('keep:')).toBe(true);
    expect(doc.links[0]?.note).toContain('Keep this around');
    expect(doc.links[0]?.showUrl).toBe(false);
  });

  it('puts unlabeled notes in Keep and writes checklist items into the description', () => {
    const clock = testClock();
    const { doc } = importKeepNotes(emptyDoc(0), [parseKeepJson(checklistNote)!], clock);
    const errands = doc.categories.find((category) => category.name === 'Errands');
    expect(errands).toBeTruthy();
    expect(doc.links[0]?.note).toContain('- [x] Milk');
    expect(doc.links[0]?.note).toContain('- [ ] Bread');
  });

  it('merges onto an existing board and skips the same URL in the same folder', () => {
    const clock = testClock();
    let doc = emptyDoc(0);
    doc = addCategory(doc, 'Work', null, clock);
    const work = doc.categories.find((category) => category.name === 'Work')!;
    doc = addLink(doc, { categoryId: work.id, title: 'Hub', url: 'https://brunaholf.netlify.app' }, clock);
    const beforeLinks = doc.links.length;

    const first = importKeepNotes(doc, [parseKeepJson(workNote)!], clock);
    expect(first.doc.links).toHaveLength(beforeLinks);
    expect(first.summary.skipped).toBe(1);
    expect(first.summary.foldersCreated).toBe(0);
    expect(first.doc.categories.filter((category) => category.name === 'Work')).toHaveLength(1);

    const extra = parseKeepJson({
      title: 'Slökkvitæki',
      annotations: [{ url: 'https://slokkvitaeki.netlify.app' }],
      labels: [{ name: 'Work' }],
    })!;
    const second = importKeepNotes(first.doc, [extra], clock);
    expect(second.doc.links).toHaveLength(beforeLinks + 1);
    expect(second.doc.links.some((link) => link.url === 'https://slokkvitaeki.netlify.app')).toBe(true);
    expect(second.summary.foldersCreated).toBe(0);
  });

  it('does not wipe existing folders when importing', () => {
    const clock = testClock();
    const seeded = addCategory(emptyDoc(0), 'Kjarni', null, clock);
    const { doc } = importKeepNotes(seeded, [parseKeepJson(workNote)!], clock);
    expect(doc.categories.map((category) => category.name)).toEqual(['Kjarni', 'Work']);
  });
});

describe('Keep HTML and paste', () => {
  it('parses a Takeout HTML note when JSON is missing', () => {
    const html = `<!DOCTYPE html><html><body>
      <div class="note">
        <div class="title">Maps</div>
        <div class="content">See <a href="https://maps.google.com">Maps</a></div>
        <div class="labels"><span class="label">Travel</span></div>
      </div>
    </body></html>`;
    const notes = parseKeepHtml(html);
    expect(notes[0]?.title).toBe('Maps');
    expect(notes[0]?.labels).toEqual(['Travel']);
    expect(notes[0]?.annotations[0]?.url).toBe('https://maps.google.com');
  });

  it('parses pasted Keep lines into the Keep folder', () => {
    const pasted = parsePastedKeepNotes(`Hub https://brunaholf.netlify.app

Just a thought
no url here`);
    expect(pasted).toHaveLength(2);
    expect(pasted[0]?.annotations[0]?.url).toBe('https://brunaholf.netlify.app');
    expect(pasted[1]?.title).toBe('Just a thought');

    const { doc, summary } = importPastedKeep(emptyDoc(0), `Hub https://brunaholf.netlify.app`, testClock());
    expect(doc.categories[0]?.name).toBe('Keep');
    expect(doc.links[0]?.url).toBe('https://brunaholf.netlify.app');
    expect(formatKeepSummary(summary)).toContain('1 notes');
  });
});

describe('Takeout zip', () => {
  it('reads Keep JSON from a store-mode zip and maps it', async () => {
    const json = new TextEncoder().encode(JSON.stringify(workNote));
    const zip = createStoreZip([{ name: 'Takeout/Keep/Brunaholf.json', data: json }]);
    const files = await unzipKeepArchive(zip);
    expect(files.map((file) => file.name)).toEqual(['Takeout/Keep/Brunaholf.json']);
    const { doc, summary } = importKeepFiles(emptyDoc(0), files, testClock());
    expect(doc.links[0]?.url).toBe('https://brunaholf.netlify.app');
    expect(summary.notes).toBe(1);
  });
});
