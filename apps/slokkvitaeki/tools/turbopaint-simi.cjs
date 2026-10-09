/* TurboPaint í síma (Agnar 09.10.2026: „Svolítið erfitt að gera í símanum. Margt fyrir. … collapse takka fyrir
 * hliðarstikuna … compact merki á veggjagluggann. Sýna bara velja. Teikna. Eyða. Undo. Og gera vista gluggann minni").
 *
 *   node tools/turbopaint-simi.cjs [http://localhost:4123] [úttaksmappa] [fyrir|eftir]
 *
 * Sími (412×915, isMobile, hasTouch, 2,6×) og tölva (1600×1000) á borði TEST FYRIRTÆKIS (1404, 1. hæð) í Teikning-ham:
 *   · mælir hve stór hluti skjásins teikniflöturinn fær (elementFromPoint á 4 px neti — allt sem stikur/gluggar þekja
 *     dregst frá), fyrst með ritilinn lokaðan, svo opinn;
 *   · „eftir": samanbrot verkfærasúlunnar (opna/loka/munað eftir endurhleðslu), þétti veggjaritillinn (Teikna með
 *     snertidrætti → Velja með snertismelli → Eyða → Afturkalla), „Meira" opnar allan gluggann, „Vista í úttekt"-borðinn
 *     lítill og ekki ofan á ritlinum, ekkert lárétt skrun, engar villur í console.
 * ENGIN skrif fara út: turbopaint-vordur.cjs grípur öll skrif í Supabase (REST + geymslu). Engin TurboPaint-borð eru
 * lesin úr skýinu (svarað tómu) svo prófið getur aldrei opnað borð annarra félaga; teikning_bord er aðeins lesið fyrir
 * 1404. */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = process.argv[3] || path.join(process.cwd(), "turbopaint-simi-myndir");
const HAMUR = process.argv[4] || "eftir";
fs.mkdirSync(OUT, { recursive: true });
const CID = 1404, HAED = "t1404h1";
const ok = [], bad = [];
const check = (n, c, x) => {
  (c ? ok : bad).push(n + (c ? "" : `   ← ${x}`));
  console.log((c ? "  ✓ " : "  ✗ ") + n + (c ? "" : `   ← ${x}`));
};

const SIMI = {
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.6,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
};
const TOLVA = { viewport: { width: 1600, height: 1000 } };

async function opna(browser, stillingar, merki) {
  const ctx = await browser.newContext(stillingar);
  const gripid = await require("./turbopaint-vordur.cjs").vernda(ctx);
  // Engin TurboPaint-borð úr skýinu: ræsingin býr til staðbundið borð og úttektin nýtt borð — aldrei borð annars félags.
  await ctx.route(/\/rest\/v1\/turbopaint_boards/, (route) => {
    const req = route.request();
    if (req.method() !== "GET" && req.method() !== "HEAD") return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  // teikning_bord: aðeins 1404 lesið; skrif gripin (og skráð)
  const teikn = [];
  await ctx.route(/\/rest\/v1\/teikning_bord/, async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") {
      if (req.url().includes("company_id=eq." + CID)) return route.fallback();
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    teikn.push({ method: req.method(), url: req.url() });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
  });
  const page = await ctx.newPage();
  const villur = [];
  page.on("pageerror", (e) => villur.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") villur.push("console: " + m.text().slice(0, 300));
  });
  const http = [];
  page.on("response", (r) => {
    if (r.status() >= 400) http.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 220)}`);
  });
  return { ctx, page, villur, http, gripid, teikn, merki };
}

async function hladaUttekt(page) {
  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&ham=teikning`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (cid) => {
      const s = window.__tpStore?.getState();
      if (!s || s.importProgress) return false;
      const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
      return !!m && s.objects.some((o) => o.type === "polyline" && o.veggur && o.parentId === m.id);
    },
    CID,
    { timeout: 300000, polling: 200 }
  );
  await page.waitForTimeout(1500);
  // tilkynningar (sonner) hverfa áður en mælt er — þær eru tímabundnar
  await page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 15000 }).catch(() => {});
}

