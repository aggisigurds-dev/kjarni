/* TurboPaint skoðunarhamur (`?skoda=<slóð>&titill=<heiti>`, lib/board/skodun.ts) — sönnun að skoðun skrifar EKKERT.
 *
 *   node tools/turbopaint-skodun.cjs [http://localhost:4177] [úttaksmappa]
 *
 * ÖLL skrif (POST/PATCH/PUT/DELETE á **\/rest/v1/** og **\/storage/v1/**) eru gripin, skráð og svarað með gervi-200 —
 * ekkert raunverulegt borð verður til. Lestur á turbopaint_boards er líka gripinn (svarað []) svo prófið opnar aldrei
 * raunverulegt borð. Myndir/teikningar skjalasafnanna eru aðeins LESNAR.
 *   1. Hafnarfjörður (bein PDF, 7008×4960 skönnun): skoðun → teiknað (ferningur + penni) → 0 skrif, ekkert í IndexedDB
 *      → endurhleðsla (vafrinn varar við) → 0 skrif → „Vista sem borð" → gripnu skrifin skráð
 *   2. Sama teikning flutt inn VENJULEGA (nýtt borð + „Af slóð") → gripnu skrifin borin saman við 1
 *   3. Reykjavík, Álfaborg (pdf.info, vafin í teikn-mynd eins og image_url) → 0 skrif
 *   4. Reykjavík, skönnuð TIF (.tif.info → TIF-frumritið) → 0 skrif
 *   5. Sími 375×812: borðinn, takkinn, „Vista í úttekt" falið → 0 skrif
 * Upplausn: dílar myndarinnar sjálfrar (createImageBitmap á eigninni) á móti stærð á borðinu. */
