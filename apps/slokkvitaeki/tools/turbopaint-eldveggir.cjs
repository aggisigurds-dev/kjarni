/* Eldveggir + veggir á skannaðri hæð (Agnar 07.10.2026, Álfaborg 661 2. hæð: „kerfið fann enga veggi á efri hæð,,
 * og brunaveggirnir eru svoldi skrítnir,,, og erfiðara að setja þá, þarf að klikka 2svar og koma þá svartir veggir").
 *   node tools/turbopaint-eldveggir.cjs [http://localhost:4123] [úttaksmappa] [--an-ei]
 *
 * Raunveruleg mús (page.mouse). VÖRÐUR Á: ÖLL skrif í Supabase (REST + geymsla) eru gripin — ekkert fer út; í lokin er
 * staðfest að engin skrif sluppu (hvert skrif-kall vafrans er í lista varðarins).
 *   1. „Veggir" á skannaðri hæð (FotoWeb-PDF) → veggir úr myndinni (sama greining og Teikning), ⌘Z tekur allt, spurt
 *      Bæta við / Skipta út þegar veggir eru fyrir, „Eyða síðustu greiningu" í ritlinum
 *   2. „Lita veggi" (F): veggir teiknast fjólubláir á striganum — vistaði liturinn breytist ekki
 *   3. „+ Eldveggur EI-60": haldið inni og dregið = einn beinn rauður eldveggur (veggur með tegund ei60)
 *   4. veggur valinn → „EI-30" í veggjastikunni → eldveggur EI-30; „Veggur" → venjulegur aftur
 *   5. EI-greining (OCR) á hæðinni: hver eldveggur liggur á vegg og INNAN hússins — engin lína eftir ásalínum
 *   6. „Vista í úttekt" gripið: veggjaLinur með { tegund: "veggur", eld: 60 | 30 }, 1. hæð ósnert */
