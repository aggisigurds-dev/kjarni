/**
 * Flokkar í Partasafni: fastir flokkar í fastri röð, flokkur hvers parts, og
 * sjálfvirka flokkunin sem giskar á flokk eftir nafni, lýsingu, skrá, sæti og
 * verkefni partsins.
 *
 * Sjálfvirkur flokkur er tillaga, merkt `auto`, þar til notandinn staðfestir
 * eða velur annan. Það sem notandinn valdi sjálfur er aldrei yfirskrifað:
 * `autoCategorize` snertir aðeins óflokkaða parta og fyrri tillögur.
 *
 * Hreint — engin geymsla hér, svo þetta keyrir eins í glugganum og prófunum.
 */

export type PartCategory =
  | 'body'
  | 'innvols'
  | 'triggerbody'
  | 'grip'
  | 'handguard'
  | 'stocksystem'
  | 'magazine'
  | 'stalror'
  | 'fittings'
  | 'accessories';

/** Óflokkað — `none` þegar notandinn valdi það sjálfur, svo sjálfvirka flokkunin láti partinn vera. */
export type CategoryValue = PartCategory | 'none';

export const UNCATEGORIZED: CategoryValue = 'none';

/** Flokkarnir í þeirri röð sem þeir sjást. */
export const PART_CATEGORIES: { id: PartCategory; label: string }[] = [
  { id: 'body', label: 'Body' },
  { id: 'innvols', label: 'Innvols' },
  { id: 'triggerbody', label: 'Triggerbody' },
  { id: 'grip', label: 'Grip' },
  { id: 'handguard', label: 'Handguard' },
  { id: 'stocksystem', label: 'Stocksystem' },
  { id: 'magazine', label: 'Magazine + mag adapter' },
  { id: 'stalror', label: 'Stálrör' },
  { id: 'fittings', label: 'Fittings' },
  { id: 'accessories', label: 'Accessories' },
];

export const UNCATEGORIZED_LABEL = 'Óflokkað';

const LABELS = new Map<string, string>(PART_CATEGORIES.map((entry) => [entry.id, entry.label]));

export function isPartCategory(value: unknown): value is PartCategory {
  return typeof value === 'string' && LABELS.has(value);
}

export function categoryLabel(value: CategoryValue | undefined | null): string {
  return (value && LABELS.get(value)) || UNCATEGORIZED_LABEL;
}

/** Flokkur parts eins og hann er geymdur: hvaða flokkur, og hvort hann er aðeins tillaga. */
export interface CategoryMark {
  category: CategoryValue;
  /** Tillaga sjálfvirku flokkunarinnar sem notandinn hefur ekki staðfest. */
  auto?: boolean;
}

/** Flokkurinn sem síað er eftir: óflokkað ef enginn, eða ef notandinn valdi óflokkað. */
export function filterCategory(mark: CategoryMark | undefined | null): CategoryValue {
  return mark && isPartCategory(mark.category) ? mark.category : 'none';
}

/** Les flokk úr geymdu skjali; allt sem ekki er þekkt telst óflokkað og ekki valið. */
export function readMark(category: unknown, auto: unknown): CategoryMark | undefined {
  if (category === 'none') return { category: 'none', ...(auto === true ? { auto: true } : {}) };
  if (!isPartCategory(category)) return undefined;
  return auto === true ? { category, auto: true } : { category };
}

// ── Sjálfvirka flokkunin ────────────────────────────────────────────────────

/** Það sem flokkunin veit um part. */
export interface ClassifyInput {
  name: string;
  /** Lýsing / athugasemdir partsins. */
  notes?: string;
  fileName?: string;
  /** Sætið á bekknum (body, barrel, grip, trigger …). */
  slotId?: string;
  projectName?: string;
}

interface Rule {
  category: PartCategory;
  pattern: RegExp;
  weight: number;
  /** Stál, steel, rör … — orðin sem ráða Stálrör þegar óvíst er milli þess og Innvols. */
  steel?: boolean;
}

// Íslenskir stafir eru ekki \w, svo orðaskil eru skrifuð sem stafa-skil.
const L = '(?<![\\p{L}\\p{N}])';
const R = '(?![\\p{L}])';

function rule(category: PartCategory, source: string, weight = 1, steel = false): Rule {
  return { category, pattern: new RegExp(source, 'iu'), weight, steel };
}