/** Hve stór hluti skjásins er teikniflötur (Konva-sviðið eða yfirlag ritilsins efst á þeim stað). */
const maela = (page) =>
  page.evaluate(() => {
    const W = innerWidth, H = innerHeight, st = 4;
    let alls = 0, plan = 0;
    for (let y = st / 2; y < H; y += st)
      for (let x = st / 2; x < W; x += st) {
        alls++;
        const el = document.elementFromPoint(x, y);
        if (el && (el.closest(".kjarni-stage") || el.closest("[data-veggjaritill]"))) plan++;
      }
    return { hlutfall: plan / alls, px2: plan * st * st, skjar: W * H };
  });

const rect = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);
/** Villur sem skipta máli. Undanskilið: „Failed to load resource … 400" þegar EINU http-villurnar eru HEAD-fyrirspurnir
 * persistence um hvort mynd borðsins sé komin í geymsluna — vörðurinn hindrar upphleðsluna, svo svarið er 400 (sést líka
 * „fyrir"). */
const raunVillur = (S) => {
  const adeinsGeymsla = S.http.length > 0 && S.http.every((h) => /^400 HEAD .*\/storage\/v1\/object\/public\/turbopaint\//.test(h));
  return S.villur.filter((v) => !(adeinsGeymsla && /Failed to load resource: the server responded with a status of 400/.test(v)));
};
const skarast = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const pct = (m) => `${(m.hlutfall * 100).toFixed(1)}% (${m.px2.toLocaleString("is-IS")} px² af ${m.skjar.toLocaleString("is-IS")})`;

const stada = (page) =>
  page.evaluate(() => {
    const s = window.__tpStore.getState();
    const V = s.objects.filter((o) => (o.type === "polyline" || o.type === "line") && (o.veggur || o.layerId === "veggir"));
    return { veggir: V.length, ids: V.map((o) => o.id), sel: s.selectedIds.slice(), past: s.past.length };
  });
const skja = (page, P) =>
  page.evaluate(([x, y]) => {
    const cam = window.__tpStore.getState().camera;
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    return { x: r.left + x * cam.scale + cam.x, y: r.top + y * cam.scale + cam.y };
  }, P);

/** Snertidráttur (raunverulegir touch-atburðir um CDP → pointerType "touch"). */
async function snertiDrattur(page, A, B, skref = 12) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: A.x, y: A.y }] });
  for (let i = 1; i <= skref; i++) {
    const t = i / skref;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }] });
    await page.waitForTimeout(16);
  }
  // fingurinn staldrar við í endann eins og fólk gerir (enginn hraði → Chrome býr ekki til „fling" sem gleypir næsta smell)
  for (let i = 0; i < 6; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: B.x, y: B.y }] });
    await page.waitForTimeout(20);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Auður staður á skjánum inni í teikniflötinum: langt frá veggjum og öllu sem er ofan á. */
