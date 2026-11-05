import { describe, expect, it } from 'vitest';
import {
  autoCategorize,
  categoryLabel,
  classifyPart,
  countByCategory,
  filterCategory,
  PART_CATEGORIES,
  readMark,
  undoChanges,
  type AutoItem,
  type PartCategory,
} from './categories';

describe('PART_CATEGORIES', () => {
  it('keeps the fixed order, with Óflokkað last when counting', () => {
    expect(PART_CATEGORIES.map((entry) => entry.label)).toEqual([
      'Body',
      'Innvols',
      'Triggerbody',
      'Grip',
      'Handguard',
      'Stocksystem',
      'Magazine + mag adapter',
      'Stálrör',
      'Fittings',
      'Accessories',
    ]);
    const counts = countByCategory(['body', 'none', 'body', 'fittings'] as const, (value) => value);
    expect(counts.map((entry) => entry.label).at(-1)).toBe('Óflokkað');
    expect(counts.find((entry) => entry.id === 'body')?.count).toBe(2);
    expect(counts.find((entry) => entry.id === 'none')?.count).toBe(1);
    expect(counts.find((entry) => entry.id === 'grip')?.count).toBe(0);
  });

  it('labels a missing or chosen-empty category Óflokkað', () => {
    expect(categoryLabel(undefined)).toBe('Óflokkað');
    expect(categoryLabel('none')).toBe('Óflokkað');
    expect(categoryLabel('stalror')).toBe('Stálrör');
  });
});

describe('classifyPart', () => {
  const cases: [string, PartCategory | null][] = [
    // Body
    ['Neðri · aðlagað (göt færð + sæti)', 'body'],
    ['Neðri (gw grip vinna 8) · hreinsað', 'body'],
    ['Iron wolf · soðið í eitt stykki', 'body'],
    ['Iron wolf · vinstri helmingur (+Z)', 'body'],
    ['- A - BT4 - Valken g15 receiver · one piece', 'body'],
    ['Upper receiver AR15', 'body'],
    ['DE sleði — skurðmynd (vinstri helmingur)', 'body'],
    ['DE hlaupshús — heilt (falið)', 'body'],
    ['- GW16 loftsystem efri hluti2_260207_182331', 'body'],
    // Innvols
    ['Gearbox V2 shell', 'innvols'],
    ['Hop-up unit', 'innvols'],
    ['Ventilfjöður (pennagormur ⌀5,5)', 'innvols'],
    ['Power tube', 'innvols'],
    ['Hamar ⌀25 (straddlar power-tube)', 'innvols'],
    ['powertube leidari. 12.6.. 17.5mm', 'innvols'],
    ['Drifgormur ⌀15 × 1,5 mm vír (drive spring)', 'innvols'],
    ['Nozzle', 'innvols'],
    ['Piston head', 'innvols'],
    ['interior parts_260824_225143', 'innvols'],
    // Triggerbody
    ['GW triggerframe2', 'triggerbody'],
    ['- A5 trigger system lengdur_260415_102223', 'triggerbody'],
    ['Gikkur', 'triggerbody'],
    ['Séar (stál)', 'triggerbody'],
    ['Goggur (aftengi) á ⌀2 pinna í armendanum', 'triggerbody'],
    ['Fire control group', 'triggerbody'],
    // Grip
    ['Grip vinna 13', 'grip'],
    ['gw grip vinna 8 · one piece', 'grip'],
    ['Motor grip', 'grip'],
    ['Handfang', 'grip'],
    // Handguard
    ['M-LOK handguard 10"', 'handguard'],
    ['Keymod rail system', 'handguard'],
    // Stocksystem
    ['Buffer tube', 'stocksystem'],
    ['Skefti', 'stocksystem'],
    ['GW stock adapter 27.6mm vinna 14.5mm . 43mm dypt 1', 'stocksystem'],
    // Magazine + mag adapter
    ['Mag adapter · hreinsað', 'magazine'],
    ['-- Mag adapter. tipx GW ar15 v10 styttri2_f slöngu', 'magazine'],
    ['Magwell', 'magazine'],
    ['Magasín (.43) aftast í gripinu', 'magazine'],
    // Stálrör — and „stál"/„steel"/„rör" win over Innvols when both fit
    ['Pipe ⌀28 × 1.5 wall — 363 mm', 'stalror'],
    ['Rör ⌀28 × 1,5 — 363 mm, með raufum', 'stalror'],
    ['Skrokkur ⌀28×1,5 (falið — samhengi)', 'stalror'],
    ['Stálrör 25 mm', 'stalror'],
    ['Hamarrör 18 × 1 (bor 16) — 70 mm', 'stalror'],
    ['Hlaup 13 × 1 ryðfrítt (bor ⌀11) — 256 mm', 'stalror'],
    ['Steel outer tube', 'stalror'],
    // Fittings
    ['G1 1_2 to Gardena 3', 'fittings'],
    ['O-hringur 4 × 1,2 — sætisþétti', 'fittings'],
    ['Gasnippill 1/8" BSP í ventilhús', 'fittings'],
    ['Messinghné (gas line fitting)', 'fittings'],
    ['6 mm nylon-slanga', 'fittings'],
    ['Hraðtengi', 'fittings'],
    ['ASA', 'fittings'],
    ['HPA air adapter', 'fittings'],
    ['Macroline slöngutengi', 'fittings'],
    ['Quick disconnect', 'fittings'],
    ['Gegnumtak 1/4"', 'fittings'],
    ['CO2 74 g', 'fittings'],
    ['Endatappi (end cap)', 'fittings'],
    // Accessories
    ['Red dot sight', 'accessories'],
    ['Hljóðdeyfir 14mm', 'accessories'],
    ['Sling mount', 'accessories'],
    ['Skrúfur M4', 'accessories'],
    ['Flashlight', 'accessories'],
    ['Kúla ⌀17,3', 'accessories'],
    // Nothing to go on
    ['Box 30 mm', null],
    ['Sveifarpinni', null],
  ];

  it.each(cases)('%s → %s', (name, expected) => {
    expect(classifyPart({ name }).category).toBe(expected);
  });

  it('does not read „tengi" inside other words as Fittings', () => {
    expect(classifyPart({ name: 'Leiðari / tengiarmur (linkage arm 98-16)' }).category).toBe('innvols');
  });

  it('uses the description, file and seat when the name says nothing', () => {
    expect(
      classifyPart({ name: 'Untitled blaster · one piece', notes: 'Joined: - A - BT4 - Valken Body A5 front' }).category
    ).toBe('body');
    expect(classifyPart({ name: '(Unsaved)', fileName: 'half-inch-coupler_260921_011559.3mf' }).category).toBe('fittings');
    expect(classifyPart({ name: 'Shape-Cylinder.stl33', slotId: 'stock' }).category).toBe('stocksystem');
    expect(classifyPart({ name: 'grip-test', slotId: 'grip' }).category).toBe('grip');
  });

  it('lets the name outweigh the build it is in', () => {
    expect(classifyPart({ name: 'Grip vinna 13', projectName: 'Iron wolf body' }).category).toBe('grip');
    // A build name alone is too little to sort by.
    expect(classifyPart({ name: 'Box 30 mm', projectName: 'Iron wolf body' }).category).toBeNull();
  });
});

