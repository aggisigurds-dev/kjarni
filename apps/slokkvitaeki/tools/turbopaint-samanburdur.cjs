/* Samanburður: Teikning-glugginn (Slökkvitæki-appið) og TurboPaint-borðið á SÖMU hæð, hlið við hlið.
 *
 *   node tools/turbopaint-samanburdur.cjs [http://localhost:4123] [úttaksmappa]
 *
 * Teikning: lifandi slokkvitaeki.netlify.app, Fiskislóð 41 (1612) 1. hæð — ÖLL skrif til Supabase eru stöðvuð (svarað 200),
 * aðeins lestur fer í gegn. TurboPaint: staðbundni þjónninn, hæðin opnuð úr úttekt — skrif í teikning_bord stöðvuð.
 * Úttak: 09a (Teikning, húsið), 09b (TurboPaint, húsið), 09c (nærmynd beggja) og 09_samanburdur (allt saman). */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = process.argv[3] || "C:/Users/Slokkvitaeki/teikning-greining/turbopaint_afangi2";
fs.mkdirSync(OUT, { recursive: true });
const CID = 1612, HAED = "hmuaaaw83rg9";
// Nærmynd: svæði frummyndar með slöngu, léttvatni, rafmagnstöflu og skilti (neðst til vinstri í húsinu)
const NAER = { x: 950, y: 3330, w: 800, h: 820 };

