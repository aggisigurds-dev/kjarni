/* „Croppa teikningu" á TENGDRI úttektarmynd (Agnar 07.10.2026 á main: öll teikningin varð grá með hvítum ramma hliðruðum
 * inn í miðju — skugginn og merkin vörpuðust eins og myndin væri allt blaðið eftir croppið).
 *   node tools/turbopaint-croppa-tengd.cjs [http://localhost:4123] [úttaksmappa]
 * Fiskislóð 41 (1612, 1. hæð), raunveruleg mús: hægrismellur á teikninguna → „✂ Croppa teikningu" → dreginn rammi.
 *   A) rammi 8 % utan um húsið: (a) enginn skuggi yfir húsinu (skuggi aðeins utan skurðar hæðarinnar), skjámyndin innan
 *      rammans eins og fyrir croppið; (b) merki og veggir á SÖMU dílum frummyndar; (c) ⌘Z skilar myndinni.
 *   B) rammi ≈ skurður hæðarinnar (1,5 %): enginn skuggi teiknaður; (d) „Vista í úttekt" eftir croppið skrifar SÖMU merki
 *      og veggjaLinur og vistun fyrir croppið (sendingarnar gripnar).
 * ENGIN skrif fara út: turbopaint-vordur.cjs grípur borðið/myndir; teikning_bord er lesið EINU sinni og fryst. */
const path = require("path");
const { raesa, opnaUttekt, teljari, mappa } = require("./turbopaint-hjalp.cjs");

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = mappa(process.argv, "turbopaint-croppa-tengd-myndir");
const CID = 1612, HAED = "hmuaaaw83rg9";
const { ok, bad, check } = teljari();
const DIM = "rgba(28,25,23,0.16)";

