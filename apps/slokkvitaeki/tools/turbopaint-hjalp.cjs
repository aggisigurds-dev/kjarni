/* Sameiginlegt í nýrri vafraprófum TurboPaint: ræsa vafra með skrifvörn (turbopaint-vordur.cjs), opna úttektarhæð og
 * bíða þar til teikningin, merkin og veggirnir eru komnir. */
const path = require("path");
const fs = require("fs");
const { vernda } = require("./turbopaint-vordur.cjs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}

/** Vafri + samhengi með skrifvörn. `teikningBord(route)` (valfrjálst) fær öll köll á teikning_bord. */
async function raesa({ teikningBord } = {}) {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const verndud = await vernda(ctx);
  if (teikningBord) await ctx.route("**/rest/v1/teikning_bord*", teikningBord);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  // Öll skrif í Supabase sem vafrinn sendir — eiga ÖLL að vera gripin (vörðurinn eða teikning_bord-route prófsins).
  const skrifBeidnir = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method()) && /supabase\.co\/(rest|storage)\//.test(r.url())) {
      skrifBeidnir.push(r.method() + " " + r.url().replace(/\?.*$/, ""));
    }
  });
  return { b, ctx, page, errs, verndud, skrifBeidnir };
}

/** Opnar ?uttekt=<cid>&haed=<haed> og bíður eftir tengdu myndinni (og veggjum, ef `veggir`). */
async function opnaUttekt(page, { BASE, cid, haed, b, h, ham, veggir = true }) {
  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${cid}&haed=${haed}&b=${b}&h=${h}&ham=${ham}`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 120000 });
  await page.waitForFunction(
    ([cid, veggir]) => {
      const w = window, s = w.__tpStore?.getState();
      if (!s) return false;
      if (s.importProgress) w.__tpByrjad = true;
      if ([...document.querySelectorAll("[data-sonner-toast]")].some((e) => /merki á teikningunni/.test(e.textContent || ""))) w.__tpByrjad = true;
      if (!w.__tpByrjad || s.importProgress) return false;
      const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
      if (!m) return false;
      return !veggir || s.objects.some((o) => o.type === "polyline" && o.veggur && o.parentId === m.id);
    },
    [cid, veggir],
    { timeout: 300000, polling: 100 }
  );
  await page.waitForTimeout(2000);
}

function teljari() {
  const ok = [], bad = [];
  const check = (n, c, x) => {
    (c ? ok : bad).push(n + (c ? "" : `   ← ${x}`));
    console.log((c ? "  ✓ " : "  ✗ ") + n + (c ? "" : `   ← ${x}`));
  };
  return { ok, bad, check };
}

function mappa(argv, sjalfgefid) {
  const OUT = argv[3] || path.join(process.cwd(), sjalfgefid);
  fs.mkdirSync(OUT, { recursive: true });
  return OUT;
}

module.exports = { raesa, opnaUttekt, teljari, mappa };
