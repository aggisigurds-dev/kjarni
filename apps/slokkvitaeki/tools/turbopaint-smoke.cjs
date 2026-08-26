// tools/turbopaint-smoke.cjs — reykpróf fyrir TurboPaint í ALVÖRU vafra.
//
// Prófar það sem notandinn gerir: býr til nýtt borð og skírir það STRAX
// (án þess að smella í reitinn), endurhleður og athugar að nafnið lifi,
// smellir á hvern einasta sýnilega takka í tólastiku + toppstiku og fylgist
// með pageerror, og mælir að nafnareiturinn fái alvöru pláss á símaskjá.
// Prófið býr til sitt EIGIð borð og soft-eyðir því í lokin — snertir aldrei
// alvöru borð notandans.
//
// Keyrsla (úr apps/slokkvitaeki eða hvaðan sem er):
//   NODE_PATH=/opt/node22/lib/node_modules node tools/turbopaint-smoke.cjs
//
// Env:
//   TP_URL           slóð á appið — default framleiðslan
//                    (https://slokkvitaeki.vercel.app/kjarni/turbopaint).
//                    localhost-slóð notar playwright beint.
//   BH_BROWSER_PATH  slóð á bh-browser.cjs relayið (þarf fyrir ytri slóðir í
//                    Claude Code web/remote session — egress-proxyið RSTar
//                    Chromium annars; sjá haus bh-browser.cjs í slokkvitaeki-repo).
//   TP_SHOTS_DIR     mappa fyrir skjámyndir (default /tmp).
//
// Skilar exit 0 = allt grænt, 1 = eitthvað féll. Prentar ✔/✘ per skref.

const path = require("path");
const fs = require("fs");

const TP_URL = process.env.TP_URL || "https://slokkvitaeki.vercel.app/kjarni/turbopaint";
const SHOTS = process.env.TP_SHOTS_DIR || "/tmp";
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(TP_URL);

async function openBrowser() {
  if (!IS_LOCAL) {
    const relayPath =
      process.env.BH_BROWSER_PATH ||
      ["/home/user/slokkvitaeki/tools/bh-browser.cjs", path.join(__dirname, "../../../../slokkvitaeki/tools/bh-browser.cjs")].find(
        (p) => fs.existsSync(p),
      );
    if (relayPath) {
      const { launch } = require(relayPath);
      return launch();
    }
  }
  // localhost (eða relay ekki til): playwright beint
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  return { context, cleanup: () => browser.close() };
}

const results = [];
function report(name, ok, extra) {
  results.push({ name, ok, extra });
  console.log(`${ok ? "✔" : "✘"} ${name}${extra ? ` — ${extra}` : ""}`);
}

