/* A4-flísar + fylgihlutir kvarðast með teikningu. PDF-ið er lesið með pdfinfo,
 * ekki bara talið að það hafi orðið til. */
const { chromium } = require("playwright");
const fs = require("fs"); const { execSync } = require("child_process");
const OUT = "/tmp/claude-0/-home-user/357c1d3d-b8ca-5909-8704-0dc2fc40aa5f/scratchpad";
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));
const pdfinfo = (f) => { const t = execSync(`pdfinfo "${f}"`).toString(); return { pages: +(/Pages:\s+(\d+)/.exec(t)||[])[1], size: (/Page size:\s+([\d.]+) x ([\d.]+)/.exec(t)||[]).slice(1,3).map(Number) }; };
const isA4 = ([w,h], o) => o === "landscape" ? Math.abs(w-841.89)<1 && Math.abs(h-595.28)<1 : Math.abs(w-595.28)<1 && Math.abs(h-841.89)<1;

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 950 });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto("http://localhost:4123/kjarni/turbopaint", { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 40000 });
  await page.waitForTimeout(6000);

  // ── Borð með breiðri teikningu (rammi + tákn + texti) ──
  await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const base = { rotation: 0, opacity: 1, locked: false, hidden: false };
    s.setCamera({ x: 20, y: 60, scale: 0.5 });
    s.addObjects([
      { id: "rammi", type: "rect", x: 0, y: 0, width: 1800, height: 620, fill: "transparent", stroke: "#111", strokeWidth: 6, cornerRadius: 0, name: "Ferningur", ...base },
      { id: "t1", type: "symbol", symbolId: "extinguisher-lettvatn", x: 200, y: 200, size: 60, label: "1", name: "Slökkvitæki", ...base },
      { id: "t2", type: "symbol", symbolId: "extinguisher-co2", x: 1500, y: 350, size: 60, label: "K", name: "Slökkvitæki", ...base },
      { id: "tx", type: "text", x: 700, y: 280, width: 400, text: "ÁLHELLA 7 · PRUFA", fontSize: 48, fill: "#111", fontStyle: "bold", align: "center", name: "Texti", ...base },
    ], false);
  });
  await page.waitForTimeout(800);

  // ── A: flísar gegnum vélina sjálfa, 2×1 lárétt og 3×1 lóðrétt ──
  const mk = (layout) => page.evaluate(async (layout) => {
    const stage = window.__tpKit.getRegisteredStage();
    const objs = window.__tpStore.getState().objects;
    const { blob, pages } = await window.__tpKit.exportTiledPdf(stage, objs, "board", 1, "Prufuborð", layout);
    const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
    return { pages, b64 };
  }, layout);
  const L = await mk({ cols: 2, rows: 1, orientation: "landscape" });
  fs.writeFileSync(`${OUT}/flisar-2x1.pdf`, Buffer.from(L.b64, "base64"));
  const iL = pdfinfo(`${OUT}/flisar-2x1.pdf`);
  check("2×1 lárétt → 2 blöð", L.pages === 2 && iL.pages === 2, JSON.stringify({ pages: L.pages, iL }));
  check("2×1 blöðin eru A4 lárétt", isA4(iL.size, "landscape"), JSON.stringify(iL.size));
  const P = await mk({ cols: 3, rows: 1, orientation: "portrait" });
  fs.writeFileSync(`${OUT}/flisar-3x1.pdf`, Buffer.from(P.b64, "base64"));
  const iP = pdfinfo(`${OUT}/flisar-3x1.pdf`);
  check("3×1 lóðrétt → 3 blöð", P.pages === 3 && iP.pages === 3, JSON.stringify({ pages: P.pages, iP }));
  check("3×1 blöðin eru A4 lóðrétt", isA4(iP.size, "portrait"), JSON.stringify(iP.size));
  // 2×2 á breiða mynd: efri/neðri röð — myndin fyllir breiddina, tvær raðir fá bita → 4 blöð; en ef hún er of lág lenda ekki allar
  const G = await mk({ cols: 2, rows: 2, orientation: "landscape" });
  check("2×2 sleppir engum blöðum að óþörfu (myndin miðjuð yfir báðar raðir)", G.pages === 4, `pages=${G.pages}`);

  // ── B: glugginn — forstilling + niðurhal ──
  await page.locator('button', { hasText: "Flytja út" }).first().click();
  await page.waitForTimeout(700);
  await page.locator('button', { hasText: "3 lóðrétt hlið við hlið" }).click();
  const summary = await page.locator("text=/3 blöð · \\d+ × \\d+ mm/").count();
  check("yfirlitið segir 3 blöð og mm", summary === 1);
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await page.locator('button', { hasText: "Prenta á 3 A4-blöð" }).click();
  const d = await dl; const f = `${OUT}/${d.suggestedFilename()}`; await d.saveAs(f);
  check("skráarheiti ber uppsetninguna", /a4-3x1-lodrett\.pdf$/.test(d.suggestedFilename()), d.suggestedFilename());
  const iD = pdfinfo(f);
  check("niðurhalaða PDF-ið: 3 A4 lóðrétt blöð", iD.pages === 3 && isA4(iD.size, "portrait"), JSON.stringify(iD));
  execSync(`pdftoppm -r 40 -png -f 1 -l 1 "${OUT}/flisar-2x1.pdf" "${OUT}/flis-bl1"`);

  // ── C: fylgihlutir kvarðast með teikningu ──
  const R = await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const base = { rotation: 0, opacity: 1, locked: false, hidden: false };
    s.addObjects([
      { id: "plan", type: "image", assetId: "x", x: 100, y: 100, width: 800, height: 400, name: "Plan", ...base },
      { id: "sym", type: "symbol", symbolId: "extinguisher", x: 300, y: 200, size: 40, label: "", name: "Slökkvitæki", ...base },
      { id: "box", type: "rect", x: 500, y: 150, width: 100, height: 50, fill: "transparent", stroke: "#000", strokeWidth: 2, cornerRadius: 0, name: "Ferningur", ...base },
      { id: "ln", type: "line", x: 600, y: 300, points: [0, 0, 100, 50], stroke: "#000", strokeWidth: 2, dash: "solid", name: "Lína", ...base },
      { id: "uti", type: "symbol", symbolId: "exit", x: 3000, y: 3000, size: 40, label: "", name: "ÚT", ...base },
    ], false);
    s.resizeDocument("plan", { x: 100, y: 100, rotation: 0, width: 1600, height: 800 });
    const o = window.__tpStore.getState().objects; const g = id => o.find(v => v.id === id);
    return { plan: g("plan"), sym: g("sym"), box: g("box"), ln: g("ln"), uti: g("uti") };
  });
  check("teikningin sjálf tvöfaldast", R.plan.width === 1600 && R.plan.height === 800);
  check("tákn helst á sama stað á plani og tvöfaldast (500,300 · 80px)", R.sym.x === 500 && R.sym.y === 300 && R.sym.size === 80, JSON.stringify(R.sym));
  check("ferningur kvarðast (900,200 · 200×100)", R.box.x === 900 && R.box.y === 200 && R.box.width === 200 && R.box.height === 100, JSON.stringify(R.box));
  check("lína: upphaf og punktar kvarðast", R.ln.x === 1100 && R.ln.y === 500 && R.ln.points.join() === "0,0,200,100", JSON.stringify(R.ln));
  check("tákn UTAN teikningar hreyfist ekki", R.uti.x === 3000 && R.uti.y === 3000 && R.uti.size === 40, JSON.stringify(R.uti));

  console.log(ok.map(n => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map(n => "  ✘ " + n).join("\n"));
  console.log(`\n${ok.length}/${ok.length + bad.length} · villur: ${errs.length ? errs.join(" | ") : "engar"}`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error("BROTNAÐI:", e.message); process.exit(1); });
