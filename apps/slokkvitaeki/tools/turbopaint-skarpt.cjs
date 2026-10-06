/* TurboPaint 3. áfangi (B) — skörp skönnun: Center Hótel Þingholt (fyrirtæki 199) opnuð í TurboPaint úr úttektinni,
 * í báðum innflutningsgæðum (Staðall 7.2k og Há gæði 12.5k), og borðið mælt og myndað.
 *
 *   node tools/turbopaint-skarpt.cjs [http://localhost:4123] [úttaksmappa] [merki: fyrir|eftir] [hæð]
 *
 * Fyrir hvert gæðastig: stærð myndarinnar á borðinu og eignarinnar (dílar), staða allra tákna (borðhnit), og aðdráttur
 * á fjóra staði (merki hæðarinnar + þrjú prófmerki inni í húsinu + texta) — `skarpt-<merki>-<gæði>-*.png` og
 * `skarpt-<merki>-<gæði>.json`. Samanburðurinn (fyrir ↔ eftir) er gerður með `--bera <fyrir.json> <eftir.json>`.
 *
 * ENGIN skrif: öll skrif í Supabase (rest + storage, allt annað en GET/HEAD) eru gripin og svarað 200. Lestur
 * teikning_bord fer í gegn en er AUKINN (aldrei skrifaður) með þremur prófmerkjum á hæðinni svo staðsetning merkja sé
 * borin saman víðar en á eina merkinu sem hæðin á. */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = process.argv[3] || "C:/Users/Slokkvitaeki/teikning-greining/turbopaint_afangi3";
const MERKI = process.argv[4] || "eftir";
const HAED = process.argv[5] || "hc199x0e7ad";
const CID = 199;
fs.mkdirSync(OUT, { recursive: true });

// Prófmerki í dílum frummyndar (JPEG skjalasafnsins, 6006 × 4251) — inni í húsinu (skurður 601,340 3976×2091).
const PROFMERKI = [
  { unitId: "s:segull:prof1", kind: "sign", sign: "segull", x: 1400, y: 900, color: "#c93c1d", rot: 0 },
  { unitId: "s:bjalla:prof2", kind: "sign", sign: "bjalla", x: 2700, y: 1500, color: "#c93c1d", rot: 0 },
  { unitId: "s:rafmagn:prof3", kind: "sign", sign: "rafmagn", x: 4100, y: 2100, color: "#eab308", rot: 0 },
];

