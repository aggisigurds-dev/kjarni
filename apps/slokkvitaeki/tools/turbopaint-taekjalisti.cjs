/* TurboPaint 2. áfangi — tækjalisti staðarins inni í TurboPaint, sannaður í raunverulegum vafra á Fiskislóð 41
 * (fyrirtæki 1612, 1. hæð hmuaaaw83rg9).
 *
 *   node tools/turbopaint-taekjalisti.cjs [http://localhost:4123] [úttaksmappa]
 *
 * Raunverulegir músarsmellir: opnar tækjalistann, setur óstaðsett tæki á teikninguna, færir staðsett tæki, sækir tæki af
 * 2. hæð (staðfesting), tekur tæki af („Taka af teikningu" og Delete), dregur röð á teikninguna, setur ÚT-merki og laust
 * slökkvitæki úr slánni, og ýtir á „Vista í úttekt" — tvisvar.
 *
 * ENGIN skrif fara í teikning_bord: öll skrif þangað eru gripin (route) og svarað 200, og gripna sendingin er skoðuð.
 * Lestur fer í gegn en er AUKINN í prófinu (aldrei skrifaður): tæki 25448 + ÚT-merki sett á 2. hæð (til að prófa „á 2.
 * hæð" og að tækið fari þaðan), og frá og með öðrum lestri bjalla á 1. hæð sem „appið" setti eftir opnun (má ekki týnast).
 * Borðið sjálft (turbopaint_boards) má endurskapast (leyfi Agnars). */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = process.argv[3] || "C:/Users/Slokkvitaeki/teikning-greining/turbopaint_afangi2";
