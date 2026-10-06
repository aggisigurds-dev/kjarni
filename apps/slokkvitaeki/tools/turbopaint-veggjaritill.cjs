/* Veggjaritill TurboPaint — sannað í raunverulegum vafra á Fiskislóð 41 (fyrirtæki 1612, 1. hæð), með RAUNVERULEGRI mús og
 * lyklaborði (page.mouse / page.keyboard — engin bein köll í borðið til að breyta neinu).
 *
 *   node tools/turbopaint-veggjaritill.cjs [http://localhost:4123] [úttaksmappa]
 *
 * Skref: opna hæðina (veggir Teikning-gluggans koma inn) → „Breyta veggjum" → smellur á teikninguna velur/færir hana
 * aldrei → teikna 3 veggi (smellur á línu, Shift-hornalás, smellur á enda) → kassaval 5 veggja + Delete → kljúfa vegg →
 * draga endapunkt (⌘Z / ⌘Y) → vegg í gler (⌘Z / ⌘Y) → „Greina veggi": línuflokkar (0,24 + 0,48 pt forskoðun), Bæta
 * við (tvítekningar felldar, leiðréttingar haldast), Skipta út + ⌘Z → „Vista í úttekt".
 * ENGIN skrif fara í teikning_bord: öll skrif þangað eru gripin (route), svarað 200, og sendingin skoðuð. Borðið sjálft
 * (turbopaint_boards) má endurskapast (Agnar). */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = process.argv[3] || path.join(process.cwd(), "turbopaint-veggjaritill-myndir");