(async () => {
  const { context, cleanup } = await openBrowser();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  // confirm() = já (eyðsla eigin borðs í lokin); prompt() = hætta við (Af slóð).
  page.on("dialog", (d) => (d.type() === "prompt" ? d.dismiss() : d.accept()).catch(() => {}));
  page.on("filechooser", () => {}); // „Flytja inn" opnar file-val — látum hann eiga sig

  const nameInput = page.locator('input[placeholder="Nafn á borði"]');
  const smokeName = `SMOKE-PRÓF ${new Date().toISOString().slice(11, 16)}`;
  let errCursor = 0;
  const newErrors = () => {
    const fresh = pageErrors.slice(errCursor);
    errCursor = pageErrors.length;
    return fresh;
  };

  // ---- 0) Síðan hleðst
  try {
    await page.goto(TP_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.locator(".tp-toolbar").waitFor({ timeout: 30000 });
    await page.waitForTimeout(3500); // hydration + ský-pull
    report("Síðan hleðst og tólastikan birtist", true);
  } catch (e) {
    report("Síðan hleðst og tólastikan birtist", false, e.message);
    console.log("STÖÐVA — síðan kom ekki upp.");
    await cleanup();
    process.exit(1);
  }

  // ---- 1) Nýtt borð → skíra STRAX án þess að smella (fókusinn á að vera kominn)
  try {
    await page.locator('button[title*="Borðin mín"]').click();
    await page.getByText("➕ Nýtt borð").click();
    await page.waitForTimeout(1400); // createBoard + 300ms fókus-tímastilling
    await page.keyboard.type(smokeName, { delay: 40 });
    await page.waitForTimeout(300);
    const v = await nameInput.inputValue();
    report("Nýtt borð: innsláttur fer BEINT í nafnareitinn og skiptir út sjálfgefna nafninu", v === smokeName, `reitur="${v}"`);
  } catch (e) {
    report("Nýtt borð: innsláttur fer BEINT í nafnareitinn og skiptir út sjálfgefna nafninu", false, e.message);
  }

  // ---- 2) Enter staðfestir (blur) og nafnið helst
  try {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => document.activeElement?.tagName || "?");
    const v = await nameInput.inputValue();
    report("Enter lokar reitnum og nafnið stendur", focused !== "INPUT" && v === smokeName, `focus=${focused}`);
  } catch (e) {
    report("Enter lokar reitnum og nafnið stendur", false, e.message);
  }

  // ---- 3) Vistun: lifir endurhleðslu (ský í framleiðslu, IndexedDB local)
  try {
    await page.waitForTimeout(4000); // debounce 2.5s + push
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".tp-toolbar").waitFor({ timeout: 30000 });
    await page.waitForTimeout(3500);
    const v = await nameInput.inputValue();
    report("Nafnið lifir endurhleðslu", v === smokeName, `reitur="${v}"`);
  } catch (e) {
    report("Nafnið lifir endurhleðslu", false, e.message);
  }

  // ---- 4) Borðalistinn sýnir nýja nafnið (pollað — ský-listinn getur tekið smá)
  try {
    await page.locator('button[title*="Borðin mín"]').click();
    let inList = 0;
    for (let i = 0; i < 10 && !inList; i++) {
      await page.waitForTimeout(600);
      inList = await page.getByText(smokeName, { exact: false }).count();
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    report("Borðalistinn sýnir nýja nafnið", inList > 0);
  } catch (e) {
    report("Borðalistinn sýnir nýja nafnið", false, e.message);
  }

  // ---- 5) Hver einasti tóla-takki (tólastikan + stílræman) án pageerror
  try {
    newErrors();
    const tools = page.locator(".tp-toolbar button");
    const n = await tools.count();
    for (let i = 0; i < n; i++) {
      await tools.nth(i).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(120);
    }
    const styles = page.locator(".tp-stylestrip button");
    const ns = await styles.count();
    for (let i = 0; i < ns; i++) {
      await styles.nth(i).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(60);
    }
    await page.keyboard.press("Escape");
    const errs = newErrors();
    report(`Tólastikan (${n} takkar) + stílræman (${ns}) án villna`, errs.length === 0, errs[0]);
  } catch (e) {
    report("Tólastikan + stílræman án villna", false, e.message);
  }

  // ---- 6) Toppstikan: undo/redo, grind, segull, zoom, E-30, Hreinsa, Út, ⟳, hjálp
  try {
    newErrors();
    const titles = [
      "Afturkalla (⌘Z)",
      "Endurtaka (⌘⇧Z)",
      "Grind",
      "Grind", // aftur í sömu stöðu
      "Festa við grind",
      "Festa við grind",
      "Minnka",
      "Stækka",
      "Merkja E-30 / E-60 eldveggi og 165.BR1 búnað",
      "Hreinsa teikningu — hvítur grunnur, bara veggir og blek",
    ];
    for (const t of titles) {
      await page.locator(`[title="${t}"]`).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(250);
      await page.keyboard.press("Escape").catch(() => {}); // lokar toast/dialog ef opnaðist
    }
    // Flytja út → dialog → Escape
    await page.locator('[title="Flytja út PNG / PDF / JSON"]').click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // ⟳ valmyndin og hjálpin
    await page.locator('[title="Meira"]').click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const helpBtn = page.locator("header > button:visible").last();
    await helpBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    const errs = newErrors();
    report("Toppstikan öll án villna", errs.length === 0, errs[0]);
  } catch (e) {
    report("Toppstikan öll án villna", false, e.message);
  }
  await page.screenshot({ path: path.join(SHOTS, "tp-smoke-desktop.png") }).catch(() => {});

  // ---- 7) Sími (390×844): nafnareiturinn fær pláss og faldu takkarnir búa í ⟳
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(700);
    const box = await nameInput.boundingBox();
    const w = box ? Math.round(box.width) : 0;
    const okWidth = w >= 90;
    await page.locator('[title="Meira"]').click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    const hasUrlItem = (await page.getByText("🔗 Sækja af slóð").count()) > 0;
    const hasStripItem = (await page.getByText("🧹 Hreinsa teikningu").count()) > 0;
    await page.keyboard.press("Escape");
    await page.screenshot({ path: path.join(SHOTS, "tp-smoke-mobile.png") }).catch(() => {});
    report("Sími: nafnareitur ≥90px og Af slóð/Hreinsa komin í ⟳ valmyndina", okWidth && hasUrlItem && hasStripItem, `breidd=${w}px, ⟳=${hasUrlItem}/${hasStripItem}`);
  } catch (e) {
    report("Sími: nafnareitur og ⟳ valmyndin", false, e.message);
  }

  // ---- 8) Tiltekt: eyða smoke-borðinu (confirm sjálfvirkt samþykkt)
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    await page.locator('button[title*="Borðin mín"]').click();
    await page.waitForTimeout(700);
    await page.getByText("🗑 Eyða þessu borði").click();
    let v = smokeName;
    for (let i = 0; i < 12 && v === smokeName; i++) {
      await page.waitForTimeout(800);
      v = await nameInput.inputValue().catch(() => "?");
    }
    report("Tiltekt: smoke-borðinu eytt (soft-delete)", v !== smokeName, `núverandi borð="${v}"`);
  } catch (e) {
    report("Tiltekt: smoke-borðinu eytt (soft-delete)", false, e.message);
  }

  // ---- Samantekt
  const failed = results.filter((r) => !r.ok);
  if (pageErrors.length) console.log(`\n⚠ pageerrors (${pageErrors.length}):\n  ${pageErrors.join("\n  ")}`);
  if (consoleErrors.length) console.log(`ℹ console-villur (${consoleErrors.length}) — 404/analytics/supabase-net eru eðlilegar í relay/local: ${consoleErrors.length <= 6 ? consoleErrors.join(" | ") : consoleErrors.slice(0, 6).join(" | ") + " …"}`);
  console.log(failed.length ? `\n✘ ${failed.length}/${results.length} skref féllu` : `\n✔ Öll ${results.length} skref græn`);
  await cleanup();
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch(async (e) => {
  console.error("SMOKE HRUN:", e);
  process.exit(1);
});
