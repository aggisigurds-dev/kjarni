/* Sannar að SJÁLFGERÐU merkin fylgi stærðarstillingunni — keyrir sjálfa
 * 165.BR1-merkingarvélina með tilbúnum OCR-orðum, og að stærðin lagi valin
 * tákn en láti óvalin í friði. */
const { chromium } = require("playwright");
const OUT = "/tmp/claude-0/-home-user/357c1d3d-b8ca-5909-8704-0dc2fc40aa5f/scratchpad";
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));

(async () => {
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext()).newPage();
  await page.setViewportSize({ width: 1600, height: 950 });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto("http://localhost:4123/kjarni/turbopaint", { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 40000 });
  await page.waitForTimeout(6000);
  const before = await page.evaluate(() => window.__tpSettings.getStampSize());

  const run = (size) => page.evaluate(async (S) => {
    await window.__tpSettings.setStampSize(S);
    const plan = { id: "p", type: "image", assetId: "a", x: 0, y: 0, width: 2000, height: 1400,
                   name: "prufa", rotation: 0, opacity: 1, locked: false, hidden: false };
    const w = (text, x, y) => ({ text, x, y, width: 40, height: 14, confidence: 90, vertical: false });
    const r = window.__tpKit.placeMvs165Equipment(plan, [w("SLT", 400, 400), w("ÚT", 900, 400)], { pixelsPerMeter: null });
    const by = (id) => r.objects.filter(o => o.symbolId === id).map(o => o.size);
    return { slt: by("extinguisher"), skilti: by("sign-extinguisher"), ut: by("exit") };
  }, size);

  const big = await run(56), small = await run(24);
  check("sjálfgert slökkvitæki fylgir 56", big.slt[0] === 56, JSON.stringify(big));
  check("sjálfgert slökkvitæki fylgir 24", small.slt[0] === 24, JSON.stringify(small));
  check("skiltið kvarðast hlutfallslega (36 → 15)", big.skilti[0] === 36 && small.skilti[0] === 15, JSON.stringify([big.skilti, small.skilti]));
  check("ÚT kvarðast hlutfallslega (44 → 19)", big.ut[0] === 44 && small.ut[0] === 19, JSON.stringify([big.ut, small.ut]));

  // Valin tákn breytast; óvalin standa
  await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const base = { rotation: 0, opacity: 1, locked: false, hidden: false, name: "Slökkvitæki", label: "" };
    s.addObjects([
      { id: "valid", type: "symbol", symbolId: "extinguisher", x: 200, y: 200, size: 80, ...base },
      { id: "ovalid", type: "symbol", symbolId: "extinguisher", x: 400, y: 200, size: 80, ...base },
    ], false);
    s.setSelected(["valid"]);
  });
  await page.waitForTimeout(500);
  const slider = page.locator('input[aria-label="Stærð nýrra tákna"]');
  check("stærðarslá birtist þegar tákn er valið", await slider.count() === 1);
  await slider.fill("30");
  await slider.dispatchEvent("pointerup");
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => {
    const o = window.__tpStore.getState().objects;
    const g = (id) => o.find(x => x.id === id);
    return { valid: g("valid"), ovalid: g("ovalid") };
  });
  check("valið tákn minnkar í 30", after.valid.size === 30, `size=${after.valid?.size}`);
  check("miðjan helst kyrr (200+40 → 225+15)", after.valid.x === 225 && after.valid.y === 225, `x=${after.valid?.x} y=${after.valid?.y}`);
  check("ÓVALIÐ tákn stendur óbreytt í 80", after.ovalid.size === 80 && after.ovalid.x === 400, `size=${after.ovalid?.size}`);

  await page.evaluate((n) => window.__tpSettings.setStampSize(n), before);
  await page.waitForTimeout(600);
  check("stimpilstærð skilað í fyrra horf", await page.evaluate(() => window.__tpSettings.getStampSize()) === before);

  await page.screenshot({ path: `${OUT}/t-staerd.png` });
  console.log(ok.map(n => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map(n => "  ✘ " + n).join("\n"));
  console.log(`\n${ok.length}/${ok.length + bad.length} · villur: ${errs.length ? errs.join(" | ") : "engar"}`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error("BROTNAÐI:", e.message); process.exit(1); });
