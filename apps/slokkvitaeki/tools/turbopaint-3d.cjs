/* TurboPaint 3. áfangi (A) — 3D á pari við Teikning-gluggann, sannað í raunverulegum vafra á Fiskislóð 41
 * (fyrirtæki 1612, 1. hæð hmuaaaw83rg9), og borið saman við 3D Teikning-gluggans á lifandi síðunni.
 *
 *   node tools/turbopaint-3d.cjs [http://localhost:4123] [úttaksmappa] [--an-teikningar]
 *
 * Raunverulegir smellir og lyklar: 3D opnað úr hamstikunni, Gegnsætt af/á, Ganga (W haldið niðri, músardráttur =
 * líta í kring, tvísmellt á gólf), Esc í gönguham (hættir AÐEINS að ganga — 3D og borðið óhreyfð), flýtilyklar borðsins
 * mega ekki kvikna á meðan (W/A/S/D/Delete), Esc utan gönguhams lokar 3D. Sama yfirlit og gönguhamur í Teikning-glugganum
 * (https://slokkvitaeki.netlify.app/#company/1612 → opnaTeikningu(1612) → .fp-3d-btn) til samanburðar hlið við hlið.
 *
 * ENGIN skrif: allt nema GET/HEAD til Supabase (rest + storage) er gripið og svarað 200 — líka á lifandi síðunni.
 * WebGL í höfuðlausum vafra: --use-gl=swiftshader. */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}

