/* „Veggjavél (skrifstofutölvan)" í „Greina veggi" (Agnar 07.10.2026) — RAUNVERULEGT ferli frá enda til enda:
 *   node tools/turbopaint-veggjavel.cjs [http://localhost:4123] [úttaksmappa] [--sidasta]
 * Álfaborg 661, 2. hæð (skönnuð PDF, 0 veggir): Greina veggi → greining vafrans (raster) → „Veggjavél (skrifstofutölvan)"
 * → síðasta niðurstaða hæðarinnar opnast strax → „Greina aftur" → NÝ beiðni í automation_triggers → luna-bridge watcher.js
 * á skrifstofutölvunni tekur hana (á mínútu fresti) → framvinda á skjánum („Skrifstofutölvan greinir… 40 %") → veggirnir
 * koma í forskoðun → „Setja inn" → veggirnir í ritlinum (ein lota, gler = gler) → ⌘Z tekur allt → ⌘Y → „Eyða síðustu
 * greiningu". Með --sidasta er „Greina aftur" sleppt (engin ný beiðni).
 *
 * SKRIF: turbopaint-vordur.cjs grípur öll skrif í Supabase. AÐEINS INSERT í automation_triggers með workflow 'veggjavel'
 * fær að fara út (beiðnin sjálf); lestur (staðan, niðurstöðuskráin í geymslu) fer í gegn. teikning_bord, turbopaint_boards
 * og upphleðslur úr vafranum eru gripin. Prófið telur í lokin hvað fór út. */
const path = require("path");
const fs = require("fs");
const { raesa, opnaUttekt, teljari, mappa } = require("./turbopaint-hjalp.cjs");

const BASE = process.argv[2] && /^https?:/.test(process.argv[2]) ? process.argv[2] : "http://localhost:4123";
const OUT = mappa(process.argv.filter((a) => a !== "--sidasta"), "turbopaint-veggjavel-myndir");
const SIDASTA = process.argv.includes("--sidasta");
const CID = 661, HAED = "hmua8v42ink6";
const { ok, bad, check } = teljari();

