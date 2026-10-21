// Teikningin sem „Greina veggi" (hamstikan, efsta stikan, ritillinn), „Finna veggi" og „Finna hurðir" vinna á — EIN regla fyrir
// alla inngangana (Agnar 21.10.2026: „finna alla takka sem segja greina veggi, athuga hvort allir virka eins"). Áður völdu hamstikan
// og efsta stikan valda teikningu / foreldri valins hlutar, en ritillinn og „Finna veggi" tóku FYRSTU mynd með úttekt — á borði með
// mörgum hæðum (Croppa oft) gat sami smellur greint sitthvora hæðina.

import { objectsOnDocument } from "./geometry";
import type { BoardObject, ImageObject } from "./types";

/** Valin teikning → foreldri valins hlutar (t.d. greindur veggur) → teikningin sem hluturinn liggur á → einkaTeikning á borðinu →
 * eina myndin með úttekt. null = ekki hægt að velja (margar teikningar, engin valin). */
export function teikningTilGreiningar(objects: BoardObject[], selectedIds: string[]): ImageObject | null {
  const myndir = objects.filter((o): o is ImageObject => o.type === "image" && !o.hidden);
  const valin = myndir.find((m) => selectedIds.includes(m.id));
  if (valin) return valin;
  if (selectedIds.length) {
    const valdir = objects.filter((o) => selectedIds.includes(o.id));
    // Valinn hlutur sem er festur við teikningu vísar á hana beint — líka þótt lagið „Teikning" sé falið
    const foreldri = myndir.find((m) => valdir.some((o) => o.parentId === m.id));
    if (foreldri) return foreldri;
    const host = myndir.find((m) => objectsOnDocument(m, valdir).length > 0);
    if (host) return host;
  }
  if (myndir.length === 1) return myndir[0];
  const medUttekt = myndir.filter((m) => m.uttekt);
  return medUttekt.length === 1 ? medUttekt[0] : null;
}