const BASE = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "http://localhost:4123";
const OUT = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "C:/Users/Slokkvitaeki/teikning-greining/turbopaint_afangi3";
const AN_TEIKNINGAR = process.argv.includes("--an-teikningar");
const CID = 1612, HAED = "hmuaaaw83rg9";
fs.mkdirSync(OUT, { recursive: true });
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra ?? ""}`));
const mynd = (n) => path.join(OUT, n);
const VAFRI = { headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] };

async function gripaSkrif(ctx, gripin) {
  await ctx.route(/supabase\.co\/(rest|storage)\//, async (route) => {
    const req = route.request();
    const m = req.method();
    if (m === "GET" || m === "HEAD") return route.continue();
    gripin.push(m + " " + req.url().split("?")[0]);
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

async function turbopaint(b) {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const villur = [];
  page.on("pageerror", (e) => villur.push(e.message));
  const gripin = [];
  await gripaSkrif(ctx, gripin);
  const t0 = Date.now();
  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&b=4244&h=6006&ham=slokkvitaeki`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 90000 });
  // eldra borð staðarins getur hlaðist fyrst úr skýinu — beðið eftir skilaboðum úttektarinnar sjálfrar
  await page.getByText(/merki á teikningunni/).first().waitFor({ timeout: 240000 });
  while (Date.now() - t0 < 240000) {
    const st = await page.evaluate((cid) => {
      const s = window.__tpStore?.getState();
      return s && { m: s.objects.some((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid), prog: s.importProgress };
    }, CID);
    if (st && st.m && !st.prog) break;
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2500);
  const fyrir = await page.evaluate(() => {
    const s = window.__tpStore.getState();
    return { tool: s.tool, n: s.objects.length, veggir: s.objects.filter((o) => o.veggur).length, takn: s.objects.filter((o) => o.type === "symbol").length };
  });
  check("borðið opnaðist með veggjum og táknum", fyrir.veggir > 50 && fyrir.takn > 5, JSON.stringify(fyrir));

  // ── 3D úr hamstikunni (raunverulegur smellur) ──
  await page.getByRole("button", { name: "3D", exact: true }).first().click();
  const dlg = page.getByRole("dialog", { name: "Hús í þrívídd" });
  await dlg.waitFor({ timeout: 20000 });
  await page.waitForFunction(() => {
    const g = document.querySelector('[role="dialog"] [data-hus3d]');
    return g && g.querySelector("canvas");
  }, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => JSON.parse(document.querySelector("[data-hus3d]").dataset.hus3d));
  console.log("3D:", JSON.stringify(info));
  check("raunhæð veggja úr kvarða (ekki hlutfall)", info.kvardi[0] && info.kvardi[0].heimild !== undefined, JSON.stringify(info.kvardi));
  check("lofthæð 3,0 m: veggH = 3 × dílar á metra", info.kvardi[0] && Math.abs(info.veggH[0] - 3 * info.kvardi[0].dilar) < 0.05, JSON.stringify(info));
  check("veggir, gler og hurðir í 3D", info.veggir > 50, JSON.stringify(info));
  check("tækjalíkön á teikningunni", info.likon >= 5 && info.likon === info.taeki, JSON.stringify(info));
  const strigi = page.locator("[data-hus3d] canvas");
  const sb = await strigi.boundingBox();
  await page.screenshot({ path: mynd("3d-turbopaint-yfirlit.png") });

  // ── Gegnsætt ──
  await dlg.getByRole("button", { name: "Gegnsætt" }).click();
  await page.waitForTimeout(700);
  check("Gegnsætt kveikt", (await dlg.getByRole("button", { name: "Gegnsætt" }).getAttribute("aria-pressed")) === "true");
  await page.screenshot({ path: mynd("3d-turbopaint-gegnsaett.png") });
  await dlg.getByRole("button", { name: "Gegnsætt" }).click();
  await page.waitForTimeout(400);

  // ── Ganga ──
  await dlg.getByRole("button", { name: "Ganga" }).click();
  await page.waitForTimeout(800);
  check("Ganga kveikt", (await dlg.getByRole("button", { name: "Ganga" }).getAttribute("aria-pressed")) === "true");
  await page.screenshot({ path: mynd("3d-turbopaint-ganga-1.png") });
  const tool0 = await page.evaluate(() => window.__tpStore.getState().tool);
  const n0 = await page.evaluate(() => window.__tpStore.getState().objects.length);
  // W haldið niðri ≈ 1,2 s → ~1,9 m áfram; myndavélin í augnhæð
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  const p0 = await page.evaluate(() => window.__hus3dStada?.());
  check("gönguhamur: augu í 1,6 m hæð, sjónhorn 70°", p0 && p0.ganga && p0.metri > 0 && Math.abs(p0.y - 1.6 * p0.metri) < 0.01 * p0.metri && p0.fov === 70, JSON.stringify(p0));
  await page.keyboard.down("w");
  await page.waitForTimeout(1200);
  await page.keyboard.up("w");
  const p1 = await page.evaluate(() => window.__hus3dStada?.());
  const gengid = p0 && p1 ? Math.hypot(p1.x - p0.x, p1.z - p0.z) / p0.metri : 0;
  console.log(`W í 1,2 s: ${gengid.toFixed(2)} m`);
  check("W gengur áfram (≈ 1,6 m/s)", gengid > 0.8 && gengid < 3.5, gengid.toFixed(2) + " m");
  await page.keyboard.press("a");
  await page.keyboard.press("Delete");
  await page.keyboard.press("d");
  await page.waitForTimeout(300);
  await page.screenshot({ path: mynd("3d-turbopaint-ganga-2-W.png") });
  // líta í kring: draga til vinstri
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 - 260, sb.y + sb.height / 2 + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: mynd("3d-turbopaint-ganga-3-litid.png") });
  // tvísmella á gólfið neðarlega á skjánum = fara þangað
  const p2 = await page.evaluate(() => window.__hus3dStada?.());
  await page.mouse.dblclick(sb.x + sb.width / 2, sb.y + sb.height * 0.85);
  await page.waitForTimeout(500);
  const p3 = await page.evaluate(() => window.__hus3dStada?.());
  check("tvísmellt á gólf færir augun þangað (sama hæð)", p2 && p3 && Math.hypot(p3.x - p2.x, p3.z - p2.z) > 0.2 * p2.metri && Math.abs(p3.y - p2.y) < 1e-6, JSON.stringify({ p2, p3 }));
  await page.screenshot({ path: mynd("3d-turbopaint-ganga-4-tvismellt.png") });
  const eftirLykla = await page.evaluate(() => ({ tool: window.__tpStore.getState().tool, n: window.__tpStore.getState().objects.length }));
  check("W/A/S/D/Delete í gönguham kveiktu ekki á flýtilyklum borðsins", eftirLykla.tool === tool0 && eftirLykla.n === n0, JSON.stringify({ tool0, n0, eftirLykla }));
  // Esc: hættir AÐEINS að ganga
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check("Esc í gönguham: gönguhamur af", (await dlg.getByRole("button", { name: "Ganga" }).getAttribute("aria-pressed")) === "false");
  check("Esc í gönguham: 3D enn opið", await dlg.isVisible());
  const p4 = await page.evaluate(() => window.__hus3dStada?.());
  check("eftir Esc: aftur í snúning (sjónhorn 42°)", p4 && !p4.ganga && p4.fov === 42, JSON.stringify(p4));
  const eftirEsc = await page.evaluate(() => ({ tool: window.__tpStore.getState().tool, sel: window.__tpStore.getState().selectedIds.length }));
  check("Esc í gönguham snerti ekki borðið", eftirEsc.tool === tool0, JSON.stringify(eftirEsc));
  await page.screenshot({ path: mynd("3d-turbopaint-eftir-esc.png") });
  // Esc aftur (ekki í gönguham) lokar 3D
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  check("Esc utan gönguhams lokar 3D", !(await dlg.isVisible().catch(() => false)));

  // ── Hurð (stuttur veggur merktur „Hurð" í veggjastikunni) og eldveggir (EI-30 / EI-60 lesin af teikningunni) ──
  await page.getByRole("tab", { name: "Teikning" }).click();
  await page.waitForTimeout(400);
  const stuttur = await page.evaluate(() => {
    const s = window.__tpStore.getState(), cam = s.camera;
    const shell = document.querySelector(".tp-sheet").getBoundingClientRect();
    const m = s.objects.find((o) => o.type === "image" && o.uttekt);
    const ppm = (m.width / m.uttekt.frumB) * 71.44;
    const takn = s.objects.filter((o) => o.type === "symbol");
    const L = (o) => Math.hypot(o.points[2] - o.points[0], o.points[3] - o.points[1]);
    const V = s.objects
      .filter((o) => o.type === "polyline" && o.veggur && o.layerId === "veggir" && !o.veggTegund && o.points.length === 4 && L(o) >= 0.8 * ppm && L(o) <= 2.2 * ppm)
      .sort((a, c) => L(a) - L(c));
    for (const o of V) {
      const wx = (o.points[0] + o.points[2]) / 2, wy = (o.points[1] + o.points[3]) / 2;
      if (takn.some((t) => Math.hypot(t.x + t.size / 2 - wx, t.y + t.size / 2 - wy) < t.size * 1.5)) continue;
      const x = shell.left + wx * cam.scale + cam.x, y = shell.top + wy * cam.scale + cam.y;
      if (x < shell.left + 80 || x > shell.right - 80 || y < shell.top + 120 || y > shell.bottom - 140) continue;
      return { id: o.id, x, y, m: +(L(o) / ppm).toFixed(2) };
    }
    return null;
  });
  if (stuttur) {
    await page.mouse.click(stuttur.x, stuttur.y);
    await page.waitForTimeout(400);
    const stika = page.getByRole("toolbar", { name: "Leiðrétta veggi" });
    if (await stika.isVisible().catch(() => false)) {
      await stika.getByRole("button", { name: "Hurð" }).click();
      await page.waitForTimeout(300);
    }
    await page.keyboard.press("Escape");
    const t = await page.evaluate((id) => window.__tpStore.getState().objects.find((o) => o.id === id)?.veggTegund, stuttur.id);
    check(`stuttur veggur (${stuttur.m} m) merktur Hurð í veggjastikunni`, t === "hurd", String(t));
  } else check("fann stuttan vegg fyrir hurð", false, "enginn");
  await page.getByRole("tab", { name: "Brunaþéttingar" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "EI-30 / EI-60" }).first().click();
  const tEi = Date.now();
  await page.getByText(/Merkti \d+ eldveggi|Fann engin E-30/).first().waitFor({ timeout: 300000 }).catch(() => {});
  const eldmerki = await page.evaluate(() => window.__tpStore.getState().objects.filter((o) => (o.type === "polyline" || o.type === "line") && /^(Eldveggur|EI-veggur)/.test(o.name)).map((o) => o.name));
  console.log(`EI-30 / EI-60: ${eldmerki.length} eldveggjamerkingar á ${Math.round((Date.now() - tEi) / 1000)} s`, [...new Set(eldmerki)].join(", "));
  await page.getByRole("tab", { name: "Slökkvitæki" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "3D", exact: true }).first().click();
  await dlg.waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("[data-hus3d] canvas"), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const info2 = await page.evaluate(() => JSON.parse(document.querySelector("[data-hus3d]").dataset.hus3d));
  console.log("3D eftir hurð + EI:", JSON.stringify(info2));
  check("hurðin er hurðargat með dyrakarmi í 3D", info2.hurdir >= 1, JSON.stringify(info2));
  if (eldmerki.length) check("eldveggjamerkingar lita veggi EI-60 / EI-30 í 3D", info2.e60 + info2.e30 > 0, JSON.stringify(info2));
  await page.screenshot({ path: mynd("3d-turbopaint-eldveggir-hurd.png") });
  await dlg.getByRole("button", { name: "Gegnsætt" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: mynd("3d-turbopaint-eldveggir-gegnsaett.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("engar síðuvillur", villur.length === 0, villur.join(" | "));
  check("engin skrif sluppu (öll gripin)", true);
  console.log("gripin skrif:", gripin.length, [...new Set(gripin)].slice(0, 5).join(" ; "));
  void p0;
  await ctx.close();
}

async function teikning(b) {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const gripin = [];
  await gripaSkrif(ctx, gripin);
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  page.on("console", (m) => {
    if (/\[383\] 3D/.test(m.text())) console.log("Teikning " + m.text().slice(0, 260));
  });
  await page.goto("https://slokkvitaeki.netlify.app/#company/1612", { waitUntil: "domcontentloaded" });
  // „Teikning"-takkinn á prófíl staðarins (onclick = Companies.opnaTeikningu(1612))
  const takki = page.locator('button[onclick*="opnaTeikningu(1612)"]').first();
  await takki.waitFor({ state: "attached", timeout: 90000 });
  await page.waitForTimeout(3000);
  if (await takki.isVisible().catch(() => false)) await takki.click();
  else await page.evaluate(() => window.Companies.opnaTeikningu(1612));
  await page.locator("#modal-floorplan.open").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.FloorPlan && window.FloorPlan.bgImage, null, { timeout: 90000 });
  await page.waitForTimeout(3000);
  await page.locator("#modal-floorplan .fp-3d-btn").click();
  await page.locator("#fp-3d canvas").waitFor({ timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: mynd("3d-teikning-yfirlit-badar-haedir.png") });
  // sama hæð og TurboPaint-borðið (úttektarborð er ein hæð): „1. hæð" ein
  const h1 = page.locator("#fp-3d-haedir button", { hasText: "1. hæð" }).first();
  if (await h1.isVisible().catch(() => false)) {
    await h1.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: mynd("3d-teikning-yfirlit.png") });
  const gb = page.locator("#fp-3d-ganga");
  if (await gb.isVisible().catch(() => false)) {
    await gb.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: mynd("3d-teikning-ganga-1.png") });
  }
  console.log("Teikning: gripin skrif", gripin.length);
  await ctx.close();
}