(async () => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Aðeins localhost — aldrei lifandi síðan");
  const gripinBord = [];
  const { b, ctx, page, errs, verndud, skrifBeidnir } = await raesa({
    teikningBord: async (route) => {
      const req = route.request();
      if (req.method() === "GET" || req.method() === "HEAD") return route.fallback();
      gripinBord.push(req.method());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
    },
  });
  // Eina undantekningin frá skrifvörninni: INSERT veggjavel-beiðnar. Allt annað í automation_triggers er gripið.
  const utFarid = [], gripinBeidni = [];
  await ctx.route("**/rest/v1/automation_triggers*", async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD" || req.method() === "OPTIONS") return route.continue();
    let body = null;
    try { body = JSON.parse(req.postData() || "null"); } catch { body = null; }
    const radir = Array.isArray(body) ? body : body ? [body] : [];
    if (req.method() === "POST" && radir.length === 1 && radir[0].workflow === "veggjavel" && radir[0].status === "bida") {
      utFarid.push({ method: "POST", workflow: "veggjavel", gogn: radir[0].gogn });
      return route.continue();
    }
    gripinBeidni.push(req.method() + " " + (req.postData() || "").slice(0, 80));
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });
  const veggir = () =>
    page.evaluate(() =>
      window.__tpStore
        .getState()
        .objects.filter((o) => o.type === "polyline" && (o.veggur || o.layerId === "veggir"))
        .map((o) => ({ id: o.id, t: o.strokeWidth, g: o.greining || null, teg: o.veggTegund || "veggur", p: o.parentId || null }))
    );

  await opnaUttekt(page, { BASE, cid: CID, haed: HAED, b: 6006, h: 4298, ham: "teikning", veggir: false });
  const v0 = await veggir();
  console.log("opnað:", v0.length, "veggir");
  const planId = await page.evaluate((cid) => window.__tpStore.getState().objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid).id, CID);

  // ── Greina veggi → greining vafrans ─────────────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Breyta veggjum" }).first().click();
  const spjald = page.getByRole("region", { name: "Veggjaritill" });
  await spjald.waitFor({ timeout: 10000 });
  await spjald.getByRole("button", { name: /Greina veggi/ }).click();
  const dlg = page.getByRole("dialog", { name: "Greina veggi" });
  const nidurst = dlg.locator("[data-greining-nidurstada]");
  await nidurst.waitFor({ timeout: 180000 });
  await page.waitForTimeout(500);
  const vafriT = (await nidurst.innerText()).replace(/\s+/g, " ");
  const nVafri = Number((vafriT.match(/(\d+) veggi/) || [])[1]) + Number((vafriT.match(/(\d+) gler/) || [0, 0])[1]);
  console.log("   greining vafrans:", vafriT);
  check("greining vafrans (raster) fann veggi", nVafri > 0, vafriT);
  const velTakki = dlg.locator("[data-veggjavel]");
  check("„Veggjavél (skrifstofutölvan)“ sést og er virk", (await velTakki.count()) === 1 && (await velTakki.isEnabled()) && /Veggjavél \(skrifstofutölvan\)/.test(await velTakki.innerText()), "");
  await shot("01_greining_vafrans.png");

  // ── Veggjavél: síðasta niðurstaða hæðarinnar opnast strax ─────────────────────────────────────────────────────
  const t1 = Date.now();
  await velTakki.click();
  const stada = dlg.locator("[data-veggjavel-stada]");
  await page.waitForFunction(() => {
    const s = document.querySelector("[data-veggjavel-stada]")?.getAttribute("data-veggjavel-stada");
    return s === "lokid" || s === "villa" || s === "bida" || s === "vinnur";
  }, null, { timeout: 30000 });
  const s1 = await stada.getAttribute("data-veggjavel-stada");
  console.log("   fyrsti smellur:", s1, ((Date.now() - t1) / 1000).toFixed(1) + " s", (await stada.innerText()).replace(/\s+/g, " ").slice(0, 160));
  if (s1 === "lokid") {
    check("síðasta niðurstaða vélarinnar opnast strax (< 10 s), merkt sem slík", Date.now() - t1 < 10000 && /síðasta niðurstaða hæðarinnar/.test(await stada.innerText()), await stada.innerText());
    check("ENGIN ný beiðni send við fyrsta smell (síðasta niðurstaða notuð)", utFarid.length === 0, JSON.stringify(utFarid));
    await shot("02_veggjavel_sidasta.png");
  }

  // ── Greina aftur: ný beiðni → skrifstofutölvan → framvinda → veggir ─────────────────────────────────────────
  const sed = new Set(), prosSed = new Set();
  let vinnurMynd = false;
  if (!SIDASTA || s1 !== "lokid") {
    if (s1 === "lokid") await dlg.getByRole("button", { name: "Greina aftur" }).click();
    const t2 = Date.now();
    const timar = {};
    for (;;) {
      const s = await stada.getAttribute("data-veggjavel-stada").catch(() => null);
      if (s && !sed.has(s)) { sed.add(s); timar[s] = ((Date.now() - t2) / 1000).toFixed(0) + " s"; console.log("   ", s, timar[s], (await stada.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 140)); }
      if (s === "vinnur") {
        const p = await dlg.locator("[data-veggjavel-pros]").getAttribute("data-veggjavel-pros").catch(() => "");
        if (p) prosSed.add(Number(p));
        if (!vinnurMynd && Number(p) >= 30) { vinnurMynd = true; await shot("03_veggjavel_greinir.png"); }
      }
      if (s === "lokid" || s === "villa") break;
      if (Date.now() - t2 > 8 * 60000) break;
      await page.waitForTimeout(500);
    }
    const sT = (await stada.innerText()).replace(/\s+/g, " ");
    console.log("    lokastaða:", sT.slice(0, 200), "·", ((Date.now() - t2) / 1000).toFixed(0), "s");
    check("ný beiðni fór út: EIN INSERT í automation_triggers (workflow veggjavel) með company_id, haed_id, image_url, skurdur, frum",
      utFarid.length === 1 && utFarid[0].gogn && utFarid[0].gogn.company_id === CID && utFarid[0].gogn.haed_id === HAED && /teikn-mynd/.test(utFarid[0].gogn.image_url) && utFarid[0].gogn.frum.b === 6006 && utFarid[0].gogn.skurdur && utFarid[0].gogn.skurdur.w > 0,
      JSON.stringify(utFarid));
    check("skrifstofutölvan tók beiðnina: biðröð → greinir → lokið", sed.has("bida") && (sed.has("vinnur") || sed.has("saekir")) && sed.has("lokid"), [...sed].join(" → "));
    check("framvinda sýnd í prósentum („Skrifstofutölvan greinir… N %“)", prosSed.size >= 2, [...prosSed].join(","));
    check("niðurstaðan er ný (ekki „síðasta niðurstaða“)", !/síðasta niðurstaða hæðarinnar/.test(sT), sT);
  }
  if ((await stada.getAttribute("data-veggjavel-stada")) !== "lokid") throw new Error("veggjavélin kláraði ekki: " + (await stada.innerText()));
  await page.waitForTimeout(800);
  const velT = (await nidurst.innerText()).replace(/\s+/g, " ");
  const nV = Number((velT.match(/(\d+) veggi/) || [])[1]), nG = Number((velT.match(/(\d+) gler/) || [0, 0])[1]);
  console.log("   veggjavél:", velT, `(vafrinn: ${nVafri})`);
  check(`veggjavélin skilar veggjum í forskoðun (${nV} veggir, ${nG} gler)`, nV > 20, velT);
  const forsk = await page.evaluate(() => {
    const f = window.__tpVeggjaRitill?.getState?.().forskodun;
    return f ? f.veggir.length : null;
  });
  if (forsk != null) check("forskoðunin á borðinu sýnir sömu veggi", forsk === nV + nG, String(forsk));
  await shot("04_veggjavel_lokid.png");
  fs.writeFileSync(path.join(OUT, "samanburdur.json"), JSON.stringify({ vafri: vafriT, veggjavel: velT, nVafri, nV, nG }, null, 1));

  // ── Setja inn → ritillinn ────────────────────────────────────────────────────────────────────────────────
  const setja = dlg.getByRole("button", { name: /^Setja inn \d+ veggi$|^Bæta við/ }).first();
  await setja.click();
  await page.waitForTimeout(800);
  const v1 = await veggir();
  const nyir = v1.filter((x) => !v0.some((y) => y.id === x.id));
  check(`veggirnir komu inn í ritilinn (${nyir.length} = ${nV} + ${nG})`, nyir.length === nV + nG, `${nyir.length}`);
  check("gler varð tegundin gler", nyir.filter((x) => x.teg === "gler").length === nG && nyir.filter((x) => x.teg === "veggur").length === nV, JSON.stringify(nyir.map((x) => x.teg)));
  const lotur = [...new Set(nyir.map((x) => x.g))];
  check("allir í EINNI greiningarlotu og festir við teikninguna", lotur.length === 1 && /^g[0-9a-z]+$/.test(lotur[0] || "") && nyir.every((x) => x.p === planId), JSON.stringify(lotur));
  check("„Greina veggi“-glugginn lokaðist", (await dlg.count()) === 0, "");
  await shot("05_settir_inn.png");

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  check("⌘Z: öll greining vélarinnar farin í EINU skrefi", (await veggir()).length === v0.length, String((await veggir()).length));
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(300);
  check("⌘Y: hún kemur aftur", (await veggir()).length === v0.length + nyir.length, String((await veggir()).length));

  // ── Aftur í Greina veggi → Veggjavél: allt þegar á teikningunni (Bæta við +0) ────────────────────────────────
  await spjald.getByRole("button", { name: /Greina veggi/ }).click();
  await dlg.waitFor({ timeout: 10000 });
  await nidurst.waitFor({ timeout: 180000 });
  await dlg.locator("[data-veggjavel]").click();
  await page.waitForFunction(() => document.querySelector("[data-veggjavel-stada]")?.getAttribute("data-veggjavel-stada") === "lokid", null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const baetaT = await dlg.getByRole("button", { name: /^Bæta við/ }).innerText();
  check("aftur: niðurstaðan úr minni og „Bæta við (+0)“ — tvítekningar felldar", /síðasta niðurstaða hæðarinnar/.test(await stada.innerText()) && /\(\+0\)/.test(baetaT), baetaT);
  await dlg.getByRole("button", { name: "Hætta við" }).last().click();
  await page.waitForTimeout(300);

  const eyda = spjald.locator('[data-eyda-greiningu="sidasta"]');
  const eydaT = (await eyda.count()) ? await eyda.innerText() : "";
  check(`ritillinn: „Eyða síðustu greiningu (${nyir.length})“`, eydaT.includes(`Eyða síðustu greiningu (${nyir.length})`), eydaT);
  await eyda.click();
  await page.waitForTimeout(400);
  check("„Eyða síðustu greiningu“ tekur alla veggi vélarinnar", (await veggir()).length === v0.length, String((await veggir()).length));

  // ── hvað fór út ──────────────────────────────────────────────────────────────────────────────────────────
  const ut = skrifBeidnir.filter((s) => !verndud.some((v) => s === v.method + " " + v.url) && !/teikning_bord/.test(s) && !/automation_triggers/.test(s));
  const atUt = skrifBeidnir.filter((s) => /automation_triggers/.test(s));
  check(`út fór AÐEINS veggjavel-beiðnin (${utFarid.length} INSERT í automation_triggers); ${gripinBeidni.length} önnur skrif í automation_triggers gripin`,
    ut.length === 0 && atUt.length === utFarid.length + gripinBeidni.length && gripinBeidni.length === 0, JSON.stringify({ ut, atUt, gripinBeidni }));
  check("engar villur á síðunni", errs.length === 0, errs.join(" | "));
  const gripinAll = [...new Set(verndud.map((v) => v.method + " " + v.url.replace(/^.*\/(rest|storage)\/v1\//, "")))];
  console.log(`\n${ok.length}/${ok.length + bad.length} · út fór: ${utFarid.length}× POST automation_triggers (veggjavel) · gripið (fór EKKI út): ${gripinAll.join(", ") || "ekkert"}${gripinBord.length ? ` + ${gripinBord.length}× teikning_bord` : ""}`);
  fs.writeFileSync(path.join(OUT, "skrif.json"), JSON.stringify({ utFarid: utFarid.map((u) => ({ ...u, gogn: u.gogn })), gripid: gripinAll, gripinBord, gripinBeidni }, null, 1));
  if (bad.length) console.log("BRÁST:\n" + bad.join("\n"));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