const path = require("path");
const fs = require("fs");
let chromium, devices;
try {
  ({ chromium, devices } = require("playwright"));
} catch {
  ({ chromium, devices } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}
const BASE = process.argv[2] || "http://localhost:4177";
const OUT = process.argv[3] || path.join(process.env.TEMP || ".", "turbopaint-skodun");
fs.mkdirSync(OUT, { recursive: true });

const DALSHRAUN = "https://teikningar.hafnarfjordur.is/data/Dalshraun_10_1_0019.pdf";
const ALFABORG =
  "https://skjalasafn.reykjavik.is/fotoweb/archives/5000-A%C3%B0aluppdr%C3%A6ttir/A%C3%B0aluppdr%C3%A6ttir/2022/11/2022-10-1139929.pdf.info";
const TIF =
  "https://skjalasafn.reykjavik.is/fotoweb/archives/5000-A%C3%B0aluppdr%C3%A6ttir/A%C3%B0aluppdr%C3%A6ttir/2011/11/2011-11-22_26304989.tif.info";
const skodunar = (slod, titill) =>
  `${BASE}/kjarni/turbopaint?skoda=${encodeURIComponent(slod)}${titill ? "&titill=" + encodeURIComponent(titill) : ""}`;

const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra ?? ""}`));
const nidurstada = {};

/** Grípur öll skrif samhengisins. Skilar listanum (lifandi). */
async function gripa(ctx) {
  const skrif = [];
  const bordLestur = [];
  await ctx.route(/supabase\.co\/(rest|storage)\//, async (route) => {
    const req = route.request();
    const m = req.method();
    const url = req.url();
    if (m === "HEAD" && /\/storage\/v1\/object\/public\/turbopaint\//.test(url)) {
      // „Er myndin þegar í fötunni?" → nei, svo upphleðslan sést (og grípst) í báðum leiðum, líka fyrir teikningu sem
      // einhver hefur flutt inn áður (föst auðkenni).
      return route.fulfill({ status: 404, body: "" });
    }
    if (m === "GET" || m === "HEAD") {
      if (/\/rest\/v1\/turbopaint_boards/.test(url)) {
        bordLestur.push(url);
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.continue();
    }
    const buf = req.postDataBuffer();
    let json = null;
    try {
      json = JSON.parse(req.postData() || "null");
    } catch {
      /* tvíundargögn (mynd) */
    }
    skrif.push({ m, url, prefer: req.headers()["prefer"] || "", baeti: buf ? buf.length : 0, json });
    if (/\/storage\/v1\//.test(url)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "turbopaint/gervi.png", Id: "gervi" }) });
    }
    return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  return { skrif, bordLestur };
}

async function bidaEftirTeikningu(page, ms = 300000) {
  await page.waitForFunction(
    () => {
      const s = window.__tpStore?.getState();
      const k = window.__tpSkodun?.getState();
      return s && !s.importProgress && s.objects.some((o) => o.type === "image") && k && k.grunnur !== null;
    },
    null,
    { timeout: ms, polling: 500 }
  );
}

async function maela(page) {
  return page.evaluate(async () => {
    const s = window.__tpStore.getState();
    const img = s.objects.find((o) => o.type === "image");
    const b = window.__tpEign(img.assetId);
    const bm = await createImageBitmap(b);
    const f = img.frumAssetId ? window.__tpEign(img.frumAssetId) : null;
    return {
      nafnBords: s.name,
      hlutir: s.objects.length,
      bord: [Math.round(img.width), Math.round(img.height)],
      dilar: [bm.width, bm.height],
      mp: +((bm.width * bm.height) / 1e6).toFixed(1),
      tegund: b.type,
      mb: +(b.size / 1048576).toFixed(1),
      frum: f ? { tegund: f.type, mb: +(f.size / 1048576).toFixed(1) } : null,
      heimild: img.heimild?.slod ?? null,
    };
  });
}

/** Lyklar í IndexedDB (idb-keyval) og localStorage — án þess að búa grunninn til ef hann er ekki til. */
async function geymsla(page) {
  return page.evaluate(async () => {
    const dbs = (await indexedDB.databases()).map((d) => d.name);
    let idb = [];
    if (dbs.includes("keyval-store")) {
      idb = await new Promise((res) => {
        const r = indexedDB.open("keyval-store");
        r.onsuccess = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("keyval")) return res([]);
          const q = db.transaction("keyval", "readonly").objectStore("keyval").getAllKeys();
          q.onsuccess = () => {
            res(q.result.map(String));
            db.close();
          };
        };
        r.onerror = () => res(["VILLA"]);
      });
    }
    return { dbs, idb, ls: Object.keys(localStorage) };
  });
}
const bordGeymsla = (g) => g.idb.filter((k) => /^(tp-board|tp-index|tp-uploaded|kjarni-asset|kjarni-board)/.test(k));

async function teikna(page) {
  // Raunverulegir smellir: ferningur (R) og penni (P) dregnir yfir teikninguna
  const box = await page.locator(".konvajs-content").first().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.keyboard.press("r");
  await page.mouse.move(cx - 120, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 30, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("p");
  await page.mouse.move(cx + 60, cy - 60);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx + 60 + i * 12, cy - 60 + (i % 2) * 20);
  await page.mouse.up();
  await page.keyboard.press("v");
  await page.waitForTimeout(1500); // > 700 ms vistunartöf venjulegra borða
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const villur = [];

  // ── 1. Hafnarfjörður: skoðun → teiknað → endurhleðsla → Vista sem borð ─────────────────────────────────────────
  {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
    const g = await gripa(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => villur.push("1: " + e.message));
    const dialogar = [];
    page.on("dialog", (d) => {
      dialogar.push(d.type());
      void d.accept();
    });
    const t0 = Date.now();
    await page.goto(skodunar(DALSHRAUN, "Dalshraun 10 · 1. hæð"), { waitUntil: "domcontentloaded" });
    await page.locator("[data-skodun-bordi]").waitFor({ timeout: 60000 });
    await bidaEftirTeikningu(page);
    const sek = ((Date.now() - t0) / 1000).toFixed(1);
    const m = await maela(page);
    nidurstada.dalshraun = { ...m, sek };
    check("1 borði „Skoðun — ekki vistað\" sýnilegur", await page.getByText("Skoðun — ekki vistað").isVisible());
    check("1 „Vista sem borð\" sýnilegur", await page.locator("[data-vista-sem-bord]").isVisible());
    check("1 „Vista í úttekt\" ekki á síðunni", (await page.locator("[data-vista-uttekt-bordi]").count()) === 0);
    check("1 nafn borðsins = titill", m.nafnBords === "Dalshraun 10 · 1. hæð", m.nafnBords);
    check("1 enginn 165.BR1-miði — teikningin ein", m.hlutir === 1, String(m.hlutir));
    check("1 PDF-frumskráin í minni (skarpa lagið)", m.frum && /pdf/.test(m.frum.tegund), JSON.stringify(m.frum));
    await page.screenshot({ path: path.join(OUT, "1-dalshraun-skodun.png") });
    await teikna(page);
    const eftirTeikn = await page.evaluate(() => window.__tpStore.getState().objects.map((o) => o.type));
    check("1 teiknað í skoðun (ferningur + penni)", eftirTeikn.includes("rect") && eftirTeikn.includes("pen"), eftirTeikn.join(","));
    await page.waitForTimeout(3500); // > 2,5 s ýtingartöf venjulegra borða
    check("1 SKRIF Í SKOÐUN = 0 (eftir innflutning + teikningu)", g.skrif.length === 0, JSON.stringify(g.skrif.map((s) => s.m + " " + s.url)));
    check("1 enginn lestur á turbopaint_boards (ekkert borð opnað)", g.bordLestur.length === 0, g.bordLestur.join(" | "));
    const geym1 = await geymsla(page);
    nidurstada.geymslaSkodun = geym1;
    check("1 IndexedDB: hvorki borð, borðalisti né mynd", bordGeymsla(geym1).length === 0, bordGeymsla(geym1).join(","));
    await page.screenshot({ path: path.join(OUT, "1-dalshraun-teiknad.png") });

    // Endurhleðsla: vafrinn varar við (teiknað), svo er ekkert eftir
    await page.reload({ waitUntil: "domcontentloaded" });
    check("1 endurhleðsla: vafrinn varaði við (beforeunload)", dialogar.includes("beforeunload"), dialogar.join(","));
    await bidaEftirTeikningu(page);
    const eftirEndur = await page.evaluate(() => window.__tpStore.getState().objects.map((o) => o.type));
    check("1 endurhleðsla: teikningin ein aftur — strikin horfin", eftirEndur.join(",") === "image", eftirEndur.join(","));
    const geym2 = await geymsla(page);
    check("1 endurhleðsla: IndexedDB enn tómt af borðum/myndum", bordGeymsla(geym2).length === 0, bordGeymsla(geym2).join(","));
    check("1 endurhleðsla: SKRIF = 0", g.skrif.length === 0, String(g.skrif.length));

    // Vista sem borð — skrifin GRIPIN (gervisvar), ekkert raunverulegt borð
    await teikna(page);
    await page.locator("[data-vista-sem-bord]").click();
    await page.waitForFunction(() => !window.__tpSkodun.getState().virk && !window.__tpSkodun.getState().vistar, null, { timeout: 120000 });
    await page.waitForFunction(() => ["synced", "error"].includes(window.__tpStore.getState().syncState), null, { timeout: 120000 });
    await page.waitForTimeout(1000);
    const eftirVistun = await page.evaluate(() => ({
      sync: window.__tpStore.getState().syncState,
      url: location.search,
      bordi: !!document.querySelector("[data-skodun-bordi]"),
    }));
    nidurstada.vistaSemBordSkrif = g.skrif.map((s) => ({ m: s.m, slod: new URL(s.url).pathname + new URL(s.url).search, prefer: s.prefer, baeti: s.baeti }));
    nidurstada.vistaSemBordUpsert = g.skrif.filter((s) => /turbopaint_boards/.test(s.url)).map((s) => ({
      lyklar: Object.keys(s.json || {}).sort(),
      docLyklar: Object.keys(s.json?.doc || {}).sort(),
      name: s.json?.name,
      hlutir: s.json?.doc?.objects?.map((o) => o.type),
      assetIds: s.json?.doc?.assetIds,
      frumAssetIds: s.json?.doc?.frumAssetIds,
    }));
    check("1 Vista sem borð: skoðun lokið, borðinn horfinn, ?skoda farið úr slóð", !eftirVistun.bordi && !/skoda=/.test(eftirVistun.url), JSON.stringify(eftirVistun));
    check("1 Vista sem borð: skýið „synced\" (gervisvar)", eftirVistun.sync === "synced", eftirVistun.sync);
    check("1 Vista sem borð: upsert í turbopaint_boards", nidurstada.vistaSemBordUpsert.length >= 1);
    const geym3 = await geymsla(page);
    check("1 Vista sem borð: borð + borðalisti + mynd í IndexedDB", ["tp-board-v1:", "tp-index-v1", "kjarni-asset-"].every((p) => geym3.idb.some((k) => k.startsWith(p))), geym3.idb.join(","));
    await ctx.close();
  }

  // ── 2. Venjulegur innflutningur sömu teikningar (samanburður) ──────────────────────────────────────────────────
  {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
    const g = await gripa(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => villur.push("2: " + e.message));
    page.on("dialog", (d) => void (d.type() === "prompt" ? d.accept(DALSHRAUN) : d.accept()));
    await page.goto(`${BASE}/kjarni/turbopaint`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__tpStore?.getState().hydrated, null, { timeout: 60000 });
    await page.getByTitle("Borðin mín — hoppa á milli verkefna").click();
    await page.getByText("➕ Nýtt borð").click();
    await page.waitForTimeout(4000);
    g.skrif.length = 0; // aðeins skrif innflutningsins
    await page.getByTitle(/Sækja af permalink/).click();
    await page.waitForFunction(() => { const s = window.__tpStore.getState(); return !s.importProgress && s.objects.some((o) => o.type === "image"); }, null, { timeout: 300000, polling: 500 });
    // Bíða eftir ýtingunni sem ber teikninguna (700 ms vistun + 2,5 s ýtingartöf + upphleðsla)
    const t2 = Date.now();
    while (Date.now() - t2 < 120000 && !g.skrif.some((s) => /turbopaint_boards/.test(s.url) && s.json?.doc?.objects?.some((o) => o.type === "image"))) {
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1000);
    const upsert = g.skrif.filter((s) => /turbopaint_boards/.test(s.url));
    nidurstada.venjulegSkrif = g.skrif.map((s) => ({ m: s.m, slod: new URL(s.url).pathname + new URL(s.url).search, prefer: s.prefer, baeti: s.baeti }));
    nidurstada.venjulegUpsert = upsert.map((s) => ({
      lyklar: Object.keys(s.json || {}).sort(),
      docLyklar: Object.keys(s.json?.doc || {}).sort(),
      hlutir: s.json?.doc?.objects?.map((o) => o.type),
      assetIds: s.json?.doc?.assetIds,
      frumAssetIds: s.json?.doc?.frumAssetIds,
    }));
    const A = nidurstada.vistaSemBordSkrif, B = nidurstada.venjulegSkrif;
    const geymslaA = A.filter((s) => s.slod.startsWith("/storage")).map((s) => s.m + " " + s.slod).sort();
    const geymslaB = B.filter((s) => s.slod.startsWith("/storage")).map((s) => s.m + " " + s.slod).sort();
    check("2 sömu upphleðslur (sama fata, sömu föstu auðkenni)", geymslaA.length > 0 && JSON.stringify(geymslaA) === JSON.stringify(geymslaB), JSON.stringify({ geymslaA, geymslaB }));
    const rA = A.filter((s) => s.slod.startsWith("/rest")).pop(), rB = B.filter((s) => s.slod.startsWith("/rest")).pop();
    check("2 sama upsert-kall (aðferð, slóð, Prefer)", rA && rB && rA.m === rB.m && rA.slod === rB.slod && rA.prefer === rB.prefer, JSON.stringify({ rA, rB }));
    const uA = nidurstada.vistaSemBordUpsert.at(-1), uB = nidurstada.venjulegUpsert.at(-1);
    check("2 sama snið borðsins (lyklar + doc-lyklar)", JSON.stringify([uA?.lyklar, uA?.docLyklar]) === JSON.stringify([uB?.lyklar, uB?.docLyklar]), JSON.stringify({ uA, uB }));
    check("2 sömu myndir í doc (assetIds + frumAssetIds)", JSON.stringify([uA?.assetIds, uA?.frumAssetIds]) === JSON.stringify([uB?.assetIds, uB?.frumAssetIds]), JSON.stringify({ uA, uB }));
    await ctx.close();
  }

  // ── 3. Reykjavík Álfaborg (pdf.info, vafin í teikn-mynd eins og image_url teikning_bord) ──────────────────────
  // ── 4. Reykjavík skönnuð TIF (.tif.info) ──────────────────────────────────────────────────────────────────────
  for (const [nr, slod, titill, lykill] of [
    ["3", "/.netlify/functions/teikn-mynd?url=" + encodeURIComponent(ALFABORG), "Álfaborg — aðaluppdráttur", "alfaborg"],
    ["4", TIF, "", "tif"],
  ]) {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
    const g = await gripa(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => villur.push(nr + ": " + e.message));
    const t0 = Date.now();
    await page.goto(skodunar(slod, titill), { waitUntil: "domcontentloaded" });
    await bidaEftirTeikningu(page);
    const m = await maela(page);
    nidurstada[lykill] = { ...m, sek: ((Date.now() - t0) / 1000).toFixed(1) };
    await page.screenshot({ path: path.join(OUT, `${nr}-${lykill}-skodun.png`) });
    if (nr === "3") {
      // Aðdráttur í upplausn frumritsins (skönnunin í PDF-inu er 13216 dílar á breidd): skarpa PDF-lagið teiknar sýnilega
      // hlutann beint úr PDF-frumskránni (í minni) — skoðun fær sömu skerpu og vistað borð.
      const k = await page.evaluate(() => {
        const s = window.__tpStore.getState();
        const img = s.objects.find((o) => o.type === "image");
        const el = document.querySelector(".tp-sheet").getBoundingClientRect();
        const k = 13216 / img.width;
        s.setCamera({ x: el.width / 2 - (img.x + img.width * 0.45) * k, y: el.height / 2 - (img.y + img.height * 0.5) * k, scale: k });
        return k;
      });
      await page.waitForFunction(() => {
        const n = window.Konva.stages[0].findOne(".skarpt-pdf");
        return n && n.visible() && n.image();
      }, null, { timeout: 60000 });
      await page.waitForTimeout(400);
      const lag = await page.evaluate(() => {
        const n = window.Konva.stages[0].findOne(".skarpt-pdf");
        return { w: +n.width().toFixed(1), cw: n.image().width, ch: n.image().height };
      });
      nidurstada.alfaborgSkarpt = { kvardi: +k.toFixed(2), ...lag, dilarAEiningu: +(lag.cw / lag.w).toFixed(2) };
      check("3 skarpa PDF-lagið kviknar í skoðun (úr frumskránni í minni)", lag.cw >= 1000 && Math.abs(lag.cw / lag.w - k) < 0.15, JSON.stringify(lag));
      await page.screenshot({ path: path.join(OUT, "3-alfaborg-adrattur.png") });
    }
    await teikna(page);
    await page.waitForTimeout(3500);
    check(`${nr} ${lykill}: SKRIF Í SKOÐUN = 0`, g.skrif.length === 0, JSON.stringify(g.skrif.map((s) => s.m + " " + s.url)));
    check(`${nr} ${lykill}: IndexedDB tómt af borðum/myndum`, bordGeymsla(await geymsla(page)).length === 0);
    check(`${nr} ${lykill}: heimildin = hrá slóð (vafningur tekinn af)`, m.heimild === (nr === "3" ? ALFABORG : TIF), m.heimild);
    await ctx.close();
  }

  // ── 5. Sími ────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: 375, height: 812 } });
    const g = await gripa(ctx);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => villur.push("5: " + e.message));
    await page.goto(skodunar(ALFABORG, "Álfaborg"), { waitUntil: "domcontentloaded" });
    await bidaEftirTeikningu(page);
    const bordi = await page.locator("[data-skodun-bordi]").boundingBox();
    const takki = await page.locator("[data-vista-sem-bord]").boundingBox();
    nidurstada.simi = { bordi, takki };
    check("5 sími: borðinn í fullri breidd", bordi && bordi.width >= 370 && bordi.height <= 48, JSON.stringify(bordi));
    check("5 sími: „Vista sem borð\" innan skjás", takki && takki.x >= 0 && takki.x + takki.width <= 375, JSON.stringify(takki));
    check("5 sími: „Vista í úttekt\" ekki á síðunni", (await page.locator("[data-vista-uttekt-bordi]").count()) === 0);
    await page.screenshot({ path: path.join(OUT, "5-simi-skodun.png") });
    await page.waitForTimeout(3500);
    check("5 sími: SKRIF = 0", g.skrif.length === 0, String(g.skrif.length));
    await ctx.close();
  }

  await b.close();
  check("engar síðuvillur", villur.length === 0, villur.join(" | "));
  fs.writeFileSync(path.join(OUT, "nidurstada.json"), JSON.stringify(nidurstada, null, 2));
  console.log(JSON.stringify(nidurstada, null, 2));
  console.log("\nÍ LAGI (" + ok.length + "):\n  " + ok.join("\n  "));
  if (bad.length) console.log("\nBILAÐ (" + bad.length + "):\n  " + bad.join("\n  "));
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
