/** Húsnúmerasía á niðurstöður Landeignaskrár.
 *
 * Agnar 20.09.2026: „Þegar ég skrái númer þá vil ég bara sjá niðurstöður úr því númeri."
 * Landeignaskrá er laus í leit: „Ármúli 13" skilar 13A og Ármúla í öðrum sveitarfélögum, „Hverfisgata 82" dregur
 * 59-59A með sér, „Laugavegur 4" skilar „Laugavegur leikvöllur". Götusían í route.ts tekur aðeins á götuheitinu.
 *
 * Reglan, þegar númer er í leitinni:
 *   1. NÁKVÆMT númer (og bókstafur ef hann var sleginn inn) — aðeins þær eignir. „Skútuvogur 4" sýnir ekki 4A
 *      (Agnar 28.08: „ekki bjóða 4A líka").
 *   2. Sé engin nákvæm: bókstafsafbrigði númersins (13A, 13B) og bil sem ná yfir það (4-6, 59-59A → 59).
 *   3. Annars tómt — kallarinn segir þá hreint út að ekkert sé skráð á númerið, fremur en að sýna önnur hús.
 * Án númers í leitinni er engu breytt (gatan öll sést á meðan skrifað er). */

export type Husnumer = { nr: number; stafur: string };

/** „Fiskislóð 41", „Ármúli 13a", „Laugavegur 4 101 Reykjavík" → númerið sem fylgir götuheitinu. */
export function lesaHusnumer(q: string): Husnumer | null {
  const m = q.normalize("NFC").match(/^\D*?(\d{1,4})\s*([a-záðéíóúýþæö])?(?![a-záðéíóúýþæö\d])/i);
  if (!m) return null;
  // Númerið verður að koma Á EFTIR einhverju götuheiti — „101 Reykjavík" ein og sér er ekki húsnúmer.
  if (!/\p{L}{2,}/u.test(q.slice(0, m.index! + m[0].indexOf(m[1])))) return null;
  return { nr: Number(m[1]), stafur: (m[2] || "").toLowerCase() };
}

type Bil = { fra: number; fraStafur: string; til: number; tilStafur: string };

/** Númerahluti merkimiða: „Fiskislóð 41 (101) - L 209698" → 41 · „Laugavegur 4-6 (101)" → 4–6 · „Ármúli (426)" → null. */
export function lesaNumerMerkimida(label: string): Bil | null {
  const gata = label.split("(")[0];
  const m = gata.match(/(\d{1,4})\s*([a-záðéíóúýþæö])?(?:\s*-\s*(\d{1,4})\s*([a-záðéíóúýþæö])?)?\s*$/i);
  if (!m) return null;
  const fra = Number(m[1]);
  return {
    fra,
    fraStafur: (m[2] || "").toLowerCase(),
    til: m[3] ? Number(m[3]) : fra,
    tilStafur: (m[3] ? m[4] || "" : m[2] || "").toLowerCase(),
  };
}

export function siaHusnumer<T extends { label: string }>(results: T[], q: string): T[] {
  const h = lesaHusnumer(q);
  if (!h) return results;
  const medBil = results.map((r) => ({ r, b: lesaNumerMerkimida(r.label) }));
  const stakt = (b: Bil | null) => !!b && b.fra === b.til && b.fraStafur === b.tilStafur;
  const nakvaem = medBil.filter(({ b }) => stakt(b) && b!.fra === h.nr && b!.fraStafur === h.stafur);
  if (nakvaem.length) return nakvaem.map((x) => x.r);
  // Bókstafur sleginn inn en engin slík eign: ekki giska á annan bókstaf.
  const naerri = medBil.filter(({ b }) => {
    if (!b) return false;
    if (stakt(b)) return !h.stafur && b.fra === h.nr;            // 13 → 13A, 13B
    return h.nr >= b.fra && h.nr <= b.til;                        // 5 → 4-6 · 59 → 59-59A
  });
  return naerri.map((x) => x.r);
}
