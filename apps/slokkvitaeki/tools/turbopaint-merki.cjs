/* Prófar: 3 tækjategundir · stimpilstærð (ný tákn AÐEINS) · dofnun allra
 * merkinga · Lagnir samanbrotnar + Lag falið · nýtt tákn og endurnefning.
 * Skilar táknastillingunum í fyrra horf í lokin — þær eru sameiginlegar. */
const { chromium } = require("playwright");
const OUT = "/tmp/claude-0/-home-user/357c1d3d-b8ca-5909-8704-0dc2fc40aa5f/scratchpad";
const ok = [], bad = [];
const check = (n, c) => (c ? ok : bad).push(n);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  await page.setViewportSize({ width: 1600, height: 950 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:4123/kjarni/turbopaint", { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 40000 });
  await page.waitForTimeout(6000); // táknastillingar sækjast úr Supabase

  const before = await page.evaluate(() => window.__tpSettings?.getSymbolSettings?.() ?? null);

  // 1) Tækjategundirnar þrjár — í slánni með réttum litum
  const tray = await page.evaluate(() => {
    const g = window.__tpSymbols;
    return ["extinguisher-duft", "extinguisher-co2", "extinguisher-lettvatn"].map((id) => {
      const s = g.getSymbol(id);
      const p = g.symbolPaint(s);
      return { id, name: s.name, glyph: s.glyphId, ...p };
    });
  });
  check("Duft er blátt á rauðum reit", tray[0].fg === "#1d4ed8" && tray[0].bg === "#e11d2e");
  check("CO₂ er dökkrautt með svartri útlínu", tray[1].fg === "#7f1d1d" && tray[1].outline === "#0c0a09");
  check("Léttvatn er blágrænt", tray[2].fg === "#0d9488");
  check("Allar þrjár nota slökkvitækja-teikninguna", tray.every((t) => t.glyph === "extinguisher"));
  const trayBtns = await page.locator('.pointer-events-auto button[title*="dragðu inn"]').count();
  check("Táknaslán ber tegundirnar", trayBtns >= 15);

  // 2) Stimpilstærð: gamalt tákn á að standa óbreytt
  await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const base = { rotation: 0, opacity: 1, locked: false, hidden: false, name: "Slökkvitæki" };
    s.addObjects([{ id: "gamalt", type: "symbol", symbolId: "extinguisher", x: 300, y: 300, size: 64, label: "G", ...base }], false);
  });
  await page.evaluate(async () => { await window.__tpSettings.setStampSize(24); });
  await page.waitForTimeout(400);
  const stamped = await page.evaluate(() => {
    const { makeSymbol } = window.__tpKit;
    return makeSymbol("extinguisher-duft", 500, 500).size;
  });
  const oldSize = await page.evaluate(() => window.__tpStore.getState().objects.find((o) => o.id === "gamalt").size);
  check("Nýtt tákn fær valda stærð (24)", stamped === 24);
  check("Tákn sem var á borðinu helst 64", oldSize === 64);

  // 3) Dofnun — öll tákn jafnt, sjónstilling en ekki breyting á hlutunum
  await page.evaluate(() => window.__tpStore.getState().setSymbolOpacity(0.4));
  await page.waitForTimeout(300);
  const dim = await page.evaluate(() => {
    const st = window.__tpStore.getState();
    return { global: st.symbolOpacity, obj: st.objects.find((o) => o.id === "gamalt").opacity };
  });
  check("Dofnun sett á 40%", Math.abs(dim.global - 0.4) < 0.001);
  check("Hluturinn sjálfur er ósnertur (opacity 1)", dim.obj === 1);
  await page.evaluate(() => window.__tpStore.getState().setSymbolOpacity(1));

  // 4) Lagnir samanbrotnar → Lag hvergi í botnstikunni
  const lagFalid = await page.locator('.tp-stylestrip', { hasText: "Lag" }).count();
  check("Lag er falið meðan lagnir eru samanbrotnar", lagFalid === 0);
  check("Merkingar-stikan er á sínum stað", await page.locator('.tp-stylestrip', { hasText: "Merkingar" }).count() === 1);
  await page.locator('button[title*="Opna lagnir"]').click();
  await page.waitForTimeout(400);
  check("Lag birtist þegar lagnir eru opnaðar", await page.locator('.tp-stylestrip', { hasText: "Lag" }).count() === 1);
  await page.locator('button[title*="Fella lagnir"]').click();
  await page.waitForTimeout(300);

  // 5) Nýtt tákn + endurnefning (og hreinsað upp á eftir)
  page.on("dialog", (d) => d.accept("Prufutákn"));
  await page.locator('button[title^="Táknin"]').click();
  await page.waitForTimeout(700);
  await page.locator('button', { hasText: "Nýtt tákn" }).click();
  await page.waitForTimeout(900);
  const madeId = await page.evaluate(() => window.__tpSettings.getSymbolSettings().custom.at(-1)?.id);
  check("Nýtt tákn stofnað", !!madeId);
  const field = page.locator('input[aria-label="Heiti á Prufutákn"]');
  await field.fill("Endurnefnt");
  await field.press("Enter");
  await page.waitForTimeout(700);
  check("Endurnefning gildir", await page.evaluate((id) => window.__tpSymbols.getSymbol(id).name, madeId) === "Endurnefnt");
  await page.screenshot({ path: `${OUT}/m-taknin.png` });

  // Hreinsun: skila stillingunum nákvæmlega eins og þær voru
  await page.evaluate(async ([id, size]) => {
    if (id) await window.__tpSettings.deleteCustomSymbol(id);
    await window.__tpSettings.setStampSize(size);
  }, [madeId, before?.stampSize ?? 40]);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.__tpSettings.getSymbolSettings());
  check("Táknastillingar skilaðar óbreyttar", after.custom.length === (before?.custom.length ?? 0));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/m-stika.png` });

  console.log(ok.map((n) => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map((n) => "  ✘ " + n).join("\n"));
  console.log(`\n${ok.length}/${ok.length + bad.length} · villur í console: ${errs.length ? errs.join(" | ") : "engar"}`);
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error("BROTNAÐI:", e.message); process.exit(1); });
