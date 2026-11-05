/** Hreinar aðgerðir heimilisfangaleitarinnar (components/kjarni/HeimilisfangLeit.tsx) — prófanlegar án React. */

/** Fleiri lóðir en þetta = innslátturinn er of stuttur til að listi gagnist (heimilisfangaleitin skilar „Br" → 305 línur). */
export const LISTI_HAMARK = 40;

/** Leitarniðurstöður (Agnar 26.10.2026: „fullt af bulli efst" — „Brekka lóð (806)" ×18 á undan Bríetartúni): ein lína
 *  per landnúmer (safnið skilar sömu lóð aftur og aftur, einu sinni per heitinúmer) og það sem líkist innslættinum
 *  fyrst — nákvæmt heiti, svo upphaf, svo innihald; röð safnsins heldur sér innan hvers flokks. */
export function hreinsaEignir<T extends { landnr: number; label: string }>(res: T[], innslattur: string): T[] {
  const norm = (x: string) => x.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  const q = norm(innslattur);
  const sed = new Set<number>();
  const einstok: { e: T; i: number }[] = [];
  res.forEach((e, i) => {
    if (sed.has(e.landnr)) return;
    sed.add(e.landnr);
    einstok.push({ e, i });
  });
  const stig = (e: T) => {
    const h = norm(e.label.split("(")[0]);
    return h === q ? 0 : h.startsWith(q) ? 1 : h.includes(q) ? 2 : 3;
  };
  return einstok.sort((a, b) => stig(a.e) - stig(b.e) || a.i - b.i).map((x) => x.e);
}
