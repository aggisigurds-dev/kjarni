/** Heiti á því sem gerist í dansinum — stökk, snúningar, skref og stöður —
 *  og æfingaáherslur út frá einkunnum.
 *
 *  Stökkin og snúningarnir fylgja lista Alþjóðaskautasambandsins (ISU) og
 *  skammstöfunum hans (2Lz, FCSSp, StSq …) — sömu skammstafanir og
 *  Skautasamband Íslands notar í grunnprófum og á prótokolum. Annað á listanum
 *  (lítil stökk, stöður, tilbrigði) er ekki á ISU-listanum en algengt í
 *  dönsum. Listinn er tillögur: þjálfarinn getur alltaf skrifað sitt eigið
 *  heiti. Hreint — prófað í node. */

export type ElementGroupId = "stokk" | "hopp" | "snuningar" | "tilbrigdi" | "skref" | "stodur" | "dans";

/** `code` er ISU-skammstöfunin (ef hún er til), `also` annað heiti sem leitin finnur líka. */
export type ElementItem = { name: string; code?: string; also?: string };

export type ElementGroup = { id: ElementGroupId; label: string; note?: string; items: ElementItem[] };

/** Alþjóðlegu heitin eru notuð á stökkin (þau eru eins á öllum málum). */
export const ELEMENTS: ElementGroup[] = [
  {
    id: "stokk",
    label: "Stökk",
    note: "ISU-listinn",
    items: [
      { name: "Toe loop", code: "T" },
      { name: "Salchow", code: "S" },
      { name: "Loop", code: "Lo", also: "Rittberger" },
      { name: "Flip", code: "F" },
      { name: "Lutz", code: "Lz" },
      { name: "Axel", code: "A" },
      { name: "Euler", code: "Eu", also: "hálft loop, half loop" },
    ],
  },
  {
    id: "hopp",
    label: "Lítil stökk og hopp",
    items: [
      { name: "Valshopp", also: "waltz jump, þriggja-hopp" },
      { name: "Kanínuhopp", also: "bunny hop" },
      { name: "Hálft flip", also: "half flip" },
      { name: "Hálft Lutz", also: "half lutz" },
      { name: "Split-stökk", also: "split jump, splittstökk" },
      { name: "Stag-stökk", also: "stag jump" },
      { name: "Rússneskt split", also: "Russian split" },
      { name: "Falling leaf", also: "fallandi lauf" },
      { name: "Mazurka" },
      { name: "Ballettstökk", also: "ballet jump" },
      { name: "Walley" },
      { name: "Toe walley" },
      { name: "Stökksamsetning", also: "combination" },
      { name: "Stökkröð", also: "sequence" },
    ],
  },
  {
    id: "snuningar",
    label: "Snúningar",
    note: "ISU-listinn",
    items: [
      { name: "Uppréttur snúningur", code: "USp", also: "upright spin, standandi" },
      { name: "Layback", code: "LSp", also: "baksveigja" },
      { name: "Vogarsnúningur", code: "CSp", also: "camel spin" },
      { name: "Sitjandi snúningur", code: "SSp", also: "sit spin" },
      { name: "Samsettur snúningur", code: "CoSp", also: "combination spin" },
    ],
  },
  {
    id: "tilbrigdi",
    label: "Tilbrigði í snúningi",
    items: [
      { name: "Biellmann" },
      { name: "Donut", also: "kleinuhringur" },
      { name: "Pancake", also: "pönnukaka" },
      { name: "Cannonball", also: "fallbyssukúla" },
      { name: "Y-snúningur", also: "Y-spin" },
      { name: "I-snúningur", also: "I-spin" },
      { name: "Haircutter" },
      { name: "Catch-foot" },
      { name: "Scratch-snúningur", also: "scratch spin, skrúfa" },
      { name: "Baksnúningur", also: "back spin" },
      { name: "Death drop" },
      { name: "Butterfly", also: "fiðrildi" },
      { name: "Illusion" },
      { name: "Broken leg" },
    ],
  },
  {
    id: "skref",
    label: "Skref og beygjur",
    items: [
      { name: "Skrefaröð", code: "StSq", also: "step sequence, sporaröð" },
      { name: "Kóreógrafísk röð", code: "ChSq", also: "choreographic sequence, choreo" },
      { name: "Three-turn", also: "þristur, 3-turn" },
      { name: "Mohawk" },
      { name: "Choctaw" },
      { name: "Bracket" },
      { name: "Rocker" },
      { name: "Counter" },
      { name: "Loop-beygja", also: "loop turn, lykkja" },
      { name: "Twizzle" },
      { name: "Chassé" },
      { name: "Krossskref", also: "crossovers, yfirstig" },
      { name: "Cross-roll" },
      { name: "Táskref", also: "toe steps" },
    ],
  },
  {
    id: "stodur",
    label: "Stöður og svif",
    items: [
      { name: "Spírall", also: "spiral, arabesque, vog, vogarstaða" },
      { name: "Charlotte" },
      { name: "Kerrigan-spírall" },
      { name: "Y-spírall" },
      { name: "Biellmann-spírall" },
      { name: "Catch-foot spírall" },
      { name: "Spread eagle", also: "örn" },
      { name: "Ina Bauer" },
      { name: "Hydroblade" },
      { name: "Besti squat" },
      { name: "Cantilever" },
      { name: "Útfall", also: "lunge" },
      { name: "Pivot" },
      { name: "Shoot-the-duck", also: "hnébeygja á öðrum fæti" },
      { name: "Hnérennsli", also: "knee slide" },
      { name: "Splitt", also: "split" },
    ],
  },
  {
    id: "dans",
    label: "Í dansinum",
    items: [
      { name: "Byrjunarstaða" },
      { name: "Lokastaða" },
      { name: "Hápunktur í tónlist" },
      { name: "Hraður kafli" },
      { name: "Rólegur kafli" },
      { name: "Taktbreyting" },
      { name: "Armhreyfing" },
      { name: "Hneiging" },
    ],
  },
];