const RULES: Rule[] = [
  // Body
  rule('body', `${L}body`),
  rule('body', `${L}(?:lower|upper)${R}`, 1.5),
  rule('body', `${L}(?:neðri|nedri|efri)${R}`, 1.5),
  rule('body', `${L}rec[e]?[i]?ver`, 1.5),
  rule('body', `${L}frame${R}`),
  rule('body', `iron\\s?wolf`),
  rule('body', `${L}(?:helming|helmingur)`),
  rule('body', `${L}(?:shell|skel)${R}`),
  rule('body', `${L}(?:grind|sleði|sledi|slide)${R}`),
  rule('body', `hlaupshús|hlaupshus`, 1.5),
  rule('body', `soðið|soðin${R}|sodid`, 0.5),
  // Innvols
  rule('innvols', `gearbox|gírkass|girkass`, 1.5),
  rule('innvols', `hop[\\s-]?up`, 1.5),
  rule('innvols', `${L}tunna|${L}barrel(?!\\s?tube)`),
  rule('innvols', `${L}hlaup(?!shús|shus)`),
  rule('innvols', `${L}innri(?![\\s-]?sexkant)|${L}internal|${L}interior|innvol`),
  rule('innvols', `spring|gorm|fjöður|fjöðr|fjodur`),
  rule('innvols', `${L}gír(?:ar|inn|um)?${R}`),
  rule('innvols', `nozzle|stútur`),
  rule('innvols', `(?<!shape[\\s-]?)cylinder|${L}piston|stimpil|plunger`),
  rule('innvols', `${L}(?:motor|mótor)(?![\\s-]?grip)`),
  rule('innvols', `ventil|${L}valve|poppet`),
  rule('innvols', `${L}(?:hamar|hamr|hammer)`),
  rule('innvols', `${L}bolt(?:i|a|ar)?${R}|${L}bolt\\s?(?:carrier|handle)`),
  rule('innvols', `power[\\s-]?tube`, 1.5),
  rule('innvols', `${L}(?:púði|pudi|buffer)(?![\\s-]?tube)`),
  rule('innvols', `hleðslu|hledslu|breech`),
  rule('innvols', `${L}vél${R}|${L}vélin`),
  rule('innvols', `leiðari|leidari|linkage`, 0.8),
  // Triggerbody
  rule('triggerbody', `trigger[\\s-]?(?:body|housing|frame|system|group|box)`, 1.5),
  rule('triggerbody', `${L}trigger|${L}gikk|${L}fcg${R}|fire[\\s-]?control`),
  rule('triggerbody', `${L}selector|${L}s[eé]ar(?:inn|num|nefið)?${R}|aftengi|disconnector`),
  rule('triggerbody', `gikkhlíf|trigger[\\s-]?guard`, 1.5),
  // Grip
  rule('grip', `${L}grip`),
  rule('grip', `grip\\s?vinna|pistol[\\s-]?grip|motor[\\s-]?grip|mótor[\\s-]?grip`, 1.5),
  rule('grip', `handfang`),
  // Handguard
  rule('handguard', `hand[\\s-]?guard|framhlíf|handhlíf`, 1.5),
  rule('handguard', `${L}rail(?:s|system)?${R}|rail[\\s-]?system|m[\\s-]?lok|keymod`),
  rule('handguard', `${L}hlíf(?:in|ina|ar)?${R}`, 0.8),
  // Stocksystem
  rule('stocksystem', `${L}stock|skefti`),
  rule('stocksystem', `buffer[\\s-]?tube|butt[\\s-]?stock`, 1.5),
  rule('stocksystem', `${L}butt${R}|axlarstoð|axlarstod|shoulder`),
  // Magazine + mag adapter
  rule('magazine', `mag[\\s-]?adapter|mag[\\s-]?well|magwell`, 1.5),
  rule('magazine', `${L}mag(?:s|azine|azines)?${R}|magasín|magasin|${L}hylki`),
  // Stálrör
  rule('stalror', `stálrör|stalror|steel[\\s-]?(?:tube|pipe)|outer[\\s-]?tube|barrel[\\s-]?tube`, 1.5, true),
  rule('stalror', `rör`, 1, true),
  rule('stalror', `${L}pip(?:e|es|a|u)${R}|${L}píp`, 1, true),
  rule('stalror', `(?<!power[\\s-]?)${L}tubes?${R}`, 1, true),
  rule('stalror', `${L}(?:stál|stal|steel|ryðfrí|ryðfrít|stainless)`, 0.5, true),
  // ⌀ × veggþykkt, t.d. „⌀28 × 1,5" — en ekki „⌀25×2,5×55" (hamar) eða „⌀4 × 38" (pinni).
  rule('stalror', `[⌀Ø]\\s?\\d+(?:[.,]\\d+)?\\s?[×x]\\s?[0-3](?:[.,]\\d+)?(?![\\d.,]|\\s?[×x])`, 0.6),
  // Fittings
  rule('fittings', `fitting|nippil|nippl|nipple|coupler|coupling|macroline|microline|gegnumtak`, 1.5),
  rule('fittings', `(?<!af)tengi(?:ð|n|nu|s)?${R}|hraðtengi|quick[\\s-]?disconnect|${L}qd${R}`),
  rule('fittings', `${L}asa${R}|${L}hpa${R}|${L}co2|${L}kút|sprautuhaus|puncture|regulator|þrýstijafn`),
  rule('fittings', `(?:loft|gas|air|co2|hpa)[\\s-]?adapter|adapter.{0,12}(?:loft|gas|air|co2|hpa)`, 1.5),
  rule('fittings', `${L}o[\\s-]?hring|${L}o[\\s-]?ring|oring|þétti|thetti`),
  rule('fittings', `slang|slöng|${L}hose|gardena|${L}bsp${R}|${L}npt${R}`),
  rule('fittings', `hné|${L}elbow|${L}té(?:ð|s|sins)?${R}|${L}tee${R}`),
  rule('fittings', `inntak|tappi|tappa${R}|${L}plug${R}|end[\\s-]?cap|hattur|hetta|${L}cap${R}`),
  rule('fittings', `gasrás|gasras|gasrör|gas[\\s-]?line|gas[\\s-]?lína`),
  rule('fittings', `messing|${L}brass`, 0.5),
  // Accessories
  rule('accessories', `${L}sight|${L}scope|${L}optic|red[\\s-]?dot|sigti`),
  rule('accessories', `flashlight|vasaljós|${L}laser|${L}sling|${L}strap|bipod`),
  rule('accessories', `muzzle|flash[\\s-]?hider|hljóðdeyf|hljodeyf|suppressor|silencer|compensator`),
  rule('accessories', `skrúf|skruf|${L}screw|${L}(?:ró|rær|washer)${R}|skífa`),
  rule('accessories', `festing|${L}mount`, 0.8),
  rule('accessories', `charging[\\s_-]?handle|cocking[\\s-]?handle|${L}knob`),
  rule('accessories', `kúla|kula${R}|${L}ball${R}|${L}bbs?${R}`),
  rule('accessories', `hlíf`, 0.5),
];