async function keyra(gaedi) {
  const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const villur = [];
  page.on("pageerror", (e) => villur.push(e.message));
  page.on("console", (m) => {
    if (/\[skonnun\]/.test(m.text())) console.log("   " + m.text().slice(0, 240));
  });
  await page.addInitScript((q) => {
    const t = setInterval(() => {
      const s = window.__tpStore;
      if (s) {
        s.getState().setImportQuality(q);
        clearInterval(t);
      }
    }, 5);
  }, gaedi);
  const gripin = [];
  let permalink = "";
  await ctx.route(/supabase\.co\/(rest|storage)\//, async (route) => {
    const req = route.request();
    const m = req.method();
    if (m !== "GET" && m !== "HEAD") {
      gripin.push(m + " " + req.url().split("?")[0]);
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (!/teikning_bord/.test(req.url())) return route.continue();
    const res = await route.fetch();
    let j;
    try {
      j = await res.json();
    } catch {
      return route.fulfill({ response: res });
    }
    const rod = Array.isArray(j) ? j[0] : j;
    const h = rod && rod.haedir && rod.haedir.find((x) => x.id === HAED);
    if (h) h.markers = [...(h.markers || []), ...PROFMERKI];
    if (h && h.image_url) permalink = new URL(h.image_url, "https://slokkvitaeki.netlify.app").searchParams.get("url") || permalink;
    const headers = { ...res.headers() };
    delete headers["content-length"];
    delete headers["content-encoding"];
    return route.fulfill({ status: res.status(), headers, body: JSON.stringify(j) });
  });
  // VARALEID=1: teikn-pdf (Netlify) svarar 502 — TIF-ið á þá að koma um fetch-plan?prefer=tif
  // VARALEID=2: TIF-ið fæst hvergi — JPEG skjalasafnsins á að koma á borðið eins og áður
  if (process.env.VARALEID) await ctx.route(/teikn-pdf/, (route) => route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"prófun"}' }));
  if (process.env.VARALEID === "2") await ctx.route(/fetch-plan\?prefer=tif/, (route) => route.fulfill({ status: 502, contentType: "application/json", body: '{"error":"prófun"}' }));
  const svor = [];
  page.on("response", (r) => {
    if (/fetch-plan|teikn-pdf|teikn-mynd/.test(r.url())) svor.push(`${r.status()} ${r.headers()["content-type"]} ${r.headers()["content-length"] || "?"} ${r.url().split("?")[0]}${/prefer=\w+/.exec(r.url())?.[0] ? " " + /prefer=\w+/.exec(r.url())[0] : ""}`);
  });

  const t0 = Date.now();
  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&ham=slokkvitaeki`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 90000 });
  while (Date.now() - t0 < 240000) {
    const st = await page.evaluate((cid) => {
      const s = window.__tpStore?.getState();
      return s && { m: s.objects.some((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid), prog: s.importProgress };
    }, CID);
    if (st && st.m && !st.prog) break;
    await page.waitForTimeout(700);
  }
  const timi = (Date.now() - t0) / 1000;
  await page.waitForTimeout(2500);
  const toasts = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent).join(" | "));
  const info = await page.evaluate(async (cid) => {
    const s = window.__tpStore.getState();
    const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
    // stærð eignarinnar sjálfrar (dílar)
    const img = [...document.querySelectorAll("img")].find((i) => i.src && i.src.startsWith("blob:"));
    let dilar = null;
    try {
      // Konva-myndin sem borðið teiknar (stærsta myndin á sviðinu)
      const K = window.Konva;
      const node = K && K.stages && K.stages[0] ? K.stages[0].find("Image").map((n) => n.image()).filter(Boolean).sort((a, c) => (c.naturalWidth || c.width) - (a.naturalWidth || a.width))[0] : null;
      if (node) dilar = { b: node.naturalWidth || node.width, h: node.naturalHeight || node.height };
    } catch (e) {
      dilar = { villa: String(e) };
    }
    return {
      mynd: { x: m.x, y: m.y, b: m.width, h: m.height, nafn: m.name, uttekt: m.uttekt, heimild: m.heimild || null, frumAssetId: m.frumAssetId || null },
      dilar,
      img: !!img,
      takn: s.objects
        .filter((o) => o.type === "symbol")
        .map((t) => ({ u: String(t.uttektUnitId), x: +t.x.toFixed(3), y: +t.y.toFixed(3), size: t.size })),
    };
  }, CID);
  // JÖFNUN UNDIR HVERJU MERKI: teikningin á borðinu (eignin, hvað sem hún er — JPEG eða TIF) borin saman við JPEG
  // skjalasafnsins (sem merkin eru vistuð í) á 120 × 120 díla reit um merkið. Afgangshliðrun fundin með ⅓ díls
  // nákvæmni (±6 dílar) — 0 = merkið stendur á nákvæmlega sama stað teikningarinnar og í Teikning-glugganum.
  info.jofnun = await page.evaluate(
    async ({ cid, permalink }) => {
      const s = window.__tpStore.getState();
      const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
      const img = window.Konva.stages[0].find("Image").map((n) => n.image()).filter(Boolean).sort((a, c) => (c.naturalWidth || c.width) - (a.naturalWidth || a.width))[0];
      const jpeg = await createImageBitmap(await (await fetch("/api/turbopaint/fetch-plan?prefer=image&url=" + encodeURIComponent(permalink))).blob());
      const fb = m.uttekt.frumB, fh = m.uttekt.frumH;
      const ka = (img.naturalWidth || img.width) / fb, kb = (img.naturalHeight || img.height) / fh;
      const N = 120, D = 6, SUB = 3, G = N * SUB, M = (N + 2 * D) * SUB;
      const gra = (cv) => {
        const d = cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data, a = new Float32Array(cv.width * cv.height);
        for (let i = 0; i < a.length; i++) a[i] = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2];
        return a;
      };
      const strigi = (w, h) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.fillStyle = "#fff";
        x.fillRect(0, 0, w, h);
        x.imageSmoothingQuality = "high";
        return [c, x];
      };
      const ut = [];
      for (const t of s.objects.filter((o) => o.type === "symbol")) {
        const a = ((t.rotation || 0) * Math.PI) / 180, hs = t.size / 2;
        const cx = ((t.x + hs * Math.cos(a) - hs * Math.sin(a) - m.x) / m.width) * fb;
        const cy = ((t.y + hs * Math.sin(a) + hs * Math.cos(a) - m.y) / m.height) * fh;
        const x0 = Math.round(cx - N / 2), y0 = Math.round(cy - N / 2);
        const [ja, jx] = strigi(G, G);
        jx.drawImage(jpeg, x0, y0, N, N, 0, 0, G, G);
        const A = gra(ja);
        const [tb, tx] = strigi(M, M);
        tx.drawImage(img, (x0 - D) * ka, (y0 - D) * kb, (N + 2 * D) * ka, (N + 2 * D) * kb, 0, 0, M, M);
        const B = gra(tb);
        const fyl = (dx, dy, sk) => {
          let sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, n = 0;
          for (let y = 0; y < G; y += sk) {
            const ra = y * G, rb = (y + D * SUB + dy) * M + D * SUB + dx;
            for (let x = 0; x < G; x += sk) {
              const p = A[ra + x], q = B[rb + x];
              sa += p; sb += q; sab += p * q; saa += p * p; sbb += q * q; n++;
            }
          }
          const v = (saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2);
          return v > 0 ? (sab / n - (sa / n) * (sb / n)) / Math.sqrt(v) : 0;
        };
        let best = { dx: 0, dy: 0, c: -2 };
        for (let dy = -D * SUB; dy <= D * SUB; dy += SUB) for (let dx = -D * SUB; dx <= D * SUB; dx += SUB) { const c = fyl(dx, dy, 3); if (c > best.c) best = { dx, dy, c }; }
        const g = best;
        for (let dy = g.dy - SUB + 1; dy <= g.dy + SUB - 1; dy++) for (let dx = g.dx - SUB + 1; dx <= g.dx + SUB - 1; dx++) { if (Math.abs(dx) > D * SUB || Math.abs(dy) > D * SUB) continue; const c = fyl(dx, dy, 2); if (c > best.c) best = { dx, dy, c }; }
        ut.push({ u: String(t.uttektUnitId), cx: Math.round(cx), cy: Math.round(cy), dx: +(best.dx / SUB).toFixed(2), dy: +(best.dy / SUB).toFixed(2), fylgni: +best.c.toFixed(3), ovidmid: +fyl(0, 0, 2).toFixed(3) });
      }
      jpeg.close();
      return ut;
    },
    { cid: CID, permalink }
  );
  // Aðdráttur: miðja hvers merkis (táknið hulið svo teikningin undir sjáist) + textareitur í húsinu.
  const stadir = [
    ...info.takn.map((t) => ({ nafn: "merki-" + t.u.split(":")[1], wx: t.x + t.size / 2, wy: t.y + t.size / 2 })),
    { nafn: "texti", wx: info.mynd.x + (1700 / 6006) * info.mynd.b, wy: info.mynd.y + (1200 / 4251) * info.mynd.h },
  ];
  const myndir = [];
  for (const st of stadir) {
    const kvardi = 2.4;
    const r = await page.evaluate(
      ([wx, wy, k]) => {
        const s = window.__tpStore.getState();
        const el = document.querySelector(".tp-sheet").getBoundingClientRect();
        s.setCamera({ x: el.width / 2 - wx * k, y: el.height / 2 - wy * k, scale: k });
        // táknin falin svo teikningin undir þeim sjáist; aðeins skjárinn (ekkert vistað — skrif gripin)
        document.querySelectorAll(".tp-sheet").forEach((n) => n.setAttribute("data-skarpt", "1"));
        return { left: el.left, top: el.top, w: el.width, h: el.height };
      },
      [st.wx, st.wy, kvardi]
    );
    await page.evaluate(() => {
      const s = window.__tpStore.getState();
      const ids = s.objects.filter((o) => o.type === "symbol" && !o.hidden).map((o) => o.id);
      window.__faldir = ids;
      if (ids.length) s.updateObjects(ids, (o) => ({ ...o, hidden: true }), false);
    });
    await page.waitForTimeout(900);
    const skra = `skarpt-${MERKI}-${gaedi}-${st.nafn}.png`;
    await page.screenshot({ path: path.join(OUT, skra), clip: { x: r.left + r.w / 2 - 300, y: r.top + r.h / 2 - 200, width: 600, height: 400 } });
    await page.evaluate(() => {
      const s = window.__tpStore.getState();
      if (window.__faldir?.length) s.updateObjects(window.__faldir, (o) => ({ ...o, hidden: false }), false);
    });
    myndir.push(skra);
  }
  // yfirlit: rammað á húsið með táknunum
  await page.evaluate((cid) => {
    const s = window.__tpStore.getState();
    const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
    const el = document.querySelector(".tp-sheet").getBoundingClientRect();
    const t = m.uttekt, sk = t.skurdur, kx = m.width / t.frumB, ky = m.height / t.frumH;
    const w = sk.w * kx, h = sk.h * ky, k = Math.min(el.width / w, el.height / h) * 0.92;
    s.setCamera({ x: el.width / 2 - (m.x + (sk.x + sk.w / 2) * kx) * k, y: el.height / 2 - (m.y + (sk.y + sk.h / 2) * ky) * k, scale: k });
  }, CID);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, `skarpt-${MERKI}-${gaedi}-yfirlit.png`) });
  // 3D á skönnuðu borði: kvarðinn kemur úr blaðstærð skjalasafnsins (teikn-blad: A2, 1:100 → ~101 díll á metra)
  let thrividd = null;
  if (MERKI === "eftir" && gaedi === "print") {
    await page.getByRole("button", { name: "3D", exact: true }).first().click();
    await page.waitForFunction(() => document.querySelector("[data-hus3d] canvas"), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    thrividd = await page.evaluate(() => {
      const g = document.querySelector("[data-hus3d]");
      return g ? JSON.parse(g.dataset.hus3d) : null;
    });
    await page.screenshot({ path: path.join(OUT, "3d-thingholt-kjallari.png") });
    await page.keyboard.press("Escape");
  }
  const nidur = { merki: MERKI, gaedi, timi, toasts, svor, gripin, villur, ...info, myndir, thrividd };
  fs.writeFileSync(path.join(OUT, `skarpt-${MERKI}-${gaedi}.json`), JSON.stringify(nidur, null, 1));
  await b.close();
  return nidur;
}

async function bera(a, c) {
  const A = JSON.parse(fs.readFileSync(a, "utf8")), C = JSON.parse(fs.readFileSync(c, "utf8"));
  console.log(`${A.merki}/${A.gaedi}: mynd ${A.mynd.b}×${A.mynd.h} (eign ${A.dilar && A.dilar.b}×${A.dilar && A.dilar.h})`);
  console.log(`${C.merki}/${C.gaedi}: mynd ${C.mynd.b}×${C.mynd.h} (eign ${C.dilar && C.dilar.b}×${C.dilar && C.dilar.h})`);
  let mest = 0;
  for (const t of A.takn) {
    const s = C.takn.find((x) => x.u === t.u);
    if (!s) {
      console.log("  vantar", t.u);
      mest = Infinity;
      continue;
    }
    // staða í hlutfalli af myndinni (borðin geta verið misstór) → dílar frummyndar
    const fa = { x: ((t.x + t.size / 2 - A.mynd.x) / A.mynd.b) * A.mynd.uttekt.frumB, y: ((t.y + t.size / 2 - A.mynd.y) / A.mynd.h) * A.mynd.uttekt.frumH };
    const fc = { x: ((s.x + s.size / 2 - C.mynd.x) / C.mynd.b) * C.mynd.uttekt.frumB, y: ((s.y + s.size / 2 - C.mynd.y) / C.mynd.h) * C.mynd.uttekt.frumH };
    const d = Math.hypot(fa.x - fc.x, fa.y - fc.y);
    mest = Math.max(mest, d);
    console.log(`  ${t.u.padEnd(34)} ${fa.x.toFixed(2)},${fa.y.toFixed(2)} ↔ ${fc.x.toFixed(2)},${fc.y.toFixed(2)}  frávik ${d.toFixed(3)} díll frummyndar`);
  }
  console.log("mesta frávik:", mest.toFixed(3), "díll frummyndar");
}

/** Hlið við hlið: fyrir (JPEG, Staðall) ↔ eftir (TIF, Há gæði) fyrir hvern aðdráttarreit. */
async function hlidVidHlid() {
  const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
  const page = await (await b.newContext({ viewport: { width: 1240, height: 470 } })).newPage();
  const til = fs.readdirSync(OUT).filter((f) => /^skarpt-fyrir-standard-.*\.png$/.test(f));
  for (const f of til) {
    const nafn = f.replace("skarpt-fyrir-standard-", "").replace(".png", "");
    const eftir = `skarpt-eftir-print-${nafn}.png`, fyrirTif = `skarpt-fyrir-print-${nafn}.png`;
    if (!fs.existsSync(path.join(OUT, eftir))) continue;
    const src = (x) => "data:image/png;base64," + fs.readFileSync(path.join(OUT, x)).toString("base64");
    const myndir = [[f, "Fyrir — Staðall (JPEG 6006 px)"], [fs.existsSync(path.join(OUT, fyrirTif)) && nafn !== "yfirlit" ? fyrirTif : null, "Fyrir — Há gæði (hrátt TIF, á hvolfi)"], [eftir, "Eftir — TIF-frumrit stillt við JPEG-ið"]].filter((x) => x[0]);
    await page.setViewportSize({ width: nafn === "yfirlit" ? 1640 : 620 * myndir.length + 20, height: nafn === "yfirlit" ? 600 : 470 });
    await page.setContent(`<body style="margin:0;background:#14120f;font:600 14px system-ui;color:#f1ede4;display:flex;gap:8px;padding:8px">${myndir
      .map(([x, t]) => `<figure style="margin:0;flex:1"><figcaption style="padding:4px 2px">${t}</figcaption><img src="${src(x)}" style="width:100%;display:block"></figure>`)
      .join("")}</body>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `skarpt-samanburdur-${nafn}.png`), fullPage: true });
  }
  await b.close();
}

