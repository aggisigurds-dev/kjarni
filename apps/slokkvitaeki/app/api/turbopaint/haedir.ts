// Hæða-þáttun úr lýsingarreit teikningar. Agnar 28.08: "ég þarf helst að finna
// hæðarnar — hæð 1, hæð 2, kjallari". Raunveruleg gildi úr söfnunum:
//   "Grunnmynd 1. hæð" · "Grunnmynd 2. hæð" · "Grunnmynd 1. hæð, snið"
//   "Grunnmynd 2. hæð, útlit austur, suður, norður" · "Grunnmynd 1.hæð."
//   "grunnmyndir kjallara og 1-7 hæð" · "Útlit N, V, S" · "Skráningartafla"
// Ein teikning getur borið FLEIRI en eina hæð, svo þetta skilar lista. Notað
// bæði fyrir FotoWeb-safn Reykjavíkur (reitur 214) og map.is-söfn Hafnarfjarðar,
// Garðabæjar og Kópavogs (lysing + gerd).
export function haedir(lysing: string | null, gerd: string | null = null) {
  const t = `${lysing || ""} ${gerd || ""}`.toLowerCase();
  const haed: number[] = [];
  for (const m of t.matchAll(/(\d+)\.\s*h[æa][eð]?ð/g)) {
    const n = Number(m[1]);
    if (n && !haed.includes(n)) haed.push(n);
  }
  // "1-7 hæð" / "1.-7. hæð": bil af hæðum.
  for (const m of t.matchAll(/(\d+)\.?\s*-\s*(\d+)\.?\s*h[æa][eð]?ð/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a && b && b >= a && b - a <= 30) {
      for (let n = a; n <= b; n++) if (!haed.includes(n)) haed.push(n);
    }
  }
  const kjallari = /kjallar/.test(t);
  const ris = /\bris\b|ris\.|rish[æa]ð/.test(t);
  // NEFNDAR hæðir sem bera enga tölu. Staðfest á Skútuvogi 2: "grunnmynd
  // milligólf, snið" datt út úr hæða-síunni af því orðið er ekki tala, og
  // teikningin varð ófinnanleg þótt hún sé grunnmynd af hæð.
  const stig: string[] = [];
  if (kjallari) stig.push("Kjallari");
  if (/milligólf|milligolf/.test(t)) stig.push("Milligólf");
  if (/jarðh[æa]ð|jardh/.test(t)) stig.push("Jarðhæð");
  if (ris) stig.push("Ris");
  return {
    haed: haed.sort((a, b) => a - b),
    stig,
    kjallari,
    ris,
    // Grunnmynd = teikning AF hæð. Útlit/snið/skráningartafla/afstöðumynd eru
    // annars konar blöð og eiga ekki heima í hæða-síunni.
    grunnmynd: /grunnmynd/.test(t) || haed.length > 0 || stig.length > 0,
  };
}
