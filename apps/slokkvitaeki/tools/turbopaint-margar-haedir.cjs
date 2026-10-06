/* TurboPaint — „Croppa oft" + „Tengja við hæð": margar hæðir af EINU blaði, sannað í raunverulegum vafra á
 * Ægisgötu 4 (fyrirtæki 194, Three sisters). Blaðið 2015-03-2425.tif ber grunnmyndir 1., 2. og 3. hæðar hver undir
 * annarri (Agnar 06.10.2026).
 *
 *   node tools/turbopaint-margar-haedir.cjs [http://localhost:4123] [úttaksmappa]
 *
 * Raunverulegir músarsmellir: opnar 1. hæð úr úttekt, „Croppa oft" (Esc hættir, „Finna sjálfkrafa", kassi eytt),
 * dregur kassa yfir grunnmyndirnar þrjár, Enter sker, tengir hlutana við 1. hæð (til) og 2./3. hæð (nýjar), setur
 * tæki á 2. hæð og ýtir á „Vista í úttekt" — tvisvar.
 *
 * ENGIN skrif fara í teikning_bord: staðurinn á enga röð þar, svo lestur 194 er svaraður með prófunarröð (ein hæð,
 * „1. hæð", á blaðinu, með ÚT-merki og tæki 21940) og ÖLL skrif þangað eru gripin (svarað 200) og skoðuð. Önnur
 * skrif (borðið sjálft, turbopaint_boards + myndir) mega fara — Agnar leyfði að borð 194 endurskapist. */
const path = require("path");
const fs = require("fs");
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright"));
}

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = process.argv[3] || "C:/Users/Slokkvitaeki/teikning-greining/turbopaint_margar_haedir";
fs.mkdirSync(OUT, { recursive: true });
const CID = 194, HAED1 = "h194prof1";
const PERMALINK =
  "https://skjalasafn.reykjavik.is/fotoweb/archives/5000-A%C3%B0aluppdr%C3%A6ttir/A%C3%B0aluppdr%C3%A6ttir/2015/04/2015-03-2425.tif.info";
const IMAGE_URL = "/.netlify/functions/teikn-mynd?url=" + encodeURIComponent(PERMALINK);
// Grunnmyndirnar á blaðinu (dílar frummyndar 6006×4373), fundnar með því að skoða blaðið: 1. hæð neðst, 3. efst.
const KASSAR = {
  1: { x: 2330, y: 3000, w: 2430, h: 1270 },
  2: { x: 2330, y: 1560, w: 2430, h: 1150 },
  3: { x: 2330, y: 150, w: 2430, h: 1180 },
};
const TAEKI_2HAED = { unitId: 21941, x: 3300, y: 2100 };
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));
const mynd = (n) => path.join(OUT, n);
const naer = (a, b, vik) => Math.abs(a - b) <= vik;

const FIXTURE = {
  company_id: CID,
  image_url: IMAGE_URL,
  updated_at: "2026-10-06T12:00:00+00:00",
  markers: [],
  haedir: [
    {
      id: HAED1,
      nafn: "1. hæð",
      image_url: IMAGE_URL,
      frum: { b: 6006, h: 4373 },
      skurdur: null,
      sjalf: true,
      thett: true,
      syn: { skyrari: true, kontrast: 1.3 },
      stimpilStaerd: 30,
      veggir: [],
      pdfVeggir: [],
      markers: [
        { unitId: "s:ut:prof194", x: 3000, y: 3600, kind: "sign", sign: "ut", color: "#15803d", rot: 0 },
        { unitId: 21940, x: 4000.5, y: 3700.25 },
      ],
    },
  ],
};
FIXTURE.markers = FIXTURE.haedir[0].markers;