fs.mkdirSync(OUT, { recursive: true });
const CID = 1612, HAED = "hmuaaaw83rg9";
const ok = [], bad = [];
const check = (n, c, extra) => {
  (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));
  console.log((c ? "  ✓ " : "  ✗ ") + n + (c ? "" : `   ← ${extra}`));
};

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));

  const gripin = [];
  let fersk = null;
  await ctx.route("**/rest/v1/teikning_bord*", async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") {
      const res = await route.fetch();
      try {
        const j = await res.json();
        const rod = Array.isArray(j) ? j[0] : j;
        if (rod && rod.haedir) fersk = rod;
      } catch { /* ekki json */ }
      return route.fulfill({ response: res });
    }
    gripin.push({ method: req.method(), url: req.url(), body: req.postData() });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
  });

  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });
  const stada = () =>
    page.evaluate(() => {
      const s = window.__tpStore.getState();
      const V = s.objects.filter((o) => (o.type === "polyline" || o.type === "line") && (o.veggur || o.layerId === "veggir"));
      const m = s.objects.find((o) => o.type === "image" && o.uttekt);
      return {
        veggir: V.length,
        gler: V.filter((o) => o.veggTegund === "gler").length,
        hurd: V.filter((o) => o.veggTegund === "hurd").length,
        ids: V.map((o) => o.id),
        sel: s.selectedIds.slice(),
        mynd: m ? { id: m.id, x: m.x, y: m.y, w: m.width, h: m.height } : null,
        teiknLaest: s.layers.find((l) => l.id === "teikning").locked,
      };
    });
  // heimshnit → skjáhnit (síðan)
  const skja = (P) =>
    page.evaluate(([x, y]) => {
      const cam = window.__tpStore.getState().camera;
      const r = document.querySelector(".tp-sheet").getBoundingClientRect();
      return { x: r.left + x * cam.scale + cam.x, y: r.top + y * cam.scale + cam.y };
    }, P);
  const veggur = (id) => page.evaluate((i) => window.__tpStore.getState().objects.find((o) => o.id === i), id);
  const heims = (o) => o.points.map((v, i) => v + (i % 2 === 0 ? o.x : o.y));

  // ── 0) opna ──────────────────────────────────────────────────────────────────────────────────────────
  const t0 = Date.now();
  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&b=4244&h=6006&ham=teikning`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 120000 });
  // Fyrst hleðst SÍÐASTA borð vafrans/skýsins (getur verið eldra Fiskislóðar-borð með veggjum). Opnun úttektarinnar telst
  // hafin þegar framvinda sést („Sæki teikningu…") eða staðfestingin „… merki á teikningunni" — svo er beðið eftir að
  // tengda myndin og veggirnir séu komnir og framvindan horfin.
  await page
    .waitForFunction(
      () => {
        const w = window;
        const s = w.__tpStore?.getState();
        if (!s) return false;
        if (s.importProgress) w.__tpByrjad = true;
        if ([...document.querySelectorAll("[data-sonner-toast]")].some((e) => /merki á teikningunni/.test(e.textContent || ""))) w.__tpByrjad = true;
        if (!w.__tpByrjad || s.importProgress || !/Fiskislóð/.test(s.name)) return false;
        const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === 1612);
        return !!m && s.objects.some((o) => o.type === "polyline" && o.veggur && o.parentId === m.id);
      },
      null,
      { timeout: 300000, polling: 100 }
    )
    .catch(async (e) => {
      console.log("opnun brást — skilaboð:", await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((x) => x.textContent).join(" | ")));
      throw e;
    });
  await page.waitForTimeout(2500);
  const s0 = await stada();
  console.log(`opnað á ${Math.round((Date.now() - t0) / 1000)} s:`, JSON.stringify({ veggir: s0.veggir, gler: s0.gler }));
  check("hæðin opnast með veggjum Teikning-gluggans (62 = 57 + 5 gler)", s0.veggir === 62 && s0.gler === 5, JSON.stringify(s0));
  await shot("01_opnad.png");

  // ── 1) ritillinn ─────────────────────────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Breyta veggjum" }).first().click();
  const spjald = page.getByRole("region", { name: "Veggjaritill" });
  await spjald.waitFor({ timeout: 10000 });
  const s1 = await stada();
  check("„Breyta veggjum“ opnar ritilinn og læsir teikningunni", s1.teiknLaest === true, JSON.stringify(s1.teiknLaest));
  check("talning í spjaldinu: „57 veggir · 5 gler“", (await spjald.locator("[data-veggjatalning]").innerText()).trim() === "57 veggir · 5 gler", await spjald.locator("[data-veggjatalning]").innerText());

  // Smellur og dráttur á auðum stað teikningarinnar: myndin hvorki veljast né færist
  const tom = await page.evaluate(() => {
    // auður staður: inni í myndinni, langt frá öllum veggjum og táknum, á skjánum
    const s = window.__tpStore.getState(), cam = s.camera;
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    const V = s.objects.filter((o) => o.type === "polyline" && (o.veggur || o.layerId === "veggir"));
    const T = s.objects.filter((o) => o.type === "symbol");
    const d = (x, y, o) => {
      let best = Infinity;
      for (let i = 2; i < o.points.length; i += 2) {
        const ax = o.points[i - 2] + o.x, ay = o.points[i - 1] + o.y, bx = o.points[i] + o.x, by = o.points[i + 1] + o.y;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
        best = Math.min(best, Math.hypot(x - ax - u * dx, y - ay - u * dy));
      }
      return best;
    };
    for (let sy = r.top + 300; sy < r.bottom - 150; sy += 23) {
      for (let sx = r.left + 420; sx < r.right - 250; sx += 29) {
        const wx = (sx - r.left - cam.x) / cam.scale, wy = (sy - r.top - cam.y) / cam.scale;
        if (V.some((o) => d(wx, wy, o) * cam.scale < 70)) continue;
        if (T.some((t) => Math.hypot(t.x + t.size / 2 - wx, t.y + t.size / 2 - wy) * cam.scale < 70)) continue;
        return { x: sx, y: sy };
      }
    }
    return null;
  });
  check("fann auðan stað á teikningunni", !!tom, "enginn");
  await page.mouse.click(tom.x, tom.y);
  await page.mouse.move(tom.x, tom.y);
  await page.mouse.down();
  await page.mouse.move(tom.x + 25, tom.y + 20, { steps: 4 });
  await page.mouse.move(tom.x + 50, tom.y + 40, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const s2 = await stada();
  check(
    "smellur/dráttur á teikninguna velur hvorki né færir myndina",
    !s2.sel.includes(s2.mynd.id) && s2.mynd.x === s0.mynd.x && s2.mynd.y === s0.mynd.y,
    JSON.stringify({ sel: s2.sel, mynd: s2.mynd, var: s0.mynd })
  );

  // ── 2) teikna 3 veggi: smellur á línu (lína), Shift-hornalás, Shift-hornalás, smellur á fyrsta enda (lokar) ──────────
  const V = await page.evaluate(() => {
    const s = window.__tpStore.getState(), cam = s.camera;
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    const W = s.objects.filter((o) => o.type === "polyline" && (o.veggur || o.layerId === "veggir") && o.points.length === 4 && !o.veggTegund);
    const L = (o) => Math.hypot(o.points[2] - o.points[0], o.points[3] - o.points[1]);
    const lodr = W.filter((o) => Math.abs(o.points[0] - o.points[2]) < 0.01)
      .filter((o) => {
        const sx = o.points[0] * cam.scale + cam.x;
        return sx > r.width * 0.3 && sx < r.width * 0.6;
      })
      .sort((a, c) => L(c) - L(a));
    const o = lodr[0];
    return o ? { id: o.id, x: o.points[0] + o.x, y0: Math.min(o.points[1], o.points[3]) + o.y, y1: Math.max(o.points[1], o.points[3]) + o.y } : null;
  });
  check("fann langan lóðréttan vegg til að byrja á", !!V, "enginn");
  await page.keyboard.press("w");
  await page.waitForTimeout(150);
  check("W velur teikni-tólið", (await spjald.getByRole("button", { name: /^Teikna/ }).getAttribute("aria-pressed")) === "true", "aria-pressed");
  const yMid = V.y0 + (V.y1 - V.y0) * 0.42;
  const P1s = await skja([V.x, yMid]);
  // bendillinn 5 dílum hægra megin við miðlínuna: smellur á línuna
  await page.mouse.move(P1s.x + 5, P1s.y, { steps: 3 });
  await page.mouse.click(P1s.x + 5, P1s.y);
  // Shift + skakkur bendill: hornalás → láréttur veggur
  await page.keyboard.down("Shift");
  await page.mouse.move(P1s.x + 120, P1s.y + 9, { steps: 5 });
  await page.mouse.move(P1s.x + 200, P1s.y + 11, { steps: 5 });
  await page.waitForTimeout(150);
  await shot("03_teikna_lengd_og_hornalas.png");
  await page.mouse.click(P1s.x + 200, P1s.y + 11);
  await page.mouse.move(P1s.x + 192, P1s.y + 140, { steps: 5 });
  await page.mouse.click(P1s.x + 192, P1s.y + 140);
  await page.keyboard.up("Shift");
  // aftur á fyrsta punktinn (smellur á enda — 4 dílum frá) → keðjan lokast
  await page.mouse.move(P1s.x + 3, P1s.y - 4, { steps: 5 });
  await page.waitForTimeout(100);
  await page.mouse.click(P1s.x + 3, P1s.y - 4);
  await page.waitForTimeout(300);
  const s3 = await stada();
  const nyjar = s3.ids.filter((i) => !s1.ids.includes(i));
  check("þrír nýir veggir teiknaðir", nyjar.length === 3 && s3.veggir === s1.veggir + 3, JSON.stringify({ nyjar, n: s3.veggir }));
  const N = await Promise.all(nyjar.map(veggur));
  const n1 = heims(N[0]), n2 = heims(N[1]), n3 = heims(N[2]);
  check("1. veggur byrjar Á miðlínu lóðrétta veggjarins (smellur á línu)", Math.abs(n1[0] - V.x) < 1e-6, JSON.stringify(n1));
  check("1. veggur er nákvæmlega láréttur (Shift-hornalás)", Math.abs(n1[1] - n1[3]) < 1e-9, JSON.stringify(n1));
  check("2. veggur er nákvæmlega lóðréttur (Shift-hornalás)", Math.abs(n2[0] - n2[2]) < 1e-9 && Math.abs(n2[0] - n1[2]) < 1e-9, JSON.stringify(n2));
  check("3. veggur endar nákvæmlega á upphafi þess fyrsta (smellur á enda — keðjan lokuð)", Math.abs(n3[2] - n1[0]) < 1e-9 && Math.abs(n3[3] - n1[1]) < 1e-9, JSON.stringify({ n1, n3 }));
  const dpm = await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const m = s.objects.find((o) => o.type === "image" && o.uttekt);
    return (m.width / m.uttekt.frumB) * (Math.max(m.uttekt.frumB, m.uttekt.frumH) / 2384 / ((0.0254 / 72) * 100));
  });
  check(
    "nýir veggir: lag „Veggir“, festir við teikninguna, 15 cm, tegund veggur",
    N.every((o) => o.layerId === "veggir" && o.veggur === true && o.parentId === s0.mynd.id && Math.abs(o.strokeWidth - 0.15 * dpm) < 0.01 && !o.veggTegund),
    JSON.stringify(N.map((o) => [o.layerId, o.parentId, o.strokeWidth, o.veggTegund]))
  );
  await page.waitForTimeout(200);
  await shot("04_thrir_veggir_teiknadir.png");

  // ── 3) kassaval 5 veggja (dregið til hægri = allir inni) + Delete ───────────────────────────────────────
  await page.keyboard.press("v");
  const kassi = await page.evaluate(() => {
    const s = window.__tpStore.getState(), cam = s.camera;
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    const W = s.objects.filter((o) => (o.type === "polyline" || o.type === "line") && (o.veggur || o.layerId === "veggir"));
    const P = (o) => o.points.map((v, i) => v * cam.scale + (i % 2 === 0 ? o.x * cam.scale + cam.x : o.y * cam.scale + cam.y));
    const sk = W.map((o) => ({ id: o.id, p: P(o), t: o.strokeWidth * cam.scale }));
    const umg = (w) => {
      const xs = w.p.filter((_, i) => i % 2 === 0), ys = w.p.filter((_, i) => i % 2 === 1);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    };
    const inni = (w, k) => { const u = umg(w); return u.x0 >= k.x0 && u.y0 >= k.y0 && u.x1 <= k.x1 && u.y1 <= k.y1; };
    const naer = (x, y) => sk.some((w) => {
      for (let i = 2; i < w.p.length; i += 2) {
        const ax = w.p[i - 2], ay = w.p[i - 1], bx = w.p[i], by = w.p[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const u = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
        if (Math.hypot(x - ax - u * dx, y - ay - u * dy) < Math.max(14, w.t / 2 + 4)) return true;
      }
      return false;
    });
    const midja = (w) => { const u = umg(w); return [(u.x0 + u.x1) / 2, (u.y0 + u.y1) / 2]; };
    for (const fr of sk) {
      const [fx, fy] = midja(fr);
      if (fx < r.width * 0.25 || fx > r.width * 0.72 || fy < 200 || fy > r.height - 160) continue;
      const rod = sk.slice().sort((a, c) => { const [ax, ay] = midja(a), [cx, cy] = midja(c); return Math.hypot(ax - fx, ay - fy) - Math.hypot(cx - fx, cy - fy); });
      const valdir = rod.slice(0, 5);
      const k = valdir.map(umg).reduce((a, u) => ({ x0: Math.min(a.x0, u.x0), y0: Math.min(a.y0, u.y0), x1: Math.max(a.x1, u.x1), y1: Math.max(a.y1, u.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      for (const m of [8, 12, 16, 22]) {
        const kk = { x0: k.x0 - m, y0: k.y0 - m, x1: k.x1 + m, y1: k.y1 + m };
        if (kk.x0 < 372 || kk.y0 < 150 || kk.x1 > r.width - 380 || kk.y1 > r.height - 130) continue;
        const allir = sk.filter((w) => inni(w, kk)).map((w) => w.id).sort();
        if (allir.length !== 5) continue;
        if (naer(kk.x0, kk.y0)) continue;
        return { k: { x0: kk.x0 + r.left, y0: kk.y0 + r.top, x1: kk.x1 + r.left, y1: kk.y1 + r.top }, ids: allir };
      }
    }
    return null;
  });
  check("fann kassa sem nær utan um nákvæmlega 5 veggi", !!kassi, "enginn");
  await page.mouse.move(kassi.k.x0, kassi.k.y0);
  await page.mouse.down();
  await page.mouse.move((kassi.k.x0 + kassi.k.x1) / 2, (kassi.k.y0 + kassi.k.y1) / 2, { steps: 6 });
  await page.mouse.move(kassi.k.x1, kassi.k.y1, { steps: 6 });
  await shot("05_kassaval.png");
  await page.mouse.up();
  await page.waitForTimeout(250);
  const s4 = await stada();
  check("kassaval velur nákvæmlega veggina 5", JSON.stringify(s4.sel.slice().sort()) === JSON.stringify(kassi.ids), JSON.stringify({ sel: s4.sel, vænt: kassi.ids }));
  check("veggjastikan sýnir „5 veggir“", (await page.getByRole("toolbar", { name: "Leiðrétta veggi" }).innerText()).trim().startsWith("5 veggir"), await page.getByRole("toolbar", { name: "Leiðrétta veggi" }).innerText());
  await page.keyboard.press("Delete");
  await page.waitForTimeout(250);
  const s5 = await stada();
  check("Delete eyðir veggjunum 5", s5.veggir === s3.veggir - 5 && kassi.ids.every((i) => !s5.ids.includes(i)), JSON.stringify({ fyrir: s3.veggir, eftir: s5.veggir }));
  await shot("06_fimm_eytt.png");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const s5u = await stada();
  check("⌘Z skilar veggjunum 5", s5u.veggir === s3.veggir && kassi.ids.every((i) => s5u.ids.includes(i)), JSON.stringify(s5u.veggir));
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(200);
  check("⌘Y eyðir þeim aftur", (await stada()).veggir === s5.veggir, "");

  // ── 4) kljúfa vegg (S + smellur) ─────────────────────────────────────────────────────────────────────
  const kv = await page.evaluate(() => {
    const s = window.__tpStore.getState(), cam = s.camera;
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    const W = s.objects.filter((o) => o.type === "polyline" && (o.veggur || o.layerId === "veggir") && o.points.length === 4 && !o.veggTegund);
    const T = s.objects.filter((o) => o.type === "symbol");
    const L = (o) => Math.hypot(o.points[2] - o.points[0], o.points[3] - o.points[1]);
    for (const o of W.sort((a, c) => L(c) - L(a))) {
      for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const wx = o.points[0] + o.x + (o.points[2] - o.points[0]) * f, wy = o.points[1] + o.y + (o.points[3] - o.points[1]) * f;
        const sx = wx * cam.scale + cam.x, sy = wy * cam.scale + cam.y;
        if (sx < 360 || sx > r.width - 380 || sy < 160 || sy > r.height - 140) continue;
        if (T.some((t) => Math.hypot(t.x + t.size / 2 - wx, t.y + t.size / 2 - wy) * cam.scale < 40)) continue;
        return { id: o.id, x: sx + r.left, y: sy + r.top, wx, wy, L: L(o) };
      }
    }
    return null;
  });
  await page.keyboard.press("s");
  await page.mouse.click(kv.x, kv.y);
  await page.waitForTimeout(250);
  const s6 = await stada();
  const klofnir = s6.ids.filter((i) => !s5.ids.includes(i));
  const K = await Promise.all(klofnir.map(veggur));
  const sumL = K.reduce((a, o) => a + Math.hypot(o.points[2] - o.points[0], o.points[3] - o.points[1]), 0);
  check(
    "S + smellur klýfur vegginn í tvennt (sama lengd alls, mætast)",
    !s6.ids.includes(kv.id) && klofnir.length === 2 && Math.abs(sumL - kv.L) < 1e-6 && Math.abs(heims(K[0])[2] - heims(K[1])[0]) < 1e-9,
    JSON.stringify({ klofnir, sumL, L: kv.L })
  );
  await shot("07_klofinn.png");

  // ── 5) draga endapunkt (V, smellur velur, handfang dregið) + ⌘Z / ⌘Y ───────────────────────────────────
  await page.keyboard.press("v");
  const kk = K[0];
  const kp = heims(kk);
  const mid = await skja([(kp[0] + kp[2]) / 2, (kp[1] + kp[3]) / 2]);
  await page.mouse.click(mid.x, mid.y);
  await page.waitForTimeout(150);
  check("smellur velur klofna vegginn", JSON.stringify((await stada()).sel) === JSON.stringify([kk.id]), JSON.stringify((await stada()).sel));
  // fjarlægi endinn (hlid 0) — hinn endinn er klofningspunkturinn
  const E0 = await skja([kp[0], kp[1]]);
  const lodrettur = Math.abs(kp[0] - kp[2]) < 1e-6;
  const fra = lodrettur ? { x: 0, y: (kp[1] < kp[3] ? -1 : 1) * 60 } : { x: (kp[0] < kp[2] ? -1 : 1) * 60, y: 0 };
  await page.mouse.move(E0.x, E0.y);
  await page.mouse.down();
  await page.mouse.move(E0.x + fra.x / 2 + 7, E0.y + fra.y / 2 + 7, { steps: 5 });
  await page.mouse.move(E0.x + fra.x + 7, E0.y + fra.y + 7, { steps: 5 });
  await page.waitForTimeout(100);
  await shot("08_endi_dreginn.png");
  await page.mouse.up();
  await page.waitForTimeout(200);
  const eftirDrag = heims(await veggur(kk.id));
  const cam = await page.evaluate(() => window.__tpStore.getState().camera);
  const faersla = Math.hypot(eftirDrag[0] - kp[0], eftirDrag[1] - kp[1]) * cam.scale;
  check("endapunkturinn færðist með músinni (> 40 skjádílar), hinn endinn kyrr", faersla > 40 && eftirDrag[2] === kp[2] && eftirDrag[3] === kp[3], JSON.stringify({ kp, eftirDrag, faersla }));
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  const afturk = heims(await veggur(kk.id));
  check("⌘Z: endapunkturinn aftur á sinn stað (einn dráttur = eitt skref)", afturk.every((v, i) => Math.abs(v - kp[i]) < 1e-9), JSON.stringify(afturk));
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(150);
  const endur = heims(await veggur(kk.id));
  check("⌘Y: drátturinn endurgerður", endur.every((v, i) => Math.abs(v - eftirDrag[i]) < 1e-9), JSON.stringify(endur));

  // ── 5b) rétthyrningur (R), veggur að hálfu (W), Lengja að (L), kljúfa+sameina (S, J), Ctrl+A, Eyða í kassa (B) ─────
  const svaedi = await page.evaluate(() => {
    const s = window.__tpStore.getState(), cam = s.camera;
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    const V = s.objects.filter((o) => (o.type === "polyline" || o.type === "line") && (o.veggur || o.layerId === "veggir"));
    const T = s.objects.filter((o) => o.type === "symbol");
    const W = 190, H = 130, M = 26;
    for (let sy = 190; sy < r.height - H - 150; sy += 17) {
      for (let sx = 380; sx < r.width - W - 300; sx += 19) {
        const x0 = (sx - M - cam.x) / cam.scale, y0 = (sy - M - cam.y) / cam.scale;
        const x1 = (sx + W + M - cam.x) / cam.scale, y1 = (sy + H + M - cam.y) / cam.scale;
        const inn = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
        let laust = true;
        for (const o of V) {
          for (let i = 2; i < o.points.length && laust; i += 2) {
            const ax = o.points[i - 2] + o.x, ay = o.points[i - 1] + o.y, bx = o.points[i] + o.x, by = o.points[i + 1] + o.y;
            const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * cam.scale / 4));
            for (let k = 0; k <= n; k++) if (inn(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n)) { laust = false; break; }
          }
          if (!laust) break;
        }
        if (!laust || T.some((t) => inn(t.x + t.size / 2, t.y + t.size / 2))) continue;
        return { x: sx + r.left, y: sy + r.top, W, H };
      }
    }
    return null;
  });
  check("fann autt svæði fyrir rétthyrning", !!svaedi, "ekkert");
  const sR = await stada();
  await page.keyboard.press("r");
  await page.mouse.move(svaedi.x, svaedi.y);
  await page.mouse.down();
  await page.mouse.move(svaedi.x + svaedi.W / 2, svaedi.y + svaedi.H / 2, { steps: 5 });
  await page.mouse.move(svaedi.x + svaedi.W, svaedi.y + svaedi.H, { steps: 5 });
  await shot("08b_retthyrningur.png");
  await page.mouse.up();
  await page.waitForTimeout(250);
  const sR2 = await stada();
  const R4 = await Promise.all(sR2.ids.filter((i) => !sR.ids.includes(i)).map(veggur));
  const rp = R4.map(heims);
  check(
    "R: dreginn kassi → fjórir veggir sem mætast í hornunum",
    R4.length === 4 && rp.every((p, i) => { const q = rp[(i + 1) % 4]; return p[2] === q[0] && p[3] === q[1]; }),
    JSON.stringify(rp)
  );
  // vinstri og hægri hlið rétthyrningsins
  const vinstri = R4[rp.findIndex((p) => p[0] === p[2] && p[0] === Math.min(...rp.map((q) => q[0])))];
  const haegri = R4[rp.findIndex((p) => p[0] === p[2] && p[0] === Math.max(...rp.map((q) => q[0])))];
  const vp = heims(vinstri), hp = heims(haegri);
  // W: veggur frá vinstri hlið (smellur á línu) hálfa leið — Enter lýkur
  await page.keyboard.press("w");
  const A = await skja([vp[0], (vp[1] + vp[3]) / 2]);
  const Bx = await skja([(vp[0] + hp[0]) / 2, (vp[1] + vp[3]) / 2]);
  await page.mouse.move(A.x + 4, A.y + 2, { steps: 3 });
  await page.mouse.click(A.x + 4, A.y + 2);
  await page.keyboard.down("Shift");
  await page.mouse.move(Bx.x, Bx.y + 5, { steps: 4 });
  await page.mouse.click(Bx.x, Bx.y + 5);
  await page.keyboard.up("Shift");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const sW = await stada();
  const stuttId = sW.ids.find((i) => !sR2.ids.includes(i));
  check("W + Enter: einn veggur frá vinstri hlið inn á miðju", !!stuttId && sW.veggir === sR2.veggir + 1 && heims(await veggur(stuttId))[0] === vp[0], JSON.stringify(sW.veggir));
  // L: velja stutta vegginn, Shift+smella hægri hlið → L lengir hann að henni
  await page.keyboard.press("v");
  const sp = heims(await veggur(stuttId));
  const sM = await skja([(sp[0] + sp[2]) / 2, sp[1]]);
  await page.mouse.click(sM.x, sM.y);
  const hM = await skja([hp[0], (hp[1] * 3 + hp[3]) / 4]);
  await page.keyboard.down("Shift");
  await page.mouse.click(hM.x, hM.y);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(150);
  check("Shift+smellur bætir hægri hliðinni við valið (2 veggir)", JSON.stringify((await stada()).sel) === JSON.stringify([stuttId, haegri.id]), JSON.stringify((await stada()).sel));
  await page.keyboard.press("l");
  await page.waitForTimeout(200);
  const lengdur = heims(await veggur(stuttId));
  check("L: veggurinn lengdur nákvæmlega að miðlínu hægri hliðarinnar", Math.abs(lengdur[2] - hp[0]) < 1e-9 && lengdur[0] === vp[0], JSON.stringify({ lengdur, hp }));
  // S + J: kljúfa efri hliðina og sameina hana aftur
  const efri = R4[rp.findIndex((p) => p[1] === p[3] && p[1] === Math.min(...rp.map((q) => q[1])))];
  const ep = heims(efri);
  await page.keyboard.press("Escape");
  await page.keyboard.press("s");
  const eM = await skja([ep[0] + (ep[2] - ep[0]) * 0.37, ep[1]]);
  await page.mouse.click(eM.x, eM.y);
  await page.waitForTimeout(200);
  const sS = await stada();
  check("S: efri hliðin klofin (val = báðir helmingar)", sS.veggir === sW.veggir + 1 && sS.sel.length === 2 && !sS.ids.includes(efri.id), JSON.stringify(sS.sel));
  await page.keyboard.press("j");
  await page.waitForTimeout(200);
  const sJ = await stada();
  const sam = sJ.sel.length === 1 ? heims(await veggur(sJ.sel[0])) : null;
  check(
    "J: helmingarnir sameinaðir aftur í einn vegg með sömu endum",
    sJ.veggir === sW.veggir && sam && Math.abs(Math.min(sam[0], sam[2]) - Math.min(ep[0], ep[2])) < 1e-6 && Math.abs(Math.max(sam[0], sam[2]) - Math.max(ep[0], ep[2])) < 1e-6 && Math.abs(sam[1] - ep[1]) < 1e-6,
    JSON.stringify({ sam, ep })
  );
  // Ctrl+A velur alla veggi (aðeins veggi)
  await page.keyboard.press("v");
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(150);
  const sA = await stada();
  check("Ctrl+A velur alla veggi — og ekkert annað", sA.sel.length === sA.veggir && sA.sel.every((i) => sA.ids.includes(i)), JSON.stringify({ sel: sA.sel.length, veggir: sA.veggir }));
  await page.keyboard.press("Escape");
  // B: eyða í kassa — dregið frá hægri til vinstri (snertir) yfir rétthyrninginn
  await page.keyboard.press("b");
  await page.mouse.move(svaedi.x + svaedi.W + 14, svaedi.y + svaedi.H + 14);
  await page.mouse.down();
  await page.mouse.move(svaedi.x + svaedi.W / 2, svaedi.y + svaedi.H / 2, { steps: 5 });
  await page.mouse.move(svaedi.x - 14, svaedi.y - 14, { steps: 5 });
  await shot("08c_eyda_i_kassa.png");
  await page.mouse.up();
  await page.waitForTimeout(250);
  const sB = await stada();
  check("B (Eyða í kassa): rétthyrningurinn og veggurinn inni í honum eyddust (5)", sB.veggir === sJ.veggir - 5 && sR.ids.every((i) => sB.ids.includes(i)), JSON.stringify({ fyrir: sJ.veggir, eftir: sB.veggir }));
  await page.keyboard.press("v");

  // ── 6) vegg breytt í gler (smellur + „Gler" í veggjastikunni) + ⌘Z / ⌘Y ────────────────────────────────
  const gv = kv; // annar langur veggur: finna nýjan sem er ekki klofni
  const g = await page.evaluate((undan) => {
    const s = window.__tpStore.getState(), cam = s.camera;
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    const W = s.objects.filter((o) => o.type === "polyline" && (o.veggur || o.layerId === "veggir") && o.points.length === 4 && !o.veggTegund && !undan.includes(o.id));
    const T = s.objects.filter((o) => o.type === "symbol");
    const L = (o) => Math.hypot(o.points[2] - o.points[0], o.points[3] - o.points[1]);
    for (const o of W.sort((a, c) => L(c) - L(a))) {
      const wx = o.points[0] + o.x + (o.points[2] - o.points[0]) * 0.5, wy = o.points[1] + o.y + (o.points[3] - o.points[1]) * 0.5;
      const sx = wx * cam.scale + cam.x, sy = wy * cam.scale + cam.y;
      if (sx < 360 || sx > r.width - 380 || sy < 220 || sy > r.height - 140) continue;
      if (T.some((t) => Math.hypot(t.x + t.size / 2 - wx, t.y + t.size / 2 - wy) * cam.scale < 40)) continue;
      return { id: o.id, x: sx + r.left, y: sy + r.top };
    }
    return null;
  }, [gv.id, ...klofnir]);
  await page.mouse.click(g.x, g.y);
  await page.waitForTimeout(150);
  const stika = page.getByRole("toolbar", { name: "Leiðrétta veggi" });
  await stika.getByRole("button", { name: "Gler" }).click();
  await page.waitForTimeout(200);
  const gg = await veggur(g.id);
  check("vegg breytt í gler (tegund + blár litur)", gg.veggTegund === "gler" && gg.stroke.toLowerCase() === "#2563eb", JSON.stringify([gg.veggTegund, gg.stroke]));
  await shot("09_gler.png");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  check("⌘Z: aftur venjulegur veggur", !(await veggur(g.id)).veggTegund, JSON.stringify((await veggur(g.id)).veggTegund));
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(150);
  check("⌘Y: aftur gler", (await veggur(g.id)).veggTegund === "gler", "");
  // dráttur á heilum vegg (færa) + ⌘Z
  const gp0 = heims(await veggur(g.id));
  const gM = await skja([(gp0[0] + gp0[2]) / 2, (gp0[1] + gp0[3]) / 2]);
  await page.mouse.move(gM.x, gM.y);
  await page.mouse.down();
  await page.mouse.move(gM.x + 15, gM.y + 15, { steps: 4 });
  await page.mouse.move(gM.x + 30, gM.y + 30, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const gp1 = heims(await veggur(g.id));
  const gL = (p) => Math.hypot(p[2] - p[0], p[3] - p[1]);
  const gfaert = Math.hypot(gp1[0] - gp0[0], gp1[1] - gp0[1]) * (await page.evaluate(() => window.__tpStore.getState().camera.scale));
  check("dráttur á vegg færir hann heilan (sama lengd, > 20 skjádílar)", Math.abs(gL(gp1) - gL(gp0)) < 1e-6 && gfaert > 20, JSON.stringify({ gp0, gp1, gfaert }));
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  check("⌘Z: veggurinn aftur á sinn stað", heims(await veggur(g.id)).every((v, i) => Math.abs(v - gp0[i]) < 1e-9), "");
  await page.keyboard.press("Escape");

  // ── 7) „Greina veggi": línuflokkar + Bæta við ────────────────────────────────────────────────────────
  const s7 = await stada();
  await spjald.getByRole("button", { name: /Greina veggi/ }).click();
  const dlg = page.getByRole("dialog", { name: "Greina veggi" });
  const nidurst = dlg.locator("[data-greining-nidurstada]");
  await nidurst.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => !/Reikna/.test(document.querySelector("[data-greining-nidurstada]")?.textContent || "Reikna"), null, { timeout: 60000 });
  const flokkar = await dlg.locator("[data-flokkur]").evaluateAll((els) => els.map((e) => ({ l: e.getAttribute("data-flokkur"), a: e.getAttribute("aria-pressed"), t: e.textContent })));
  console.log("   línuflokkar:", JSON.stringify(flokkar));
  check("línuflokkar PDF-sins listaðir (0,24 · 0,48 · 0,66 · 0,96 · 1,38 pt)", ["0.24", "0.48", "0.66", "0.96", "1.38"].every((l) => flokkar.some((f) => f.l === l)), JSON.stringify(flokkar.map((f) => f.l)));
  check("0,48 pt er tillagan og valinn", flokkar.find((f) => f.l === "0.48")?.a === "true" && flokkar.filter((f) => f.a === "true").length === 1, JSON.stringify(flokkar));
  const t048 = (await nidurst.innerText()).replace(/\s+/g, " ");
  console.log("   0,48:", t048);
  const fjoldiVeggja = (t) => { const m = t.match(/(\d+) veggi?r?(?: · (\d+) gler)?/); return m ? Number(m[1]) + Number(m[2] || 0) : -1; };
  check("0,48 pt → ~63 veggir úr 777 línum, þekja ≥ 95 %", fjoldiVeggja(t048) >= 55 && fjoldiVeggja(t048) <= 75 && /777 línum/.test(t048) && Number((t048.match(/Þekja: ([\d,]+)/) || [])[1]?.replace(",", ".")) >= 95, t048);
  const forsk048 = await page.evaluate(() => document.querySelector("[data-veggjaritill]") !== null);
  check("forskoðun teiknuð á borðið (yfirlag)", forsk048, "");
  await shot("10_greining_048.png");
  // 0,24 með: margfalt fleiri línur og „veggir" úr skástrikun — forskoðunin sýnir það áður en nokkru er bætt við
  await dlg.locator('[data-flokkur="0.24"]').click();
  await page.waitForFunction(() => /\d+ línum/.test(document.querySelector("[data-greining-nidurstada]")?.textContent || "") && !/Reikna/.test(document.querySelector("[data-greining-nidurstada]")?.textContent || ""), null, { timeout: 120000 });
  await page.waitForTimeout(300);
  const t2 = (await nidurst.innerText()).replace(/\s+/g, " ");
  console.log("   0,24 + 0,48:", t2);
  check("0,24 + 0,48 valdir saman: fleiri línur og fleiri veggir í forskoðun", fjoldiVeggja(t2) > fjoldiVeggja(t048) && !/777 línum/.test(t2), t2);
  await shot("11_greining_024_og_048_forskodun.png");
  await dlg.locator('[data-flokkur="0.24"]').click();
  await page.waitForFunction(() => /777 línum/.test(document.querySelector("[data-greining-nidurstada]")?.textContent || ""), null, { timeout: 60000 });
  const baeta = dlg.getByRole("button", { name: /^Bæta við/ });
  const baetaTexti = await baeta.innerText();
  const plus = Number((baetaTexti.match(/\+(\d+)/) || [])[1]);
  console.log("   ", baetaTexti, "|", await dlg.getByRole("button", { name: /^Skipta út/ }).innerText());
  const fyrstur = await baeta.evaluate((e) => e.parentElement.querySelector("button") === e);
  check("Bæta við er sjálfgefið (fyrsti hnappurinn) og bætir aðeins óþöktu við (5 eyddir + fáeinir)", plus >= 5 && plus <= 12 && fyrstur, baetaTexti);
  await baeta.click();
  await page.waitForTimeout(400);
  const s8 = await stada();
  check("Bæta við: veggjum fjölgar um það sem sýnt var — engu eytt", s8.veggir === s7.veggir + plus && s7.ids.every((i) => s8.ids.includes(i)), JSON.stringify({ fyrir: s7.veggir, eftir: s8.veggir, plus }));
  check("leiðréttingar haldast (glerveggurinn sem var settur er enn gler)", (await veggur(g.id))?.veggTegund === "gler", "");
  check("teiknuðu veggirnir þrír haldast", nyjar.every((i) => s8.ids.includes(i)), "");
  await shot("12_eftir_baeta_vid.png");

  // Skipta út + ⌘Z (eitt skref)
  await spjald.getByRole("button", { name: /Greina veggi/ }).click();
  await nidurst.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => /777 línum/.test(document.querySelector("[data-greining-nidurstada]")?.textContent || ""), null, { timeout: 60000 });
  const bt = await dlg.getByRole("button", { name: /^Bæta við/ }).innerText();
  check("önnur greining ofan á: ekkert tvítekið (+0 eða nánast)", Number((bt.match(/\+(\d+)/) || [])[1]) <= 2, bt);
  const skiptaT = await dlg.getByRole("button", { name: /^Skipta út/ }).innerText();
  await dlg.getByRole("button", { name: /^Skipta út/ }).click();
  await page.waitForTimeout(400);
  const s9 = await stada();
  const skiptM = skiptaT.match(/(\d+) → (\d+)/);
  check("Skipta út: veggjum teikningarinnar skipt út fyrir greininguna", skiptM && s9.veggir === Number(skiptM[2]) && s9.gler === 5, JSON.stringify({ skiptaT, n: s9.veggir, gler: s9.gler }));
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  const s10 = await stada();
  check("⌘Z afturkallar Skipta út í einu skrefi", s10.veggir === s8.veggir && s8.ids.every((i) => s10.ids.includes(i)), JSON.stringify({ n: s10.veggir, vænt: s8.veggir }));

  // „Sýna aðeins veggi" (myndskreyting) og hjálparlistinn
  await spjald.getByRole("button", { name: "Sýna aðeins veggi" }).click();
  await page.waitForTimeout(400);
  await shot("13_adeins_veggir_eftir.png");
  const synileg = await page.evaluate(() => window.__tpStore.getState().layers.filter((l) => l.visible).map((l) => l.id));
  check("„Sýna aðeins veggi“ felur öll lög nema Veggir", synileg.length === 1 && synileg[0] === "veggir", JSON.stringify(synileg));
  await spjald.getByRole("button", { name: "Sýna aðeins veggi" }).click();
  await page.keyboard.press("?");
  await page.waitForTimeout(250);
  check("? opnar flýtilyklana", await page.getByRole("dialog", { name: "Flýtilyklar veggjaritils" }).isVisible(), "");
  await shot("14_flytilyklar.png");
  await page.keyboard.press("?");

  // ── 8) Vista í úttekt (gripið) ──────────────────────────────────────────────────────────────────────────
  const s11 = await stada();
  const fyrirVistun = gripin.length;
  await page.getByRole("button", { name: /Vista í úttekt/ }).click();
  await page.getByText(/merki vistuð/).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  const skrif = gripin.slice(fyrirVistun).filter((x) => x.method === "PATCH" || x.method === "POST");
  check("vistun reyndi að skrifa teikning_bord (gripið, ekki sent)", skrif.length === 1, JSON.stringify(gripin.map((x) => x.method)));
  const sent = JSON.parse(skrif[0].body);
  const haed = sent.haedir.find((h) => h.id === HAED);
  const VL = haed.veggjaLinur || [];
  console.log("   veggjaLinur:", VL.length, "leidrett:", JSON.stringify(haed.leidrett));
  check("veggjaLinur = allir veggir borðsins", VL.length === s11.veggir, JSON.stringify({ VL: VL.length, bord: s11.veggir }));
  check("leidrett.af = turbopaint", haed.leidrett && haed.leidrett.af === "turbopaint" && !!haed.leidrett.kl, JSON.stringify(haed.leidrett));
  check("tegund fylgir (gler ≥ 6: 5 úr PDF + sá sem var settur)", VL.filter((v) => v.tegund === "gler").length >= 6 && VL.every((v) => ["veggur", "gler", "hurd"].includes(v.tegund)), JSON.stringify(VL.map((v) => v.tegund)));
  const mynd = s0.mynd;
  const tilFrum = (x, y) => [Math.round((x - mynd.x) * (4244 / mynd.w)), Math.round((y - mynd.y) * (6006 / mynd.h))];
  const fp = tilFrum(n1[0], n1[1]);
  check("teiknaði veggurinn er í veggjaLinur (dílar frummyndar)", VL.some((v) => Math.abs(v.p[0] - fp[0]) <= 1 && Math.abs(v.p[1] - fp[1]) <= 1), JSON.stringify(fp));
  check(
    "aðrar hæðir óbreyttar",
    fersk && sent.haedir.length === fersk.haedir.length && sent.haedir.filter((h) => h.id !== HAED).every((h) => JSON.stringify(h) === JSON.stringify(fersk.haedir.find((x) => x.id === h.id))),
    ""
  );
  await shot("15_vistad.png");

  check("engar villur á síðunni", errs.length === 0, errs.join(" | "));
  console.log(`\n${ok.length} í lagi, ${bad.length} brást`);
  if (bad.length) console.log("BRÁST:\n" + bad.join("\n"));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