(async () => {
  const b = await chromium.launch({ headless: true });
  const stodvad = [];

  // ── Teikning-glugginn (lifandi app, skrif stöðvuð) ─────────────────────────────────────────────────────────────
  const c1 = await b.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2 });
  await c1.route(/supabase\.co\//, (r) => {
    const m = r.request().method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return r.continue();
    stodvad.push(m + " " + r.request().url().split("?")[0]);
    return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  const p1 = await c1.newPage();
  await p1.goto("https://slokkvitaeki.netlify.app/", { waitUntil: "domcontentloaded" });
  // Tækjaskyndiminnið VERÐUR að vera komið áður en glugginn opnast: annars fær FloorPlan tóman tækjalista og Teikning
  // teiknar öll tæki sem „annað" (enginn borði, slöngur sem slökkvitæki) — mælt 06.10.2026, sama kapphlaup getur hent
  // notanda sem opnar Teikningu strax eftir hleðslu.
  await p1.waitForFunction(
    () => window.Companies && (Companies.list || []).length > 100 && window.FloorPlan && window.DB && DB.cache && (DB.cache.units || []).length > 1000,
    null,
    { timeout: 90000 }
  );
  await p1.evaluate((cid) => Companies.opnaTeikningu(cid), CID);
  await p1.waitForFunction(() => {
    const c = document.getElementById("fp-canvas");
    const p = window.FloorPlan && FloorPlan.plans[1612];
    return c && c.width > 100 && FloorPlan.bgImage && p && (p.markers || []).length > 0;
  }, null, { timeout: 90000 });
  await p1.waitForTimeout(6000);
  const tFjoldi = await p1.evaluate(() => FloorPlan.units.length);
  if (tFjoldi !== 14) throw new Error("Teikning fékk " + tFjoldi + " tæki, ekki 14 — tækjaskyndiminnið var ekki komið");
  const t = await p1.evaluate(() => {
    const c = document.getElementById("fp-canvas");
    const r = c.getBoundingClientRect();
    const h = FloorPlan.plans[1612].haedir[0];
    return { r: { x: r.left, y: r.top, w: r.width, h: r.height }, cw: c.width, ch: c.height, sk: h.skurdur };
  });
  await p1.screenshot({ path: path.join(OUT, "09a_teikning_glugginn.png"), clip: { x: t.r.x, y: t.r.y, width: t.r.w, height: t.r.h } });
  const kT = t.r.w / t.cw;
  await p1.screenshot({
    path: path.join(OUT, "09c1_teikning_naermynd.png"),
    clip: { x: t.r.x + (NAER.x - t.sk.x) * kT, y: t.r.y + (NAER.y - t.sk.y) * kT, width: NAER.w * kT, height: NAER.h * kT },
  });
  await c1.close();

  // ── TurboPaint (staðbundið, skrif í teikning_bord stöðvuð) ────────────────────────────────────────────────────
  const c2 = await b.newContext({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });
  await c2.route("**/rest/v1/teikning_bord*", (r) => {
    const m = r.request().method();
    if (m === "GET" || m === "HEAD") return r.continue();
    stodvad.push(m + " " + r.request().url().split("?")[0]);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
  });
  const p2 = await c2.newPage();
  await p2.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&b=4244&h=6006&ham=slokkvitaeki`, { waitUntil: "domcontentloaded" });
  await p2.getByText(/merki á teikningunni/).first().waitFor({ timeout: 180000 });
  await p2.waitForTimeout(3000);
  await p2.evaluate(() => window.__tpStore.getState().setSelected([]));
  await p2.waitForTimeout(300);
  /** Svæði frummyndar → mynd af Konva-sviðinu (aðeins borðið, engin stika eða spjald ofan á). */
  const svaedi = (sv, pr) =>
    p2.evaluate(([sv, pr]) => {
      const s = window.__tpStore.getState(), cam = s.camera;
      const m = s.objects.find((o) => o.type === "image" && o.uttekt);
      const kx = m.width / m.uttekt.frumB, ky = m.height / m.uttekt.frumH;
      const st = window.__tpKit.getRegisteredStage();
      return st.toDataURL({
        x: (m.x + sv.x * kx) * cam.scale + cam.x,
        y: (m.y + sv.y * ky) * cam.scale + cam.y,
        width: sv.w * kx * cam.scale,
        height: sv.h * ky * cam.scale,
        pixelRatio: pr,
      });
    }, [sv, pr]);
  const skrifa = (dataUrl, nafn) => fs.writeFileSync(path.join(OUT, nafn), Buffer.from(dataUrl.split(",")[1], "base64"));
  const sk = t.sk;
  skrifa(await svaedi({ x: sk.x, y: sk.y, w: sk.w, h: sk.h }, 2), "09b_turbopaint_bordid.png");
  skrifa(await svaedi(NAER, 6), "09c2_turbopaint_naermynd.png");
  await c2.close();

  // ── Samsett mynd ───────────────────────────────────────────────────────────────────────────────────────────────
  const d = (n) => "data:image/png;base64," + fs.readFileSync(path.join(OUT, n)).toString("base64");
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#14120f;color:#f1ede4;font:600 15px system-ui,sans-serif}
    .r{display:flex;gap:18px;padding:16px 18px 6px}.k{flex:1;min-width:0}.k h2{font-size:15px;margin:0 0 8px;color:#c9a54a;letter-spacing:.04em}
    .k img{display:block;width:100%;height:auto;border-radius:6px;background:#fff}
    .n img{image-rendering:auto}p{margin:4px 18px 14px;font-weight:500;font-size:12.5px;color:#a8a29e}</style>
    <div class="r"><div class="k"><h2>TEIKNING-GLUGGINN (Slökkvitæki-appið) — Fiskislóð 41, 1. hæð</h2><img src="${d("09a_teikning_glugginn.png")}"></div>
    <div class="k"><h2>TURBOPAINT — sama hæð, sama merkjasafn</h2><img src="${d("09b_turbopaint_bordid.png")}"></div></div>
    <div class="r n"><div class="k"><h2>NÆRMYND · Teikning</h2><img src="${d("09c1_teikning_naermynd.png")}"></div>
    <div class="k"><h2>NÆRMYND · TurboPaint</h2><img src="${d("09c2_turbopaint_naermynd.png")}"></div></div>
    <p>Sama svæði frummyndar (x ${NAER.x}–${NAER.x + NAER.w}, y ${NAER.y}–${NAER.y + NAER.h}). TurboPaint teiknar plöturnar með sama strigakóða og Teikning (434 teiknaTakn → merkjasafn.ts). Undir tækjum í TurboPaint: síðustu sex stafir raðnúmers.</p>`;
  const c3 = await b.newContext({ viewport: { width: 1800, height: 1000 } });
  const p3 = await c3.newPage();
  await p3.setContent(html);
  await p3.waitForTimeout(500);
  await p3.screenshot({ path: path.join(OUT, "09_samanburdur_teikning_turbopaint.png"), fullPage: true });
  await b.close();
  console.log("Myndir í", OUT);
  console.log("Stöðvuð skrif:", stodvad.length ? stodvad.join(" | ") : "engin reynd");
})().catch((e) => {
  console.error("BROTNAÐI:", e.stack || e.message);
  process.exit(1);
});