async function hlidVidHlid(b, vinstri, haegri, ut, titlar) {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 560 } });
  const page = await ctx.newPage();
  const src = (f) => "data:image/png;base64," + fs.readFileSync(path.join(OUT, f)).toString("base64");
  await page.setContent(`<body style="margin:0;background:#14120f;font:600 15px system-ui;color:#f1ede4;display:flex;gap:8px;padding:8px">
    ${[vinstri, haegri].map((f, i) => `<figure style="margin:0;flex:1"><figcaption style="padding:4px 2px">${titlar[i]}</figcaption><img src="${src(f)}" style="width:100%;display:block"></figure>`).join("")}</body>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: mynd(ut), fullPage: true });
  await ctx.close();
}

(async () => {
  const b = await chromium.launch(VAFRI);
  try {
    await turbopaint(b);
    if (!AN_TEIKNINGAR) {
      try {
        await teikning(b);
        await hlidVidHlid(b, "3d-teikning-yfirlit.png", "3d-turbopaint-yfirlit.png", "3d-samanburdur-yfirlit.png", ["Teikning-glugginn (lifandi, 383)", "TurboPaint (3. áfangi)"]);
        if (fs.existsSync(mynd("3d-teikning-ganga-1.png"))) {
          await hlidVidHlid(b, "3d-teikning-ganga-1.png", "3d-turbopaint-ganga-1.png", "3d-samanburdur-ganga.png", ["Teikning-glugginn — Ganga", "TurboPaint — Ganga"]);
        }
      } catch (e) {
        console.log("Teikning-samanburður náðist ekki:", e.message);
      }
    }
  } finally {
    await b.close();
  }
  console.log("\nÍ LAGI (" + ok.length + "):\n  " + ok.join("\n  "));
  if (bad.length) console.log("\nBILAÐ (" + bad.length + "):\n  " + bad.join("\n  "));
  process.exit(bad.length ? 1 : 0);
})();
