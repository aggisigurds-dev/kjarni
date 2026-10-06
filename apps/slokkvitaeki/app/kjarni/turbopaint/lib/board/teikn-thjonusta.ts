// Netaföll Slökkvitæki-appsins sem Teikning-glugginn (383/438) notar og TurboPaint samnýtir. Þau senda
// `Access-Control-Allow-Origin: *`, svo vafrinn les þau beint:
//   teikn-blad?url=<permalink>  → { b_mm, h_mm } blaðstærð teikningar (FotoWeb-upplausn skönnunar / MediaBox PDF)
// Ekkert er skrifað; aðeins lesið.

export const SLOKKVITAEKI_ROT = "https://slokkvitaeki.netlify.app";

export function teiknBladSlod(permalink: string): string {
  return `${SLOKKVITAEKI_ROT}/.netlify/functions/teikn-blad?url=${encodeURIComponent(permalink)}`;
}

export type Bladstaerd = { b_mm: number; h_mm: number; heimild?: string };

const bladMinni = new Map<string, Promise<Bladstaerd | null>>();

/** Blaðstærð teikningar í mm (sótt einu sinni á slóð; misheppnuð sókn er reynd aftur næst). 15 s þak eins og 383. */
export function saekjaBladstaerd(permalink: string): Promise<Bladstaerd | null> {
  let p = bladMinni.get(permalink);
  if (!p) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    p = fetch(teiknBladSlod(permalink), { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Bladstaerd>) : null))
      .then((j) => (j && j.b_mm > 50 && j.h_mm > 50 ? j : null))
      .catch(() => null)
      .finally(() => clearTimeout(t));
    bladMinni.set(permalink, p);
    void p.then((j) => {
      if (!j) bladMinni.delete(permalink);
    });
  }
  return p;
}
