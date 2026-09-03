/* Dregið tákn á að koma ÁN merkimiða (eins og stimplað) en halda heiti táknsins
 * í lagalista/magntöflu. Sjálfvirka 165.BR1-merkingin heldur sínum númerum. */
const { chromium } = require("playwright");
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

  const r = await page.evaluate(() => {
    const { makeSymbol, placeMvs165Equipment } = window.__tpKit;
    const dropped = makeSymbol("extinguisher-lettvatn", 100, 100);      // drag-og-slepp leiðin
    const plan = { id:"p", type:"image", assetId:"a", x:0, y:0, width:2000, height:1400, name:"p", rotation:0, opacity:1, locked:false, hidden:false };
    const w = (t,x,y) => ({ text:t, x, y, width:40, height:14, confidence:90, vertical:false });
    const auto = placeMvs165Equipment(plan, [w("SLT",400,400), w("ÚT",900,400)], { pixelsPerMeter:null }).objects;
    const slt = auto.find(o => o.symbolId === "extinguisher");
    const ut = auto.find(o => o.symbolId === "exit");
    return { dropped: { label: dropped.label, name: dropped.name }, slt: { label: slt?.label, name: slt?.name }, ut: { label: ut?.label } };
  });
  check("dregið tákn: enginn merkimiði", r.dropped.label === "", JSON.stringify(r.dropped));
  check("dregið tákn: heitið helst í lagalista (Slökkvitæki · Léttvatn)", r.dropped.name === "Slökkvitæki · Léttvatn", JSON.stringify(r.dropped));
  check("sjálfvirk merking heldur SLT-1", r.slt.label === "SLT-1", JSON.stringify(r.slt));
  check("sjálfvirk merking heldur 165.BR1-heitinu", r.slt.name === "165.BR1 SLT-1", JSON.stringify(r.slt));
  check("sjálfvirk merking heldur ÚT", r.ut.label === "ÚT", JSON.stringify(r.ut));

  // Stimplun með alvöru smelli — var þegar án texta, á að vera það áfram
  await page.evaluate(() => { const s = window.__tpStore.getState(); s.setCamera({x:0,y:0,scale:1}); s.setStyle({ symbolId: "extinguisher-duft" }); s.setTool("symbol"); });
  await page.waitForTimeout(300);
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(box.x + 500, box.y + 500);
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => { const o = window.__tpStore.getState().objects.filter(v => v.type === "symbol"); const l = o[o.length-1]; return l && { label: l.label, name: l.name }; });
  check("stimplað tákn: enginn merkimiði, heitið helst", st && st.label === "" && st.name === "Slökkvitæki · Duft", JSON.stringify(st));

  console.log(ok.map(n => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map(n => "  ✘ " + n).join("\n"));
  console.log(`\n${ok.length}/${ok.length + bad.length} · villur: ${errs.length ? errs.join(" | ") : "engar"}`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error("BROTNAÐI:", e.message); process.exit(1); });
