/** Heiti á því sem gerist í dansinum — stökk, snúningar, skref og stöður —
 *  og æfingaáherslur út frá einkunnum. Listinn er tillögur: þjálfarinn getur
 *  alltaf skrifað sitt eigið heiti. Hreint — prófað í node. */

export type ElementGroupId = "stokk" | "snuningar" | "annad";

export type ElementGroup = { id: ElementGroupId; label: string; items: string[] };

/** Alþjóðlegu heitin eru notuð á stökkin (þau eru eins á öllum málum). */
export const ELEMENTS: ElementGroup[] = [
  { id: "stokk", label: "Stökk", items: ["Valshopp", "Salchow", "Toe loop", "Loop", "Flip", "Lutz", "Axel", "Stökksamsetning"] },
  { id: "snuningar", label: "Snúningar", items: ["Uppréttur snúningur", "Sitjandi snúningur", "Vogarsnúningur", "Layback", "Samsettur snúningur", "Flugsnúningur"] },
  { id: "annad", label: "Skref og stöður", items: ["Skrefaröð", "Spírall", "Vog", "Ina Bauer", "Byrjunarstaða", "Lokastaða"] },
];

/** Fjöldi snúninga í stökki, sem forskeyti: "2× Salchow". */
export const TURNS = ["", "2×", "3×"] as const;

export const ALL_ELEMENTS: string[] = ELEMENTS.flatMap((g) => g.items);

/** "2× Lutz" → { turns: "2×", name: "Lutz" } */
export function splitTurns(label: string): { turns: (typeof TURNS)[number]; name: string } {
  const m = label.trim().match(/^([23])\s*[×x]\s*(.+)$/i);
  return m ? { turns: `${m[1]}×` as (typeof TURNS)[number], name: m[2].trim() } : { turns: "", name: label.trim() };
}

export function withTurns(name: string, turns: (typeof TURNS)[number]): string {
  return turns ? `${turns} ${name}` : name;
}

/** Í hvaða flokki heitið er (eftir listanum; óþekkt heiti → null). */
export function groupOf(label: string): ElementGroupId | null {
  const name = splitTurns(label).name.toLowerCase();
  if (!name) return null;
  for (const g of ELEMENTS) if (g.items.some((i) => i.toLowerCase() === name)) return g.id;
  if (name === "stökk") return "stokk";
  if (name === "snúningur") return "snuningar";
  return null;
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