(async () => {
  if (process.argv.includes("--hlid")) {
    await hlidVidHlid();
    return;
  }
  if (process.argv.includes("--bera")) {
    const i = process.argv.indexOf("--bera");
    await bera(process.argv[i + 1], process.argv[i + 2]);
    return;
  }
  for (const g of ["standard", "print"]) {
    console.log(`── ${MERKI} · ${g}`);
    const n = await keyra(g);
    console.log(`   ${n.timi.toFixed(1)} s · mynd ${n.mynd.b}×${n.mynd.h} · eign ${JSON.stringify(n.dilar)} · ${n.takn.length} tákn`);
    for (const j of n.jofnun) {
      console.log(`   undir ${j.u.padEnd(30)} (${j.cx}, ${j.cy}): afgangshliðrun ${j.dx}, ${j.dy} díll · fylgni ${j.fylgni} (óhliðrað ${j.ovidmid})`);
    }
    console.log("   svör:", n.svor.join(" ; "));
    console.log("   skilaboð:", n.toasts.slice(0, 300));
    console.log("   gripin skrif:", n.gripin.length, n.gripin.slice(0, 4).join(" ; "));
    if (n.thrividd) console.log("   3D:", JSON.stringify(n.thrividd));
    if (n.villur.length) console.log("   VILLUR:", n.villur.join(" | "));
  }
})();