const path = require("path");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright")); }
const BASE = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "http://localhost:4123";
const OUT = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : path.join(process.cwd(), "turbopaint-eldveggir-myndir");
const AN_EI = process.argv.includes("--an-ei");
fs.mkdirSync(OUT, { recursive: true });
const CID = 661, HAED = "hmua8v42ink6", HAED1 = "hmua8ukhvfaw";
// Húsið á blaðinu (dílar frummyndar 6006 × 4298): útveggir 2. hæðar eins og Teikning (383) greinir þá.
const HUS_FRUM = { x0: 1215, y0: 141, x1: 4537, y1: 3706 }, VIK_FRUM = 60;
const ok = [], bad = [];
const check = (n, c, x) => { (c ? ok : bad).push(n); console.log((c ? "  ✓ " : "  ✗ ") + n + (c ? "" : "   ← " + x)); };

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  // VÖRÐUR fyrst: engin skrif í Supabase (turbopaint_boards, teikning_bord, geymsla) fara út.
  const verndud = await require("./turbopaint-vordur.cjs").vernda(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  const skrifVafra = [];
  page.on("request", (r) => { if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) skrifVafra.push({ method: r.method(), url: r.url().replace(/\?.*$/, "") }); });
  const loggar = []; page.on("console", (m) => { const t = m.text(); if (/\[veggir\]|\[EI\]/.test(t)) loggar.push(t.slice(0, 8000)); });
  const gripin = [];
  let dbHaedir = null;
  await ctx.route("**/rest/v1/teikning_bord*", async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") {
      const res = await route.fetch();
      try { const j = await res.json(); const r = Array.isArray(j) ? j[0] : j; if (r && r.haedir) dbHaedir = r.haedir; } catch (_) {}
      return route.fulfill({ response: res });
    }
    gripin.push(req.postData());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
  });

  const stada = () => page.evaluate(() => {
    const s = window.__tpStore.getState();
    const V = s.objects.filter((o) => (o.type === "polyline" || o.type === "line") && (o.veggur || o.layerId === "veggir") && !o.hidden);
    const t = (k) => V.filter((o) => (o.veggTegund || "veggur") === k).length;
    return { veggir: V.length, gler: t("gler"), hurd: t("hurd"), ei60: t("ei60"), ei30: t("ei30"), ids: V.map((o) => o.id), past: s.past.length };
  });
  const hlutur = (id) => page.evaluate((i) => window.__tpStore.getState().objects.find((o) => o.id === i), id);
  const myndin = () => page.evaluate((cid) => window.__tpStore.getState().objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid), CID);
  const bidaGreiningar = async (ms) => {
    await page.waitForFunction(() => !window.__tpStore.getState().importProgress, null, { timeout: ms, polling: 250 });
  };
  /** Heimshnit → skjáhnit (yfirlag ritilsins / borðið). */
  const skja = async (X, Y) => page.evaluate(([x, y]) => {
    const s = window.__tpStore.getState(), c = s.camera;
    const el = document.querySelector("[data-veggjaritill]") || document.querySelector(".tp-sheet");
    const r = el.getBoundingClientRect();
    return { x: r.left + x * c.scale + c.x, y: r.top + y * c.scale + c.y };
  }, [X, Y]);

  // ── opna 2. hæð Álfaborgar í Teikning-ham ─────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&ham=teikning`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 120000 });
  await page.waitForFunction(() => {
    const w = window, s = w.__tpStore?.getState(); if (!s) return false;
    if (s.importProgress) w.__tpByrjad = true;
    if ([...document.querySelectorAll("[data-sonner-toast]")].some((e) => /merki á teikningunni/.test(e.textContent || ""))) w.__tpByrjad = true;
    if (!w.__tpByrjad || s.importProgress) return false;
    return s.objects.some((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === 661);
  }, null, { timeout: 300000, polling: 100 });
  await page.waitForTimeout(2500);
  const m = await myndin();
  const kx = m.width / m.uttekt.frumB, ky = m.height / m.uttekt.frumH;
  const HUS = { x0: m.x + (HUS_FRUM.x0 - VIK_FRUM) * kx, y0: m.y + (HUS_FRUM.y0 - VIK_FRUM) * ky, x1: m.x + (HUS_FRUM.x1 + VIK_FRUM) * kx, y1: m.y + (HUS_FRUM.y1 + VIK_FRUM) * ky };
  const s0 = await stada();
  console.log("opnað:", JSON.stringify({ veggir: s0.veggir, skurdur: m.uttekt.skurdur }));
  check("2. hæð opnast án veggja (engar veggjaLinur, engin vigurstrik)", s0.veggir === 0, s0.veggir);

  // ── 1. „Veggir" → skönnunargreining ───────────────────────────────────────────────────────────────────────────
  await page.locator('button[title^="Greina veggi"]').first().click();
  const nid = page.locator("[data-greining-nidurstada]");
  await nid.waitFor({ timeout: 180000 });
  await page.waitForFunction(() => !/Reikna/.test(document.querySelector("[data-greining-nidurstada]")?.textContent || "Reikna"), null, { timeout: 60000 });
  const nidTexti = (await nid.textContent()) || "";
  const dlg = (await page.locator('[role="dialog"][aria-label="Greina veggi"]').textContent()) || "";
  console.log("greining:", nidTexti.replace(/\s+/g, " "));
  check("skönnuð PDF fer í myndgreiningu (ekki „Engar strokaðar línur“)", /skönnuð PDF|mynd/.test(dlg) && !/Engar strokaðar línur/.test(dlg), dlg.slice(0, 160));
  const nGreint = Number((nidTexti.match(/(\d+)\s+veggi/) || [])[1] || 0);
  check("greiningin finnur veggi á 2. hæð (Teikning: 47 veggir + 4 gler)", nGreint >= 30, nidTexti);
  await page.screenshot({ path: path.join(OUT, "01_greining_forskodun.png") });
  await page.getByRole("button", { name: /Setja inn \d+ veggi/ }).click();
  await page.waitForTimeout(800);
  const s1 = await stada();
  check("veggirnir eru komnir á borðið sem veggir (ritanlegir)", s1.veggir >= 30 && s1.veggir === nGreint + s1.gler, JSON.stringify({ veggir: s1.veggir, gler: s1.gler, nGreint }));
  // Ásalínurnar (strik-punkta, út í ásahringina vinstra og hægra megin við húsið) mega ekki verða veggir. Neðan við
  // húsið (skyggnisrönd við ás 10) eru þykkar línur innan skurðar hæðarinnar — þær eru taldar og sýndar, ekki faldar.
  const utanHuss1 = await page.evaluate(([H, mm]) => window.__tpStore.getState().objects
    .filter((o) => o.veggur && o.points.some((v, i) => (i % 2 === 0 ? v + o.x < H.x0 || v + o.x > H.x1 : v + o.y < H.y0 || v + o.y > H.y1)))
    .map((o) => o.points.map((v, i) => Math.round(i % 2 === 0 ? (v + o.x - mm.x) / mm.kx : (v + o.y - mm.y) / mm.ky))), [HUS, { x: m.x, y: m.y, kx, ky }]);
  const tilHlida = utanHuss1.filter((p) => p.some((v, i) => i % 2 === 0 && (v < HUS_FRUM.x0 - VIK_FRUM || v > HUS_FRUM.x1 + VIK_FRUM)));
  const nedan = utanHuss1.filter((p) => !tilHlida.includes(p));
  console.log(`veggir utan útveggja hússins: ${utanHuss1.length} (neðan við húsið, skyggnisrönd: ${nedan.length})`, JSON.stringify(utanHuss1));
  check("ásalínur urðu ekki veggir: enginn veggur til hliðar við húsið (ásahringirnir)", tilHlida.length === 0, JSON.stringify(tilHlida));
  // veggirnir í dílum frummyndar (til samanburðar við Teikning / 383)
  const veggirFrum = await page.evaluate((mm) => window.__tpStore.getState().objects.filter((o) => o.veggur).map((o) => ({
    p: o.points.map((v, i) => (i % 2 === 0 ? (v + o.x - mm.x) / mm.kx : (v + o.y - mm.y) / mm.ky)), t: o.strokeWidth / mm.kx, tegund: o.veggTegund || "veggur" })), { x: m.x, y: m.y, kx, ky });
  fs.writeFileSync(path.join(OUT, "veggir-2haed-frum.json"), JSON.stringify(veggirFrum));
  await page.screenshot({ path: path.join(OUT, "02_veggir_2haed.png") });
  // ⌘Z tekur alla greininguna í einu skrefi — og ⌘Y skilar henni
  await page.keyboard.press("Control+z"); await page.waitForTimeout(400);
  const sz = await stada();
  check("Ctrl+Z tekur alla greininguna í einu skrefi", sz.veggir === 0, sz.veggir);
  await page.keyboard.press("Control+y"); await page.waitForTimeout(400);
  const sy = await stada();
  check("Ctrl+Y skilar henni aftur", sy.veggir === s1.veggir, JSON.stringify({ sy: sy.veggir, s1: s1.veggir }));
  // Greina aftur: spurt Bæta við / Skipta út
  await page.locator('button[title^="Greina veggi"]').first().click();
  await nid.waitFor({ timeout: 180000 });
  await page.waitForFunction(() => !/Reikna/.test(document.querySelector("[data-greining-nidurstada]")?.textContent || "Reikna"), null, { timeout: 60000 });
  const baeta = page.getByRole("button", { name: /Bæta við \(\+\d+\)/ });
  const skipta = page.getByRole("button", { name: /Skipta út \(\d+ → \d+\)/ });
  check("veggir fyrir → spurt „Bæta við“ / „Skipta út“", (await baeta.count()) === 1 && (await skipta.count()) === 1, await page.locator('[role="dialog"][aria-label="Greina veggi"]').textContent());
  check("Bæta við sleppir tvítekningum (+0 þegar sama greining er komin)", /\(\+0\)/.test((await baeta.textContent()) || ""), await baeta.textContent());
  await page.locator('[role="dialog"][aria-label="Greina veggi"]').getByRole("button", { name: "Hætta við" }).click();
  await page.waitForTimeout(300);

  // ── 2. „Lita veggi" (F) ───────────────────────────────────────────────────────────────────────────────────────
  const einnVeggur = (await stada()).ids[0];
  const lina = (id) => page.evaluate((i) => {
    const st = window.__tpKit.getRegisteredStage(); const g = st && st.findOne("#" + i);
    const l = g && (g.getClassName() === "Line" ? g : g.findOne("Line"));
    return l ? l.stroke() : null;
  }, id);
  const fyrirLit = JSON.stringify(await page.evaluate(() => window.__tpStore.getState().objects));
  const lit0 = await lina(einnVeggur);
  await page.mouse.move(800, 500);
  await page.keyboard.press("f"); await page.waitForTimeout(400);
  const lit1 = await lina(einnVeggur);
  const ls1 = await page.evaluate(() => localStorage.getItem("tp_lita_veggi"));
  check("F: veggurinn teiknast fjólublár (#8b2cff) á striganum", lit0 === "#1c1917" && lit1 === "#8b2cff", JSON.stringify({ lit0, lit1 }));
  await page.screenshot({ path: path.join(OUT, "03_lita_veggi.png") });
  const eftirLit = JSON.stringify(await page.evaluate(() => window.__tpStore.getState().objects));
  check("Lita veggi breytir ENGU í gögnum borðsins (aðeins sýn); valið í localStorage", fyrirLit === eftirLit && ls1 === "1", JSON.stringify({ sama: fyrirLit === eftirLit, ls1 }));
  await page.keyboard.press("f"); await page.waitForTimeout(300);
  const lit2 = await lina(einnVeggur);
  check("F aftur: svart eins og áður", lit2 === "#1c1917", lit2);

  // ── 3. „+ Eldveggur EI-60": haldið inni og dregið ─────────────────────────────────────────────────────────────
  const fyrirEld = await stada();
  await page.getByRole("button", { name: /\+ Eldveggur EI-60/ }).first().click();
  await page.waitForTimeout(400);
  // auður reitur inni í húsinu (vinstri salurinn „Opið niður")
  const A = await skja(m.x + 1700 * kx, m.y + 2900 * ky);
  await page.mouse.move(A.x, A.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(A.x + i * 14, A.y + i * 1.1);
  await page.mouse.up(); await page.waitForTimeout(500);
  const s3 = await stada();
  const nyEld = s3.ids.filter((i) => !fyrirEld.ids.includes(i));
  check("+ Eldveggur EI-60: haldið inni og dregið = EINN nýr eldveggur", nyEld.length === 1 && s3.ei60 === fyrirEld.ei60 + 1, JSON.stringify({ nyEld, ei60: s3.ei60 }));
  let eldId = nyEld[0];
  if (eldId) {
    const o = await hlutur(eldId);
    const p = o.points;
    check("eldveggurinn er rauður veggur með tegund EI-60 (ekki svartur, ekki yfirlag)", o.veggTegund === "ei60" && o.stroke === "#d32f2f" && o.veggur === true && o.layerId === "veggir", JSON.stringify({ t: o.veggTegund, s: o.stroke, n: o.name }));
    check("beinn (hornalás)", Math.abs(p[p.length - 1] - p[1]) < 0.5 && Math.abs(p[p.length - 2] - p[0]) > 10, JSON.stringify(p));
  }
  await page.screenshot({ path: path.join(OUT, "04_eldveggur_dreginn.png") });

  // ── 4. veggur valinn → EI-30 í veggjastikunni; Veggur → venjulegur aftur ─────────────────────────────────────
  await page.keyboard.press("v"); await page.waitForTimeout(200);
  const valinn = await page.evaluate(() => {
    const V = window.__tpStore.getState().objects.filter((o) => o.veggur && !o.veggTegund && o.points.length === 4);
    V.sort((a, b) => Math.hypot(b.points[2] - b.points[0], b.points[3] - b.points[1]) - Math.hypot(a.points[2] - a.points[0], a.points[3] - a.points[1]));
    const o = V[3] || V[0];
    return { id: o.id, mx: o.x + (o.points[0] + o.points[2]) / 2, my: o.y + (o.points[1] + o.points[3]) / 2 };
  });
  const M = await skja(valinn.mx, valinn.my);
  await page.mouse.click(M.x, M.y); await page.waitForTimeout(300);
  const sel = await page.evaluate(() => window.__tpStore.getState().selectedIds);
  check("smellur velur vegginn", sel.length === 1 && sel[0] === valinn.id, JSON.stringify({ sel, vildi: valinn.id }));
  await page.locator('[data-stika-tegund="ei30"]').click(); await page.waitForTimeout(300);
  let ov = await hlutur(valinn.id);
  check("„EI-30“ í veggjastikunni: valinn veggur verður eldveggur EI-30 (ljósrauður)", ov.veggTegund === "ei30" && ov.stroke === "#ef5350", JSON.stringify({ t: ov.veggTegund, s: ov.stroke }));
  await page.screenshot({ path: path.join(OUT, "05_gera_ad_ei30.png") });
  await page.locator('[data-stika-tegund="veggur"]').click(); await page.waitForTimeout(300);
  ov = await hlutur(valinn.id);
  check("„Veggur“: aftur venjulegur veggur (svartur)", (ov.veggTegund || "veggur") === "veggur" && ov.stroke === "#1c1917", JSON.stringify({ t: ov.veggTegund, s: ov.stroke }));
  // flýtilykill 5 gerir hann aftur að EI-30 (helst þannig í vistun)
  await page.keyboard.press("5"); await page.waitForTimeout(300);
  ov = await hlutur(valinn.id);
  check("flýtilykill 5 (EI-30) á völdum vegg", ov.veggTegund === "ei30", ov.veggTegund);
  await page.keyboard.press("Escape");

  // ── 5. EI-greining (OCR) — eldveggir á veggjum, innan hússins ─────────────────────────────────────────────────
  if (!AN_EI) {
    const fyrirEI = await stada();
    await page.getByRole("tab", { name: "Brunaþéttingar" }).click(); await page.waitForTimeout(400);
    const t0 = Date.now();
    await page.locator('button[title="Lesa EI-merkingar og merkja eldveggina"]').click();
    await page.waitForFunction(() => window.__tpStore.getState().importProgress, null, { timeout: 30000 });
    await bidaGreiningar(900000);
    await page.waitForTimeout(800);
    const sek = Math.round((Date.now() - t0) / 1000);
    const toastEI = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((e) => e.textContent).filter((t) => /EI-merki|eldvegg/i.test(t || "")).join(" | "));
    console.log(`EI-greining (${sek} s):`, toastEI);
    const ei = await page.evaluate((H) => {
      const O = window.__tpStore.getState().objects;
      const E = O.filter((o) => o.veggur && (o.veggTegund === "ei60" || o.veggTegund === "ei30"));
      const utan = E.filter((o) => o.points.some((v, i) => (i % 2 === 0 ? v + o.x < H.x0 || v + o.x > H.x1 : v + o.y < H.y0 || v + o.y > H.y1)));
      const yfirlog = O.filter((o) => (o.type === "polyline" || o.type === "line") && /^Eldveggur|^Eldhurð/.test(o.name)).length;
      const midar = O.filter((o) => o.type === "text" && /^Eldveggur EI/.test(o.name)).length;
      const lengd = E.reduce((s, o) => { let L = 0; for (let i = 2; i < o.points.length; i += 2) L += Math.hypot(o.points[i] - o.points[i - 2], o.points[i + 1] - o.points[i - 1]); return s + L; }, 0);
      return { eld: E.length, ei60: E.filter((o) => o.veggTegund === "ei60").length, ei30: E.filter((o) => o.veggTegund === "ei30").length, utan: utan.length, yfirlog, midar, lengd };
    }, HUS);
    console.log("EI:", JSON.stringify(ei));
    const veggirEI = await page.evaluate(() => window.__tpStore.getState().objects.filter((o) => o.veggur).map((o) => ({ id: o.id, p: o.points.map((v, i) => v + (i % 2 === 0 ? o.x : o.y)), t: o.strokeWidth, tegund: o.veggTegund || "veggur" })));
    fs.writeFileSync(path.join(OUT, "ei-greining-gogn.json"), JSON.stringify({ veggir: veggirEI, log: loggar.filter((l) => /^\[EI\]/.test(l)), mynd: { x: m.x, y: m.y, kx, ky } }));
    check("EI-greiningin las EI-miða á 2. hæð", ei.midar > 0, JSON.stringify(ei));
    check("EI-merki urðu eldveggir Á VEGGJUM (fleiri en handgerðu tveir)", ei.eld > fyrirEI.ei60 + fyrirEI.ei30, JSON.stringify({ ei, fyrir: fyrirEI }));
    check("ENGIN eldveggslína utan hússins (ásalínur eltar ekki)", ei.utan === 0, ei.utan);
    check("engin gömul yfirlög eftir ásalínum (Eldveggur-línur)", ei.yfirlog === 0, ei.yfirlog);
    const mpx = 1 / (kx * (6006 / 2384) / ((0.0254 / 72) * 100));
    console.log("lengd eldveggja ≈", Math.round(ei.lengd * mpx), "m");
    await page.screenshot({ path: path.join(OUT, "06_ei_greining.png") });
    await page.evaluate(() => window.__tpStore.getState().setSelected([]));
    await page.keyboard.press("f"); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "07_ei_greining_litad.png") });
    await page.keyboard.press("f"); await page.waitForTimeout(200);
    // eitt ⌘Z tekur alla EI-greininguna
    await page.keyboard.press("Control+z"); await page.waitForTimeout(500);
    const eftirZ = await stada();
    check("Ctrl+Z tekur alla EI-greininguna í einu skrefi", eftirZ.ei60 === fyrirEI.ei60 && eftirZ.ei30 === fyrirEI.ei30 && eftirZ.veggir === fyrirEI.veggir, JSON.stringify({ eftirZ, fyrirEI }));
    await page.keyboard.press("Control+y"); await page.waitForTimeout(500);
  }

  // ── 6. Vista í úttekt — gripið ────────────────────────────────────────────────────────────────────────────────
  const fyrirVistun = await stada();
  await page.getByRole("button", { name: /Vista í úttekt/ }).first().click();
  await page.waitForTimeout(5000);
  let haed = null, haed1 = null;
  try { const j = JSON.parse(gripin[gripin.length - 1] || "{}"); haed = (j.haedir || []).find((h) => h.id === HAED); haed1 = (j.haedir || []).find((h) => h.id === HAED1); } catch (_) {}
  const vl = (haed && haed.veggjaLinur) || [];
  console.log("vistun:", JSON.stringify({ linur: vl.length, eld60: vl.filter((v) => v.eld === 60).length, eld30: vl.filter((v) => v.eld === 30).length, gler: vl.filter((v) => v.tegund === "gler").length, leidrett: haed && haed.leidrett }));
  check("vistun gripin: eldveggir í veggjaLinur sem { tegund: 'veggur', eld: 60 / 30 }", vl.some((v) => v.eld === 60 && v.tegund === "veggur") && vl.some((v) => v.eld === 30 && v.tegund === "veggur"), JSON.stringify(vl.filter((v) => v.eld).slice(0, 3)));
  check("allir veggir borðsins fylgja (veggjaLinur = veggir á borðinu)", vl.length === fyrirVistun.veggir, JSON.stringify({ vl: vl.length, bord: fyrirVistun.veggir }));
  check("engin óþekkt tegund í vistun (Teikning les veggur/gler/hurd)", vl.every((v) => ["veggur", "gler", "hurd"].includes(v.tegund)), JSON.stringify([...new Set(vl.map((v) => v.tegund))]));
  const d1 = dbHaedir && dbHaedir.find((h) => h.id === HAED1);
  check("1. hæð ósnert í sendingunni", !!haed1 && !!d1 && JSON.stringify(haed1.veggjaLinur) === JSON.stringify(d1.veggjaLinur) && JSON.stringify(haed1.markers) === JSON.stringify(d1.markers), "1. hæð breyttist");
  await page.screenshot({ path: path.join(OUT, "08_vistad.png") });

  // ── vörður: engin skrif sluppu ────────────────────────────────────────────────────────────────────────────────
  const gripidUrl = new Set([...verndud.map((g) => g.method + " " + g.url)]);
  const supabaseSkrif = skrifVafra.filter((r) => /supabase\.co/.test(r.url));
  const sloppid = supabaseSkrif.filter((r) => !gripidUrl.has(r.method + " " + r.url) && !/teikning_bord/.test(r.url));
  const annad = skrifVafra.filter((r) => !/supabase\.co/.test(r.url) && !/localhost|127\.0\.0\.1/.test(r.url));
  console.log("skrif gripin af verði:", verndud.length, "· teikning_bord gripin:", gripin.length, "· skrif vafrans alls:", skrifVafra.length);
  check("ENGIN skrif fóru út (öll Supabase-skrif gripin, engin skrif á aðra þjóna)", sloppid.length === 0 && annad.length === 0, JSON.stringify({ sloppid, annad }));
  check("engar villur á síðunni", !errs.length, errs.join(" | "));
  if (loggar.length) console.log(loggar.join("\n"));
  console.log(`\n${ok.length} í lagi, ${bad.length} brást`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error("VILLA", e.message); process.exit(2); });
