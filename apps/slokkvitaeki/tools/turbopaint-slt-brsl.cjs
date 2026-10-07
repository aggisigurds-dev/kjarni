/* „SLT / BRSL af teikningu" + sjálftenging + Nýtt (Agnar 07.10.2026, Álfaborg 661 1. hæð, skönnuð FotoWeb-PDF:
 * „slt/brsl lesturinn er ekki að lesa það heldur ei-60 sýnist mér" · „ég var búinn að raða öllum tækjunum inn í
 * TurboPaint.. en þau koma ekki á Teikningar").
 *   node tools/turbopaint-slt-brsl.cjs [http://localhost:4123] [úttaksmappa]
 *
 * VÖRÐUR Á: ÖLL skrif í Supabase (REST + geymsla) gripin — ekkert fer út (turbopaint_boards / teikning_bord /
 * geymsla); í lokin er staðfest að hvert skrif-kall vafrans var gripið. Lestur fer í gegn (tæki staðarins, teikning_bord).
 *   A. Nýtt borð (opnað úr úttektinni) → „SLT / BRSL af teikningu":
 *      fjöldi BRSL / SLT; ENGINN EI-miði / eldveggur; hver 165.BR1-hlutur INNAN myndarinnar; hver slanga ≤ 1 m frá
 *      sínu slöngukefli og hvert SLT ≤ 1 m frá sínum stað; slöngurnar -00020..22 staðsettar (tengdar); ⌘Z tekur allt
 *      í einu skrefi, ⌘Y skilar; endurkeyrsla tvítekur ekkert
 *   B. Borðið eins og Agnar raðaði því (14 ótengd tákn úr lifandi borðinu) → „Vista í úttekt" (gripið):
 *      tengd = laus tæki af hverri tegund, restin Nýtt { nytt, tegund, stada: "bid", unitId: "n:…" }; ekkert unitId
 *      tvisvar yfir hæðir; 2. hæð ósnert; borðið fær lyklana (græn tæki, „Nýtt"-miðar); önnur vistun tvítekur ekkert
 *   Gögnin sem vistuðust (gripin) fara í <úttaksmappa>/vistun-661.json — Teikning-prófið (slokkvitaeki) notar þau. */
const path = require("path");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("C:/Users/Slokkvitaeki/luna-bridge/node_modules/playwright")); }
const BASE = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "http://localhost:4123";
const OUT = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : path.join(process.cwd(), "turbopaint-slt-brsl-myndir");
fs.mkdirSync(OUT, { recursive: true });
const CID = 661, HAED = "hmua8ukhvfaw", HAED2 = "hmua8v42ink6";
// Slöngukeflin (spíralarnir) á teikningunni, dílar myndarinnar 7478 × 5349 (lesið af myndinni, teikning-greining/slt_brsl)
const KEFLI = [[4457, 785], [1621, 1735], [1580, 2410], [4297, 2477], [1625, 3045], [1757, 3585], [4165, 4542], [3865, 272]];
// SLT sem stendur eitt (ekkert kefli): textinn er staðurinn
const SLT_EIN = [[4862, 4070], [1579, 4585], [3959, 1878]];
// 14 ótengd tákn sem Agnar raðaði (turbopaint_boards nAnM6xtBgjJ7njooQBX9nm 07.10.2026 ~12:35), miðað við mynd á (-160, 680)
const AGNAR = { x: -160, y: 680, takn: [
  ["teikn:slanga", 329.0, 1432.8], ["teikn:slanga", 342.4, 1217.2], ["teikn:slanga", 386.3, 1805.8], ["teikn:slanga", 346.0, 1634.1],
  ["teikn:slanga", 1151.1, 2110.0], ["teikn:slanga", 1191.3, 1443.6], ["teikn:slanga", 1243.7, 914.5], ["teikn:slanga", 1049.6, 751.9],
  ["teikn:lettvatn", 1081.9, 749.6], ["teikn:lettvatn", 1153.2, 2078.7], ["teikn:lettvatn", 370.9, 1629.3], ["teikn:lettvatn", 420.8, 1798.7],
  ["teikn:lettvatn", 329.5, 1475.1], ["teikn:lettvatn", 379.4, 1221.3],
] };
const ok = [], bad = [];
let vafri = null; // lokaður líka ef prófið brotnar (munaðarlaus vafri hélt áfram OCR og hægði á næstu keyrslu)
const check = (n, c, x) => { (c ? ok : bad).push(n); console.log((c ? "  ✓ " : "  ✗ ") + n + (c ? "" : "   ← " + x)); };