export const ALL_ELEMENTS: string[] = ELEMENTS.flatMap((g) => g.items.map((i) => i.name));

const lower = (s: string) => s.trim().toLowerCase();

function itemIn(group: ElementGroupId, name: string): ElementItem | undefined {
  const n = lower(name);
  return ELEMENTS.find((g) => g.id === group)?.items.find((i) => lower(i.name) === n);
}

/** Fjöldi snúninga í stökki, sem forskeyti: "2× Salchow". Einfalt stökk hefur ekkert forskeyti. */
export const TURNS = ["", "2×", "3×", "4×"] as const;
export type Turns = (typeof TURNS)[number];

/** "2× Lutz" → { turns: "2×", name: "Lutz" } */
export function splitTurns(label: string): { turns: Turns; name: string } {
  const m = label.trim().match(/^([1-4])\s*[×x]\s*(.+)$/i);
  if (!m) return { turns: "", name: label.trim() };
  return { turns: (m[1] === "1" ? "" : `${m[1]}×`) as Turns, name: m[2].trim() };
}

export function withTurns(name: string, turns: Turns): string {
  return turns ? `${turns} ${name}` : name;
}

/** Stökksamsetning er skrifuð með plúsum: "2× Lutz + 2× Toe loop". */
export const COMBO_MAX = 4;

export function splitCombo(label: string): string[] {
  return label
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function joinCombo(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, COMBO_MAX)
    .join(" + ");
}

/** Stökkin í heitinu (eitt, eða fleiri í samsetningu) ef þau eru öll á ISU-listanum; annars null. */
export function jumpParts(label: string): Array<{ turns: Turns; name: string }> | null {
  const parts = splitCombo(label).map(splitTurns);
  if (!parts.length || parts.length > COMBO_MAX) return null;
  const listed = parts.map((p) => ({ turns: p.turns, name: itemIn("stokk", p.name)?.name }));
  return listed.every((p) => p.name) ? (listed as Array<{ turns: Turns; name: string }>) : null;
}

/** Snúningur getur hafist með flugi og/eða skipt um fót: "Sitjandi snúningur með flugi". */
const FLY = " með flugi";
const CHANGE = " með fótaskiptum";
const BOTH = " með flugi og fótaskiptum";

export type Spin = { base: string; fly: boolean; change: boolean };

/** Snúningurinn í heitinu ef hann er á ISU-listanum; annars null. */
export function splitSpin(label: string): Spin | null {
  const text = label.trim();
  const low = text.toLowerCase();
  let base = text;
  let fly = false;
  let change = false;
  if (low.endsWith(BOTH)) {
    base = text.slice(0, -BOTH.length);
    fly = change = true;
  } else if (low.endsWith(FLY)) {
    base = text.slice(0, -FLY.length);
    fly = true;
  } else if (low.endsWith(CHANGE)) {
    base = text.slice(0, -CHANGE.length);
    change = true;
  }
  const item = itemIn("snuningar", base);
  return item ? { base: item.name, fly, change } : null;
}

export function withSpin(base: string, fly: boolean, change: boolean): string {
  return base + (fly && change ? BOTH : fly ? FLY : change ? CHANGE : "");
}

/** Í hvaða flokki heitið er (eftir listanum; óþekkt heiti → null). */
export function groupOf(label: string): ElementGroupId | null {
  const name = lower(label);
  if (!name) return null;
  if (jumpParts(label)) return "stokk";
  if (splitSpin(label)) return "snuningar";
  for (const g of ELEMENTS) if (g.items.some((i) => lower(i.name) === name)) return g.id;
  if (name === "stökk") return "stokk";
  if (name.includes("snúningur")) return "snuningar";
  return null;
}

