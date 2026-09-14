/* Vafra-próf: heimilisfangaleitin í TurboPaint finnur teikningar í Hafnarfirði,
 * Garðabæ og Kópavogi og setur PDF á borðið.
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/turbopaint-teikningaleit.cjs [http://localhost:4143]
 */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.argv[2] || "http://localhost:4143";
const RELAY = "/home/user/slokkvitaeki/tools/bh-browser.cjs";
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function launchBrowser() {
  if (/^https:/i.test(BASE) && fs.existsSync(RELAY)) {
    const { context, cleanup } = await require(RELAY).launch();
    return { ctx: context, cleanup };
  }
  const browser = await chromium.launch({ headless: true });
  return { ctx: await browser.newContext(), cleanup: () => browser.close() };
}
async function waitFor(fn, ms, every = 500) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await wait(every); }
  return last;
}

(async () => {
  const { ctx, cleanup } = await launchBrowser();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 950 });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  try {
    await page.goto(`${BASE}/kjarni/turbopaint`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-toolbar").waitFor({ timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.evaluate(() => { const s = window.__tpStore.getState(); s.deleteIds(s.objects.map((o) => o.id)); });

    const search = page.locator('input[placeholder^="Heimilisfang"]').first();
    check("leitarreiturinn er í stikunni", (await search.count()) >= 1);
    const tiles = () => page.locator("[data-hleit] button[title*='smelltu til að setja']");
    /** Slá inn heimilisfang; sé sama heimilisfang til í fleiri bæjum sýnir leitin
     *  listann og þá er rétta póstnúmerið valið (Strandgata 6 er til í fimm bæjum). */
    const leita = async (addr, postnr) => {
      await search.click();
      await search.fill("");
      await search.fill(addr);
      const entry = page.locator("[data-hleit] button", { hasText: new RegExp(`^${addr}\\s*\\(${postnr}\\)`) });
      // Valda eignin stendur í feitletraða hausnum — gömlu spjöldin úr fyrri leit
      // teljast ekki með fyrr en hausinn sýnir nýja heimilisfangið.
      const header = page.locator("[data-hleit] span.font-semibold", { hasText: addr });
      await wait(700); // leitin er hömluð um 420 ms
      const got = await waitFor(async () => ((await header.count()) && (await tiles().count()) ? "tiles" : (await entry.count()) ? "list" : null), 30000);
      if (got === "list") await entry.first().click();
      await waitFor(async () => (await header.count()) || null, 20000);
      return waitFor(async () => (await tiles().count()) || null, 40000);
    };

    // Hafnarfjörður
    const n1 = await leita("Strandgata 6", 220);
    check(`Strandgata 6 (HF): teikningaspjöld birtast (${n1})`, n1 > 0);
    const chips1 = await page.locator("[data-tegundir] button").allTextContents();
    check("tegundar-síur birtast, Bygginganefndarteikning sjálfvalin", chips1.some((c) => /Bygginganefndarteikning/.test(c)), JSON.stringify(chips1));
    const pdfBadges = await page.locator("[data-hleit] span", { hasText: /^PDF$/ }).count();
    check("spjöldin sýna PDF-merki í stað forskoðunar", pdfBadges > 0, `${pdfBadges}`);
    const first = tiles().first();
    const firstTitle = await first.getAttribute("title");
    await first.click();
    const plan = await waitFor(() => page.evaluate(() => { const o = window.__tpStore.getState().objects.find((x) => x.type === "image"); return o ? { name: o.name, w: o.width, h: o.height } : null; }), 90000, 1000);
    check(`smellur á spjald setur PDF-teikninguna á borðið (${plan && plan.name})`, plan && plan.w > 200 && plan.h > 200, JSON.stringify(plan) + " | " + firstTitle);
    await page.screenshot({ path: "/tmp/tp-teikningaleit-hf.png" });

    // Kópavogur — aðaluppdrættir sjálfvaldir, hæða-síur úr gögnunum, textasía
    const n2 = await leita("Digranesvegur 1", 200);
    check(`Digranesvegur 1 (KP): spjöld birtast (${n2})`, n2 > 0);
    const chips2 = await page.locator("[data-tegundir] button").allTextContents();
    check("Kópavogur: Aðaluppdráttur sjálfvalinn", chips2.some((c) => /Aðaluppdráttur/.test(c)), JSON.stringify(chips2));
    const haedChips = await page.locator("[data-hleit] button", { hasText: /^\d+\. hæð$/ }).count();
    check("hæða-síur smíðaðar úr Kópavogs-gögnunum", haedChips > 0, `${haedChips}`);
    const filter = page.locator('input[placeholder^="Sía"]');
    check("textasía birtist á löngum lista", (await filter.count()) === 1);
    const before = await tiles().count();
    await filter.fill("grunnmynd 2");
    await wait(400);
    const after = await tiles().count();
    check("textasían þrengir listann", after > 0 && after < before, `${before} → ${after}`);
    await filter.fill("");

    // Garðabær — 1000+ blöð, Allt-takkinn sýnir fjöldann
    const n3 = await leita("Garðatorg 7", 210);
    check(`Garðatorg 7 (GB): spjöld birtast (${n3})`, n3 > 0);
    const allt = await page.locator("[data-tegundir] button", { hasText: /^Allt/ }).textContent();
    check("Garðabær: Allt-takkinn telur hundruð blaða", /\((\d{3,4})\)/.test(allt || ""), allt);
    const kort = await page.locator("[data-hleit] a", { hasText: /kortasjá Garðabær/ }).count();
    check("kortasjár-tengill enn til staðar undir listanum", kort === 1, `${kort}`);
    await page.screenshot({ path: "/tmp/tp-teikningaleit-gb.png" });

    // Djúptengill ?leit= (kúnnaspjaldið í Slökkvitæki-appinu)
    await page.goto(`${BASE}/kjarni/turbopaint?leit=${encodeURIComponent("Strandgata 6")}`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-toolbar").waitFor({ timeout: 60000 });
    const deepEntry = page.locator("[data-hleit] button", { hasText: /^Strandgata 6\s*\(220\)/ });
    const deep = await waitFor(async () => (await deepEntry.count()) || (await tiles().count()) || null, 30000);
    check("?leit= opnar leitina með heimilisfanginu og sýnir niðurstöður", Boolean(deep), `${deep}`);
    check("?leit= hverfur úr slóðinni", !/leit=/.test(page.url()), page.url());
  } catch (e) {
    bad.push(`crash: ${String(e).slice(0, 200)}`);
    await page.screenshot({ path: "/tmp/tp-teikningaleit-crash.png" }).catch(() => {});
  }
  console.log(ok.map((n) => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map((n) => "  ✘ " + n).join("\n"));
  if (errs.length) console.log("pageerrors:", errs.slice(0, 4).join(" | "));
  console.log(`${ok.length}/${ok.length + bad.length} passed`);
  await Promise.race([cleanup(), new Promise((r) => setTimeout(r, 8000))]).catch(() => {});
  process.exit(bad.length ? 1 : 0);
})();
