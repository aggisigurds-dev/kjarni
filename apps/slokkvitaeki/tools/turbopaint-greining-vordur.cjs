/* „Greina veggi" — varnir (Agnar 07.10.2026: 0,24 + 0,48 pt gáfu 599 „veggi", svartar klessur yfir allri teikningunni).
 *   node tools/turbopaint-greining-vordur.cjs [http://localhost:4123] [úttaksmappa]
 * Fiskislóð 41 (1612, 1. hæð) í Teikning-ham, raunveruleg mús og lyklaborð:
 *   0,24 pt merktur „ekki veggir" → valinn: rauð viðvörun með fjölda strika → „Bæta við" spyr („Bæta við N veggjum?
 *   Þetta lítur út eins og skástrikun"), fókus á „Hætta við" (Enter hættir við) → „Já" bætir við → þykkt ≤ 40 cm,
 *   veggirnir merktir lotunni → ⌘Z tekur alla greininguna í einu skrefi, ⌘Y setur aftur → „Eyða síðustu greiningu"
 *   eyðir nákvæmlega þeim → ⌘Z skilar þeim.
 * ENGIN skrif fara út: turbopaint-vordur.cjs grípur öll skrif í Supabase (borðið, myndir, teikning_bord). */
const path = require("path");
const { raesa, opnaUttekt, teljari, mappa } = require("./turbopaint-hjalp.cjs");

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = mappa(process.argv, "turbopaint-greining-vordur-myndir");
const CID = 1612, HAED = "hmuaaaw83rg9";
const { ok, bad, check } = teljari();