(async () => {
  const gripin = [];
  let fryst = null;
  const { b, page, errs, verndud, skrifBeidnir } = await raesa({
    teikningBord: async (route) => {
      const req = route.request();
      if (req.method() === "GET" || req.method() === "HEAD") {
        if (!/company_id=eq\.1612\b/.test(req.url())) return route.fallback();
        // Lesið EINU sinni og fryst — Agnar getur verið að vinna í lifandi röðinni; vistanirnar tvær eiga að sjá það sama.
        if (!fryst) {
          const res = await route.fetch();
          fryst = await res.text();
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: fryst });
      }
      gripin.push({ method: req.method(), body: req.postData() });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
    },
  });
  const shot = (n, clip) => page.screenshot({ path: path.join(OUT, n), clip });

  // Staða: mynd, merki og veggir í DÍLUM FRUMMYNDAR (sama vörpun og vistunin: um myndSkurdur ef hann er til)
  const stada = () =>
    page.evaluate(() => {
      const s = window.__tpStore.getState();
      const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === 1612);
      const t = m.uttekt;
      const sv = t.myndSkurdur && t.myndSkurdur.w > 0 ? t.myndSkurdur : null;
      const kx = sv ? m.width / sv.w : m.width / t.frumB, ky = sv ? m.height / sv.h : m.height / t.frumH;
      const blad = { x: m.x - (sv ? sv.x : 0) * kx, y: m.y - (sv ? sv.y : 0) * ky, w: t.frumB * kx, h: t.frumH * ky };
      const frum = (x, y) => [((x - blad.x) / blad.w) * t.frumB, ((y - blad.y) / blad.h) * t.frumH];
      const merki = s.objects
        .filter((o) => o.type === "symbol" && o.uttektUnitId != null && o.uttektUnitId !== "")
        .map((o) => {
          const a = ((o.rotation || 0) * Math.PI) / 180, h = o.size / 2;
          const c = frum(o.x + h * Math.cos(a) - h * Math.sin(a), o.y + h * Math.sin(a) + h * Math.cos(a));
          return { u: String(o.uttektUnitId), x: Math.round(c[0]), y: Math.round(c[1]) };
        })
        .sort((p, q) => (p.u < q.u ? -1 : 1));
      const veggir = s.objects
        .filter((o) => o.type === "polyline" && o.veggur)
        .map((o) => o.points.map((v, i) => (i % 2 === 0 ? frum(o.x + v, 0)[0] : frum(0, o.y + v)[1])));
      const sk = t.skurdur;
      const hus = { x: blad.x + (sk.x / t.frumB) * blad.w, y: blad.y + (sk.y / t.frumH) * blad.h, w: (sk.w / t.frumB) * blad.w, h: (sk.h / t.frumH) * blad.h };
      return { mynd: { x: m.x, y: m.y, w: m.width, h: m.height, asset: m.assetId, myndSkurdur: t.myndSkurdur || null, skurdur: t.skurdur }, merki, veggir, hus, cam: s.camera };
    });
  // Skuggareitirnir (SkurdarSkuggi) í heimshnitum
  const skuggar = () =>
    page.evaluate((DIM) => {
      const st = window.__tpKit.getRegisteredStage();
      const cam = window.__tpStore.getState().camera;
      return st
        .find((n) => typeof n.fill === "function" && n.fill() === DIM)
        .map((n) => {
          const r = n.getClientRect();
          return { x: (r.x - cam.x) / cam.scale, y: (r.y - cam.y) / cam.scale, w: r.width / cam.scale, h: r.height / cam.scale };
        });
    }, DIM);
  const skja = (x, y) =>
    page.evaluate(([x, y]) => {
      const cam = window.__tpStore.getState().camera;
      const r = document.querySelector(".tp-sheet").getBoundingClientRect();
      return { x: r.left + x * cam.scale + cam.x, y: r.top + y * cam.scale + cam.y };
    }, [x, y]);
  // Meðalbirta og meðalfrávik tveggja skjámynda (PNG) — reiknað í vafranum
  const myndMunur = (a, b2) =>
    page.evaluate(async ([a, b2]) => {
      const les = async (b64) => {
        const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
        const c = document.createElement("canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        const x = c.getContext("2d");
        x.drawImage(bmp, 0, 0);
        return x.getImageData(0, 0, c.width, c.height).data;
      };
      const A = await les(a), B = await les(b2);
      let d = 0, la = 0, lb = 0;
      const n = Math.min(A.length, B.length) / 4;
      for (let i = 0; i < n * 4; i += 4) {
        const ya = (A[i] + A[i + 1] + A[i + 2]) / 3, yb = (B[i] + B[i + 1] + B[i + 2]) / 3;
        d += Math.abs(ya - yb);
        la += ya;
        lb += yb;
      }
      return { munur: d / n, birtaA: la / n, birtaB: lb / n };
    }, [a.toString("base64"), b2.toString("base64")]);
  const klippa = async (x0, y0, x1, y1) => {
    const p = await skja(x0, y0), q = await skja(x1, y1);
    return { x: Math.round(p.x), y: Math.round(p.y), width: Math.round(q.x - p.x), height: Math.round(q.y - p.y) };
  };

  // ── opna + vistun FYRIR croppið (gripin) ────────────────────────────────────────────────────────────────
  await opnaUttekt(page, { BASE, cid: CID, haed: HAED, b: 4244, h: 6006, ham: "teikning" });
  const s0 = await stada();
  console.log("opnað:", JSON.stringify({ merki: s0.merki.length, veggir: s0.veggir.length, mynd: s0.mynd, hus: s0.hus }));
  const vista = async () => {
    const n0 = gripin.length;
    await page.getByRole("button", { name: /Vista í úttekt/ }).click();
    for (let i = 0; i < 300 && gripin.length === n0; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(400);
    const sent = gripin[gripin.length - 1] && JSON.parse(gripin[gripin.length - 1].body);
    return sent ? sent.haedir.find((h) => h.id === HAED) : null;
  };
  const h1 = await vista();
  check("vistun fyrir croppið gripin", !!h1, "");
  await page.waitForTimeout(600);
  const s0b = await stada();

  // Myndavélin: húsið allt á skjánum með svigrúmi
  const H = s0b.hus;
  const kassiA = { x0: H.x - H.w * 0.08, y0: H.y - H.h * 0.08, x1: H.x + H.w * 1.08, y1: H.y + H.h * 1.08 };
  await page.evaluate(([k]) => {
    const st = window.__tpStore.getState();
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    const scale = Math.min((r.width - 120) / (k.x1 - k.x0), (r.height - 120) / (k.y1 - k.y0));
    st.setCamera({ scale, x: 60 - k.x0 * scale + ((r.width - 120) - (k.x1 - k.x0) * scale) / 2, y: 60 - k.y0 * scale });
  }, [kassiA]);
  await page.waitForTimeout(500);
  const clipA = await klippa(kassiA.x0, kassiA.y0, kassiA.x1, kassiA.y1);
  const fyrirA = await page.screenshot({ clip: clipA });
  await shot("01_fyrir_cropp.png");
  const skFyrir = await skuggar();
  console.log("   skuggareitir fyrir cropp:", skFyrir.length);

  // ── A) hægrismellur → „✂ Croppa teikningu" → rammi 8 % utan um húsið ─────────────────────────────────────
  const opnaCropp = async () => {
    // auður staður á teikningunni utan hússins (efst til vinstri í rammanum) — hittir myndina
    const p = await skja(H.x - H.w * 0.04, H.y - H.h * 0.04);
    await page.mouse.click(p.x, p.y, { button: "right" });
    await page.getByRole("button", { name: /Croppa teikningu/ }).first().click();
    await page.waitForTimeout(200);
  };
  const draga = async (k) => {
    const p = await skja(k.x0, k.y0), q = await skja(k.x1, k.y1);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(p.x + ((q.x - p.x) * i) / 12, p.y + ((q.y - p.y) * i) / 12);
    await page.mouse.up();
    await page.waitForFunction((a) => {
      const m = window.__tpStore.getState().objects.find((o) => o.type === "image" && o.uttekt);
      return m && m.assetId !== a;
    }, s0b.mynd.asset, { timeout: 30000 });
    await page.waitForTimeout(800);
  };
  await opnaCropp();
  await draga(kassiA);
  const sA = await stada();
  console.log("   eftir cropp A:", JSON.stringify({ mynd: sA.mynd }));
  check("A: myndin croppuð (minni) og tengingin fékk myndSkurdur", sA.mynd.w < s0b.mynd.w && !!sA.mynd.myndSkurdur, JSON.stringify(sA.mynd));
  const skA = await skuggar();
  const inni = (r) => r.x < H.x + H.w - 1 && r.x + r.w > H.x + 1 && r.y < H.y + H.h - 1 && r.y + r.h > H.y + 1;
  check("A (a): enginn skuggareitur nær inn á húsið (skurð hæðarinnar)", skA.every((r) => !inni(r)), JSON.stringify(skA));
  check("A (a): skuggareitir aðeins innan croppuðu myndarinnar", skA.every((r) => r.x >= sA.mynd.x - 1 && r.y >= sA.mynd.y - 1 && r.x + r.w <= sA.mynd.x + sA.mynd.w + 1 && r.y + r.h <= sA.mynd.y + sA.mynd.h + 1), JSON.stringify({ skA, m: sA.mynd }));
  const eftirA = await page.screenshot({ clip: clipA });
  const mA = await myndMunur(fyrirA, eftirA);
  console.log("   skjámynd rammans fyrir/eftir:", JSON.stringify(mA));
  check("A (a): teikningin innan rammans lítur eins út og fyrir croppið (ekkert grátt, enginn hliðraður rammi; frávik < 8 = endursýnataka línanna, gráskuggi væri ~35)", mA.munur < 8 && Math.abs(mA.birtaA - mA.birtaB) < 2, JSON.stringify(mA));
  await shot("02_eftir_cropp_A.png");
  check("A (b): öll merki á SÖMU dílum frummyndar", JSON.stringify(sA.merki) === JSON.stringify(s0b.merki), JSON.stringify(sA.merki.filter((m, i) => JSON.stringify(m) !== JSON.stringify(s0b.merki[i])).slice(0, 4)));
  const veggMunur = (p, q) => Math.max(0, ...p.flatMap((v, i) => v.map((n, j) => Math.abs(n - q[i][j]))));
  check("A (b): allir veggir á sömu dílum frummyndar (< 0,5 díll)", sA.veggir.length === s0b.veggir.length && veggMunur(sA.veggir, s0b.veggir) < 0.5, String(veggMunur(sA.veggir, s0b.veggir)));

  // ── (c) ⌘Z skilar myndinni ──────────────────────────────────────────────────────────────────────────────
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(600);
  const sZ = await stada();
  check("(c) ⌘Z: myndin aftur heil (sama mynd, staða, stærð; enginn myndSkurdur)", sZ.mynd.asset === s0b.mynd.asset && sZ.mynd.w === s0b.mynd.w && sZ.mynd.x === s0b.mynd.x && !sZ.mynd.myndSkurdur, JSON.stringify(sZ.mynd));
  check("(c) ⌘Z: skuggareitirnir eins og fyrir croppið", (await skuggar()).length === skFyrir.length, "");
  await shot("03_ctrl_z.png");

  // ── B) rammi ≈ skurður hæðarinnar (1,5 %): enginn skuggi ──────────────────────────────────────────────────
  const kassiB = { x0: H.x - H.w * 0.015, y0: H.y - H.h * 0.015, x1: H.x + H.w * 1.015, y1: H.y + H.h * 1.015 };
  const clipB = await klippa(H.x + H.w * 0.02, H.y + H.h * 0.02, H.x + H.w * 0.98, H.y + H.h * 0.98);
  const fyrirB = await page.screenshot({ clip: clipB });
  await opnaCropp();
  await draga(kassiB);
  const sB = await stada();
  const skB = await skuggar();
  check("B: rammi ≈ skurður hæðarinnar → enginn skuggi teiknaður", skB.length === 0, JSON.stringify(skB));
  const mB = await myndMunur(fyrirB, await page.screenshot({ clip: clipB }));
  check("B: húsið lítur eins út og fyrir croppið", mB.munur < 8 && Math.abs(mB.birtaA - mB.birtaB) < 2, JSON.stringify(mB));
  check("B (b): merki og veggir á sömu dílum frummyndar", JSON.stringify(sB.merki) === JSON.stringify(s0b.merki) && veggMunur(sB.veggir, s0b.veggir) < 0.5, "");
  await shot("04_eftir_cropp_B.png");

  // ── (d) vistun eftir croppið = vistun fyrir það ─────────────────────────────────────────────────────────
  const h2 = await vista();
  check("(d) vistun eftir croppið gripin", !!h2, "");
  const rada = (a) => [...(a || [])].sort((p, q) => (String(p.unitId) < String(q.unitId) ? -1 : 1));
  check("(d) merki hæðarinnar í sendingunni ÓBREYTT frá vistun fyrir croppið", JSON.stringify(rada(h2.markers)) === JSON.stringify(rada(h1.markers)), JSON.stringify(rada(h2.markers).filter((m, i) => JSON.stringify(m) !== JSON.stringify(rada(h1.markers)[i])).slice(0, 4)));
  check("(d) veggjaLinur ÓBREYTTAR (sömu hnit frummyndar)", JSON.stringify(h2.veggjaLinur) === JSON.stringify(h1.veggjaLinur), `${(h2.veggjaLinur || []).length} vs ${(h1.veggjaLinur || []).length}`);
  check("(d) skurður hæðarinnar og blaðið (image_url, frum) ósnert", JSON.stringify(h2.skurdur) === JSON.stringify(h1.skurdur) && h2.image_url === h1.image_url && JSON.stringify(h2.frum) === JSON.stringify(h1.frum), "");

  const ut = skrifBeidnir.filter((s) => !verndud.some((v) => s === v.method + " " + v.url) && !/teikning_bord/.test(s));
  check(`ENGIN skrif fóru út (${verndud.length} borð/mynda-skrif gripin, ${gripin.length} teikning_bord gripin)`, ut.length === 0, JSON.stringify(ut));
  check("engar villur á síðunni", errs.length === 0, errs.join(" | "));
  console.log(`\n${ok.length}/${ok.length + bad.length}`);
  if (bad.length) console.log("BRÁST:\n" + bad.join("\n"));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
