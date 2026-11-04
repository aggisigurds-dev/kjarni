// Þysjun með hjóli / snertiborði (Agnar 04.11.2026: „rosalegt hopp upp eða niður, harðar hreyfingar"). Áður þysjaði
// TurboPaint um FAST þrep (8 % / 12 %) á hvern hjólaatburð án tillits til stærðar rennslisins — snertiborð og mýs með
// frjálst hjól senda tugi atburða á sekúndu svo myndin stökk. Nú fylgir þrepið stærð rennslisins (deltaY) og er
// klemmt á hvern atburð.

/** Margfaldari á kvarða fyrir einn hjólaatburð: > 1 = þysja inn (rennt upp), < 1 = út. */
export function hjolaThysjun(e: { deltaY: number; deltaMode?: number; ctrlKey?: boolean; metaKey?: boolean }): number {
  // deltaMode 1 = línur, 2 = síður (Firefox, sumar mýs); 0 = dílar
  const eining = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
  const dy = Math.max(-240, Math.min(240, e.deltaY * eining));
  // klípa á snertiborði (ctrl) sendir litlar deltur — næmara; venjulegt hjól: ~13 % á 100 dílum
  const naemni = e.ctrlKey || e.metaKey ? 0.01 : 0.0012;
  return Math.exp(-dy * naemni);
}