/** Sæti á bekknum → flokkur. Sæti er oft rétt, en stundum giskað af skráarnafni. */
const SLOT_CATEGORY: Record<string, PartCategory> = {
  body: 'body',
  barrel: 'innvols',
  internals: 'innvols',
  muzzle: 'accessories',
  sight: 'accessories',
  rail: 'accessories',
  magazine: 'magazine',
  grip: 'grip',
  trigger: 'triggerbody',
  stock: 'stocksystem',
};

const SLOT_WEIGHT = 2.5;
const FIELD_WEIGHT = { head: 4.5, name: 3, aside: 1.5, fileName: 1, notes: 1, projectName: 0.5 } as const;
/** Lýsing sem telur upp partana sem voru sameinaðir („Joined: …", ein lína á part) segir meira en setning. */
const LISTED_NOTES_WEIGHT = 1.5;
/** Minnsta stig sem þarf til að gefa flokk; annars Óflokkað. */
const THRESHOLD = 1.5;
/** Við jafntefli: sértækari flokkur fyrst. */
const TIE_ORDER: PartCategory[] = [
  'triggerbody',
  'magazine',
  'grip',
  'stocksystem',
  'handguard',
  'fittings',
  'stalror',
  'innvols',
  'body',
  'accessories',
];

function normalize(text: string | undefined): string {
  return (text ?? '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Höfuðorð nafnsins: fyrsti hluti þess (fyrir „·", „—", „:", „(" …) sem hefur alvöru orð. */
function headOf(name: string): string {
  const parts = name.split(/\s[—–-]\s|·|:|\(|,\s|\+|\s\/\s/);
  return parts.find((part) => (part.match(/\p{L}/gu)?.length ?? 0) >= 3)?.trim() ?? '';
}

export interface Classification {
  category: PartCategory | null;
  /** Stig hvers flokks sem fékk eitthvað — til að skoða hvers vegna. */
  scores: Partial<Record<PartCategory, number>>;
}

/**
 * Giskar á flokk parts. Hver flokkur fær stig úr hverju sviði (nafn, lýsing,
 * skrá, verkefni, sæti) eftir sterkustu reglunni sem passar þar — samheiti
 * hlaðast ekki upp. Orð fremst í nafninu vega mest. Ef óvíst er milli Innvols
 * og Stálrör og „stál"/„steel"/„rör" stendur í nafninu ræður Stálrör.
 */
export function classifyPart(input: ClassifyInput): Classification {
  // Það sem stendur í svigum er samhengi („Neðri (gw grip vinna 8)" er neðri hluti, ekki grip) og vegur minna.
  const full = normalize(input.name);
  const aside = (full.match(/\([^)]*\)/g) ?? []).map((part) => part.slice(1, -1)).join(' ');
  const name = full.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const fields: [keyof typeof FIELD_WEIGHT, string][] = [
    ['head', headOf(name)],
    ['name', name],
    ['aside', aside],
    ['fileName', normalize(input.fileName).replace(/\.(?:3mf|stl|obj|step|stp)$/i, '')],
    ['notes', normalize(input.notes)],
    ['projectName', normalize(input.projectName)],
  ];

  const listedNotes = /^\s*joined:|\n/i.test(input.notes ?? '');
  const weightOf = (field: keyof typeof FIELD_WEIGHT) =>
    field === 'notes' && listedNotes ? LISTED_NOTES_WEIGHT : FIELD_WEIGHT[field];

  const scores: Partial<Record<PartCategory, number>> = {};
  // Hvort nafnið sjálft bar stálorð — og hvort nafnið bar orð úr Innvols.
  let steelInName = false;
  let innvolsInName = false;

  const best = new Map<PartCategory, Map<string, number>>();
  const take = (category: PartCategory, field: string, value: number) => {
    let byField = best.get(category);
    if (!byField) best.set(category, (byField = new Map()));
    byField.set(field, Math.max(byField.get(field) ?? 0, value));
  };

  for (const [field, text] of fields) {
    if (!text) continue;
    for (const entry of RULES) {
      if (!entry.pattern.test(text)) continue;
      // Nafnið telst einu sinni: fremst (höfuð) eða annars staðar í því.
      const key = field === 'head' ? 'name' : field;
      take(entry.category, key, entry.weight * weightOf(field));
      if (field === 'head' || field === 'name') {
        if (entry.steel) steelInName = true;
        if (entry.category === 'innvols') innvolsInName = true;
      }
    }
  }
  const slotCategory = input.slotId ? SLOT_CATEGORY[input.slotId] : undefined;
  if (slotCategory) take(slotCategory, 'slot', SLOT_WEIGHT);

  for (const [category, byField] of best) {
    scores[category] = [...byField.values()].reduce((sum, value) => sum + value, 0);
  }

  let winner: PartCategory | null = null;
  let top = 0;
  for (const category of TIE_ORDER) {
    const score = scores[category] ?? 0;
    if (score > top) {
      top = score;
      winner = category;
    }
  }
  if (top < THRESHOLD) return { category: null, scores };
  if ((winner === 'innvols' || winner === 'stalror') && steelInName && innvolsInName) winner = 'stalror';
  return { category: winner, scores };
}

/** Einn partur í keyrslu sjálfvirku flokkunarinnar. */
export interface AutoItem {
  key: string;
  mark?: CategoryMark;
  input: ClassifyInput;
}

/** Það sem sjálfvirka flokkunin breytti — `from` er fyrra ástand, til að afturkalla. */
export interface AutoChange {
  key: string;
  name: string;
  from?: CategoryMark;
  to: CategoryMark;
}

/**
 * Sjálfvirk flokkun á þeim pörtum sem notandinn hefur ekki flokkað sjálfur:
 * óflokkuðum og fyrri tillögum. Handval — líka „Óflokkað" sem notandinn valdi —
 * er aldrei snert. Skilar aðeins því sem breytist.
 */
export function autoCategorize(items: AutoItem[]): AutoChange[] {
  const changes: AutoChange[] = [];
  for (const item of items) {
    if (item.mark && !item.mark.auto) continue;
    const { category } = classifyPart(item.input);
    if (!category) continue;
    if (item.mark?.category === category) continue;
    changes.push({ key: item.key, name: item.input.name, from: item.mark, to: { category, auto: true } });
  }
  return changes;
}

/**
 * Afturköllun: fyrra ástand þeirra parta sem keyrslan breytti — nema notandinn
 * hafi breytt partinum síðan, þá stendur hans val.
 */
export function undoChanges(
  changes: AutoChange[],
  current: (key: string) => CategoryMark | undefined
): { key: string; mark?: CategoryMark }[] {
  return changes
    .filter((change) => {
      const now = current(change.key);
      return now?.category === change.to.category && now.auto === true;
    })
    .map((change) => ({ key: change.key, mark: change.from }));
}

/** Fjöldi í hverjum flokki, í föstu röðinni, með Óflokkað aftast. */
export function countByCategory<T>(
  items: T[],
  categoryOf: (item: T) => CategoryValue
): { id: CategoryValue; label: string; count: number }[] {
  const counts = new Map<CategoryValue, number>();
  for (const item of items) {
    const category = categoryOf(item);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [
    ...PART_CATEGORIES.map((entry) => ({ id: entry.id as CategoryValue, label: entry.label, count: counts.get(entry.id) ?? 0 })),
    { id: 'none' as CategoryValue, label: UNCATEGORIZED_LABEL, count: counts.get('none') ?? 0 },
  ];
}