const audurStadur = (page) =>
  page.evaluate(() => {
    const s = window.__tpStore.getState(), cam = s.camera;
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    const V = s.objects.filter((o) => (o.type === "polyline" || o.type === "line") && (o.veggur || o.layerId === "veggir"));
    const fj = (x, y) => {
      let best = Infinity;
      for (const o of V)
        for (let i = 2; i < o.points.length; i += 2) {
          const ax = (o.points[i - 2] + o.x) * cam.scale + cam.x + r.left, ay = (o.points[i - 1] + o.y) * cam.scale + cam.y + r.top;
          const bx = (o.points[i] + o.x) * cam.scale + cam.x + r.left, by = (o.points[i + 1] + o.y) * cam.scale + cam.y + r.top;
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
          best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
        }
      return best;
    };
    const ofan = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return !(el && (el.closest(".kjarni-stage") || el.closest("[data-veggjaritill]")));
    };
    let best = null;
    for (let y = r.top + 120; y < r.bottom - 200; y += 10)
      for (let x = r.left + 40; x < r.right - 140; x += 10) {
        if (ofan(x, y) || ofan(x + 100, y) || ofan(x + 50, y)) continue;
        const d = Math.min(fj(x, y), fj(x + 50, y), fj(x + 100, y));
        if (!best || d > best.d) best = { x, y, d };
      }
    return best;
  });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const nidurstodur = {};

  // ── SÍMI ───────────────────────────────────────────────────────────────────────────────────────────────
  {
    const S = await opna(browser, SIMI, "simi");
    const page = S.page;
    const t0 = Date.now();
    await hladaUttekt(page);
    console.log(`sími: hæðin opnuð á ${Math.round((Date.now() - t0) / 1000)} s`);
    const s0 = await stada(page);
    const m0 = await maela(page);
    nidurstodur.simiTeikning = m0;
    console.log("  sími, ritill lokaður: teikniflötur", pct(m0));
    await page.screenshot({ path: path.join(OUT, `${HAMUR}_simi_1_teikning.png`) });

    if (HAMUR === "eftir") {
      // 1) verkfærasúlan byrjar samanbrotin í síma
      check("sími: verkfærasúlan byrjar samanbrotin", !(await rect(page, ".tp-toolbar")) && !!(await rect(page, "[data-sula-opna]")), "súlan sést");
      await page.locator("[data-sula-opna]").tap();
      await page.waitForTimeout(250);
      check("sími: „Opna“ sýnir súluna", !!(await rect(page, ".tp-toolbar")), "ekki opin");
      await page.screenshot({ path: path.join(OUT, `${HAMUR}_simi_2_sula_opin.png`) });
      await page.locator("[data-sula-loka]").tap();
      await page.waitForTimeout(250);
      check("sími: „Fella saman“ felur súluna aftur", !(await rect(page, ".tp-toolbar")) && !!(await rect(page, "[data-sula-opna]")), "ekki samanbrotin");
      // man síðasta val: opna → endurhlaða → enn opin
      await page.locator("[data-sula-opna]").tap();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("[data-sula-loka], [data-sula-opna]").first().waitFor({ timeout: 120000 });
      await page.waitForTimeout(800);
      check("sími: munar síðasta val eftir endurhleðslu (opin)", !!(await rect(page, ".tp-toolbar")), "gleymdist");
      await page.locator("[data-sula-loka]").tap();
      await page.waitForTimeout(200);
      // aftur á úttektina (endurhleðslan opnar síðasta borð vafrans = úttektarborðið, staðbundið)
      await page.waitForFunction(
        (cid) => !!window.__tpStore?.getState().objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid),
        CID,
        { timeout: 120000 }
      );
      await page.waitForTimeout(800);
    }

    // 2) „Breyta veggjum" → ritillinn
    await page.getByRole("button", { name: /Breyta veggjum/ }).first().tap();
    await page.waitForTimeout(500);
    const m1 = await maela(page);
    nidurstodur.simiRitill = m1;
    console.log("  sími, ritill opinn: teikniflötur", pct(m1));
    await page.screenshot({ path: path.join(OUT, `${HAMUR}_simi_3_ritill.png`) });
    const borði = await rect(page, "[data-vista-uttekt-bordi]");
    const ritillR = (await rect(page, "[data-ritill-thett]")) || (await rect(page, '[aria-label="Veggjaritill"]'));
    console.log("  borðinn:", JSON.stringify(borði), " ritillinn:", JSON.stringify(ritillR));

    if (HAMUR === "eftir") {
      check("sími: ritillinn opnast í þéttum ham (Velja · Teikna · Eyða · Afturkalla · Meira)", !!(await rect(page, "[data-ritill-thett]")) && !(await rect(page, '[role="region"][aria-label="Veggjaritill"]')), "ekki þéttur");
      const takkar = await page.locator("[data-ritill-thett] button").evaluateAll((bs) => bs.map((b) => b.getAttribute("data-thett") || b.textContent.trim()));
      console.log("  takkar þétta hamsins:", takkar.join(" · "));
      check("sími: þéttur hamur sýnir aðeins velja/teikna/eyda/afturkalla/meira/loka", ["velja", "teikna", "eyda", "afturkalla", "meira"].every((k) => takkar.includes(k)) && takkar.length <= 6, takkar.join(","));
      check("sími: „Vista í úttekt“-borðinn orðinn lítill hnappur (≤ 160 × 44 px)", !!borði && borði.w <= 160 && borði.h <= 44, JSON.stringify(borði));
      check("sími: borðinn er ekki ofan á ritlinum", !skarast(borði, ritillR), JSON.stringify({ borði, ritillR }));
      check("sími: teikniflöturinn ≥ 80% skjásins með ritilinn opinn", m1.hlutfall >= 0.8, pct(m1));

      // 3) Teikna: snertidráttur á auðum stað → einn nýr veggur
      await page.locator('[data-thett="teikna"]').tap();
      await page.waitForTimeout(200);
      const A = await audurStadur(page);
      const B = { x: A.x + 100, y: A.y + 2 };
      const sA = await stada(page);
      await snertiDrattur(page, A, B);
      await page.waitForTimeout(500);
      const sB = await stada(page);
      const ny = sB.ids.filter((i) => !sA.ids.includes(i));
      check("Teikna (snertidráttur): einn nýr veggur", ny.length === 1 && sB.veggir === sA.veggir + 1, JSON.stringify({ fyrir: sA.veggir, eftir: sB.veggir, A, d: A && A.d }));
      await page.screenshot({ path: path.join(OUT, `${HAMUR}_simi_4_teiknad.png`) });

      // 4) Velja: snertismellur á miðjan nýja vegginn → valinn
      await page.evaluate(() => {
        window.__tpAtb = [];
        for (const t of ["pointerdown", "pointerup", "click", "touchstart", "touchend"])
          window.addEventListener(t, (e) => window.__tpAtb.push(`${t}:${e.target?.closest?.("[data-thett]")?.getAttribute("data-thett") || e.target?.tagName}`), { capture: true });
      });
      await page.locator('[data-thett="velja"]').tap();
      await page.waitForTimeout(600);
      const veljaVirkt = (await page.locator('[data-thett="velja"]').getAttribute("aria-pressed")) === "true";
      check("Velja-hnappurinn virkjast við snertingu", veljaVirkt, JSON.stringify(await page.evaluate(() => window.__tpAtb)));
      await page.evaluate(() => window.__tpStore.getState().setSelected([]));
      const o = await page.evaluate((id) => window.__tpStore.getState().objects.find((x) => x.id === id), ny[0]);
      const p = o.points;
      const mid = await skja(page, [o.x + (p[0] + p[p.length - 2]) / 2, o.y + (p[1] + p[p.length - 1]) / 2]);
      const greining = await page.evaluate(([x, y]) => {
        window.__tpPtr = [];
        for (const t of ["pointerdown", "pointerup", "pointercancel"])
          window.addEventListener(t, (e) => window.__tpPtr.push(`${t}:${e.pointerType}:${e.pointerId}`), { capture: true });
        const el = document.elementFromPoint(x, y);
        return {
          velja: document.querySelector('[data-thett="velja"]')?.getAttribute("aria-pressed"),
          efst: el ? el.getAttribute("data-veggjaritill") || el.tagName : null,
        };
      }, [mid.x, mid.y]);
      await page.touchscreen.tap(mid.x, mid.y);
      await page.waitForTimeout(300);
      const sC = await stada(page);
      const ptr = await page.evaluate(() => window.__tpPtr);
      check("Velja (snertismellur á vegginn): nýi veggurinn valinn", sC.sel.length === 1 && sC.sel[0] === ny[0], JSON.stringify({ sel: sC.sel, mid, greining, ptr }));
      await page.screenshot({ path: path.join(OUT, `${HAMUR}_simi_5_valinn.png`) });

      // 5) Eyða: valinn veggur hverfur
      await page.locator('[data-thett="eyda"]').tap();
      await page.waitForTimeout(300);
      const sD = await stada(page);
      check("Eyða: valda veggnum eytt", sD.veggir === sA.veggir && !sD.ids.includes(ny[0]), JSON.stringify({ veggir: sD.veggir }));

      // 6) Afturkalla: veggurinn kemur aftur, svo aftur → teikningin hverfur líka
      await page.locator('[data-thett="afturkalla"]').tap();
      await page.waitForTimeout(300);
      const sE = await stada(page);
      check("Afturkalla: eydda veggurinn kemur aftur", sE.veggir === sA.veggir + 1 && sE.ids.includes(ny[0]), JSON.stringify({ veggir: sE.veggir }));
      await page.locator('[data-thett="afturkalla"]').tap();
      await page.waitForTimeout(300);
      const sF = await stada(page);
      check("Afturkalla aftur: teiknaði veggurinn hverfur (sama saga og ⌘Z)", sF.veggir === sA.veggir && !sF.ids.includes(ny[0]), JSON.stringify({ veggir: sF.veggir }));

      // 7) Meira → allur glugginn; „Minna" → þétt aftur
      await page.locator('[data-thett="meira"]').tap();
      await page.waitForTimeout(300);
      const full = page.getByRole("region", { name: "Veggjaritill" });
      const fullOk = (await full.count()) === 1 && (await full.isVisible());
      // textContent (ekki innerText): fyrirsagnirnar eru í hástöfum með CSS („LÖG")
      const texti = fullOk ? await full.evaluate((e) => e.textContent || "") : "";
      check(
        "Meira: allur ritillinn (Rétthyrningur, Kljúfa, Lengja að, Eyða í kassa, 10/15/20/30, tegundir, Hornalás, Lög, Lita veggi, Sýna aðeins veggi, Greina veggi)",
        fullOk && ["Rétthyrningur", "Kljúfa", "Lengja að", "Eyða í kassa", "Gler", "Hurð", "EI-60", "EI-30", "Hornalás", "Lög", "Lita veggi", "Sýna aðeins veggi", "Greina veggi"].every((t) => texti.includes(t)),
        texti.slice(0, 200)
      );
      const hlidrun = await page.evaluate(() => {
        const skrunad = [...document.querySelectorAll("*")]
          .filter((e) => e.scrollLeft > 0)
          .map((e) => `${e.tagName}.${String(e.className).slice(0, 60)} sl=${e.scrollLeft} sw=${e.scrollWidth} cw=${e.clientWidth}`);
        const vv = window.visualViewport;
        return { scrollX: window.scrollX, vv: vv && { x: vv.offsetLeft, pageLeft: vv.pageLeft, s: vv.scale, w: vv.width }, skrunad };
      });
      console.log("  hliðrun eftir „Meira“:", JSON.stringify(hlidrun));
      await page.screenshot({ path: path.join(OUT, `${HAMUR}_simi_6_meira.png`) });
      await page.locator("[data-ritill-minna]").tap();
      await page.waitForTimeout(300);
      check("„Minna“: aftur í þéttan ham", !!(await rect(page, "[data-ritill-thett]")), "ekki þéttur");

      // 8) ekkert lárétt skrun
      const skrun = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, bw: document.body.scrollWidth }));
      check("sími: ekkert lárétt skrun", skrun.sw <= skrun.iw && skrun.bw <= skrun.iw, JSON.stringify(skrun));
      // …og ekkert innra ílát hliðrunarhæft (overflow:hidden má skruna með forriti/fókus — 09.10 hliðraðist allt um 160 px
      // því neðsta stikan var 732 px breið); ekkert sýnilegt (nema fast staðsett) nær út fyrir skjáinn.
      const innra = await page.evaluate(() => {
        const W = innerWidth;
        const stn = document.querySelector(".stn");
        const ut = [];
        for (const e of document.querySelectorAll("body *")) {
          const q = e.getBoundingClientRect();
          if (!q.width || (q.right <= W + 1 && q.left >= -1)) continue;
          // fast staðsett (tilkynningar) og það sem er klippt inni í skrunanlegu íláti innan skjásins (t.d. neðsta stikan) telst ekki
          let sleppa = false;
          for (let a = e.parentElement; a && a !== stn && a !== document.body; a = a.parentElement) {
            const cs = getComputedStyle(a);
            const r = a.getBoundingClientRect();
            if (cs.position === "fixed") sleppa = true;
            if (cs.overflowX !== "visible" && r.left >= -1 && r.right <= W + 1) sleppa = true;
          }
          if (getComputedStyle(e).position === "fixed") sleppa = true;
          if (!sleppa) ut.push(e);
        }
        return {
          stn: stn ? { sw: stn.scrollWidth, cw: stn.clientWidth, sl: stn.scrollLeft } : null,
          utan: ut.filter((a) => !ut.some((b) => b !== a && b.contains(a))).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`),
        };
      });
      check("sími: ekkert innra ílát breiðara en skjárinn (neðsta stikan skrunar inni í sér)", (!innra.stn || (innra.stn.sw <= innra.stn.cw && innra.stn.sl === 0)) && !innra.utan.length, JSON.stringify(innra));
      // 9) Loka ritlinum
      await page.locator('[data-thett="loka"]').tap();
      await page.waitForTimeout(300);
      check("Loka: ritillinn lokast", !(await rect(page, "[data-ritill-thett]")) && !(await rect(page, '[role="region"][aria-label="Veggjaritill"]')), "opinn");
      const m2 = await maela(page);
      nidurstodur.simiEftirLokun = m2;
    }
    console.log("  villur í síma:", S.villur.length ? S.villur.join("\n    ") : "engar");
    console.log("  http ≥ 400:", S.http.length ? S.http.join("\n    ") : "engin");
    if (HAMUR === "eftir") check("sími: engar villur í console", !raunVillur(S).length, raunVillur(S).join(" | "));
    console.log(`  gripin skrif: ${S.gripid.length} í Supabase, ${S.teikn.length} í teikning_bord (ekkert fór út)`);
    await S.ctx.close();
  }

  // ── SÍMI í Slökkvitækjaham (sjálfgefið þegar úttekt opnast) — Vista-hnappurinn og magntaflan deila hægra horninu ──
  if (HAMUR === "eftir") {
    const S = await opna(browser, SIMI, "simi-slokkvitaeki");
    const page = S.page;
    await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      (cid) => {
        const s = window.__tpStore?.getState();
        return !!s && !s.importProgress && s.objects.some((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
      },
      CID,
      { timeout: 300000, polling: 200 }
    );
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => !document.querySelector("[data-sonner-toast]"), null, { timeout: 15000 }).catch(() => {});
    const vista = await rect(page, "[data-vista-uttekt-bordi]");
    const tafla = await rect(page, "[data-magntafla]");
    const sula = await rect(page, "[data-sula-opna]");
    const m = await maela(page);
    nidurstodur.simiSlokkvitaeki = m;
    console.log("  sími, Slökkvitækjahamur: teikniflötur", pct(m), JSON.stringify({ vista, tafla, sula }));
    check("sími/Slökkvitækjahamur: Vista-hnappur og magntafla skarast ekki", !!vista && !!tafla && !skarast(vista, tafla), JSON.stringify({ vista, tafla }));
    check("sími/Slökkvitækjahamur: Vista-hnappur ekki ofan á verkfærahnappnum", !skarast(vista, sula), JSON.stringify({ vista, sula }));
    await page.screenshot({ path: path.join(OUT, `${HAMUR}_simi_7_slokkvitaekjahamur.png`) });
    check("sími/Slökkvitækjahamur: engar villur í console", !raunVillur(S).length, raunVillur(S).join(" | "));
    await S.ctx.close();
  }

  // ── TÖLVA 1600×1000 ────────────────────────────────────────────────────────────────────────────────────
  {
    const S = await opna(browser, TOLVA, "tolva");
    const page = S.page;
    await hladaUttekt(page);
    const m0 = await maela(page);
    nidurstodur.tolvaTeikning = m0;
    console.log("  tölva, ritill lokaður: teikniflötur", pct(m0));
    if (HAMUR === "eftir") {
      check("tölva: verkfærasúlan opin sjálfgefið", !!(await rect(page, ".tp-toolbar")), "samanbrotin");
      check("tölva: samanbrots-takki á súlunni", !!(await rect(page, "[data-sula-loka]")), "vantar");
      const b = await rect(page, "[data-vista-uttekt-bordi]");
      const bt = await page.locator("[data-vista-uttekt-bordi]").innerText();
      check("tölva: borðinn óbreyttur (texti + „Vista í úttekt“)", /Úttektarteikning/.test(bt) && /Vista í úttekt/.test(bt), bt);
      console.log("  borðinn (tölva):", JSON.stringify(b));
    }
    await page.screenshot({ path: path.join(OUT, `${HAMUR}_tolva_1_teikning.png`) });
    await page.getByRole("button", { name: /Breyta veggjum/ }).first().click();
    await page.waitForTimeout(500);
    const m1 = await maela(page);
    nidurstodur.tolvaRitill = m1;
    console.log("  tölva, ritill opinn: teikniflötur", pct(m1));
    await page.screenshot({ path: path.join(OUT, `${HAMUR}_tolva_2_ritill.png`) });
    if (HAMUR === "eftir") {
      const full = page.getByRole("region", { name: "Veggjaritill" });
      check("tölva: ritillinn opnast fullur eins og áður", (await full.count()) === 1 && (await full.isVisible()), "ekki fullur");
      check("tölva: þéttur-hnappur („Minna“) í fulla glugganum", !!(await rect(page, "[data-ritill-minna]")), "vantar");
      // Teikna með mús í fullum ham + Delete + ⌘Z — virkni óbreytt
      await page.getByRole("button", { name: /^Teikna/ }).first().click();
      const A = await audurStadur(page);
      const sA = await stada(page);
      await page.mouse.move(A.x, A.y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(A.x + i * 12, A.y + 1);
      await page.mouse.up();
      await page.waitForTimeout(400);
      const sB = await stada(page);
      check("tölva: Teikna (mús) = einn nýr veggur", sB.veggir === sA.veggir + 1, JSON.stringify({ fyrir: sA.veggir, eftir: sB.veggir }));
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(300);
      check("tölva: ⌘Z afturkallar", (await stada(page)).veggir === sA.veggir, "");
      // „Minna" í tölvu: þétta ræman neðst, ofan við neðstu stikuna; „Meira" skilar glugganum
      await page.locator("[data-ritill-minna]").click();
      await page.waitForTimeout(300);
      const thettR = await rect(page, "[data-ritill-thett]");
      const stilR = await rect(page, ".tp-stylestrip");
      check("tölva: „Minna“ → þétt ræma, glugginn víkur", !!thettR && !(await rect(page, '[role="region"][aria-label="Veggjaritill"]')), JSON.stringify(thettR));
      check("tölva: þétta ræman skarast ekki við neðstu stikuna", !skarast(thettR, stilR), JSON.stringify({ thettR, stilR }));
      nidurstodur.tolvaThett = await maela(page);
      console.log("  tölva, ritill þéttur: teikniflötur", pct(nidurstodur.tolvaThett));
      await page.screenshot({ path: path.join(OUT, `${HAMUR}_tolva_3_thettur.png`) });
      await page.locator('[data-thett="meira"]').click();
      await page.waitForTimeout(300);
      check("tölva: „Meira“ → allur glugginn aftur", await page.getByRole("region", { name: "Veggjaritill" }).isVisible(), "");
      const skrun = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      check("tölva: ekkert lárétt skrun", skrun.sw <= skrun.iw, JSON.stringify(skrun));
      check("tölva: engar villur í console", !raunVillur(S).length, raunVillur(S).join(" | "));
    }
    console.log("  villur í tölvu:", S.villur.length ? S.villur.join("\n    ") : "engar");
    console.log("  http ≥ 400:", S.http.length ? S.http.join("\n    ") : "engin");
    console.log(`  gripin skrif: ${S.gripid.length} í Supabase, ${S.teikn.length} í teikning_bord (ekkert fór út)`);
    await S.ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, `${HAMUR}_maelingar.json`), JSON.stringify(nidurstodur, null, 2));
  console.log(`\n${ok.length} ✓ · ${bad.length} ✗`);
  if (bad.length) {
    console.log(bad.join("\n"));
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
