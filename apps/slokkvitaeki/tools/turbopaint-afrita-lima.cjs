/* ⌘C / ⌘X / ⌘V á borðinu, sérsniðnir litir (+ swatch) og Gátreitur-tólið.
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/turbopaint-afrita-lima.cjs [http://localhost:4142]
 */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.argv[2] || "http://localhost:4142";
// Framleiðslu-slóð úr Claude Code web/remote session: Chromium kemst ekki
// beint út (ECH GREASE → ERR_CONNECTION_RESET) — nota TLS-relay slokkvitaeki-repósins.
const RELAY = "/home/user/slokkvitaeki/tools/bh-browser.cjs";
async function launchBrowser() {
  if (/^https:/i.test(BASE) && fs.existsSync(RELAY)) {
    const { context, cleanup } = await require(RELAY).launch();
    return { browser: context.browser(), ctx: context, cleanup };
  }
  const browser = await chromium.launch({ headless: true });
  return { browser, ctx: await browser.newContext(), cleanup: () => browser.close() };
}
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { browser: b, ctx, cleanup } = await launchBrowser();
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 950 });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  try {
  await page.goto(`${BASE}/kjarni/turbopaint`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 40000 });
  await page.waitForTimeout(6000);

  const state = () => page.evaluate(() => {
    const s = window.__tpStore.getState();
    return { n: s.objects.length, ids: s.objects.map((o) => o.id), sel: s.selectedIds, clip: s.clipboard.length, tool: s.tool,
      objs: s.objects.map((o) => ({ id: o.id, type: o.type, x: o.x, y: o.y, name: o.name, stroke: o.stroke, fill: o.fill, checked: o.checked, isCheckbox: o.isCheckbox, width: o.width, height: o.height, groupId: o.groupId })) };
  });

  // Hreint borð með tveimur hlutum, valdir báðir.
  await page.evaluate(() => {
    const s = window.__tpStore.getState();
    s.setCamera({ x: 0, y: 0, scale: 1 });
    s.deleteIds(s.objects.map((o) => o.id));
    s.addObjects([
      // Teikning undir öllu — Magntaflan telur aðeins hluti sem liggja á teikningu.
      { id: "plan", type: "image", assetId: "smoke-plan", x: 0, y: 0, width: 2000, height: 1400, rotation: 0, opacity: 1, locked: true, hidden: false, name: "Teikning" },
      { id: "rA", type: "rect", x: 100, y: 100, width: 120, height: 80, fill: "transparent", stroke: "#1c1917", strokeWidth: 4, cornerRadius: 0, rotation: 0, opacity: 1, locked: false, hidden: false, name: "Ferningur A", groupId: "gX" },
      { id: "tB", type: "text", x: 100, y: 220, text: "Hæ", fontSize: 22, fill: "#1c1917", width: 120, fontStyle: "normal", align: "left", rotation: 0, opacity: 1, locked: false, hidden: false, name: "Texti B", groupId: "gX" },
    ], true);
  });
  await page.mouse.click(1200, 900); // fókus á síðuna (ekki í reit)
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  await page.evaluate(() => window.__tpStore.getState().setSelected(["rA", "tB"]));
  let st = await state();
  check("byrjun: teikning + 2 hlutir, báðir valdir", st.n === 3 && st.sel.length === 2, JSON.stringify(st.sel));

  // ⌘C
  await page.keyboard.press("Control+c");
  await wait(600);
  st = await state();
  check("Ctrl+C: klemmuspjaldið geymir 2 hluti", st.clip === 2, `clip=${st.clip}`);

  // ⌘V → 2 nýir, hliðraðir um 24, valdir, hópur endurkóðaður
  await page.keyboard.press("Control+v");
  await wait(800);
  st = await state();
  const pasted1 = st.objs.filter((o) => !["plan", "rA", "tB"].includes(o.id));
  check("Ctrl+V: 2 nýir hlutir", st.n === 5 && pasted1.length === 2, `n=${st.n}`);
  check("límdir hlutir hliðrast um 24 px", pasted1.every((o) => (o.type === "rect" ? o.x === 124 && o.y === 124 : o.x === 124 && o.y === 244)), JSON.stringify(pasted1.map((o) => [o.x, o.y])));
  check("límdir hlutir eru valdir", st.sel.length === 2 && st.sel.every((id) => pasted1.some((o) => o.id === id)), JSON.stringify(st.sel));
  check("hópurinn fylgir með undir nýju id", pasted1[0].groupId && pasted1[0].groupId === pasted1[1].groupId && pasted1[0].groupId !== "gX", JSON.stringify(pasted1.map((o) => o.groupId)));

  // Annað ⌘V → 48 px frá upprunanum
  await page.keyboard.press("Control+v");
  await wait(800);
  st = await state();
  const pasted2 = st.objs.filter((o) => !["plan", "rA", "tB"].includes(o.id) && !pasted1.some((p) => p.id === o.id));
  check("Ctrl+V aftur: 2 í viðbót, 48 px frá uppruna", st.n === 7 && pasted2.some((o) => o.x === 148 && o.y === 148), JSON.stringify(pasted2.map((o) => [o.x, o.y])));

  // ⌘X á upprunalegu tvo → hverfa, koma aftur með ⌘V
  await page.evaluate(() => window.__tpStore.getState().setSelected(["rA", "tB"]));
  await page.keyboard.press("Control+x");
  await wait(600);
  st = await state();
  check("Ctrl+X: upprunalegir hlutir fjarlægðir", st.n === 5 && !st.ids.includes("rA") && !st.ids.includes("tB"), `n=${st.n}`);
  await page.keyboard.press("Control+v");
  await wait(800);
  st = await state();
  check("Ctrl+V eftir klippingu: koma aftur", st.n === 7, `n=${st.n}`);
  await page.keyboard.press("Control+z");
  await wait(300);
  st = await state();
  check("Ctrl+Z tekur límingu til baka (eitt skref)", st.n === 5, `n=${st.n}`);

  // Líming úr texta (annað borð / flipi): paste-atburður með JSON
  const pastedViaEvent = await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const before = s.objects.length;
    const payload = JSON.stringify({ turbopaint: 1, objects: [{ id: "zz", type: "rect", x: 500, y: 500, width: 50, height: 50, fill: "transparent", stroke: "#2563eb", strokeWidth: 2, cornerRadius: 0, rotation: 0, opacity: 1, locked: true, hidden: false, name: "Að utan" }] });
    const dt = new DataTransfer(); dt.setData("text/plain", payload);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    const after = window.__tpStore.getState();
    const added = after.objects.filter((o) => o.name === "Að utan");
    return { grew: after.objects.length === before + 1, added: added.map((o) => ({ id: o.id, locked: o.locked, x: o.x })) };
  });
  check("líming úr klemmuspjalds-texta (milli borða) bætir hlutnum við, ólæstum, með nýju id", pastedViaEvent.grew && pastedViaEvent.added.length === 1 && pastedViaEvent.added[0].id !== "zz" && pastedViaEvent.added[0].locked === false, JSON.stringify(pastedViaEvent));
  const plainText = await page.evaluate(() => {
    const before = window.__tpStore.getState().objects.length;
    const dt = new DataTransfer(); dt.setData("text/plain", "bara venjulegur texti");
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    return window.__tpStore.getState().objects.length === before;
  });
  check("venjulegur texti á klemmuspjaldi límir enga hluti", plainText);

  // Sérsniðnir litir — hliðarstika (valinn ferningur)
  st = await state();
  const someRect = st.objs.find((o) => o.type === "rect" && !o.isCheckbox);
  await page.evaluate((id) => window.__tpStore.getState().setSelected([id]), someRect.id);
  await wait(400);
  const strokeInput = page.locator('input[type="color"][aria-label="Sérsniðinn litur — velja"]').first();
  check("hliðarstika: + swatch fyrir strokulit til", (await strokeInput.count()) >= 1);
  await strokeInput.fill("#123456");
  await wait(300);
  st = await state();
  check("sérsniðinn strokulitur fer á hlutinn", st.objs.find((o) => o.id === someRect.id).stroke === "#123456", st.objs.find((o) => o.id === someRect.id).stroke);
  const fillInput = page.locator('input[type="color"][aria-label="Sérsniðinn litur — velja"]').nth(1);
  await fillInput.fill("#00ff00");
  await wait(300);
  st = await state();
  check("sérsniðin fylling fær 40% gegnsæi (#00ff0066)", st.objs.find((o) => o.id === someRect.id).fill === "#00ff0066", st.objs.find((o) => o.id === someRect.id).fill);
  const remembered = await page.locator('button[title="Sérsniðinn litur"]').count();
  check("nýlegir sérsniðnir litir birtast sem swatch-ar", remembered >= 2, `${remembered}`);
  const stored = await page.evaluate(() => localStorage.getItem("turbopaint:custom-colors"));
  check("sérsniðnir litir muna sig (localStorage)", /#00ff00/.test(stored || "") && /#123456/.test(stored || ""), stored);
  const toolbarInput = page.locator('input[type="color"][aria-label="Sérsniðinn strokulitur — velja"]');
  check("tólastika: + swatch fyrir strokulit", (await toolbarInput.count()) === 1);
  await page.evaluate(() => window.__tpStore.getState().setSelected([]));
  await toolbarInput.fill("#abcdef");
  await wait(300);
  const styleStroke = await page.evaluate(() => window.__tpStore.getState().style.stroke);
  check("tólastikan setur sérsniðinn lit á nýja hluti", styleStroke === "#abcdef", styleStroke);

  // Gátreitur — fókusinn sat í litareitnum; lyklaborðs-flýtileiðir eiga ekki við þar.
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  await page.keyboard.press("x");
  await wait(200);
  st = await state();
  check("X-lykill velur Gátreitur-tólið", st.tool === "checkbox", st.tool);
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(box.x + 700, box.y + 500);
  await wait(500);
  st = await state();
  const cb = st.objs.find((o) => o.isCheckbox);
  check("smellur stimplar 120×120 gátreit miðjaðan á smellinn", cb && cb.width === 120 && cb.height === 120 && cb.x === 640 && cb.y === 440 && cb.checked === false && cb.name === "Gátreitur", JSON.stringify(cb));
  if (!cb) { console.log(bad.map((n) => "  ✘ " + n).join("\n")); console.log("tool:", st.tool, "objs:", JSON.stringify(st.objs.map((o) => o.name))); await b.close().catch(() => {}); process.exit(1); }
  // dregin stærð (tólið fer aftur í Velja eftir hvern reit, eins og ferningurinn — veljum það aftur)
  await page.evaluate(() => window.__tpStore.getState().setTool("checkbox"));
  await wait(200);
  await page.mouse.move(box.x + 900, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 1100, box.y + 450, { steps: 8 });
  await page.mouse.up();
  await wait(500);
  st = await state();
  const cb2 = st.objs.filter((o) => o.isCheckbox).find((o) => o.id !== cb.id);
  // Grindin festir endapunktinn (snap) — stærðin má hnikast um eitt grindarbil.
  check("drag teiknar gátreit í dreginni stærð", cb2 && Math.abs(cb2.width - 200) <= 24 && Math.abs(cb2.height - 150) <= 24, JSON.stringify(cb2));
  // haka við með smelli á ✓-merkið (Velja-tól)
  await page.evaluate(() => window.__tpStore.getState().setTool("select"));
  await wait(200);
  const badge = { size: 28, inset: 5 }; // 120/4 = 30 → clamp 28; inset round(28/6)=5
  const bx = cb.x + cb.width - badge.size - badge.inset + badge.size / 2;
  const by = cb.y + cb.height - badge.size - badge.inset + badge.size / 2;
  await page.mouse.click(box.x + bx, box.y + by);
  await wait(400);
  st = await state();
  check("smellur á ✓ í horninu hakar við (reiturinn grænkar)", st.objs.find((o) => o.id === cb.id).checked === true, JSON.stringify(st.objs.find((o) => o.id === cb.id)));
  check("smellur á ✓ velur ekki reitinn / dregur ekki", !st.sel.includes(cb.id) && st.objs.find((o) => o.id === cb.id).x === 640, JSON.stringify(st.sel));
  await page.mouse.click(box.x + bx, box.y + by);
  await wait(400);
  st = await state();
  check("annar smellur afhakar", st.objs.find((o) => o.id === cb.id).checked === false);
  // hliðarstiku-hnappur
  await page.evaluate((id) => window.__tpStore.getState().setSelected([id]), cb.id);
  await wait(400);
  const toggleBtn = page.locator("button", { hasText: "Óhakað" }).first();
  const toggleVisible = await toggleBtn.isVisible().catch(() => false);
  check("hliðarstika sýnir Gátreitur-hnapp", toggleVisible, `count=${await page.locator("button", { hasText: "Óhakað" }).count()}`);
  await toggleBtn.click({ timeout: 10000 });
  await wait(300);
  st = await state();
  check("hliðarstiku-hnappur hakar við", st.objs.find((o) => o.id === cb.id).checked === true);
  await page.keyboard.press("Control+z");
  await wait(300);
  st = await state();
  check("Ctrl+Z afhakar (hak er sögu-skref)", st.objs.find((o) => o.id === cb.id).checked === false);
  // gátreitur afritast/límist með haki
  await page.evaluate((id) => { const s = window.__tpStore.getState(); s.toggleChecked(id); s.setSelected([id]); }, cb.id);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  await page.keyboard.press("Control+c"); await wait(400);
  await page.keyboard.press("Control+v"); await wait(600);
  st = await state();
  const cbCopies = st.objs.filter((o) => o.isCheckbox && o.id !== cb.id && o.id !== cb2.id);
  check("gátreitur afritast með haki og hliðrun", cbCopies.length === 1 && cbCopies[0].checked === true && cbCopies[0].x === 664, JSON.stringify(cbCopies));
  // magntafla
  const tableText = await page.evaluate(() => document.body.innerText);
  check("magntafla telur gátreiti sér (hakað/óhakað)", /Gátreitir — hakað/.test(tableText) && /Gátreitir — óhakað/.test(tableText), "");

  } catch (e) {
    bad.push(`script crashed: ${String(e).slice(0, 200)}`);
    await page.screenshot({ path: "/tmp/tp-afrita-lima-crash.png" }).catch(() => {});
    const dump = await page.evaluate(() => { const s = window.__tpStore.getState(); return { tool: s.tool, sel: s.selectedIds, cbs: s.objects.filter((o) => o.isCheckbox).map((o) => ({ id: o.id, checked: o.checked, x: o.x, y: o.y })), buttons: Array.from(document.querySelectorAll("button")).map((b) => b.textContent.trim()).filter((t) => /hak|Hak/.test(t)) }; }).catch(() => null);
    console.log("state at crash:", JSON.stringify(dump));
  }
  await page.screenshot({ path: "/tmp/tp-afrita-lima.png" });
  console.log(ok.map((n) => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map((n) => "  ✘ " + n).join("\n"));
  if (errs.length) console.log("pageerrors:", errs.slice(0, 5).join(" | "));
  console.log(`${ok.length}/${ok.length + bad.length} passed`);
  await Promise.race([cleanup(), new Promise((r) => setTimeout(r, 8000))]).catch(() => {});
  process.exit(bad.length ? 1 : 0);
})();