(async () => {
  const gripin = [];
  const { b, page, errs, verndud, skrifBeidnir } = await raesa({
    teikningBord: async (route) => {
      const req = route.request();
      if (req.method() === "GET" || req.method() === "HEAD") return route.fallback();
      gripin.push(req.method());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
    },
  });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });
  const veggir = () =>
    page.evaluate(() =>
      window.__tpStore
        .getState()
        .objects.filter((o) => o.type === "polyline" && (o.veggur || o.layerId === "veggir"))
        .map((o) => ({ id: o.id, t: o.strokeWidth, g: o.greining || null }))
    );

  await opnaUttekt(page, { BASE, cid: CID, haed: HAED, b: 4244, h: 6006, ham: "teikning" });
  const v0 = await veggir();
  console.log("opnað:", v0.length, "veggir");
  const dpm = await page.evaluate(() => {
    const s = window.__tpStore.getState();
    if (s.pixelsPerMeter) return s.pixelsPerMeter;
    const m = s.objects.find((o) => o.type === "image" && o.uttekt);
    const ms = m.uttekt.myndSkurdur;
    const bredd = ms && ms.w > 0 ? ms.w : m.uttekt.frumB;
    return (m.width / bredd) * (Math.max(m.uttekt.frumB, m.uttekt.frumH) / 2384 / ((0.0254 / 72) * 100));
  });

  // ── ritillinn → Greina veggi ─────────────────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Breyta veggjum" }).first().click();
  const spjald = page.getByRole("region", { name: "Veggjaritill" });
  await spjald.waitFor({ timeout: 10000 });
  await spjald.getByRole("button", { name: /Greina veggi/ }).click();
  const dlg = page.getByRole("dialog", { name: "Greina veggi" });
  const nidurst = dlg.locator("[data-greining-nidurstada]");
  await nidurst.waitFor({ timeout: 120000 });
  const reiknad = () =>
    page.waitForFunction(() => {
      const t = document.querySelector("[data-greining-nidurstada]")?.textContent || "Reikna";
      return /\d+ línum/.test(t) && !/Reikna/.test(t);
    }, null, { timeout: 120000 });
  await reiknad();
  const f024 = dlg.locator('[data-flokkur="0.24"]');
  check("0,24 pt merktur „ekki veggir“ (rautt)", (await f024.locator("[data-ekki-veggir]").count()) === 1 && /ekki veggir/.test(await f024.innerText()), await f024.innerText());
  check("0,48 pt er tillagan og EKKI merktur „ekki veggir“", (await dlg.locator('[data-flokkur="0.48"]').getAttribute("aria-pressed")) === "true" && (await dlg.locator('[data-flokkur="0.48"] [data-ekki-veggir]').count()) === 0, "");
  check("engin viðvörun meðan aðeins 0,48 er valinn", (await dlg.locator("[data-vidvorun-flokkar]").count()) === 0, "");

  // ── 0,24 valinn með: rauð viðvörun með fjölda ────────────────────────────────────────────────────────────
  await f024.click();
  await page.waitForTimeout(200);
  await reiknad();
  await page.waitForTimeout(300);
  const vidv = dlg.locator("[data-vidvorun-flokkar]");
  const vidvT = (await vidv.count()) ? await vidv.innerText() : "";
  console.log("   viðvörun:", vidvT.replace(/\s+/g, " "));
  check("0,24 valinn: rauð viðvörun (role=alert) með fjölda strika og „ekki út eins og veggir“", /0,24 pt \([\d.]+ strik/.test(vidvT) && /ekki út eins og veggir/.test(vidvT) && (await vidv.getAttribute("role")) === "alert", vidvT);
  await shot("01_024_valinn_vidvorun.png");

  const baeta = dlg.getByRole("button", { name: /^Bæta við/ });
  const baetaT = await baeta.innerText();
  const n = Number((baetaT.match(/\+(\d+)/) || [])[1]);
  console.log("   ", baetaT);
  check("greiningin myndi bæta við mjög mörgum (> 120)", n > 120, baetaT);

  // ── Bæta við → spurt; fókus á Hætta við; Enter hættir við ─────────────────────────────────────────────────
  await baeta.click();
  const stadf = dlg.locator("[data-stadfesta-greiningu]");
  await stadf.waitFor({ timeout: 5000 });
  const stadfT = (await stadf.innerText()).replace(/\s+/g, " ");
  console.log("   staðfesting:", stadfT.slice(0, 160));
  const nT = n.toLocaleString("de-DE");
  check(`spurt: „Bæta við ${nT} veggjum? Þetta lítur út eins og skástrikun“`, stadfT.includes(`Bæta við ${nT} veggjum? Þetta lítur út eins og skástrikun`), stadfT);
  const fokus = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check("sjálfgefinn fókus á „Hætta við“", fokus === "Hætta við", fokus);
  check("ekkert bættist við meðan spurt er", (await veggir()).length === v0.length, "");
  await shot("02_stadfesting.png");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("Enter (fókus á Hætta við): spurningin hverfur og ENGU er bætt við", (await stadf.count()) === 0 && (await veggir()).length === v0.length, `${await stadf.count()} ${(await veggir()).length}`);

  // ── Já → bætt við; þykkt ≤ 40 cm; ein lota ────────────────────────────────────────────────────────────────
  await baeta.click();
  await stadf.waitFor({ timeout: 5000 });
  await dlg.getByRole("button", { name: /^Já, bæta við/ }).click();
  await page.waitForTimeout(600);
  const v1 = await veggir();
  const nyir = v1.filter((x) => !v0.some((y) => y.id === x.id));
  check(`„Já“: ${n} veggjum bætt við`, nyir.length === n && v1.length === v0.length + n, `${nyir.length} / ${v1.length}`);
  const hamark = 0.4 * dpm;
  const thykkastur = Math.max(...nyir.map((x) => x.t));
  check(`þykkt hvers nýs veggjar ≤ 40 cm (${hamark.toFixed(1)} borðdílar; þykkastur ${thykkastur.toFixed(1)})`, thykkastur <= hamark + 1e-6, String(thykkastur));
  const lotur = [...new Set(nyir.map((x) => x.g))];
  check("allir nýju veggirnir merktir SÖMU greiningarlotu", lotur.length === 1 && /^g[0-9a-z]+$/.test(lotur[0] || ""), JSON.stringify(lotur));
  check("eldri veggir ómerktir (innfluttir úr Teikning)", v0.every((x) => !x.g), "");
  await shot("03_baett_vid_thunnir_veggir.png");

  // ── ⌘Z tekur alla greininguna í einu skrefi, ⌘Y setur aftur ──────────────────────────────────────────────
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  check("⌘Z: öll greiningin farin í EINU skrefi", (await veggir()).length === v0.length, String((await veggir()).length));
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(300);
  check("⌘Y: greiningin aftur", (await veggir()).length === v0.length + n, String((await veggir()).length));

  // ── Eyða síðustu greiningu ───────────────────────────────────────────────────────────────────────────────
  const eyda = spjald.locator('[data-eyda-greiningu="sidasta"]');
  const eydaT = (await eyda.count()) ? await eyda.innerText() : "";
  check(`ritillinn sýnir „Eyða síðustu greiningu (${n})“`, eydaT.includes(`Eyða síðustu greiningu (${n})`), eydaT);
  await eyda.click();
  await page.waitForTimeout(400);
  const v2 = await veggir();
  check("„Eyða síðustu greiningu“ eyðir nákvæmlega greindu veggjunum — innfluttu veggirnir haldast", v2.length === v0.length && v0.every((x) => v2.some((y) => y.id === x.id)), String(v2.length));
  check("hnappurinn hverfur þegar engin greining er eftir", (await eyda.count()) === 0, "");
  await shot("04_greiningu_eytt.png");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  check("⌘Z skilar greindu veggjunum", (await veggir()).length === v0.length + n, String((await veggir()).length));

  // ── engin skrif út ────────────────────────────────────────────────────────────────────────────────────────
  const ut = skrifBeidnir.filter((s) => !verndud.some((v) => s === v.method + " " + v.url) && !/teikning_bord/.test(s));
  check("ENGIN skrif fóru út (allt gripið: " + verndud.length + " borð/mynda-skrif, " + gripin.length + " teikning_bord)", ut.length === 0, JSON.stringify(ut));
  check("engar villur á síðunni", errs.length === 0, errs.join(" | "));
  console.log(`\n${ok.length}/${ok.length + bad.length} · gripin skrif: ${[...new Set(verndud.map((v) => v.method + " " + v.url.replace(/^.*\/(rest|storage)\/v1\//, "")))].join(", ") || "engin"}`);
  if (bad.length) console.log("BRÁST:\n" + bad.join("\n"));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