fs.mkdirSync(OUT, { recursive: true });
const CID = 1612, HAED = "hmuaaaw83rg9", HAED2 = "hmuv3scrhisf";
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));
const mynd = (n) => path.join(OUT, n);

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const dialogs = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.accept();
  });

  // ── teikning_bord: skrif gripin, lestur aukinn ─────────────────────────────────────────────────────────────────
  const gripin = [];
  let lestrar = 0;
  let fersk = null; // ferska röðin eins og appið sá hana við síðasta lestur (aukin)
  let skrifad = null; // síðasta gripna sending — síðari lestrar sjá hana, eins og skrifin hefðu farið í gegn
  let appBaetti = false; // „appið" setur bjöllu á 1. hæð eftir opnun (sett rétt fyrir fyrstu vistun)
  const auka = (rod) => {
    // rot/staerd sýndir (433): rafmagnstaflan snúin 90° og tvöföld (staerd 52 á hæð með stimpilStaerd 26)
    const raf = rod.haedir.find((h) => h.id === HAED).markers.find((m) => m.unitId === "s:rafmagn:mur14paumv8v");
    if (raf) Object.assign(raf, { rot: 90, staerd: 52 });
    const h2 = rod.haedir.find((h) => h.id === HAED2);
    h2.markers = [
      ...(h2.markers || []).filter((m) => m.unitId !== 25448),
      { x: 1200, y: 2000, unitId: 25448 },
      { x: 1500, y: 2100, kind: "sign", sign: "ut", color: "#15803d", rot: 0, unitId: "s:ut:prof2haed" },
    ];
    return rod;
  };
  await ctx.route("**/rest/v1/teikning_bord*", async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") {
      const res = await route.fetch();
      let j;
      try {
        j = await res.json();
      } catch {
        return route.fulfill({ response: res });
      }
      lestrar++;
      const rod = Array.isArray(j) ? j[0] : j;
      if (rod && rod.haedir) {
        if (skrifad) {
          rod.haedir = JSON.parse(JSON.stringify(skrifad.haedir));
          rod.markers = skrifad.markers;
        } else auka(rod);
        const h1 = rod.haedir.find((h) => h.id === HAED);
        if (appBaetti && !h1.markers.some((m) => m.unitId === "s:bjalla:fraappinu")) {
          h1.markers = [...h1.markers, { x: 2000, y: 2600, kind: "sign", sign: "bjalla", color: "#c93c1d", rot: 0, unitId: "s:bjalla:fraappinu" }];
        }
        fersk = JSON.parse(JSON.stringify(rod));
      }
      const headers = { ...res.headers() };
      delete headers["content-length"];
      delete headers["content-encoding"];
      return route.fulfill({ status: res.status(), headers, body: JSON.stringify(j) });
    }
    gripin.push({ method: req.method(), url: req.url(), body: req.postData() });
    try {
      skrifad = JSON.parse(req.postData() || "null");
    } catch {
      /* ekki json */
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
  });

  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&b=4244&h=6006&ham=slokkvitaeki`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 90000 });
  const t0 = Date.now();
  await page.getByText(/merki á teikningunni/).first().waitFor({ timeout: 180000 });
  while (Date.now() - t0 < 180000) {
    const st = await page.evaluate(() => {
      const s = window.__tpStore?.getState();
      return s && { m: s.objects.some((o) => o.type === "image" && o.uttekt), prog: s.importProgress };
    });
    if (st && st.m && !st.prog) break;
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(2000);

  // ── hjálparföll ────────────────────────────────────────────────────────────────────────────────────────────────
  const stada = () =>
    page.evaluate(() => {
      const s = window.__tpStore.getState();
      const m = s.objects.find((o) => o.type === "image" && o.uttekt);
      const takn = s.objects.filter((o) => o.type === "symbol");
      return {
        tool: s.tool,
        selected: s.selectedIds,
        mynd: { id: m.id, x: m.x, y: m.y, w: m.width, h: m.height, uttekt: m.uttekt },
        takn: takn.map((t) => ({ id: t.id, symbolId: t.symbolId, x: t.x, y: t.y, size: t.size, rotation: t.rotation, label: t.label, u: t.uttektUnitId, k: t.uttektKind, sg: t.uttektSign, hidden: t.hidden })),
        veggir: s.objects.filter((o) => o.veggur).length,
      };
    });
  /** Heimshnit → skjáhnit. */
  const aSkja = (wx, wy) =>
    page.evaluate(([x, y]) => {
      const s = window.__tpStore.getState(), cam = s.camera;
      const r = document.querySelector(".tp-sheet").getBoundingClientRect();
      return { x: r.left + x * cam.scale + cam.x, y: r.top + y * cam.scale + cam.y };
    }, [wx, wy]);
  /** Frjálsir blettir inni í húsinu (skurðinum), fjarri táknum og stikum — skjá- og heimshnit. */
  const frjalsir = (n, notad = []) =>
    page.evaluate(([n, notad]) => {
      const s = window.__tpStore.getState(), cam = s.camera;
      const m = s.objects.find((o) => o.type === "image" && o.uttekt);
      const t = m.uttekt, sk = t.skurdur, kx = m.width / t.frumB, ky = m.height / t.frumH;
      const r = document.querySelector(".tp-sheet").getBoundingClientRect();
      const takn = s.objects.filter((o) => o.type === "symbol");
      const S = takn[0] ? takn[0].size : 40;
      const ut = [];
      for (let fy = 0.2; fy <= 0.8; fy += 0.05) {
        for (let fx = 0.2; fx <= 0.8; fx += 0.05) {
          const wx = m.x + (sk.x + sk.w * fx) * kx, wy = m.y + (sk.y + sk.h * fy) * ky;
          const sx = r.left + wx * cam.scale + cam.x, sy = r.top + wy * cam.scale + cam.y;
          if (sx < r.left + 110 || sx > r.right - 280 || sy < r.top + 170 || sy > r.bottom - 170) continue;
          const naer = [...takn.map((o) => [o.x + o.size / 2, o.y + o.size / 2]), ...notad].some(
            ([cx, cy]) => Math.hypot(cx - wx, cy - wy) < S * 3
          );
          if (naer) continue;
          ut.push({ sx, sy, wx, wy });
          notad.push([wx, wy]);
          if (ut.length >= n) return ut;
        }
      }
      return ut;
    }, [n, notad]);
  const takniFyrir = (st, u) => st.takn.filter((t) => String(t.u) === String(u));
  const radir = page.locator('section[aria-label="Tæki staðarins"]');

  // ── 1) Tækjalistinn ────────────────────────────────────────────────────────────────────────────────────────────
  let st = await stada();
  check("teikningin opnast tengd úttektinni með `merki` (lyklarnir sem borðið sýnir)", st.mynd.uttekt.companyId === CID && Array.isArray(st.mynd.uttekt.merki) && st.mynd.uttekt.merki.length === 14, JSON.stringify(st.mynd.uttekt.merki));
  await radir.waitFor({ timeout: 20000 });
  await radir.getByText(/á teikningu ·/).waitFor({ timeout: 30000 });
  const yfirlit = await radir.getByText(/á teikningu ·/).innerText();
  check("tækjalistinn: 14 tæki, 10 á teikningu · 1 á öðrum hæðum · 3 óstaðsett", /TÆKI STAÐARINS · 14/.test(await radir.innerText()) && /10 á teikningu · 1 á öðrum hæðum · 3 óstaðsett/.test(yfirlit), yfirlit);
  const hopar = await radir.locator("div.font-semibold").allInnerTexts();
  check("flokkað eftir tegund með nöfnum Teikning-gluggans (Léttvatn 9, Slanga 5)", hopar.some((h) => /^Léttvatn 9$/.test(h)) && hopar.some((h) => /^Slanga 5$/.test(h)), JSON.stringify(hopar));
  const r25448 = radir.locator('[data-taeki="25448"]');
  check("tæki á 2. hæð merkt „á 2. hæð“", /á 2\. hæð/.test(await r25448.innerText()), await r25448.innerText());
  check("staðsett tæki merkt „á teikningu“", /á teikningu/.test(await radir.locator('[data-taeki="25442"]').innerText()), "");
  check("raðnúmer stytt í síðustu sex", /N5VABN/.test(await radir.locator('[data-taeki="25442"]').innerText()), "");
  await page.screenshot({ path: mynd("01_taekjalisti_opinn.png") });

  // sían og „aðeins óstaðsett"
  await radir.getByLabel("Sýna aðeins óstaðsett").check();
  const ostadsett = await radir.locator("[data-taeki]").evaluateAll((els) => els.map((e) => e.dataset.taeki).sort());
  check("„Sýna aðeins óstaðsett“ sýnir 25447, 25451, 25453", JSON.stringify(ostadsett) === JSON.stringify(["25447", "25451", "25453"]), JSON.stringify(ostadsett));
  await page.screenshot({ path: mynd("01b_adeins_ostadsett.png") });
  await radir.getByLabel("Sýna aðeins óstaðsett").uncheck();
  await radir.getByLabel("Sía tækjalistann").fill("n5vab");
  const leit = await radir.locator("[data-taeki]").evaluateAll((els) => els.map((e) => e.dataset.taeki));
  check("sían finnur raðnúmer", JSON.stringify(leit) === '["25442"]', JSON.stringify(leit));
  await radir.getByLabel("Sía tækjalistann").fill("");

  // ── 2) Setja óstaðsett tæki (25447): smellur á röð → smellur á teikningu ─────────────────────────────────────
  const blettir = await frjalsir(6);
  check("fann 6 auða bletti inni í húsinu", blettir.length === 6, `${blettir.length}`);
  await radir.locator('[data-taeki="25447"]').click();
  await page.waitForTimeout(200);
  st = await stada();
  check("smellur á röð vopnar stimpiltólið", st.tool === "symbol" && (await radir.getByRole("status").isVisible()), st.tool);
  await page.screenshot({ path: mynd("02a_taeki_valid.png") });
  await page.mouse.click(blettir[0].sx, blettir[0].sy);
  await page.waitForTimeout(400);
  st = await stada();
  const t47 = takniFyrir(st, 25447);
  check("tækið 25447 komið á teikninguna, tengt (eitt tákn, Léttvatn úr merkjasafninu)", t47.length === 1 && t47[0].symbolId === "teikn:lettvatn" && t47[0].label === "G79YGM", JSON.stringify(t47));
  check("miðja táknsins þar sem smellt var", t47[0] && Math.hypot(t47[0].x + t47[0].size / 2 - blettir[0].wx, t47[0].y + t47[0].size / 2 - blettir[0].wy) < 2, JSON.stringify([t47[0], blettir[0]]));
  check("eftir setningu: Velja-tól og nýja táknið valið", st.tool === "select" && st.selected.length === 1 && st.selected[0] === t47[0]?.id, JSON.stringify([st.tool, st.selected]));
  check("röðin sýnir nú „á teikningu“", /á teikningu/.test(await radir.locator('[data-taeki="25447"]').innerText()), "");
  await page.screenshot({ path: mynd("02b_taeki_sett.png") });

  // ── 3) Færa staðsett tæki (25442) — sama tákn, ekkert afrit ──────────────────────────────────────────────────
  const fyrir42 = takniFyrir(st, 25442)[0];
  await radir.locator('[data-taeki="25442"]').click();
  await page.waitForTimeout(200);
  await page.mouse.click(blettir[1].sx, blettir[1].sy);
  await page.waitForTimeout(400);
  st = await stada();
  const t42 = takniFyrir(st, 25442);
  check("25442 fært: sama tákn, ekkert afrit", t42.length === 1 && t42[0].id === fyrir42.id, JSON.stringify(t42));
  check("25442 stendur þar sem smellt var", t42[0] && Math.hypot(t42[0].x + t42[0].size / 2 - blettir[1].wx, t42[0].y + t42[0].size / 2 - blettir[1].wy) < 2, JSON.stringify(t42[0]));
  await page.screenshot({ path: mynd("03_taeki_fært.png") });

  // ── 4) Tæki af 2. hæð (25448): staðfesting ─────────────────────────────────────────────────────────────────────
  await radir.locator('[data-taeki="25448"]').click();
  await page.waitForTimeout(200);
  await page.mouse.click(blettir[2].sx, blettir[2].sy);
  await page.waitForTimeout(500);
  st = await stada();
  check("spurt á íslensku: „Tækið er á 2. hæð — færa það hingað?“", dialogs.includes("Tækið er á 2. hæð — færa það hingað?"), JSON.stringify(dialogs));
  check("25448 komið á þessa hæð eftir staðfestingu", takniFyrir(st, 25448).length === 1, "");
  check("röð 25448 sýnir „á teikningu“", /á teikningu/.test(await radir.locator('[data-taeki="25448"]').innerText()), "");

  // ── 5) Taka af teikningu: hnappurinn (25443) og Delete (25444) ────────────────────────────────────────────────
  const t43 = takniFyrir(st, 25443)[0];
  const p43 = await aSkja(t43.x + t43.size / 2, t43.y + t43.size / 2);
  await page.mouse.click(p43.x, p43.y);
  await page.waitForTimeout(300);
  st = await stada();
  check("músarsmellur velur tæki á teikningunni", st.selected.length === 1 && st.selected[0] === t43.id, JSON.stringify(st.selected));
  const takaAf = page.getByRole("button", { name: "Taka af teikningu" });
  check("„Taka af teikningu“ sést við valið tæki", await takaAf.isVisible(), "falinn");
  await page.screenshot({ path: mynd("04a_valid_taka_af.png") });
  await takaAf.click();
  await page.waitForTimeout(300);
  st = await stada();
  check("25443 tekið af teikningunni", takniFyrir(st, 25443).length === 0, "");
  check("25443 er áfram í listanum sem „ekki staðsett“", /ekki staðsett/.test(await radir.locator('[data-taeki="25443"]').innerText()), "");
  const t44 = takniFyrir(st, 25444)[0];
  const p44 = await aSkja(t44.x + t44.size / 2, t44.y + t44.size / 2);
  await page.mouse.click(p44.x, p44.y);
  await page.waitForTimeout(250);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(300);
  st = await stada();
  check("Delete tekur 25444 af (ekki úr listanum)", takniFyrir(st, 25444).length === 0 && /ekki staðsett/.test(await radir.locator('[data-taeki="25444"]').innerText()), "");
  await page.screenshot({ path: mynd("04b_tekid_af.png") });

  // ── 6) Draga röð á teikninguna (25451) ─────────────────────────────────────────────────────────────────────────
  const sheet = await page.locator(".tp-sheet").boundingBox();
  await radir.locator('[data-taeki="25451"]').dragTo(page.locator(".tp-sheet"), {
    targetPosition: { x: blettir[3].sx - sheet.x, y: blettir[3].sy - sheet.y },
  });
  await page.waitForTimeout(500);
  st = await stada();
  const t51 = takniFyrir(st, 25451);
  check("dregin röð (25451) lendir á teikningunni sem Slanga (teikn:slanga)", t51.length === 1 && t51[0].symbolId === "teikn:slanga" && Math.hypot(t51[0].x + t51[0].size / 2 - blettir[3].wx, t51[0].y + t51[0].size / 2 - blettir[3].wy) < 3, JSON.stringify(t51));

  // ── 7) ÚT-merki úr „Merki (Teikning)" ──────────────────────────────────────────────────────────────────────────
  await radir.locator('[data-stimpill="ut"]').click();
  await page.waitForTimeout(200);
  await page.mouse.click(blettir[4].sx, blettir[4].sy);
  await page.waitForTimeout(400);
  st = await stada();
  const utTakn = st.takn.filter((t) => t.sg === "ut");
  check("ÚT-merki sett (tákn teikn:ut, stimpill ut, enginn merkimiði eins og í Teikning)", utTakn.length === 1 && utTakn[0].symbolId === "teikn:ut" && utTakn[0].label === "" && utTakn[0].k === "sign", JSON.stringify(utTakn));
  // Segulloki (er í Teikning-glugganum — var ekki í 1. útgáfu 2. áfanga)
  const blettir2 = await frjalsir(1, blettir.map((b) => [b.wx, b.wy]));
  await radir.locator('[data-stimpill="segull"]').click();
  await page.waitForTimeout(200);
  await page.mouse.click(blettir2[0].sx, blettir2[0].sy);
  await page.waitForTimeout(400);
  st = await stada();
  const sgTakn = st.takn.filter((t) => t.sg === "segull");
  check("Segulloki settur (teikn:segull)", sgTakn.length === 1 && sgTakn[0].symbolId === "teikn:segull", JSON.stringify(sgTakn));
  await page.screenshot({ path: mynd("05_ut_og_segull.png") });

  // ── 8) Laust slökkvitæki úr slánni (á ekkert tæki) → athugasemdin ──────────────────────────────────────────────
  // Táknasláin: merkjasafnið (14) fyrst, svo AUKA
  const slain = await page.locator("[data-takn]").evaluateAll((els) => els.map((e) => e.dataset.takn));
  check("táknasláin: merkjasafn Teikning (4 tæki + 10 merki, segull með) á undan aukatáknum", slain.slice(0, 14).every((id) => id.startsWith("teikn:")) && slain.includes("teikn:segull") && slain.slice(14).every((id) => !id.startsWith("teikn:")) && (await page.getByText("AUKA", { exact: true }).isVisible()), JSON.stringify(slain));
  await page.locator('button[data-takn="teikn:lettvatn"]').click();
  await page.waitForTimeout(200);
  await page.mouse.click(blettir[5].sx, blettir[5].sy);
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  st = await stada();
  const lausir = st.takn.filter((t) => t.symbolId === "teikn:lettvatn" && (t.u == null || t.u === ""));
  check("laust Léttvatn úr slánni (ekkert tæki) er ótengt", lausir.length === 1, JSON.stringify(lausir));
  const taekjaStaerd = takniFyrir(st, 25447)[0]?.size;
  check("tákn úr slánni jafnstórt tækjunum á tengdu borði", lausir[0] && Math.abs(lausir[0].size - taekjaStaerd) < 0.5, JSON.stringify([lausir[0]?.size, taekjaStaerd]));
  const ath = radir.getByText(/tákn án tengingar vistast ekki í úttekt/);
  check("athugasemd: „1 tákn án tengingar vistast ekki í úttekt“", (await ath.isVisible()) && (await ath.innerText()).startsWith("1 tákn"), "");
  // magntaflan telur eftir tegund og sýnir skráð tæki
  const magn = await page.locator("text=MAGNTAFLA").locator("xpath=ancestor::div[contains(@class,'rounded-xl')][1]").innerText();
  check("magntaflan: nöfn Teikning-gluggans (Léttvatn, Slanga, Segulloki …) og „skráð tæki“", /Léttvatn[\s\S]*skráð tæki/.test(magn) && /Segulloki/.test(magn) && /Slöngumerki/.test(magn) && !/Slökkvitæki · /.test(magn), magn.slice(0, 400));
  // rot/staerd úr úttektinni sjást á borðinu
  const rafT = takniFyrir(st, "s:rafmagn:mur14paumv8v")[0];
  const tSt = takniFyrir(st, 25445)[0];
  check("rafmagnstaflan snúin 90° og tvöföld stærð (rot/staerd 433 sýnd)", rafT && rafT.rotation === 90 && Math.abs(rafT.size / tSt.size - 2) < 0.01, JSON.stringify([rafT, tSt && tSt.size]));
  await page.screenshot({ path: mynd("06_magntafla_og_athugasemd.png") });

  // ── 9) Vista í úttekt (gripið) ─────────────────────────────────────────────────────────────────────────────────
  const fyrirVistun = await stada();
  const veggirABordi = fyrirVistun.veggir;
  const frumHnit = (t) => {
    const m = fyrirVistun.mynd;
    return {
      x: Math.round(((t.x + t.size / 2 - m.x) / m.w) * m.uttekt.frumB),
      y: Math.round(((t.y + t.size / 2 - m.y) / m.h) * m.uttekt.frumH),
    };
  };
  appBaetti = true;
  await page.getByRole("button", { name: /Vista í úttekt/ }).click();
  await page.getByText(/merki vistuð/).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  check("„Vista í úttekt“ skrifaði einu sinni (gripið, ekki sent)", gripin.length === 1, `gripin=${gripin.length}`);
  const g0 = gripin[0];
  const body = JSON.parse(g0.body || "{}");
  fs.writeFileSync(mynd("gripin_sending_1.json"), JSON.stringify({ method: g0.method, url: g0.url, body }, null, 1));
  const hd = body.haedir.find((h) => h.id === HAED);
  const hd2 = body.haedir.find((h) => h.id === HAED2);
  const f1 = fersk.haedir.find((h) => h.id === HAED);
  const f2 = fersk.haedir.find((h) => h.id === HAED2);
  const merki = (u) => hd.markers.filter((m) => String(m.unitId) === String(u));
  check("PATCH á company_id=1612", g0.method === "PATCH" && /company_id=eq\.1612/.test(g0.url), `${g0.method} ${g0.url}`);
  check("nýtt tæki 25447 í hæðinni, á smellta staðnum", merki(25447).length === 1 && JSON.stringify({ x: merki(25447)[0].x, y: merki(25447)[0].y }) === JSON.stringify(frumHnit(takniFyrir(fyrirVistun, 25447)[0])), JSON.stringify(merki(25447)));
  check("25442 fært í hæðinni", merki(25442).length === 1 && JSON.stringify({ x: merki(25442)[0].x, y: merki(25442)[0].y }) === JSON.stringify(frumHnit(takniFyrir(fyrirVistun, 25442)[0])), JSON.stringify(merki(25442)));
  check("25448 og dregna 25451 í hæðinni", merki(25448).length === 1 && merki(25451).length === 1, "");
  check("teknu tækin 25443 og 25444 EKKI í hæðinni", merki(25443).length === 0 && merki(25444).length === 0, "");
  const ut = hd.markers.filter((m) => m.sign === "ut");
  const sg = hd.markers.filter((m) => m.sign === "segull");
  check("Segulloki í sendingunni á Teikning-sniði (s:segull:<id>, litur #c93c1d, rot 0)", sg.length === 1 && /^s:segull:[0-9a-z]+$/.test(sg[0].unitId) && sg[0].kind === "sign" && sg[0].color === "#c93c1d" && sg[0].rot === 0, JSON.stringify(sg));
  check(
    "ÚT-merkið á Teikning-sniði: kind sign, sign ut, unitId s:ut:<id>, litur, rot 0",
    ut.length === 1 && ut[0].kind === "sign" && /^s:ut:[0-9a-z]+$/.test(ut[0].unitId) && ut[0].color === "#15803d" && ut[0].rot === 0,
    JSON.stringify(ut)
  );
  const utTaknNu = (await stada()).takn.find((t) => t.sg === "ut");
  check("borðið fær unitId ÚT-merkisins (næsta vistun tvöfaldar ekki)", utTaknNu && ut[0] && utTaknNu.u === ut[0].unitId, JSON.stringify([utTaknNu, ut[0]]));
  const oHreyfd = [25445, 25446, 25449, 25450, 25452, 25454, 25455];
  const fM = (u) => f1.markers.find((m) => String(m.unitId) === String(u));
  check("óhreyfð tæki óbreytt (líka brotatölu-hnit 25445)", oHreyfd.every((u) => JSON.stringify(merki(u)[0]) === JSON.stringify(fM(u))), JSON.stringify(oHreyfd.map((u) => [merki(u)[0], fM(u)])));
  const gomulMerki = f1.markers.filter((m) => m.kind === "sign" && m.unitId !== "s:bjalla:fraappinu");
  check("eldri stimplar (slanga, bjalla, rafmagn m. rot 90/staerd 52, skilti) óbreyttir", gomulMerki.length === 4 && gomulMerki.every((m) => JSON.stringify(merki(m.unitId)[0]) === JSON.stringify(m)), JSON.stringify(gomulMerki));
  check("merki sem appið setti EFTIR opnun heldur sér (fersk röð)", merki("s:bjalla:fraappinu").length === 1, "");
  // 25442 + 7 óhreyfð tæki + 4 eldri stimplar + bjalla úr appinu + 5 ný (25447, 25448, 25451, ÚT, Segulloki)
  check("laust Léttvatn (án tækis) EKKI skrifað", hd.markers.length === 1 + 7 + 4 + 1 + 5, `markers=${hd.markers.length}: ${JSON.stringify(hd.markers.map((m) => m.unitId))}`);
  check("2. hæð: 25448 farið, ÚT-merkið þar ósnert", hd2.markers.length === 1 && hd2.markers[0].unitId === "s:ut:prof2haed" && JSON.stringify(hd2.markers[0]) === JSON.stringify(f2.markers.find((m) => m.unitId === "s:ut:prof2haed")), JSON.stringify(hd2.markers));
  const { markers: _a, ...hd2Annad } = hd2;
  const { markers: _b, ...f2Annad } = f2;
  check("2. hæð að öðru leyti óbreytt", JSON.stringify(hd2Annad) === JSON.stringify(f2Annad), "breyttist");
  check("veggirnir varðveittir: veggjaLinur = veggir á borðinu", Array.isArray(hd.veggjaLinur) && hd.veggjaLinur.length === veggirABordi && veggirABordi > 0, `${hd.veggjaLinur?.length} vs ${veggirABordi}`);
  check("pdfVeggir og skurður ósnert, leidrett sett", JSON.stringify(hd.pdfVeggir) === JSON.stringify(f1.pdfVeggir) && JSON.stringify(hd.skurdur) === JSON.stringify(f1.skurdur) && hd.leidrett?.af === "turbopaint", "");
  check("markers-dálkurinn = merki 1. hæðar (eldri lesendur)", JSON.stringify(body.markers) === JSON.stringify(body.haedir[0].markers), "");
  check("aðeins tvær hæðir, sama röð", body.haedir.map((h) => h.id).join() === fersk.haedir.map((h) => h.id).join(), "");
  st = await stada();
  check("merkið úr appinu kom á borðið eftir vistun", takniFyrir(st, "s:bjalla:fraappinu").length === 1, "");
  check("`merki` tengingarinnar uppfært (teknu tækin farin, ný komin)", !st.mynd.uttekt.merki.includes("25443") && st.mynd.uttekt.merki.includes("25447") && st.mynd.uttekt.merki.includes(ut[0]?.unitId), JSON.stringify(st.mynd.uttekt.merki));
  const toastTexti = await page.getByText(/merki vistuð/).first().innerText();
  check("staðfesting segir frá teknum og ótengdum", /2 tekin af/.test(toastTexti) && /1 tákn án tengingar vistast ekki í úttekt/.test(toastTexti), toastTexti);
  await page.screenshot({ path: mynd("07_vistad_gripid.png") });

  // ── 10) Önnur vistun án breytinga: sama niðurstaða, ekkert tvöfaldast ─────────────────────────────────────────
  await page.getByRole("button", { name: /Vista í úttekt/ }).click();
  await page.waitForTimeout(3500);
  check("önnur vistun skrifaði (gripið)", gripin.length === 2, `gripin=${gripin.length}`);
  if (gripin.length === 2) {
    const body2 = JSON.parse(gripin[1].body || "{}");
    const hdB = body2.haedir.find((h) => h.id === HAED);
    fs.writeFileSync(mynd("gripin_sending_2.json"), JSON.stringify(body2, null, 1));
    check("önnur vistun: sömu merki 1. hæðar (ÚT ekki tvöfaldað)", JSON.stringify(hdB.markers) === JSON.stringify(hd.markers), JSON.stringify(hdB.markers.map((m) => m.unitId)));
  }

  // ── 11) Teikning-hamur: listinn sést (samanbrotinn) ───────────────────────────────────────────────────────────
  await page.getByRole("tab", { name: "Teikning" }).click();
  await page.waitForTimeout(300);
  check("í Teikning-ham: tækjalistinn sést (samanbrotinn)", await radir.isVisible() && !(await radir.locator("[data-taeki]").count()), "");
  await page.screenshot({ path: mynd("08_teikning_hamur.png") });

  console.log(ok.map((n) => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map((n) => "  ✘ " + n).join("\n"));
  console.log(`\n${ok.length}/${ok.length + bad.length} · lestrar: ${lestrar} · skrif í teikning_bord gripin: ${gripin.length} · villur: ${errs.length ? errs.join(" | ") : "engar"}`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error("BROTNAÐI:", e.stack || e.message);
  process.exit(1);
});
