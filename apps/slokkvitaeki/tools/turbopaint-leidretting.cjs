/* TurboPaint sem leiðréttingarborð (1. áfangi) — sannað í raunverulegum vafra á Fiskislóð 41 (fyrirtæki 1612).
 *
 *   node tools/turbopaint-leidretting.cjs [http://localhost:4123] [úttaksmappa]
 *
 * Opnar hæðina úr úttekt, sannar að borðið opnist rammað á húsið og að veggir Teikning-gluggans (pdfVeggir) komi inn
 * á lagið „Veggir", velur vegg með músarsmelli, setur Gler / Hurð, tengir tvo veggi og eyðir einum með stikunni, og
 * ýtir á „Vista í úttekt". ENGIN skrif fara í teikning_bord: öll skrif þangað eru gripin (route) og svarað 200, og
 * gripna sendingin er skoðuð (tegund + leidrett). Lestur fer í gegn. Borðið sjálft (turbopaint_boards) og myndir eru líka gripin (turbopaint-vordur.cjs) — ekkert skrifast. */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = process.argv[3] || path.join(process.cwd(), "turbopaint-leidretting-myndir");
fs.mkdirSync(OUT, { recursive: true });
const CID = 1612, HAED = "hmuaaaw83rg9";
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  // Engin skrif fara út — hvorki borðið (turbopaint_boards), myndir né annað (07.10: prófun á 1612 skrifaði yfir lifandi borð Agnars).
  const verndud = await require("./turbopaint-vordur.cjs").vernda(ctx);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));

  // Öll skrif í teikning_bord gripin — aldrei send. Lestur fer í gegn (og ferska röðin geymd til samanburðar).
  const gripin = [];
  let fersk = null;
  await ctx.route("**/rest/v1/teikning_bord*", async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") {
      const res = await route.fetch();
      try {
        const j = await res.json();
        const rod = Array.isArray(j) ? j[0] : j; // maybeSingle: hlutur eða fylki eftir útgáfu
        if (rod && rod.haedir && req.url().includes("company_id=eq." + CID)) fersk = rod; // aðeins prófunarstaðurinn (síðasta borð vafrans getur verið annar)
      } catch { /* ekki json */ }
      return route.fulfill({ response: res });
    }
    gripin.push({ method: req.method(), url: req.url(), body: req.postData() });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
  });

  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&b=4244&h=6006`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 60000 });
  // bíða eftir að opnuninni ljúki (staðfestingin „… merki á teikningunni"): fyrra borð sama staðar getur verið hlaðið
  // úr vafranum á undan og má ekki villa um
  const t0 = Date.now();
  await page.getByText(/merki á teikningunni/).first().waitFor({ timeout: 180000 });
  let st = null;
  while (Date.now() - t0 < 180000) {
    st = await page.evaluate(() => {
      const s = window.__tpStore?.getState();
      if (!s) return null;
      const mynd = s.objects.find((o) => o.type === "image" && o.uttekt);
      const veggir = s.objects.filter((o) => o.type === "polyline" && o.veggur && o.layerId === "veggir");
      return { mynd: mynd ? { x: mynd.x, y: mynd.y, w: mynd.width, h: mynd.height, uttekt: mynd.uttekt } : null, veggir: veggir.length, prog: s.importProgress };
    });
    if (st && st.mynd && st.veggir > 0 && !st.prog) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2500);
  const sidar = await page.evaluate(() => {
    const s = window.__tpStore.getState();
    return { nafn: s.name, n: s.objects.length, myndir: s.objects.filter((o) => o.type === "image").map((o) => !!o.uttekt) };
  });
  console.log("staða:", JSON.stringify(st), JSON.stringify(sidar), `${Math.round((Date.now() - t0) / 1000)} s`);
  check("teikningin opnast tengd úttektinni", !!(st && st.mynd && st.mynd.uttekt && st.mynd.uttekt.companyId === CID), JSON.stringify(st));
  check("skurður hæðarinnar fylgir tengingunni", !!(st?.mynd?.uttekt?.skurdur?.w > 8), JSON.stringify(st?.mynd?.uttekt));
  check("veggir Teikning-gluggans á laginu „Veggir“ (~60 úr 776 PDF-línum)", st && st.veggir >= 35 && st.veggir <= 110, `veggir=${st?.veggir}`);

  // 1) Rammað á húsið: skurðurinn fyllir skjáinn (en blaðið allt gerir það ekki)
  const rammi = await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const m = s.objects.find((o) => o.type === "image" && o.uttekt);
    const t = m.uttekt, sk = t.skurdur, cam = s.camera;
    const kx = m.width / t.frumB, ky = m.height / t.frumH;
    const r = { x: m.x + sk.x * kx, y: m.y + sk.y * ky, w: sk.w * kx, h: sk.h * ky };
    const shell = document.querySelector(".tp-sheet").getBoundingClientRect();
    return {
      sx0: r.x * cam.scale + cam.x, sy0: r.y * cam.scale + cam.y,
      sx1: (r.x + r.w) * cam.scale + cam.x, sy1: (r.y + r.h) * cam.scale + cam.y,
      vw: shell.width, vh: shell.height,
      bladH: m.height * cam.scale, bladW: m.width * cam.scale,
    };
  });
  const fyllir = Math.max((rammi.sx1 - rammi.sx0) / rammi.vw, (rammi.sy1 - rammi.sy0) / rammi.vh);
  check("húsið (skurðurinn) er allt á skjánum", rammi.sx0 >= -2 && rammi.sy0 >= -2 && rammi.sx1 <= rammi.vw + 2 && rammi.sy1 <= rammi.vh + 2, JSON.stringify(rammi));
  check("húsið fyllir skjáinn (≥ 85% í þrengri vídd)", fyllir >= 0.85, `fyllir=${fyllir.toFixed(2)}`);
  check("blaðið allt er stærra en skjárinn (ekki „passa allt“)", rammi.bladH > rammi.vh * 1.2, JSON.stringify(rammi));
  await page.screenshot({ path: path.join(OUT, "01_opnad_rammad_a_husid.png") });
  // sama, með lagið „Teikning" falið: aðeins veggirnir (og táknin) — myndskreyting, ekki sönnun
  await page.evaluate(() => window.__tpStore.getState().toggleLayerVisible("teikning"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "01b_veggir_ur_teikningu_an_bakgrunns.png") });
  await page.evaluate(() => window.__tpStore.getState().toggleLayerVisible("teikning"));
  await page.waitForTimeout(300);

  // 2) Teikning-hamur: veggjastikan býr þar
  await page.getByRole("tab", { name: "Teikning" }).click();
  await page.waitForTimeout(400);

  // skjáhnit veggjar (miðja lengsta lárétta veggjar sem ekkert tákn er nálægt)
  const veljaVegg = async (skilyrdi) =>
    page.evaluate((sk) => {
      const s = window.__tpStore.getState(), cam = s.camera;
      const shell = document.querySelector(".tp-sheet").getBoundingClientRect();
      const takn = s.objects.filter((o) => o.type === "symbol");
      const veggir = s.objects.filter((o) => o.type === "polyline" && o.veggur && o.layerId === "veggir" && !o.veggTegund && !s.selectedIds.includes(o.id));
      const L = (o) => Math.hypot(o.points[2] - o.points[0], o.points[3] - o.points[1]);
      const kandidatar = veggir
        .filter((o) => (sk === "larett" ? Math.abs(o.points[1] - o.points[3]) < 1 : Math.abs(o.points[0] - o.points[2]) < 1))
        .sort((a, c) => L(c) - L(a));
      for (const o of kandidatar) {
        for (const f of [0.5, 0.35, 0.65, 0.25, 0.75]) {
          const wx = o.points[0] + (o.points[2] - o.points[0]) * f, wy = o.points[1] + (o.points[3] - o.points[1]) * f;
          const naer = takn.some((t) => Math.hypot(t.x + t.size / 2 - wx, t.y + t.size / 2 - wy) < t.size * 1.5);
          if (naer) continue;
          const x = shell.left + wx * cam.scale + cam.x, y = shell.top + wy * cam.scale + cam.y;
          if (x < shell.left + 80 || x > shell.right - 80 || y < shell.top + 120 || y > shell.bottom - 140) continue;
          return { id: o.id, x, y };
        }
      }
      return null;
    }, skilyrdi);

  const v1 = await veljaVegg("larett");
  check("fann vegg til að smella á", !!v1, "enginn");
  await page.mouse.click(v1.x, v1.y);
  await page.waitForTimeout(400);
  const valid1 = await page.evaluate(() => window.__tpStore.getState().selectedIds);
  check("músarsmellur velur vegginn", valid1.length === 1 && valid1[0] === v1.id, JSON.stringify({ valid1, v1 }));
  const stika = page.getByRole("toolbar", { name: "Leiðrétta veggi" });
  check("veggjastikan birtist við valinn vegg", await stika.isVisible(), "ekki sýnileg");
  await page.screenshot({ path: path.join(OUT, "02_veggur_valinn_stika.png") });

  // 3) Gler → blár
  await stika.getByRole("button", { name: "Gler" }).click();
  await page.waitForTimeout(300);
  const g = await page.evaluate((id) => window.__tpStore.getState().objects.find((o) => o.id === id), v1.id);
  check("Gler: tegund = gler", g.veggTegund === "gler", JSON.stringify(g.veggTegund));
  check("Gler: liturinn verður blár", g.stroke.toLowerCase() === "#2563eb", g.stroke);
  check("Gler-hnappurinn sýnir valda tegund", (await stika.getByRole("button", { name: "Gler" }).getAttribute("aria-pressed")) === "true", "aria-pressed");
  // liturinn á skjánum sjálfum: afvelja (Esc) og lesa díl á striganum þar sem veggurinn er
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const dill = await page.evaluate(({ x, y }) => {
    const c = [...document.querySelectorAll(".tp-sheet canvas")].pop();
    const r = c.getBoundingClientRect(), k = c.width / r.width;
    const d = c.getContext("2d").getImageData(Math.round((x - r.left) * k), Math.round((y - r.top) * k), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, v1);
  check("glerveggurinn er blár á skjánum", dill[2] > 150 && dill[2] > dill[0] + 60, JSON.stringify(dill));
  await page.screenshot({ path: path.join(OUT, "03_gler_blatt.png") });

  // 4) Hurð → brún (lóðréttur veggur)
  const v2 = await veljaVegg("lodrett");
  await page.mouse.click(v2.x, v2.y);
  await page.waitForTimeout(300);
  await stika.getByRole("button", { name: "Hurð" }).click();
  await page.waitForTimeout(300);
  const h = await page.evaluate((id) => window.__tpStore.getState().objects.find((o) => o.id === id), v2.id);
  check("Hurð: tegund = hurd og brúnn litur", h.veggTegund === "hurd" && h.stroke.toLowerCase() === "#b45309", JSON.stringify([h.veggTegund, h.stroke]));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "04_hurd_brun.png") });

  // 5) Tengja: horn tveggja veggja opnað (uppsetning í gegnum borðið), svo lagað MEÐ STIKUNNI (shift-smellur + Tengja)
  const horn = await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const m = s.objects.find((o) => o.type === "image" && o.uttekt);
    const ppm = (m.width / m.uttekt.frumB) * 71.41;
    const V = s.objects.filter((o) => o.type === "polyline" && o.veggur && o.layerId === "veggir" && o.points.length === 4 && !o.veggTegund);
    const L = (o) => Math.hypot(o.points[2] - o.points[0], o.points[3] - o.points[1]);
    for (const a of V) {
      if (L(a) < 2 * ppm || Math.abs(a.points[1] - a.points[3]) > 0.5) continue; // láréttur, ≥ 2 m
      for (const ea of [0, 1]) {
        const P = [a.points[ea * 2], a.points[ea * 2 + 1]];
        for (const c of V) {
          if (c === a || L(c) < 2 * ppm || Math.abs(c.points[0] - c.points[2]) > 0.5) continue; // lóðréttur, ≥ 2 m
          for (const ec of [0, 1]) {
            const Q = [c.points[ec * 2], c.points[ec * 2 + 1]];
            if (Math.hypot(P[0] - Q[0], P[1] - Q[1]) < 1) return { a: a.id, ea, c: c.id, ec, P, aPts: a.points, cPts: c.points };
          }
        }
      }
    }
    return null;
  });
  check("fann L-horn tveggja veggja", !!horn, "ekkert horn");
  if (horn) {
    const bil = await page.evaluate((hn) => {
      const s = window.__tpStore.getState();
      const m = s.objects.find((o) => o.type === "image" && o.uttekt);
      const ppm = (m.width / m.uttekt.frumB) * 71.41;
      const d = 0.4 * ppm; // 40 cm gat á hvorn
      const a = s.objects.find((o) => o.id === hn.a), c = s.objects.find((o) => o.id === hn.c);
      const ap = a.points.slice(), cp = c.points.slice();
      const ai = hn.ea * 2, ao = (1 - hn.ea) * 2, ci = hn.ec * 2, co = (1 - hn.ec) * 2;
      ap[ai] += Math.sign(ap[ao] - ap[ai]) * d;
      cp[ci + 1] += Math.sign(cp[co + 1] - cp[ci + 1]) * d;
      s.updateObjects([a.id], (o) => ({ ...o, points: ap }));
      s.updateObjects([c.id], (o) => ({ ...o, points: cp }));
      s.setSelected([]);
      // miðjur beggja veggja á skjánum
      const shell = document.querySelector(".tp-sheet").getBoundingClientRect(), cam = s.camera;
      const mid = (p, f) => ({ x: shell.left + (p[0] + (p[2] - p[0]) * f) * cam.scale + cam.x, y: shell.top + (p[1] + (p[3] - p[1]) * f) * cam.scale + cam.y });
      return { d, A: mid(ap, hn.ea === 0 ? 0.15 : 0.85), C: mid(cp, hn.ec === 0 ? 0.15 : 0.85) };
    }, horn);
    await page.waitForTimeout(300);
    await page.mouse.click(bil.A.x, bil.A.y);
    await page.waitForTimeout(200);
    await page.keyboard.down("Shift");
    await page.mouse.click(bil.C.x, bil.C.y);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(300);
    const valdir = await page.evaluate(() => window.__tpStore.getState().selectedIds);
    check("shift-smellur velur báða veggina", valdir.length === 2 && valdir.includes(horn.a) && valdir.includes(horn.c), JSON.stringify(valdir));
    await page.screenshot({ path: path.join(OUT, "05a_tengja_fyrir.png") });
    await stika.getByRole("button", { name: "Tengja" }).click();
    await page.waitForTimeout(400);
    const eftir = await page.evaluate((hn) => {
      const s = window.__tpStore.getState();
      const a = s.objects.find((o) => o.id === hn.a), c = s.objects.find((o) => o.id === hn.c);
      return { a: [a.points[hn.ea * 2], a.points[hn.ea * 2 + 1]], c: [c.points[hn.ec * 2], c.points[hn.ec * 2 + 1]] };
    }, horn);
    const fj = Math.hypot(eftir.a[0] - horn.P[0], eftir.a[1] - horn.P[1]) + Math.hypot(eftir.c[0] - horn.P[0], eftir.c[1] - horn.P[1]);
    check("Tengja: hornið lokast aftur (báðir endar í upprunalega horninu)", fj < 2, JSON.stringify({ eftir, P: horn.P, fj }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, "05b_tengja_eftir.png") });
  }

  // 6) Eyða með stikunni
  const fyrir = await page.evaluate(() => window.__tpStore.getState().objects.filter((o) => o.veggur).length);
  const v3 = await veljaVegg("larett");
  await page.mouse.click(v3.x, v3.y);
  await page.waitForTimeout(300);
  await stika.getByRole("button", { name: "Eyða" }).click();
  await page.waitForTimeout(300);
  const eftirEyd = await page.evaluate((id) => {
    const s = window.__tpStore.getState();
    return { n: s.objects.filter((o) => o.veggur).length, til: s.objects.some((o) => o.id === id) };
  }, v3.id);
  check("Eyða: veggurinn hverfur", eftirEyd.n === fyrir - 1 && !eftirEyd.til, JSON.stringify({ fyrir, eftirEyd }));

  // stikan sést ekki í Slökkvitækjaham (sami valdi veggur)
  await page.mouse.click(v2.x, v2.y);
  await page.waitForTimeout(300);
  check("stikan sést í Teikning-ham við valinn vegg", await stika.isVisible(), "falin");
  await page.getByRole("tab", { name: "Slökkvitæki" }).click();
  await page.waitForTimeout(300);
  check("veggjastikan er falin í Slökkvitækjaham", !(await stika.isVisible()), "sýnileg");
  await page.getByRole("tab", { name: "Teikning" }).click();
  await page.keyboard.press("Escape");

  // 7) Vista í úttekt — gripið
  const fjoldiVeggja = await page.evaluate(() => window.__tpStore.getState().objects.filter((o) => o.veggur).length);
  await page.getByRole("button", { name: /Vista í úttekt/ }).click();
  await page.waitForTimeout(4000);
  check("„Vista í úttekt“ reyndi að skrifa (gripið, ekki sent)", gripin.length === 1, `gripin=${gripin.length}`);
  if (gripin.length) {
    const g0 = gripin[0];
    const body = JSON.parse(g0.body || "{}");
    const haedir = body.haedir || [];
    const hd = haedir.find((x) => x.id === HAED);
    check("sendingin er PATCH á company_id=1612", g0.method === "PATCH" && /company_id=eq\.1612/.test(g0.url), `${g0.method} ${g0.url}`);
    check("veggjaLinur á hæðinni, jafnmargar og veggirnir á borðinu", hd && Array.isArray(hd.veggjaLinur) && hd.veggjaLinur.length === fjoldiVeggja, `${hd?.veggjaLinur?.length} vs ${fjoldiVeggja}`);
    const tegundir = (hd?.veggjaLinur || []).map((v) => v.tegund);
    check("hver veggur ber tegund", tegundir.length > 0 && tegundir.every((t) => t === "veggur" || t === "gler" || t === "hurd"), JSON.stringify([...new Set(tegundir)]));
    check("gler og hurð skila sér", tegundir.includes("gler") && tegundir.includes("hurd"), JSON.stringify([...new Set(tegundir)]));
    check("hæðin fær leidrett { af: 'turbopaint', kl }", hd?.leidrett?.af === "turbopaint" && !isNaN(Date.parse(hd?.leidrett?.kl)), JSON.stringify(hd?.leidrett));
    if (fersk) {
      const adrar = haedir.filter((x) => x.id !== HAED);
      const ferskarAdrar = fersk.haedir.filter((x) => x.id !== HAED);
      check("aðrar hæðir óbreyttar frá fersku röðinni", JSON.stringify(adrar) === JSON.stringify(ferskarAdrar), "breyttust");
      const f = fersk.haedir.find((x) => x.id === HAED);
      check("pdfVeggir og skurður hæðarinnar ósnert", JSON.stringify(hd.pdfVeggir) === JSON.stringify(f.pdfVeggir) && JSON.stringify(hd.skurdur) === JSON.stringify(f.skurdur), "breyttust");
    }
    fs.writeFileSync(path.join(OUT, "gripin_sending.json"), JSON.stringify({ method: g0.method, url: g0.url, body }, null, 1));
  }
  await page.screenshot({ path: path.join(OUT, "06_vistad_gripid.png") });

  console.log(ok.map((n) => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map((n) => "  ✘ " + n).join("\n"));
  console.log(`\n${ok.length}/${ok.length + bad.length} · skrif í teikning_bord gripin: ${gripin.length} · villur: ${errs.length ? errs.join(" | ") : "engar"}`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error("BROTNAÐI:", e.message);
  process.exit(1);
});
