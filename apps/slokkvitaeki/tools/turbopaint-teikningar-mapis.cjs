/* API-próf: heimilisfangaleit → teikningar úr kortasjám Hafnarfjarðar, Garðabæjar,
 * Kópavogs (map.is) og Reykjavíkur (FotoWeb), og að fetch-plan sæki PDF-in.
 *   NODE_USE_ENV_PROXY=1 node tools/turbopaint-teikningar-mapis.cjs [http://localhost:4143]
 */
const BASE = process.argv[2] || "http://localhost:4143";
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));
const api = async (q) => {
  const r = await fetch(`${BASE}/api/turbopaint/teikningar?${q}`);
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text) }; } catch { return { status: r.status, json: null, text: text.slice(0, 200) }; }
};
const ALLOWED = ["teikningar.hafnarfjordur.is", "teikningar.gardabaer.is", "gagnasja.kopavogur.is", "skjalasafn.reykjavik.is"];

(async () => {
  // 1. Heimilisfang → eign með heitinúmeri og sveitarfélagsnúmeri
  const hf = await api("heimilisfang=" + encodeURIComponent("Strandgata 6"));
  const strand = (hf.json?.results || []).find((e) => e.landnr === 122391);
  check("Strandgata 6 finnst með heitinr + svf 1400 (Hafnarfjörður)", strand && strand.heitinr === 1030450 && strand.svf === 1400 && strand.heimild === "map.is", JSON.stringify(strand || hf).slice(0, 200));
  check("útgáfumerki API er mapis", hf.json?.utgafa === "2026-09-14-mapis", hf.json?.utgafa);

  // 2. Teikningalistar úr þremur kortasjám
  const cases = [
    { nafn: "Hafnarfjörður · Strandgata 6", q: "landnr=122391&heitinr=1030450&svf=1400", min: 40, host: "teikningar.hafnarfjordur.is" },
    { nafn: "Garðabær · Garðatorg 7", q: "landnr=174868&heitinr=1088027&svf=1300", min: 500, host: "teikningar.gardabaer.is" },
    { nafn: "Kópavogur · Digranesvegur 1", q: "landnr=114102&heitinr=1021071&svf=1000", min: 100, host: "gagnasja.kopavogur.is" },
  ];
  let firstPdf = null;
  for (const c of cases) {
    const r = await api(c.q);
    const rows = r.json?.results || [];
    check(`${c.nafn}: ≥${c.min} teikningar (fékk ${rows.length})`, rows.length >= c.min, JSON.stringify(r).slice(0, 200));
    check(`${c.nafn}: allar slóðir á ${c.host}`, rows.length > 0 && rows.every((t) => new URL(t.infoUrl).hostname === c.host), rows[0] && rows[0].infoUrl);
    check(`${c.nafn}: gildar fremst, úreltar aftast`, rows.length > 0 && rows.findIndex((t) => t.urelt) >= rows.filter((t) => !t.urelt).length - 0 || rows.every((t) => !t.urelt), `first urelt idx ${rows.findIndex((t) => t.urelt)} / gild ${rows.filter((t) => !t.urelt).length}`);
    const grunn = rows.filter((t) => t.haed.length > 0 || t.stig.length > 0);
    check(`${c.nafn}: hæðir þáttaðar á grunnmyndum (${grunn.length})`, grunn.length > 0, "");
    check(`${c.nafn}: gerd + hofundur skila sér`, rows.some((t) => t.gerd) && rows.some((t) => t.hofundur), "");
    if (!firstPdf) firstPdf = rows.find((t) => !t.urelt)?.infoUrl || null;
  }
  const kop = await api("landnr=114102&heitinr=1021071&svf=1000");
  const a102 = (kop.json?.results || []).find((t) => t.bnnr === "A1-02");
  check("Kópavogur: 'Grunnmynd 2. hæð.' → haed [2], grunnmynd", a102 && JSON.stringify(a102.haed) === "[2]" && a102.grunnmynd === true, JSON.stringify(a102 || {}).slice(0, 200));

  // 3. fetch-plan sækir PDF af leyfðum hýsli — og hafnar öðrum
  if (firstPdf) {
    const r = await fetch(`${BASE}/api/turbopaint/fetch-plan?url=${encodeURIComponent(firstPdf)}`);
    const buf = Buffer.from(await r.arrayBuffer());
    check("fetch-plan skilar PDF (200, application/pdf, %PDF)", r.status === 200 && /pdf/i.test(r.headers.get("content-type") || "") && buf.slice(0, 4).toString() === "%PDF", `${r.status} ${r.headers.get("content-type")} ${buf.length}b`);
    check("fetch-plan setur skráarheiti í x-plan-filename", /\.pdf$/i.test(decodeURIComponent(r.headers.get("x-plan-filename") || "")), r.headers.get("x-plan-filename"));
  } else check("fann PDF til að sækja", false, "");
  const gb2 = await fetch(`${BASE}/api/turbopaint/fetch-plan?url=${encodeURIComponent("https://teikningar.gardabaer.is/ANNAD/3142.pdf")}`);
  check("Garðabæjar-PDF sækist", gb2.status === 200 && /pdf/i.test(gb2.headers.get("content-type") || ""), `${gb2.status}`);
  const nei = await fetch(`${BASE}/api/turbopaint/fetch-plan?url=${encodeURIComponent("https://example.com/x.pdf")}`);
  check("fetch-plan hafnar hýsli utan leyfilista (403)", nei.status === 403, `${nei.status}`);

  // 4. Reykjavík óbreytt
  const rvk = await api("heimilisfang=" + encodeURIComponent("Skútuvogur 4"));
  const sk = (rvk.json?.results || []).find((e) => e.landnr === 105166);
  check("Reykjavík: Skútuvogur 4 → heimild reykjavik", sk && sk.heimild === "reykjavik" && sk.svf === null, JSON.stringify(sk || rvk).slice(0, 160));
  const rvkT = await api("landnr=105166");
  check("Reykjavík: FotoWeb-listi virkar enn", (rvkT.json?.results || []).length > 10, JSON.stringify(rvkT).slice(0, 160));
  const oth = await api("heimilisfang=" + encodeURIComponent("Hafnarstræti 1"));
  check("annað sveitarfélag: engin villa, heimild óþekkt eða reykjavik", oth.status === 200 && (oth.json?.results || []).length > 0, JSON.stringify(oth).slice(0, 160));

  console.log(ok.map((n) => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map((n) => "  ✘ " + n).join("\n"));
  console.log(`${ok.length}/${ok.length + bad.length} passed`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error("crash", e); process.exit(1); });
