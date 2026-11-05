// Hrein útreikningseining fyrir 3D-gluggaham. Stærðirnar eru áætlaðar sýnastillingar,
// EKKI upplýsingaheimild um raunverulegan hæðarkóta glugga í byggingarteikningu.
export interface GluggaHaedir {
  brjost: number;
  efri: number;
  gler: number;
  glerMidja: number;
  rammi: number;
}

/** Tekur við vegghæð í sömu einingum og 3D-sviðið notar. */
export function gluggaHaedir(vegghaed: number): GluggaHaedir {
  if (!Number.isFinite(vegghaed) || vegghaed <= 0) throw new RangeError("vegghaed must be positive");
  const brjost = vegghaed * (0.85 / 3);
  const efri = vegghaed * (0.35 / 3);
  const gler = vegghaed - brjost - efri;
  return { brjost, efri, gler, glerMidja: brjost + gler / 2, rammi: vegghaed * (0.06 / 3) };
}
