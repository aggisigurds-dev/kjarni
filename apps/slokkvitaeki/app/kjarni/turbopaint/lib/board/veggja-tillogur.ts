// Tillögur „Finna veggi" í Veggir-ham (Agnar 10.10.2026: „aðstoð við að reyna að finna veggina"). Greindir veggir verða
// EKKI sjálfkrafa veggir: þeir birtast sem punktalínur og aðeins samþykktir (smellur, kassi eða allar) fara á borðið —
// hver samþykkt er ein ⌘Z-færsla, merkt greiningarlotu svo „Eyða síðustu greiningu" taki þær saman.

import { newId, useBoardStore } from "./store";
import { inniKassa, nyrVeggur, strikSkerKassa, type Kassi, type P } from "./veggja-ritill";
import { skiptaUt } from "./veggja-ritill-adgerdir";
import { useVeggjaRitill, type Tillogur } from "./veggja-ritill-stada";

export type TillagaVeggur = Tillogur["veggir"][number];

function fjarlaegdAdStriki(X: P, p: number[]): number {
  let best = Infinity;
  for (let i = 2; i + 1 < p.length; i += 2) {
    const ax = p[i - 2], ay = p[i - 1], dx = p[i] - ax, dy = p[i + 1] - ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((X[0] - ax) * dx + (X[1] - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(X[0] - ax - t * dx, X[1] - ay - t * dy));
  }
  return best;
}

/** Næsta tillaga við X (heimshnit) innan vikmarka eða hálfrar þykktar hennar; -1 ef engin. */
export function tillagaVid(X: P, veggir: readonly TillagaVeggur[], vik: number): number {
  let best = -1, bestD = Infinity;
  veggir.forEach((v, i) => {
    const d = fjarlaegdAdStriki(X, v.p);
    if (d <= Math.max(vik, v.t / 2) && d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Tillögur í kassa: „inni" = öll tillagan innan kassans, „snerta" = einhver hluti hennar. */
export function tillogurIKassa(veggir: readonly TillagaVeggur[], k: Kassi, ham: "inni" | "snerta"): number[] {
  const ut: number[] = [];
  veggir.forEach((v, i) => {
    const p = v.p;
    let jaa = ham === "inni";
    if (ham === "inni") {
      for (let j = 0; j + 1 < p.length; j += 2) if (!inniKassa(p[j], p[j + 1], k)) jaa = false;
    } else {
      for (let j = 2; j + 1 < p.length && !jaa; j += 2) jaa = strikSkerKassa(p[j - 2], p[j - 1], p[j], p[j + 1], k);
    }
    if (jaa) ut.push(i);
  });
  return ut;
}

/** Skiptir tillögunum: þær sem eru valdar (vísar) og þær sem eftir standa. */
export function skiptaTillogum(veggir: readonly TillagaVeggur[], idx: readonly number[]) {
  const s = new Set(idx);
  return { valdar: veggir.filter((_, i) => s.has(i)), eftir: veggir.filter((_, i) => !s.has(i)) };
}

/** Samþykkja tillögur → veggir á teikningunni (ein ⌘Z-færsla). Skilar fjölda. */
export function samthykkjaTillogur(idx: readonly number[]): number {
  const t = useVeggjaRitill.getState().tillogur;
  if (!t || !idx.length) return 0;
  const { valdar, eftir } = skiptaTillogum(t.veggir, idx);
  const plan = useBoardStore.getState().objects.some((o) => o.id === t.planId) ? t.planId : undefined;
  const nyir = valdar.map((v) => nyrVeggur(v.p, { id: newId(), thykkt: v.t, tegund: v.tegund ?? "veggur", parentId: plan, greining: t.lota }));
  if (nyir.length) skiptaUt([], nyir, []);
  useVeggjaRitill.getState().setTillogur(eftir.length ? { ...t, veggir: eftir } : null);
  return nyir.length;
}

/** Hafna tillögum (hverfa — ekkert breytist á borðinu). Skilar fjölda. */
export function hafnaTillogum(idx: readonly number[]): number {
  const t = useVeggjaRitill.getState().tillogur;
  if (!t || !idx.length) return 0;
  const { valdar, eftir } = skiptaTillogum(t.veggir, idx);
  useVeggjaRitill.getState().setTillogur(eftir.length ? { ...t, veggir: eftir } : null);
  return valdar.length;
}