/** ISU-skammstöfun heitisins: "2× Lutz + 2× Toe loop" → "2Lz+2T", "Sitjandi
 *  snúningur með flugi" → "FSSp", "Skrefaröð" → "StSq". Ekkert á listanum → null. */
export function codeOf(label: string): string | null {
  const jumps = jumpParts(label);
  if (jumps) return jumps.map((j) => `${j.turns ? j.turns[0] : "1"}${itemIn("stokk", j.name)!.code}`).join("+");
  const spin = splitSpin(label);
  if (spin) return `${spin.fly ? "F" : ""}${spin.change ? "C" : ""}${itemIn("snuningar", spin.base)!.code}`;
  const name = lower(label);
  for (const g of ELEMENTS) {
    const item = g.items.find((i) => lower(i.name) === name);
    if (item) return item.code ?? null;
  }
  return null;
}

const JUMP_CODE = /^([1-4])?(lz|lo|eu|t|s|f|a)$/i;
const SPIN_CODE = /^(f)?(c)?(co|u|l|c|s)sp$/i;

/** Skammstöfun → heiti: "2lz+2t" → "2× Lutz + 2× Toe loop", "FCSSp" → "Sitjandi
 *  snúningur með flugi og fótaskiptum". Ekki skammstöfun → null. */
export function fromCode(text: string): string | null {
  const raw = text.replace(/\s+/g, "");
  if (!raw) return null;
  const parts = raw.split("+");
  if (parts.length <= COMBO_MAX && parts.every((p) => JUMP_CODE.test(p))) {
    // Eitt stakt stökk án tölu ("T", "S", "A") er of tvírætt til að teljast skammstöfun.
    if (parts.length === 1 && !/^[1-4]/.test(parts[0]) && parts[0].length < 2) return null;
    return joinCombo(
      parts.map((p) => {
        const m = p.match(JUMP_CODE)!;
        const item = ELEMENTS[0].items.find((i) => i.code!.toLowerCase() === m[2].toLowerCase())!;
        return withTurns(item.name, (m[1] && m[1] !== "1" ? `${m[1]}×` : "") as Turns);
      }),
    );
  }
  const spin = raw.match(SPIN_CODE);
  if (spin) {
    const item = ELEMENTS.find((g) => g.id === "snuningar")!.items.find((i) => i.code!.toLowerCase() === `${spin[3]}sp`.toLowerCase());
    if (item) return withSpin(item.name, !!spin[1], !!spin[2]);
  }
  const low = raw.toLowerCase();
  for (const g of ELEMENTS) {
    if (g.id === "stokk" || g.id === "snuningar") continue;
    const item = g.items.find((i) => i.code?.toLowerCase() === low);
    if (item) return item.name;
  }
  return null;
}

/** Leitarsnið: lágstafir án brodda og íslenskra sérstafa, svo "spirall" finni "Spírall". */
export function plainText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Listinn síaður eftir leitarorði (heiti, annað heiti eða skammstöfun). Tóm leit → allur listinn. */
export function searchElements(query: string): ElementGroup[] {
  const q = plainText(query);
  if (!q) return ELEMENTS;
  return ELEMENTS.map((g) => ({
    ...g,
    items: g.items.filter((i) => plainText(i.name).includes(q) || (i.also ? plainText(i.also).includes(q) : false) || (i.code ? i.code.toLowerCase().startsWith(q) : false)),
  })).filter((g) => g.items.length > 0);
}

export const GRADES = [1, 2, 3, 4, 5] as const;
export const GRADE_LABEL: Record<number, string> = { 1: "Þarf mikla æfingu", 2: "Óöruggt", 3: "Í lagi", 4: "Gott", 5: "Frábært" };

export type Graded = { label: string; grade?: number };

export type Focus = { label: string; grade: number; count: number };

/** Æfingaáherslur: það sem fékk lægsta einkunn fyrst. Sama heiti oftar en
 *  einu sinni er tekið saman (meðaleinkunn); óeinkunnað og ónefnt er ekki með. */
export function focusList(markers: Graded[]): Focus[] {
  const by = new Map<string, { label: string; sum: number; count: number }>();
  for (const m of markers) {
    const label = m.label.trim();
    if (!label || !m.grade) continue;
    const key = label.toLowerCase();
    const cur = by.get(key) ?? { label, sum: 0, count: 0 };
    cur.sum += m.grade;
    cur.count++;
    by.set(key, cur);
  }
  return [...by.values()]
    .map((x) => ({ label: x.label, grade: Math.round((x.sum / x.count) * 10) / 10, count: x.count }))
    .sort((a, b) => a.grade - b.grade || a.label.localeCompare(b.label, "is"));
}

/** Það sem ætti að leggja áherslu á: einkunn 3 eða lægri. */
export function needsWork(markers: Graded[]): Focus[] {
  return focusList(markers).filter((f) => f.grade <= 3);
}
