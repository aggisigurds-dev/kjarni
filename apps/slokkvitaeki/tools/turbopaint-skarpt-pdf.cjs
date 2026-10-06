/* TurboPaint 3. áfangi (B2) — vigur-PDF helst skarpt við aðdrátt. Fiskislóð 41 (fyrirtæki 1612, 1. hæð) opnuð úr
 * úttektinni (vigur-PDF → rastamynd 227 DPI), þysjað á herbergi í 800 %:
 *   1. strax eftir aðdrátt: aðeins rastamyndin (loðin)  → pdf-fyrir.png
 *   2. eftir að myndavélin staðnæmist: skarpa lagið teiknað úr PDF-inu í skjáupplausn → pdf-eftir.png
 *   3. „Hreinsa svæði" (raunverulegur dráttur) yfir hluta skjásins: útstrokaða svæðið helst hvítt — skarpa lagið vekur
 *      ekki upp það sem var strokað út → pdf-hreinsad.png
 * Skerpa mæld sem meðalorka stigulsins (|∇I|²) á sama skjásvæði.
 *
 *   node tools/turbopaint-skarpt-pdf.cjs [http://localhost:4123] [úttaksmappa]
 *
 * ENGIN skrif: allt nema GET/HEAD til Supabase er gripið og svarað 200. */
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
const CID = 1612, HAED = "hmuaaaw83rg9";
fs.mkdirSync(OUT, { recursive: true });
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra ?? ""}`));

/** Skerpa og birta svæðis á skjámynd: meðal |∇I|² og meðalbirta (0–255). */
async function maela(page, skra, r) {
  const src = "data:image/png;base64," + fs.readFileSync(skra).toString("base64");
  return page.evaluate(
    async ({ src, r }) => {
      const i = new Image();
      await new Promise((res) => {
        i.onload = res;
        i.src = src;
      });
      const c = document.createElement("canvas");
      c.width = r.w;
      c.height = r.h;
      const x = c.getContext("2d");
      x.drawImage(i, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      const d = x.getImageData(0, 0, r.w, r.h).data;
      const L = (px, py) => {
        const o = (py * r.w + px) * 4;
        return 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
      };
      let g = 0, s = 0, n = 0, dokk = 0;
      for (let y = 1; y < r.h - 1; y++) {
        for (let xx = 1; xx < r.w - 1; xx++) {
          const gx = L(xx + 1, y) - L(xx - 1, y), gy = L(xx, y + 1) - L(xx, y - 1);
          g += gx * gx + gy * gy;
          const l = L(xx, y);
          s += l;
          if (l < 128) dokk++;
          n++;
        }
      }
      return { skerpa: +(g / n).toFixed(1), birta: +(s / n).toFixed(1), dokkir: dokk };
    },
    { src, r }
  );
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const villur = [];
  page.on("pageerror", (e) => villur.push(e.message));
  const gripin = [];
  await ctx.route(/supabase\.co\/(rest|storage)\//, async (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") return route.continue();
    gripin.push(m);
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  const t0 = Date.now();
  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&b=4244&h=6006&ham=teikning`, { waitUntil: "domcontentloaded" });
  await page.getByText(/merki á teikningunni/).first().waitFor({ timeout: 240000 });
  while (Date.now() - t0 < 240000) {
    const st = await page.evaluate((cid) => {
      const s = window.__tpStore?.getState();
      return s && { m: s.objects.some((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid && o.frumAssetId), prog: s.importProgress };
    }, CID);
    if (st && st.m && !st.prog) break;
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2000);
  // tákn og veggir falin svo teikningin sjálf sjáist (aðeins á skjánum — skrif gripin)
  await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const ids = s.objects.filter((o) => o.type !== "image").map((o) => o.id);
    s.updateObjects(ids, (o) => ({ ...o, hidden: true }), false);
  });
  const mynd = await page.evaluate((cid) => {
    const s = window.__tpStore.getState();
    const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
    const K = window.Konva;
    const img = K.stages[0].find("Image").map((n) => n.image()).filter(Boolean).sort((a, c) => (c.naturalWidth || 0) - (a.naturalWidth || 0))[0];
    return { x: m.x, y: m.y, w: m.width, h: m.height, frum: m.uttekt, frumNafn: m.frumNafn, rasterB: img && img.naturalWidth, ppp: m.pixelsPerPdfPoint };
  }, CID);
  console.log("mynd:", JSON.stringify(mynd));
  // Þéttasti hluti teikningarinnar innan hússins (texti, málsetningar, tákn): gluggi á stærð við skjáinn í 800 %,
  // fundinn á smækkaðri rastamynd
  const kvardi = 8;
  const punktur = await page.evaluate(
    ([cid, k]) => {
      const s = window.__tpStore.getState();
      const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
      const img = window.Konva.stages[0].find("Image").map((n) => n.image()).filter(Boolean).sort((a, c) => (c.naturalWidth || 0) - (a.naturalWidth || 0))[0];
      const el = document.querySelector(".tp-sheet").getBoundingClientRect();
      const t = m.uttekt, sk = t.skurdur, kx = m.width / t.frumB;
      const bx0 = sk.x * kx, by0 = sk.y * kx, bw = sk.w * kx, bh = sk.h * kx; // borðeiningar, miðað við myndina
      const S = 400 / bw; // smækkun
      const c = document.createElement("canvas");
      c.width = Math.round(bw * S);
      c.height = Math.round(bh * S);
      const x = c.getContext("2d", { willReadFrequently: true });
      const kr = img.naturalWidth / m.width;
      x.drawImage(img, bx0 * kr, by0 * kr, bw * kr, bh * kr, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const gw = Math.round(((el.width / k) * 0.5) * S), gh = Math.round(((el.height / k) * 0.5) * S);
      let best = { v: -1, x: 0, y: 0 };
      for (let y = 0; y + gh < c.height; y += 2) {
        for (let xx = 0; xx + gw < c.width; xx += 2) {
          let v = 0;
          for (let j = 0; j < gh; j += 2) for (let i = 0; i < gw; i += 2) { const o = ((y + j) * c.width + xx + i) * 4; if (d[o] + d[o + 1] + d[o + 2] < 600) v++; }
          if (v > best.v) best = { v, x: xx + gw / 2, y: y + gh / 2 };
        }
      }
      return { wx: m.x + bx0 + best.x / S, wy: m.y + by0 + best.y / S };
    },
    [CID, kvardi]
  );
  const r = await page.evaluate(
    ([p, k]) => {
      const s = window.__tpStore.getState();
      const el = document.querySelector(".tp-sheet").getBoundingClientRect();
      s.setCamera({ x: el.width / 2 - p.wx * k, y: el.height / 2 - p.wy * k, scale: k });
      return { left: el.left, top: el.top, w: el.width, h: el.height };
    },
    [punktur, kvardi]
  );
  const svaedi = { x: Math.round(r.left + r.w / 2 - 380), y: Math.round(r.top + r.h / 2 - 240), w: 760, h: 480 };
  await page.waitForTimeout(80);
  const fyrir = path.join(OUT, "pdf-fyrir.png");
  await page.screenshot({ path: fyrir, clip: { x: svaedi.x, y: svaedi.y, width: svaedi.w, height: svaedi.h } });
  const tS = Date.now();
  await page.waitForFunction(() => {
    const n = window.Konva.stages[0].findOne(".skarpt-pdf");
    return n && n.visible() && n.image();
  }, null, { timeout: 60000 });
  const timi = Date.now() - tS;
  await page.waitForTimeout(400);
  const eftir = path.join(OUT, "pdf-eftir.png");
  await page.screenshot({ path: eftir, clip: { x: svaedi.x, y: svaedi.y, width: svaedi.w, height: svaedi.h } });
  const lag = await page.evaluate(() => {
    const n = window.Konva.stages[0].findOne(".skarpt-pdf");
    return { x: n.x(), y: n.y(), w: n.width(), h: n.height(), cw: n.image().width, ch: n.image().height };
  });
  console.log(`skarpa lagið: ${JSON.stringify(lag)} á ${timi} ms eftir að myndavélin staðnæmdist`);
  const mF = await maela(page, fyrir, { x: 0, y: 0, w: svaedi.w, h: svaedi.h });
  const mE = await maela(page, eftir, { x: 0, y: 0, w: svaedi.w, h: svaedi.h });
  console.log("skerpa fyrir:", JSON.stringify(mF), " eftir:", JSON.stringify(mE));
  check("skarpa lagið birtist í 800 % aðdrætti", lag.cw >= 1000 && lag.ch >= 500, JSON.stringify(lag));
  check("skarpa lagið er í skjáupplausn (8 dílar á pt)", Math.abs(lag.cw / lag.w - kvardi) < 0.1, JSON.stringify(lag));
  check("skerpa (orka stiguls) eykst greinilega", mE.skerpa > mF.skerpa * 1.5, `${mF.skerpa} → ${mE.skerpa}`);

  // ── Hreinsa svæði (raunverulegur dráttur) yfir miðju skjásins: helst hvítt með skarpa laginu ──
  await page.getByRole("button", { name: "Hreinsa svæði" }).first().click();
  await page.waitForTimeout(300);
  const hr = { x0: r.left + r.w / 2 - 120, y0: r.top + r.h / 2 - 80, x1: r.left + r.w / 2 + 120, y1: r.top + r.h / 2 + 80 };
  const assetFyrir = await page.evaluate((cid) => window.__tpStore.getState().objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid).assetId, CID);
  await page.mouse.move(hr.x0, hr.y0);
  await page.mouse.down();
  await page.mouse.move(hr.x1, hr.y1, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(
    ([cid, a]) => window.__tpStore.getState().objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid).assetId !== a,
    [CID, assetFyrir],
    { timeout: 30000 }
  );
  // nýtt lag teiknað úr nýju myndinni
  await page.waitForTimeout(600);
  await page.waitForFunction(() => {
    const n = window.Konva.stages[0].findOne(".skarpt-pdf");
    return n && n.visible() && n.image();
  }, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const hreinsad = path.join(OUT, "pdf-hreinsad.png");
  await page.screenshot({ path: hreinsad, clip: { x: svaedi.x, y: svaedi.y, width: svaedi.w, height: svaedi.h } });
  // innri hluti útstrokaða kassans (6 dílar inn frá brúninni)
  const inni = { x: Math.round(hr.x0 - svaedi.x + 6), y: Math.round(hr.y0 - svaedi.y + 6), w: Math.round(hr.x1 - hr.x0 - 12), h: Math.round(hr.y1 - hr.y0 - 12) };
  const mH = await maela(page, hreinsad, inni);
  const mFinni = await maela(page, eftir, inni);
  console.log("útstrokaði kassinn — fyrir hreinsun:", JSON.stringify(mFinni), " eftir:", JSON.stringify(mH));
  check("það var teikning í kassanum fyrir hreinsun", mFinni.dokkir > 200, JSON.stringify(mFinni));
  check("útstrokaða svæðið helst hvítt með skarpa laginu (ekkert vaknar aftur)", mH.dokkir === 0 && mH.birta > 245, JSON.stringify(mH));
  check("engar síðuvillur", villur.length === 0, villur.join(" | "));
  console.log("gripin skrif:", gripin.length);
  // hlið við hlið
  const sp = await (await b.newContext({ viewport: { width: 1600, height: 420 } })).newPage();
  const src = (f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
  await sp.setContent(`<body style="margin:0;background:#14120f;font:600 14px system-ui;color:#f1ede4;display:flex;gap:8px;padding:8px">${[
    [fyrir, "Fyrir — rastamyndin (227 DPI) í 800 %"],
    [eftir, `Eftir — skarpa lagið úr vigur-PDF (${timi} ms)`],
    [hreinsad, "Hreinsa svæði — útstrokað helst hvítt"],
  ].map(([f, t]) => `<figure style="margin:0;flex:1"><figcaption style="padding:4px 2px">${t}</figcaption><img src="${src(f)}" style="width:100%;display:block"></figure>`).join("")}</body>`);
  await sp.waitForTimeout(300);
  await sp.screenshot({ path: path.join(OUT, "pdf-samanburdur.png"), fullPage: true });
  await b.close();
  console.log("\nÍ LAGI (" + ok.length + "):\n  " + ok.join("\n  "));
  if (bad.length) console.log("\nBILAÐ (" + bad.length + "):\n  " + bad.join("\n  "));
  process.exit(bad.length ? 1 : 0);
})();