describe('autoCategorize', () => {
  const items: AutoItem[] = [
    { key: 'a', input: { name: 'Grip vinna 13' } },
    { key: 'b', mark: { category: 'body' }, input: { name: 'Gikkur' } },
    { key: 'c', mark: { category: 'none' }, input: { name: 'Mag adapter' } },
    { key: 'd', mark: { category: 'body', auto: true }, input: { name: 'Gikkur' } },
    { key: 'e', mark: { category: 'grip', auto: true }, input: { name: 'Grip vinna 9' } },
    { key: 'f', input: { name: 'Box 30 mm' } },
  ];

  it('suggests a category for unsorted parts and earlier suggestions, never over a hand-picked one', () => {
    const changes = autoCategorize(items);
    expect(changes.map((change) => [change.key, change.to])).toEqual([
      ['a', { category: 'grip', auto: true }],
      ['d', { category: 'triggerbody', auto: true }],
    ]);
    expect(changes[1].from).toEqual({ category: 'body', auto: true });
    expect(changes[0].from).toBeUndefined();
  });

  it('undoes what it did, unless the user has changed the part since', () => {
    const changes = autoCategorize(items);
    const now = new Map<string, { category: PartCategory; auto?: boolean }>([
      ['a', { category: 'grip', auto: true }],
      ['d', { category: 'innvols' }],
    ]);
    expect(undoChanges(changes, (key) => now.get(key))).toEqual([{ key: 'a', mark: undefined }]);
  });
});

describe('readMark / filterCategory', () => {
  it('reads only known categories, and keeps a chosen Óflokkað apart from none at all', () => {
    expect(readMark('grip', undefined)).toEqual({ category: 'grip' });
    expect(readMark('grip', true)).toEqual({ category: 'grip', auto: true });
    expect(readMark('none', false)).toEqual({ category: 'none' });
    expect(readMark('laser-cannon', false)).toBeUndefined();
    expect(readMark(undefined, true)).toBeUndefined();
    expect(filterCategory(undefined)).toBe('none');
    expect(filterCategory({ category: 'none' })).toBe('none');
    expect(filterCategory({ category: 'stalror', auto: true })).toBe('stalror');
  });
});