let _page = null;
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  _page = page;
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const dialogs = [];
  let hafna = false; // næsta staðfesting: hætta við
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    if (hafna) {
      hafna = false;
      await d.dismiss();
    } else await d.accept();
  });

  // ── teikning_bord: lestur 194 = prófunarröðin (eða það sem síðast var „skrifað"), ÖLL skrif gripin ─────────────
  const gripin = [];
  const adrarSkrifanir = [];
  let skrifad = null;
  let lestrar = 0;
  await ctx.route("**/rest/v1/teikning_bord*", async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") {
      if (/company_id=eq\.194\b/.test(req.url())) {
        lestrar++;
        const rod = JSON.parse(JSON.stringify(FIXTURE));
        if (skrifad) {
          rod.haedir = skrifad.haedir;
          rod.markers = skrifad.markers;
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([rod]) });
      }
      return route.continue();
    }
    gripin.push({ method: req.method(), url: req.url(), body: req.postData() });
    try {
      skrifad = JSON.parse(req.postData() || "null");
    } catch {
      /* ekki json */
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
  });
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.method() !== "HEAD" && r.method() !== "OPTIONS" && /supabase\.co/.test(r.url()) && !/teikning_bord/.test(r.url())) {
      adrarSkrifanir.push(r.method() + " " + r.url().replace(/\?.*$/, ""));
    }
  });

  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED1}&b=6006&h=4373&ham=teikning`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 90000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const st = await page.evaluate(() => {
      const s = window.__tpStore?.getState();
      return s && { m: s.objects.some((o) => o.type === "image" && o.uttekt), prog: s.importProgress };
    });
    if (st && st.m && !st.prog) break;
    await page.waitForTimeout(800);
  }
  await page.getByText(/merki á teikningunni/).first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // ── hjálparföll ────────────────────────────────────────────────────────────────────────────────────────────────
  const stada = () =>
    page.evaluate(() => {
      const s = window.__tpStore.getState();
      return {
        tool: s.tool,
        selected: s.selectedIds,
        myndir: s.objects
          .filter((o) => o.type === "image")
          .map((m) => ({ id: m.id, x: m.x, y: m.y, w: m.width, h: m.height, uttekt: m.uttekt || null, bladhluti: m.bladhluti || null, heimild: m.heimild || null })),
        takn: s.objects
          .filter((o) => o.type === "symbol")
          .map((t) => ({ id: t.id, x: t.x, y: t.y, size: t.size, rotation: t.rotation, u: t.uttektUnitId, sg: t.uttektSign, parentId: t.parentId })),
      };
    });
  /** Punktur í dílum frummyndar → skjáhnit, um mynd (og skurð hennar ef hún er hluti). */
  const frumASkja = (m, fx, fy) =>
    page.evaluate(
      ([m, fx, fy]) => {
        const s = window.__tpStore.getState(), cam = s.camera;
        const r = document.querySelector(".tp-sheet").getBoundingClientRect();
        const sv = (m.uttekt && m.uttekt.myndSkurdur) || (m.bladhluti && m.bladhluti.svaedi) || { x: 0, y: 0, w: m.uttekt.frumB, h: m.uttekt.frumH };
        const wx = m.x + ((fx - sv.x) / sv.w) * m.w, wy = m.y + ((fy - sv.y) / sv.h) * m.h;
        return { x: r.left + wx * cam.scale + cam.x, y: r.top + wy * cam.scale + cam.y, wx, wy };
      },
      [m, fx, fy]
    );
  const draga = async (a, z) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + z.x) / 2, (a.y + z.y) / 2, { steps: 4 });
    await page.mouse.move(z.x, z.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  };
  const dragaKassa = async (m, k) => draga(await frumASkja(m, k.x, k.y), await frumASkja(m, k.x + k.w, k.y + k.h));
  const kassaFjoldi = () => page.locator("[data-fjolkassi]").count();
  const hamCroppaOft = page.locator('button[title^="Margar grunnmyndir á einu blaði (1., 2., 3. hæð)"]');

  // ── 1) Opnað úr úttekt ─────────────────────────────────────────────────────────────────────────────────────────
  let st = await stada();
  const blad = st.myndir.find((m) => m.uttekt);
  check("1. hæð 194 opnast tengd úttektinni (frum 6006×4373, blaðið úr skjalasafni)", blad && blad.uttekt.companyId === CID && blad.uttekt.haedId === HAED1 && blad.uttekt.frumB === 6006 && blad.heimild && blad.heimild.slod === PERMALINK, JSON.stringify(blad && { u: blad.uttekt, h: blad.heimild }));
  check("merkin tvö (ÚT + tæki 21940) á blaðinu", st.takn.filter((t) => t.u != null).length === 2, JSON.stringify(st.takn));
  console.log(`   blaðið á borðinu: ${Math.round(blad.w)}×${Math.round(blad.h)} (frummynd 6006×4373)`);
  await page.screenshot({ path: mynd("01_opnad_ur_uttekt.png") });

  // ── 2) Croppa oft: Esc hættir, Finna sjálfkrafa, kassi eytt ────────────────────────────────────────────────────
  check("„Croppa oft“ í hamstiku Teikning-hams", await hamCroppaOft.isVisible(), "sést ekki");
  await hamCroppaOft.click();
  await page.waitForTimeout(200);
  check("tólið „fjolcrop“ virkt og spjaldið sýnt", (await stada()).tool === "fjolcrop" && (await page.locator("[data-fjolcrop]").isVisible()), (await stada()).tool);
  await dragaKassa(blad, KASSAR[1]);
  check("dreginn kassi birtist sem 1", (await kassaFjoldi()) === 1, `${await kassaFjoldi()}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check("Esc hættir: kassarnir hverfa og Velja-tól", (await stada()).tool === "select" && !(await page.locator("[data-fjolcrop]").count()), (await stada()).tool);

  await hamCroppaOft.click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Finna sjálfkrafa" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-fjolkassi]").length > 0, null, { timeout: 30000 }).catch(() => {});
  const fundnir = await kassaFjoldi();
  check("„Finna sjálfkrafa“ stingur upp á kössum utan um grunnmyndirnar (≥ 3)", fundnir >= 3, `${fundnir}`);
  // hver grunnmynd hæðanna þriggja er inni í einhverjum uppástungukassa (í dílum frummyndar)
  const uppast = await page.evaluate((m) => {
    const k = window.__tpFjolcrop.getState().kassar;
    const kx = m.uttekt.frumB / m.w, ky = m.uttekt.frumH / m.h;
    return k.map((b) => ({ x: Math.round((b.x - m.x) * kx), y: Math.round((b.y - m.y) * ky), w: Math.round(b.width * kx), h: Math.round(b.height * ky) }));
  }, blad);
  const hylur = (n) => uppast.some((b) => { const cx = KASSAR[n].x + KASSAR[n].w / 2, cy = KASSAR[n].y + KASSAR[n].h / 2; return cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h && b.w > KASSAR[n].w * 0.7; });
  check("…og þær ná yfir 1., 2. og 3. hæð", [1, 2, 3].every(hylur), JSON.stringify(uppast));
  await page.screenshot({ path: mynd("02_finna_sjalfkrafa.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  // ── 3) Þrír kassar yfir 1., 2. og 3. hæð — og einn aukakassi sem er eytt ──────────────────────────────────────
  await hamCroppaOft.click();
  await page.waitForTimeout(200);
  for (const n of [1, 2, 3]) await dragaKassa(blad, KASSAR[n]);
  await dragaKassa(blad, { x: 300, y: 300, w: 1200, h: 900 }); // afstöðumyndin — óvart
  check("fjórir kassar númeraðir 1–4", (await kassaFjoldi()) === 4, `${await kassaFjoldi()}`);
  await page.locator('[data-fjolkassi="4"]').click();
  await page.waitForTimeout(200);
  check("kassa 4 eytt (✕) — þrír eftir", (await kassaFjoldi()) === 3, `${await kassaFjoldi()}`);
  // kassi færður með músinni (dreginn) og aftur til baka — kassarnir eru breytanlegir
  const kassi3 = () => page.evaluate(() => window.__tpFjolcrop.getState().kassar[2]);
  const k3 = await kassi3();
  const midK3 = await page.evaluate((k) => {
    const s = window.__tpStore.getState(), cam = s.camera;
    const r = document.querySelector(".tp-sheet").getBoundingClientRect();
    return { x: r.left + (k.x + k.width * 0.5) * cam.scale + cam.x, y: r.top + (k.y + k.height * 0.5) * cam.scale + cam.y };
  }, k3);
  await draga(midK3, { x: midK3.x + 60, y: midK3.y });
  const k3b = await kassi3();
  check("kassi 3 dreginn til (færist, sama stærð)", Math.abs(k3b.x - k3.x) > 10 && Math.abs(k3b.width - k3.width) < 1e-6 && (await kassaFjoldi()) === 3, JSON.stringify([k3, k3b]));
  await draga({ x: midK3.x + 60, y: midK3.y }, midK3);
  const k3c = await kassi3();
  check("…og aftur á sinn stað", Math.abs(k3c.x - k3.x) < 1e-6 && Math.abs(k3c.y - k3.y) < 1e-6, JSON.stringify([k3, k3c]));
  await page.screenshot({ path: mynd("03_thrir_kassar.png") });

  // ── 4) Enter: skorið í þrjá hluta hlið við hlið ────────────────────────────────────────────────────────────────
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__tpStore.getState().objects.filter((o) => o.type === "image" && o.bladhluti).length === 3, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  st = await stada();
  const hlutar = st.myndir.filter((m) => m.bladhluti).sort((a, c) => a.bladhluti.nr - c.bladhluti.nr);
  check("blaðið vék fyrir þremur hlutum (engin önnur mynd eftir)", st.myndir.length === 3 && hlutar.length === 3, JSON.stringify(st.myndir.map((m) => m.id)));
  const svaedi = hlutar.map((h) => h.bladhluti.svaedi);
  check(
    "svæði hlutanna í dílum frummyndar = kassarnir (±8 díla — dregið með mús)",
    [1, 2, 3].every((n, i) => ["x", "y", "w", "h"].every((k) => naer(svaedi[i][k], KASSAR[n][k], 8))),
    JSON.stringify(svaedi)
  );
  check("svæðin heiltölur, slóð blaðsins og frum fylgja hverjum hluta", svaedi.every((s) => Object.values(s).every(Number.isInteger)) && hlutar.every((h) => h.bladhluti.imageUrl === IMAGE_URL && h.bladhluti.frumB === 6006 && h.bladhluti.frumH === 4373 && h.bladhluti.companyId === CID), JSON.stringify(hlutar.map((h) => h.bladhluti)));
  check("hlutarnir hlið við hlið (sama efri brún, hver hægra megin við hinn)", hlutar[1].x > hlutar[0].x + hlutar[0].w && hlutar[2].x > hlutar[1].x + hlutar[1].w && hlutar.every((h) => Math.abs(h.y - hlutar[0].y) < 1e-6), JSON.stringify(hlutar.map((h) => [h.x, h.y, h.w])));
  check("hluti 1 erfði tenginguna við 1. hæð (merkin hennar standa á honum)", hlutar[0].uttekt && hlutar[0].uttekt.haedId === HAED1 && JSON.stringify(hlutar[0].uttekt.myndSkurdur) === JSON.stringify(svaedi[0]) && !hlutar[1].uttekt && !hlutar[2].uttekt, JSON.stringify(hlutar.map((h) => h.uttekt)));
  // merkin fóru með hluta 1 og halda nákvæmlega sömu hnitum frummyndar
  const fyrstuHnit = await page.evaluate(() => {
    const s = window.__tpStore.getState();
    const m = s.objects.find((o) => o.type === "image" && o.uttekt);
    const sv = m.uttekt.myndSkurdur;
    return s.objects
      .filter((o) => o.type === "symbol" && o.uttektUnitId != null)
      .map((t) => ({ u: t.uttektUnitId, parent: t.parentId === m.id, x: Math.round(sv.x + ((t.x + t.size / 2 - m.x) / m.width) * sv.w), y: Math.round(sv.y + ((t.y + t.size / 2 - m.y) / m.height) * sv.h) }));
  });
  check("ÚT-merkið og tæki 21940 fylgja hluta 1 á sömu hnitum frummyndar (21940: 4000,5 → innan námundunar)", fyrstuHnit.length === 2 && fyrstuHnit.every((t) => t.parent) && fyrstuHnit.some((t) => t.u === "s:ut:prof194" && t.x === 3000 && t.y === 3600) && fyrstuHnit.some((t) => t.u === 21940 && Math.abs(t.x - 4000.5) <= 0.5 && t.y === 3700), JSON.stringify(fyrstuHnit));
  await page.screenshot({ path: mynd("04_skorid_hlid_vid_hlid.png") });

  // ── 5) Tengja við hæð ──────────────────────────────────────────────────────────────────────────────────────────
  const tengjaSpjald = page.locator('section[aria-label="Tengja við hæð"]');
  const veljaHluta = async (h) => {
    const p = await frumASkja(h, h.bladhluti.svaedi.x + h.bladhluti.svaedi.w * 0.2, h.bladhluti.svaedi.y + h.bladhluti.svaedi.h * 0.55);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
  };
  const opnaValmynd = async () => {
    await tengjaSpjald.getByRole("button", { name: /Tengja við hæð/ }).click();
    await page.waitForTimeout(250);
  };
  const nyHaed = async (nafnBuist) => {
    await tengjaSpjald.locator('[data-haed="ny"]').click();
    const inn = tengjaSpjald.getByLabel("Nafn nýrrar hæðar");
    const tillaga = await inn.inputValue();
    await tengjaSpjald.getByRole("button", { name: "Stofna" }).click();
    await page.waitForTimeout(300);
    return tillaga === nafnBuist ? null : tillaga;
  };
  // hluti 2 → + Ný hæð („2. hæð" stungið upp á)
  await veljaHluta(hlutar[1]);
  check("valinn hluti sýnir „HLUTI 2 · ótengdur“", (await tengjaSpjald.isVisible()) && /Hluti 2 · ótengdur/.test(await tengjaSpjald.locator("[data-haed-merki]").innerText()), await tengjaSpjald.innerText().catch(() => "?"));
  await opnaValmynd();
  const valmynd = await tengjaSpjald.locator('[role="menu"]').innerText();
  check("valmyndin: 1. hæð (á hluta 1) + „+ Ný hæð“", /1\. hæð/.test(valmynd) && /á hluta 1/.test(valmynd) && /\+ Ný hæð/.test(valmynd), valmynd);
  await page.screenshot({ path: mynd("05_tengja_valmynd.png") });
  let rangt = await nyHaed("2. hæð");
  check("+ Ný hæð stingur upp á „2. hæð“", rangt === null, rangt);
  st = await stada();
  let h2 = st.myndir.find((m) => m.id === hlutar[1].id);
  check("hluti 2 tengdur nýrri „2. hæð“ (nyHaed, skurður = hlutinn)", h2.uttekt && h2.uttekt.nyHaed && h2.uttekt.nyHaed.nafn === "2. hæð" && /^h[0-9a-z]+$/.test(h2.uttekt.haedId) && JSON.stringify(h2.uttekt.myndSkurdur) === JSON.stringify(svaedi[1]), JSON.stringify(h2.uttekt));
  // hluti 3 → reyna „2. hæð" (þegar á hluta 2): spurt, hætt við
  await veljaHluta(hlutar[2]);
  await opnaValmynd();
  hafna = true;
  await tengjaSpjald.locator(`[data-haed="${h2.uttekt.haedId}"]`).click();
  await page.waitForTimeout(300);
  check("2. hæð á hluta 3: spurt hvort skipta eigi („… þegar tengd hluta 2 …“) — hætt við, ekkert breytist", dialogs.some((d) => /„2\. hæð“ er þegar tengd hluta 2/.test(d)) && !(await stada()).myndir.find((m) => m.id === hlutar[2].id).uttekt && (await stada()).myndir.find((m) => m.id === hlutar[1].id).uttekt?.haedId === h2.uttekt.haedId, JSON.stringify(dialogs));
  rangt = await nyHaed("3. hæð");
  check("+ Ný hæð á hluta 3 stingur upp á „3. hæð“", rangt === null, rangt);
  // hluti 1 → 1. hæð (þegar tengd): ✓ í valmyndinni
  await veljaHluta(hlutar[0]);
  check("hluti 1 sýnir „1. hæð“", (await tengjaSpjald.locator("[data-haed-merki]").innerText()).trim() === "1. hæð", await tengjaSpjald.locator("[data-haed-merki]").innerText());
  await opnaValmynd();
  check("valmynd hluta 1: „1. hæð ✓ þessi hluti“", /✓ þessi hluti/.test(await tengjaSpjald.locator(`[data-haed="${HAED1}"]`).innerText()), await tengjaSpjald.locator(`[data-haed="${HAED1}"]`).innerText());
  await tengjaSpjald.locator(`[data-haed="${HAED1}"]`).click();
  await page.waitForTimeout(250);
  st = await stada();
  const tengingar = hlutar.map((h) => st.myndir.find((m) => m.id === h.id).uttekt);
  check("allir þrír hlutar tengdir: 1. hæð, 2. hæð (ný), 3. hæð (ný)", tengingar[0]?.haedId === HAED1 && tengingar[1]?.nyHaed?.nafn === "2. hæð" && tengingar[2]?.nyHaed?.nafn === "3. hæð", JSON.stringify(tengingar));
  check("vistunarborðinn: „3 af 3 hlutum tengdir hæðum“", await page.getByText("3 af 3 hlutum tengdir hæðum").isVisible(), "sést ekki");
  await page.keyboard.press("Escape"); // afvelja
  await page.waitForTimeout(200);
  await page.screenshot({ path: mynd("06_allir_tengdir.png") });

  // ── 6) Tæki 21941 sett á 2. hæð úr tækjalistanum ───────────────────────────────────────────────────────────────
  const radir = page.locator('section[aria-label="Tæki staðarins"]');
  await radir.waitFor({ timeout: 20000 });
  const haus = radir.locator("button[aria-expanded]").first();
  if ((await haus.getAttribute("aria-expanded")) !== "true") await haus.click();
  await radir.locator(`[data-taeki="${TAEKI_2HAED.unitId}"]`).waitFor({ timeout: 30000 });
  await radir.locator(`[data-taeki="${TAEKI_2HAED.unitId}"]`).click();
  await page.waitForTimeout(200);
  st = await stada();
  h2 = st.myndir.find((m) => m.id === hlutar[1].id);
  const smellur = await frumASkja(h2, TAEKI_2HAED.x, TAEKI_2HAED.y);
  await page.mouse.click(smellur.x, smellur.y);
  await page.waitForTimeout(400);
  st = await stada();
  const t41 = st.takn.filter((t) => String(t.u) === String(TAEKI_2HAED.unitId));
  check("tæki 21941 sett á hluta 2 (eitt tákn, fest við hlutann)", t41.length === 1 && t41[0].parentId === h2.id, JSON.stringify(t41));
  const vaentan = {
    x: Math.round(h2.uttekt.myndSkurdur.x + ((t41[0].x + t41[0].size / 2 - h2.x) / h2.w) * h2.uttekt.myndSkurdur.w),
    y: Math.round(h2.uttekt.myndSkurdur.y + ((t41[0].y + t41[0].size / 2 - h2.y) / h2.h) * h2.uttekt.myndSkurdur.h),
  };
  check("miðja táknsins þar sem smellt var (≈ (3300, 2100) í frummynd)", naer(vaentan.x, TAEKI_2HAED.x, 6) && naer(vaentan.y, TAEKI_2HAED.y, 6), JSON.stringify(vaentan));
  await page.screenshot({ path: mynd("07_taeki_a_2haed.png") });

  // ── 7) Vista í úttekt (gripið) ─────────────────────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: /Vista í úttekt/ }).click();
  await page.getByText(/merki vistuð/).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  check("„Vista í úttekt“ skrifaði einu sinni (gripið, ekki sent)", gripin.length === 1, `gripin=${gripin.length}`);
  const g0 = gripin[0];
  const body = JSON.parse(g0.body || "{}");
  fs.writeFileSync(mynd("gripin_sending_1.json"), JSON.stringify({ method: g0.method, url: g0.url, body }, null, 1));
  check("PATCH á company_id=194", g0.method === "PATCH" && /company_id=eq\.194/.test(g0.url), `${g0.method} ${g0.url}`);
  const hs = body.haedir || [];
  check("þrjár hæðir: 1. hæð (til) + 2. og 3. hæð (nýjar), í þessari röð", hs.length === 3 && hs[0].id === HAED1 && hs.map((h) => h.nafn).join("|") === "1. hæð|2. hæð|3. hæð", JSON.stringify(hs.map((h) => [h.id, h.nafn])));
  check("sama image_url á öllum (blaðið, snið Teikning-gluggans)", hs.every((h) => h.image_url === IMAGE_URL), JSON.stringify(hs.map((h) => h.image_url)));
  check("þrír ólíkir skurðir = hlutarnir nákvæmlega (dílar frummyndar)", hs.every((h, i) => JSON.stringify(h.skurdur) === JSON.stringify(svaedi[i])) && new Set(hs.map((h) => JSON.stringify(h.skurdur))).size === 3, JSON.stringify(hs.map((h) => h.skurdur)));
  check("…og skurðirnir eru kassarnir sem voru dregnir (±8)", hs.every((h, i) => ["x", "y", "w", "h"].every((k) => naer(h.skurdur[k], KASSAR[i + 1][k], 8))), JSON.stringify(hs.map((h) => h.skurdur)));
  check("frum 6006×4373 og handvalinn skurður (sjalf=false, ekki „thett“) á öllum", hs.every((h) => h.frum && h.frum.b === 6006 && h.frum.h === 4373 && h.sjalf === false && !("thett" in h)), JSON.stringify(hs.map((h) => [h.frum, h.sjalf, h.thett])));
  check("ný hæð-id á sniði Teikning (h<tími36><slembi>)", hs.slice(1).every((h) => /^h[0-9a-z]{9,}$/.test(h.id)), JSON.stringify(hs.map((h) => h.id)));
  const m2 = (hs[1] && hs[1].markers) || [];
  check(`tæki 21941 á 2. hæð á réttum stað í frummynd (${vaentan.x}, ${vaentan.y})`, m2.length === 1 && m2[0].unitId === TAEKI_2HAED.unitId && m2[0].x === vaentan.x && m2[0].y === vaentan.y, JSON.stringify(m2));
  check("3. hæð ný og tóm (markers: [], veggir: [])", hs[2] && Array.isArray(hs[2].markers) && hs[2].markers.length === 0 && Array.isArray(hs[2].veggir), JSON.stringify(hs[2]));
  const f1 = FIXTURE.haedir[0];
  check("1. hæð varðveitt: id, nafn, syn, stimpilStaerd, ÚT-merki og tæki 21940 óbreytt (líka brotatölur)", hs[0] && hs[0].nafn === "1. hæð" && JSON.stringify(hs[0].syn) === JSON.stringify(f1.syn) && hs[0].stimpilStaerd === 30 && JSON.stringify(hs[0].markers) === JSON.stringify(f1.markers), JSON.stringify(hs[0]));
  check("21941 aðeins á 2. hæð", hs.filter((h) => (h.markers || []).some((m) => m.unitId === TAEKI_2HAED.unitId)).length === 1, "");
  check("markers-dálkurinn = merki 1. hæðar (eldri lesendur)", JSON.stringify(body.markers) === JSON.stringify(hs[0].markers), "");
  const toastTexti = await page.getByText(/merki vistuð/).first().innerText();
  check("staðfesting nefnir hæðirnar þrjár", /3 hæðir \(1\. hæð, 2\. hæð ný, 3\. hæð ný\)/.test(toastTexti), toastTexti);
  const bordNafn = await page.evaluate(() => window.__tpStore.getState().name);
  check("borðið heitir eftir hæðunum (opnun 1. hæðar úr appinu endurbyggir það ekki)", bordNafn === "Three sisters - Ægisgata 4 — 1. hæð, 2. hæð, 3. hæð", bordNafn);
  st = await stada();
  check("eftir vistun: nýju hæðirnar ekki lengur „nýjar“ á borðinu, `merki` uppfært", hlutar.every((h) => { const u = st.myndir.find((m) => m.id === h.id).uttekt; return u && !u.nyHaed; }) && st.myndir.find((m) => m.id === hlutar[1].id).uttekt.merki.includes("21941"), JSON.stringify(st.myndir.map((m) => m.uttekt)));
  await page.screenshot({ path: mynd("08_vistad_gripid.png") });

  // ── 8) Önnur vistun án breytinga: sama sending ────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: /Vista í úttekt/ }).click();
  await page.waitForTimeout(3500);
  check("önnur vistun skrifaði (gripið)", gripin.length === 2, `gripin=${gripin.length}`);
  if (gripin.length === 2) {
    const body2 = JSON.parse(gripin[1].body || "{}");
    fs.writeFileSync(mynd("gripin_sending_2.json"), JSON.stringify(body2, null, 1));
    check("önnur vistun: sömu hæðir og merki (ekkert tvöfaldast, engin ný hæð aftur)", JSON.stringify(body2.haedir.map((h) => [h.id, h.skurdur, h.markers])) === JSON.stringify(hs.map((h) => [h.id, h.skurdur, h.markers])), JSON.stringify(body2.haedir.map((h) => h.id)));
  }

  console.log(ok.map((n) => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map((n) => "  ✘ " + n).join("\n"));
  console.log(`\n${ok.length}/${ok.length + bad.length} · lestrar 194: ${lestrar} · skrif í teikning_bord gripin: ${gripin.length} · önnur skrif: ${[...new Set(adrarSkrifanir)].join(", ") || "engin"} · villur: ${errs.length ? errs.join(" | ") : "engar"}`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch(async (e) => {
  console.log(ok.map((n) => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map((n) => "  ✘ " + n).join("\n"));
  console.error("BROTNAÐI:", e.stack || e.message);
  try { if (_page) await _page.screenshot({ path: mynd("villa.png") }); } catch { /* */ }
  process.exit(1);
});
