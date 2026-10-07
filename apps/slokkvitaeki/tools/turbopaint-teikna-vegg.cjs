/* „+ Teikna vegg" / „+ Hurð" / „+ Gler" — haldið inni og dregið = einn beinn veggur (Agnar 07.10.2026: „hún dregst
 * þegar ég held inni vinstri músartakkanum og stoppar þegar ég sleppi" · „draga á milli hurðakarmanna").
 *   node tools/turbopaint-teikna-vegg.cjs [http://localhost:4123] [úttaksmappa]
 * Raunveruleg mús (page.mouse). ENGIN skrif í teikning_bord — gripin og skoðuð. */
const path = require("path");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright")); }
const BASE = process.argv[2] || "http://localhost:4123";
const OUT = process.argv[3] || path.join(process.cwd(), "turbopaint-teikna-vegg-myndir");
fs.mkdirSync(OUT, { recursive: true });
const CID = 1612, HAED = "hmuaaaw83rg9";
const ok = [], bad = [];
const check = (n, c, x) => { (c ? ok : bad).push(n); console.log((c ? "  ✓ " : "  ✗ ") + n + (c ? "" : "   ← " + x)); };

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  const gripin = [];
  await ctx.route("**/rest/v1/teikning_bord*", async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") return route.fulfill({ response: await route.fetch() });
    gripin.push(req.postData());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
  });
  const stada = () => page.evaluate(() => {
    const s = window.__tpStore.getState();
    const V = s.objects.filter((o) => (o.type === "polyline" || o.type === "line") && (o.veggur || o.layerId === "veggir"));
    return { veggir: V.length, gler: V.filter((o) => o.veggTegund === "gler").length, hurd: V.filter((o) => o.veggTegund === "hurd").length, ids: V.map((o) => o.id) };
  });
  const veggur = (id) => page.evaluate((i) => window.__tpStore.getState().objects.find((o) => o.id === i), id);

  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&b=4244&h=6006&ham=teikning`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 120000 });
  await page.waitForFunction(() => {
    const w = window, s = w.__tpStore?.getState(); if (!s) return false;
    if (s.importProgress) w.__tpByrjad = true;
    if ([...document.querySelectorAll("[data-sonner-toast]")].some((e) => /merki á teikningunni/.test(e.textContent || ""))) w.__tpByrjad = true;
    if (!w.__tpByrjad || s.importProgress) return false;
    const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === 1612);
    return !!m && s.objects.some((o) => o.type === "polyline" && o.veggur && o.parentId === m.id);
  }, null, { timeout: 300000, polling: 100 });
  await page.waitForTimeout(2000);
  const s0 = await stada();
  console.log("opnað:", JSON.stringify({ veggir: s0.veggir, gler: s0.gler, hurd: s0.hurd }));

  // auður reitur á skjánum (inni í salnum) — miðja borðsins
  const box = await page.locator(".tp-sheet").boundingBox();
  const cx = box.x + box.width * 0.55, cy = box.y + box.height * 0.45;

  // 1) „+ Teikna vegg" → haldið inni, dregið (aðeins á ská — hornalás á að rétta), sleppt
  await page.getByRole("button", { name: /\+ Teikna vegg/ }).first().click();
  await page.waitForTimeout(400);
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx + i * 15, cy + i * 1.2);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const s1 = await stada();
  const ny = s1.ids.filter((i) => !s0.ids.includes(i));
  check("+ Teikna vegg: haldið inni og dregið = einn nýr veggur", ny.length === 1 && s1.veggir === s0.veggir + 1, JSON.stringify({ s0: s0.veggir, s1: s1.veggir, ny }));
  if (ny.length) {
    const o = await veggur(ny[0]);
    const p = o.points;
    const dy = Math.abs(p[p.length - 1] - p[1]), dx = Math.abs(p[p.length - 2] - p[0]);
    check("veggurinn er beinn (hornalás sjálfgefið: lárétt þó músin færi á ská)", dy < 0.5 && dx > 10, JSON.stringify({ dx, dy }));
    check("tegund = veggur", !o.veggTegund || o.veggTegund === "veggur", o.veggTegund);
  }
  await page.screenshot({ path: path.join(OUT, "01_teikna_vegg.png") });

  // 2) annar dráttur strax (ekki keðja frá síðasta) — nýr veggur á nýjum stað
  await page.mouse.move(cx, cy + 80); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx, cy + 80 + i * 14);
  await page.mouse.up(); await page.waitForTimeout(400);
  const s2 = await stada();
  check("annar dráttur = annar sjálfstæður veggur (lóðréttur)", s2.veggir === s1.veggir + 1, JSON.stringify({ s1: s1.veggir, s2: s2.veggir }));

  // 3) „+ Hurð" → dregið á milli tveggja punkta
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /\+ Hurð/ }).first().click();
  await page.waitForTimeout(400);
  await page.mouse.move(cx + 300, cy); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx + 300 + i * 10, cy);
  await page.mouse.up(); await page.waitForTimeout(400);
  const s3 = await stada();
  check("+ Hurð: dráttur = ný hurð (veggTegund hurd)", s3.hurd === s2.hurd + 1 && s3.veggir === s2.veggir + 1, JSON.stringify({ s2, s3: { veggir: s3.veggir, hurd: s3.hurd } }));
  await page.screenshot({ path: path.join(OUT, "02_hurd.png") });

  // 4) „+ Gler"
  await page.getByRole("button", { name: /\+ Gler/ }).first().click();
  await page.waitForTimeout(300);
  await page.mouse.move(cx + 300, cy + 120); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx + 300 + i * 12, cy + 120);
  await page.mouse.up(); await page.waitForTimeout(400);
  const s4 = await stada();
  check("+ Gler: dráttur = nýtt gler", s4.gler === s3.gler + 1, JSON.stringify({ s3: s3.gler, s4: s4.gler }));

  // 5) ⌘Z afturkallar síðasta
  await page.keyboard.press("Control+z"); await page.waitForTimeout(300);
  const s5 = await stada();
  check("Ctrl+Z tekur síðasta dráttinn til baka", s5.gler === s3.gler && s5.veggir === s3.veggir, JSON.stringify({ s5 }));

  // 6) smellur án dráttar heldur keðju-ham (smellur, smellur, Enter)
  await page.getByRole("button", { name: /\+ Teikna vegg/ }).first().click();
  await page.mouse.click(cx - 200, cy + 200); await page.mouse.click(cx - 60, cy + 200); await page.mouse.click(cx - 60, cy + 300);
  await page.keyboard.press("Enter"); await page.waitForTimeout(400);
  const s6 = await stada();
  check("smellur-smellur-smellur + Enter = 2 veggir (keðja virkar áfram)", s6.veggir === s5.veggir + 2, JSON.stringify({ s5: s5.veggir, s6: s6.veggir }));

  // 7) vista — gripið
  await page.getByRole("button", { name: /Vista í úttekt/ }).first().click();
  await page.waitForTimeout(4000);
  let haed = null;
  try { const j = JSON.parse(gripin[gripin.length - 1] || "{}"); haed = (j.haedir || []).find((h) => h.id === HAED); } catch (_) {}
  check("vistun gripin og hurð í veggjaLinur með tegund hurd", !!haed && (haed.veggjaLinur || []).some((v) => v.tegund === "hurd"), haed ? (haed.veggjaLinur || []).length + " línur" : "engin sending");
  check("engar villur á síðunni", !errs.length, errs.join(" | "));
  console.log(`\n${ok.length} í lagi, ${bad.length} brást`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error("VILLA", e.message); process.exit(2); });