(async () => {
  const b = await chromium.launch({ headless: true });
  vafri = b;
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  // VÖRÐUR fyrst: engin skrif í Supabase (turbopaint_boards, teikning_bord, geymsla) fara út.
  const verndud = await require("./turbopaint-vordur.cjs").vernda(ctx);
  const skrifVafra = [];
  const errs = [];
  const loggar = [];
  let fersk = null; // teikning_bord eins og gagnagrunnurinn skilaði henni (fyrir vistun)
  let skrifad = null; // síðasta gripna vistun — eftir hana skila lestrar henni (eins og gagnagrunnurinn myndi)
  const gripin = [];
  await ctx.route("**/rest/v1/teikning_bord*", async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") {
      if (!new RegExp(`company_id=eq\\.${CID}\\b`).test(req.url())) return route.fallback();
      const res = await route.fetch();
      let j;
      try { j = await res.json(); } catch { return route.fulfill({ response: res }); }
      const rod = Array.isArray(j) ? j[0] : j;
      if (rod && rod.haedir) {
        if (!fersk) fersk = JSON.parse(JSON.stringify(rod));
        if (skrifad) { rod.haedir = JSON.parse(JSON.stringify(skrifad.haedir)); rod.markers = skrifad.markers; }
      }
      const headers = { ...res.headers() };
      delete headers["content-length"];
      delete headers["content-encoding"];
      return route.fulfill({ status: res.status(), headers, body: JSON.stringify(j) });
    }
    gripin.push(req.postData());
    try { skrifad = JSON.parse(req.postData() || "null"); } catch { /* ekki json */ }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
  });

  const nySida = async () => {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("request", (r) => { if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) skrifVafra.push({ method: r.method(), url: r.url().replace(/\?.*$/, "") }); });
    page.on("console", (m) => { const t = m.text(); if (/^\[SLT\]|^\[EI\]/.test(t)) loggar.push(t.slice(0, 20000)); });
    await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&ham=slokkvitaeki`, { waitUntil: "domcontentloaded" });
    await page.locator(".tp-toolbar").waitFor({ timeout: 120000 });
    await page.waitForFunction((cid) => {
      const w = window, s = w.__tpStore?.getState(); if (!s) return false;
      if (s.importProgress) w.__tpByrjad = true;
      if ([...document.querySelectorAll("[data-sonner-toast]")].some((e) => /merki á teikningunni/.test(e.textContent || ""))) w.__tpByrjad = true;
      if (!w.__tpByrjad || s.importProgress) return false;
      return s.objects.some((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
    }, CID, { timeout: 300000, polling: 100 });
    await page.waitForTimeout(2500);
    return page;
  };
  const stada = (page) => page.evaluate(() => {
    const s = window.__tpStore.getState();
    const m = s.objects.find((o) => o.type === "image" && o.uttekt);
    const S = s.objects.filter((o) => o.type === "symbol");
    const taeki = S.filter((o) => /^teikn:(lettvatn|duft|co2|slanga|annad)$/.test(o.symbolId));
    return {
      mynd: { x: m.x, y: m.y, w: m.width, h: m.height },
      taeki: taeki.map((o) => ({ id: o.id, sym: o.symbolId, cx: o.x + o.size / 2, cy: o.y + o.size / 2, unit: o.uttektUnitId ?? null, label: o.label })),
      mvs: s.objects.filter((o) => /^165\.BR1/.test(o.name)).map((o) => ({ type: o.type, name: o.name, x: o.x, y: o.y, w: o.type === "symbol" ? o.size : o.width, h: o.type === "symbol" ? o.size : o.height })),
      ei: s.objects.filter((o) => /^Eldveggur|^Eldhurð|^Eldveggir/.test(o.name) || o.veggTegund === "ei60" || o.veggTegund === "ei30").length,
      alls: s.objects.length,
      past: s.past.length,
    };
  });
  const bidaLesturs = async (page) => {
    await page.waitForFunction(() => window.__tpStore.getState().importProgress, null, { timeout: 30000 });
    await page.waitForFunction(() => !window.__tpStore.getState().importProgress, null, { timeout: 1800000, polling: 250 });
    await page.waitForTimeout(800);
  };
  const toasts = (page, re) => page.evaluate((r) => [...document.querySelectorAll("[data-sonner-toast]")].map((e) => e.textContent || "").filter((t) => new RegExp(r).test(t)).join(" | "), re.source);
  const ramma = async (page, X, Y, W, H) => {
    await page.evaluate(([x, y, w, h]) => {
      const s = window.__tpStore.getState(), el = document.querySelector(".tp-sheet"), r = el.getBoundingClientRect();
      const sc = Math.min(r.width / w, r.height / h) * 0.92;
      s.setCamera({ scale: sc, x: r.width / 2 - (x + w / 2) * sc, y: r.height / 2 - (y + h / 2) * sc });
    }, [X, Y, W, H]);
    await page.waitForTimeout(700);
  };

  // ═══ A. Nýtt borð → „SLT / BRSL af teikningu" ═════════════════════════════════════════════════════════════════════
  console.log("A. opna Álfaborg 1. hæð (Slökkvitæki-hamur) …");
  const page = await nySida();
  const asset = await page.evaluate(async () => {
    const s = window.__tpStore.getState(), m = s.objects.find((o) => o.type === "image" && o.uttekt);
    const c = await window.__tpKit.loadPlanCanvas(m); const r = { W: c.width, H: c.height }; c.width = 0; c.height = 0; return r;
  });
  const s0 = await stada(page);
  const M = s0.mynd, k = M.w / asset.W, metri = 28.35 * (M.w / 2379); // PDF-síða 1:100: 1 m = 28,35 pt; borðið = pt
  const iBord = ([x, y]) => [M.x + x * k, M.y + y * k];
  console.log("mynd:", JSON.stringify(M), "frummynd:", JSON.stringify(asset), "1 m =", metri.toFixed(2), "borðeiningar");
  await ramma(page, M.x, M.y, M.w, M.h);
  await page.screenshot({ path: path.join(OUT, "01_fyrir.png") });
  const t0 = Date.now();
  await page.locator('button[title^="Lesa SLT og BRSL"]').click();
  await bidaLesturs(page);
  const sek = Math.round((Date.now() - t0) / 1000);
  const s1 = await stada(page);
  const tA = await toasts(page, /BRSL|SLT/);
  console.log(`lestur (${sek} s):`, tA);
  const nidur = loggar.filter((l) => /^\[SLT\] \{"ms"/.test(l)).pop();
  const nid = nidur ? JSON.parse(nidur.slice(6)) : {};
  console.log("[SLT]", JSON.stringify(nid));
  check("lesturinn fann BRSL (8 slöngukefli á teikningunni)", nid.brsl === 8, JSON.stringify(nid));
  check("lesturinn fann SLT (≥ 7 af 11: 8 við keflin + 3 ein)", nid.slt >= 7, JSON.stringify(nid));
  check("ENGINN EI-miði né eldveggur bættist við (EI hefur sinn takka)", s1.ei === s0.ei, JSON.stringify({ fyrir: s0.ei, eftir: s1.ei }));
  check("enginn EI-texti í tilkynningunni", !/EI-\d0|eldvegg/i.test(tA), tA);
  const utan = s1.mvs.filter((o) => o.x < M.x - 1 || o.y < M.y - 1 || o.x + (o.type === "sticky" ? 0 : o.w) > M.x + M.w + 1 || (o.type !== "sticky" && o.y + o.h > M.y + M.h + 1));
  const utanAnMida = utan.filter((o) => o.type !== "sticky");
  check("hver 165.BR1-hlutur (skilti) INNAN myndarinnar", utanAnMida.length === 0, JSON.stringify(utanAnMida));
  check("engir drægishringir sjálfgefið („taka þennan rauða hring“)", !s1.mvs.some((o) => o.type === "ellipse"), JSON.stringify(s1.mvs.filter((o) => o.type === "ellipse")));
  const nyTaeki = s1.taeki.filter((t) => !s0.taeki.some((f) => f.id === t.id));
  const slongur = nyTaeki.filter((t) => t.sym === "teikn:slanga");
  const slt = nyTaeki.filter((t) => t.sym !== "teikn:slanga");
  const kefliB = KEFLI.map(iBord), sltB = SLT_EIN.map(iBord);
  const fjarl = (t, pts) => Math.min(...pts.map(([x, y]) => Math.hypot(t.cx - x, t.cy - y))) / metri;
  const slFjarl = slongur.map((t) => +fjarl(t, kefliB).toFixed(2));
  const sltFjarl = slt.map((t) => +fjarl(t, [...kefliB, ...sltB]).toFixed(2));
  console.log("slöngur — fjarlægð frá keflinu (m):", JSON.stringify(slFjarl), "· SLT — frá sínum stað (m):", JSON.stringify(sltFjarl));
  check("8 slöngur á borðið (ein á hvert kefli)", slongur.length === 8, slongur.length);
  check("hver slanga ≤ 1 m frá TÁKNI slöngukeflisins (ekki textanum)", slFjarl.every((d) => d <= 1), JSON.stringify(slFjarl));
  check("hvert SLT ≤ 1 m frá sínum stað", sltFjarl.every((d) => d <= 1), JSON.stringify(sltFjarl));
  check("öll tækin INNAN myndarinnar", nyTaeki.every((t) => t.cx >= M.x && t.cy >= M.y && t.cx <= M.x + M.w && t.cy <= M.y + M.h), "");
  const tengdS = slongur.filter((t) => t.unit != null).map((t) => t.unit).sort();
  check("slöngurnar -00018..22 tengdar (8223–8227) — -00020/21/22 staðsettar", JSON.stringify(tengdS) === JSON.stringify([8223, 8224, 8225, 8226, 8227]), JSON.stringify(tengdS));
  check("of fáar skráðar slöngur → 3 ótengdar merktar „ótengt“", slongur.filter((t) => t.unit == null).length === 3 && slongur.filter((t) => t.unit == null).every((t) => t.label === "ótengt"), JSON.stringify(slongur.filter((t) => t.unit == null)));
  const tengdSlt = slt.filter((t) => t.unit != null).map((t) => t.unit).sort();
  check("SLT tengd lausum slökkvitækjum (4 CO2: 8219–8222); aldrei tæki sem er staðsett", JSON.stringify(tengdSlt) === JSON.stringify([8219, 8220, 8221, 8222]), JSON.stringify(tengdSlt));
  const ollUnit = s1.taeki.filter((t) => t.unit != null).map((t) => String(t.unit));
  check("ekkert tæki tvisvar á borðinu", new Set(ollUnit).size === ollUnit.length, JSON.stringify(ollUnit));
  // tækjalistinn: -00020..22 „á teikningu"
  const listi = await page.evaluate(() => [...document.querySelectorAll("[data-taeki]")].map((e) => e.textContent || ""));
  const radir = listi.filter((t) => /-?0002[012]/.test(t));
  console.log("tækjalisti -00020..22:", JSON.stringify(radir));
  check("tækjalistinn: -00020, -00021, -00022 „á teikningu“", radir.length === 3 && radir.every((t) => /á teikningu/.test(t)), JSON.stringify(radir));
  await ramma(page, M.x, M.y, M.w, M.h);
  await page.screenshot({ path: path.join(OUT, "02_eftir_lestur.png") });
  // nærmynd: keflið við „Ný aksturhurð" (1625, 3045) og „ÚT"/EI-60 (4457, 785)
  for (const [nafn, [x, y]] of [["03_naermynd_aksturhurd", [1625, 3045]], ["04_naermynd_ut_ei60", [4457, 785]], ["05_naermynd_slt_brsl", [4165, 4542]]]) {
    const [bx, by] = iBord([x, y]);
    await ramma(page, bx - 6 * metri, by - 4 * metri, 12 * metri, 8 * metri);
    await page.screenshot({ path: path.join(OUT, nafn + ".png") });
  }
  // eitt ⌘Z tekur allt, ⌘Y skilar
  await page.mouse.move(800, 500);
  await page.keyboard.press("Control+z"); await page.waitForTimeout(500);
  const sz = await stada(page);
  check("Ctrl+Z tekur allan lesturinn í EINU skrefi", sz.alls === s0.alls && sz.taeki.length === s0.taeki.length && sz.mvs.length === s0.mvs.length, JSON.stringify({ alls: [s0.alls, sz.alls], taeki: [s0.taeki.length, sz.taeki.length] }));
  await page.keyboard.press("Control+y"); await page.waitForTimeout(500);
  const sy = await stada(page);
  check("Ctrl+Y skilar honum aftur", sy.alls === s1.alls && sy.taeki.length === s1.taeki.length, JSON.stringify({ s1: s1.alls, sy: sy.alls }));
  // endurkeyrsla: ekkert tvítekið
  await page.locator('button[title^="Lesa SLT og BRSL"]').click();
  await bidaLesturs(page);
  const s2 = await stada(page);
  check("endurkeyrsla: sami fjöldi tækja og 165.BR1-merkja (engin tvítekning)", s2.taeki.length === s1.taeki.length && s2.mvs.length === s1.mvs.length, JSON.stringify({ taeki: [s1.taeki.length, s2.taeki.length], mvs: [s1.mvs.length, s2.mvs.length] }));
  check("endurkeyrsla: enn enginn EI-hlutur", s2.ei === s0.ei, s2.ei);
  // drægi slangna: valfrjálst hak, AF sjálfgefið
  const hak = page.locator("[data-draegi-slangna]");
  check("hakið „Sýna drægi slangna (165.BR1)“ er til og AF", (await hak.count()) === 1 && !(await hak.isChecked()), await hak.count());
  // 3D: miðar (tengt grænt, ótengt grátt)
  const midar3d = await page.evaluate(async () => {
    const s = window.__tpStore.getState();
    return s.objects.filter((o) => o.type === "symbol" && /^teikn:(slanga|lettvatn|co2|duft)$/.test(o.symbolId)).length;
  });
  void midar3d;
  await page.close();

  // ═══ B. Borðið eins og Agnar raðaði því → „Vista í úttekt" (gripið) ═════════════════════════════════════════════
  console.log("B. nýtt borð + 14 ótengd tákn Agnars → Vista í úttekt …");
  const pb = await nySida();
  const sb0 = await stada(pb);
  const MB = sb0.mynd;
  await pb.evaluate(([A, MB]) => {
    const s = window.__tpStore.getState(), m = s.objects.find((o) => o.type === "image" && o.uttekt);
    const ny = A.takn.map(([sym, x, y]) => {
      const o = window.__tpKit.makeSymbol(sym, MB.x + (x - A.x), MB.y + (y - A.y), "", 27.82);
      return { ...o, layerId: "almennt", parentId: undefined };
    });
    s.addObjects(ny, false);
    void m;
  }, [AGNAR, MB]);
  await pb.waitForTimeout(500);
  const sb1 = await stada(pb);
  check("14 ótengd tákn Agnars á borðinu", sb1.taeki.filter((t) => t.unit == null).length === 14, sb1.taeki.filter((t) => t.unit == null).length);
  const forsk = await pb.evaluate(() => (document.querySelector("[data-nytt-talning]")?.textContent || "") + " | " + (document.querySelector("[data-tengjast]")?.textContent || ""));
  console.log("tækjalisti (forskoðun):", forsk);
  check("tækjalistinn sýnir Nýtt (í bið) eftir tegund áður en vistað er", /Nýtt — í bið: 9/.test(forsk) && /Léttvatn 6/.test(forsk) && /Brunaslanga 3/.test(forsk), forsk);
  await ramma(pb, MB.x, MB.y, MB.w, MB.h);
  await pb.screenshot({ path: path.join(OUT, "06_agnar_fyrir_vistun.png") });
  const nGripin = gripin.length;
  await pb.getByRole("button", { name: /Vista í úttekt/ }).first().click();
  for (let i = 0; i < 60 && gripin.length === nGripin; i++) await pb.waitForTimeout(250);
  await pb.waitForTimeout(1500);
  check("vistun gripin (ekkert fór út)", gripin.length === nGripin + 1, gripin.length - nGripin);
  const v = skrifad || { haedir: [] };
  const h1 = v.haedir.find((h) => h.id === HAED) || { markers: [] };
  const h2 = v.haedir.find((h) => h.id === HAED2) || { markers: [] };
  const f2 = fersk.haedir.find((h) => h.id === HAED2);
  const tengdV = h1.markers.filter((m) => typeof m.unitId === "number").map((m) => m.unitId).sort();
  const nyttV = h1.markers.filter((m) => m.nytt);
  const eftirTeg = {};
  for (const m of nyttV) eftirTeg[m.tegund] = (eftirTeg[m.tegund] || 0) + 1;
  console.log("vistun 1. hæð:", JSON.stringify({ tengd: tengdV, nytt: eftirTeg, stimplar: h1.markers.filter((m) => m.kind === "sign").length }));
  const nyTengd = tengdV.filter((u) => ![8212, 8213, 8214, 8215, 8216].includes(u));
  check("tengd = lausu tækin af hverri tegund: 5 slöngur (8223–8227); léttvatn 0 laust (8214–8216 hér, 8217 á 2. hæð)", JSON.stringify(nyTengd) === JSON.stringify([8223, 8224, 8225, 8226, 8227]), JSON.stringify(nyTengd));
  check("restin Nýtt: Léttvatn 6, Brunaslanga 3", eftirTeg["Léttvatn"] === 6 && eftirTeg["Brunaslanga"] === 3 && nyttV.length === 9, JSON.stringify(eftirTeg));
  check("Nýtt-merki á sniðinu { unitId: n:…, x, y, nytt: true, tegund, stada: \"bid\" }", nyttV.every((m) => /^n:(lettvatn|slanga):/.test(m.unitId) && m.stada === "bid" && Number.isFinite(m.x) && Number.isFinite(m.y)), JSON.stringify(nyttV[0]));
  const oll = v.haedir.flatMap((h) => (h.markers || []).map((m) => String(m.unitId)));
  check("ekkert unitId tvisvar yfir hæðir", new Set(oll).size === oll.length, JSON.stringify(oll.filter((u, i) => oll.indexOf(u) !== i)));
  check("2. hæð ósnert (8217 / 8218 ekki tekin)", JSON.stringify(h2.markers) === JSON.stringify(f2.markers), JSON.stringify(h2.markers));
  check("ekkert búið til í uttaeki (engin skrif í uttaeki)", !skrifVafra.some((r) => /uttaeki/.test(r.url)), JSON.stringify(skrifVafra.filter((r) => /uttaeki/.test(r.url))));
  const tVistun = await toasts(pb, /merki vistuð/);
  console.log("tilkynning:", tVistun);
  check("upplýsingalína: „9 ný tæki í biðstöðu — bíða samþykkis: Léttvatn 6, Brunaslanga 3“ (ekki „Vantar“)", /9 ný tæki í biðstöðu — bíða samþykkis: Léttvatn 6, Brunaslanga 3/.test(tVistun) && !/Vantar/.test(tVistun), tVistun);
  const sb2 = await stada(pb);
  const tengdBord = sb2.taeki.filter((t) => typeof t.unit === "number" && [8223, 8224, 8225, 8226, 8227].includes(t.unit));
  const nyttBord = sb2.taeki.filter((t) => typeof t.unit === "string" && t.unit.startsWith("n:"));
  check("borðið fékk lyklana: 5 sjálftengd (raðnúmer undir), 9 Nýtt („Nýtt“ undir)", tengdBord.length === 5 && tengdBord.every((t) => t.label.length > 0 && t.label !== "ótengt") && nyttBord.length === 9 && nyttBord.every((t) => t.label === "Nýtt"), JSON.stringify({ tengd: tengdBord.map((t) => t.label), nytt: nyttBord.map((t) => t.label) }));
  await ramma(pb, MB.x, MB.y, MB.w, MB.h);
  await pb.screenshot({ path: path.join(OUT, "07_agnar_eftir_vistun.png") });
  // önnur vistun: ekkert tvítekið
  const fyrri = JSON.stringify(h1.markers.map((m) => m.unitId).sort());
  const nG2 = gripin.length;
  await pb.getByRole("button", { name: /Vista í úttekt/ }).first().click();
  for (let i = 0; i < 60 && gripin.length === nG2; i++) await pb.waitForTimeout(250);
  await pb.waitForTimeout(1000);
  const h1b = (skrifad.haedir.find((h) => h.id === HAED) || { markers: [] });
  check("önnur vistun: sömu merki (ekkert tengt aftur, engin ný Nýtt)", JSON.stringify(h1b.markers.map((m) => m.unitId).sort()) === fyrri, JSON.stringify({ fyrri: JSON.parse(fyrri).length, nu: h1b.markers.length }));
  fs.writeFileSync(path.join(OUT, "vistun-661.json"), JSON.stringify({ company_id: CID, haedir: skrifad.haedir, markers: skrifad.markers }, null, 1));
  // 3D: miðarnir (Nýtt indígó / tengt grænt)
  await pb.getByRole("button", { name: /^3D$/ }).first().click().catch(() => {});
  await pb.waitForTimeout(4000);
  await pb.screenshot({ path: path.join(OUT, "08_3d_eftir_vistun.png") });
  await pb.close();

  // ── vörður: engin skrif sluppu ────────────────────────────────────────────────────────────────────────────────
  const gripidUrl = new Set(verndud.map((g) => g.method + " " + g.url));
  const supabaseSkrif = skrifVafra.filter((r) => /supabase\.co/.test(r.url));
  const sloppid = supabaseSkrif.filter((r) => !gripidUrl.has(r.method + " " + r.url) && !/teikning_bord/.test(r.url));
  const annad = skrifVafra.filter((r) => !/supabase\.co/.test(r.url) && !/localhost|127\.0\.0\.1/.test(r.url));
  console.log("skrif vafrans:", skrifVafra.length, "· gripin af verði:", verndud.length, "· teikning_bord gripin:", gripin.length, "·", JSON.stringify([...new Set(skrifVafra.map((r) => r.method + " " + r.url.replace(/^https:\/\/[^/]+/, "")))]));
  check("ENGIN skrif fóru út (öll Supabase-skrif gripin, engin skrif á aðra þjóna)", sloppid.length === 0 && annad.length === 0, JSON.stringify({ sloppid, annad }));
  check("engar villur á síðunni", !errs.length, errs.join(" | "));
  fs.writeFileSync(path.join(OUT, "slt-log.txt"), loggar.join("\n"));
  console.log(`\n${ok.length} í lagi, ${bad.length} brást`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch(async (e) => {
  console.error("VILLA", e);
  if (vafri) await vafri.close().catch(() => {});
  process.exit(2);
});
