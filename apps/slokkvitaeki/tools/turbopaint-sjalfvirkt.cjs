/* Sjálfvirka verkferlið í TurboPaint (?sjalfvirkt=1, Agnar 08.10.2026) — vafrapróf og MÆLING á einni hæð.
 *
 *   node tools/turbopaint-sjalfvirkt.cjs --base http://localhost:4127 --cid 1612 --haed hmuv3scrhisf --lykill 1612_h2 \
 *        --ut <mappa> [--hreinsa] [--anSkurdar] [--svar haetta|baeta] [--bord <json>] [--stodva <ms>]
 *
 *   --hreinsa    hæðin opnast EINS OG ÓLEIÐRÉTT: veggjaLinur, leidrett (og pdfVeggir/veggir) teknar úr svari teikning_bord
 *                (aðeins í vafranum) — svo verkferlið greinir frá grunni og vistar sjálfkrafa; sendingin er GRIPIN og
 *                línurnar bornar saman við leiðréttingu Agnars (mæling).
 *   --anSkurdar  skurður hæðarinnar líka tekinn úr svarinu (prófar „Skera að byggingu").
 *   --svar       á leiðréttri hæð (án --hreinsa): hverju er svarað í spurningunni (sjálfgefið: ekkert — Hætta við
 *                staðfest sem sjálfgefið og smellt á það).
 *   --bord       teikning_bord-röð (JSON-skrá) sem svarað er með — fyrir stað sem á enga röð (t.d. 1532 Sléttuvegur 7).
 *   --stodva     ýtt á „Stöðva" eftir <ms> — prófar að ekkert vistist.
 *
 * VÖRÐUR: turbopaint-vordur.cjs grípur ÖLL skrif í Supabase (REST + geymslu): teikning_bord, turbopaint_boards,
 * automation_triggers (Veggjavélin fær þá enga nýja beiðni — síðasta niðurstaða hæðarinnar er lesin ef hún er til,
 * annars myndgreining í vafranum), upphleðslur. Lestur fer í gegn. Í lokin er staðfest að EKKERT skrif fór út.
 * Úttak í --ut: maeling.json (línur í dílum frummyndar fyrir/eftir hreinsun, hurðir, lokalínur, talning), skref.json,
 * vistun.json (gripna sendingin), 01_opnad.png, 02_lokid.png, 03_nalaegt.png. */
const path = require("path");
const fs = require("fs");
const { raesa, teljari } = require("./turbopaint-hjalp.cjs");

const arg = (n, d) => {
  const i = process.argv.indexOf("--" + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const flagg = (n) => process.argv.includes("--" + n);
const BASE = arg("base", "http://localhost:4127");
const CID = Number(arg("cid", "0"));
const HAED = arg("haed", "");
const LYKILL = arg("lykill", CID + "_" + HAED);
const OUT = arg("ut", path.join(process.cwd(), "sjalfvirkt-" + LYKILL));
const HREINSA = flagg("hreinsa"), AN_SKURDAR = flagg("anSkurdar");
const SVAR = arg("svar", "");
const BORD = arg("bord", "");
const STODVA = Number(arg("stodva", "0"));
fs.mkdirSync(OUT, { recursive: true });
const { ok, bad, check } = teljari();

(async () => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Aðeins localhost — aldrei lifandi síðan");
  if (!CID || !HAED) throw new Error("--cid og --haed vantar");
  const bordSkra = BORD ? JSON.parse(fs.readFileSync(BORD, "utf8")) : null;
  const vistanir = [];
  const { b, ctx, page, errs, verndud, skrifBeidnir } = await raesa({
    teikningBord: async (route) => {
      const req = route.request();
      if (req.method() === "GET" || req.method() === "HEAD") {
        if (!new RegExp("company_id=eq\\." + CID + "\\b").test(req.url())) return route.fallback();
        if (bordSkra) {
          const eitt = /vnd\.pgrst\.object/.test(req.headers()["accept"] || "");
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(eitt ? bordSkra : [bordSkra]) });
        }
        if (!HREINSA && !AN_SKURDAR) return route.fallback();
        const res = await route.fetch();
        let j;
        try { j = await res.json(); } catch { return route.fulfill({ response: res }); }
        const rows = Array.isArray(j) ? j : [j];
        for (const r of rows) {
          for (const h of (r && r.haedir) || []) {
            if (h.id !== HAED) continue;
            if (HREINSA) { delete h.veggjaLinur; delete h.leidrett; h.pdfVeggir = []; h.veggir = []; delete h.vinnumynd; delete h.eldVal; }
            if (AN_SKURDAR) { h.skurdur = null; delete h.sjalf; delete h.thett; }
          }
        }
        const headers = { ...res.headers() };
        delete headers["content-length"];
        delete headers["content-encoding"];
        return route.fulfill({ status: res.status(), headers, body: JSON.stringify(j) });
      }
      let body = null;
      try { body = JSON.parse(req.postData() || "null"); } catch { body = null; }
      vistanir.push({ method: req.method(), url: req.url().replace(/^.*\/rest\/v1\//, ""), body });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
    },
  });
  const LEID = arg("leid", "");
  if (LEID) await page.addInitScript((l) => { try { localStorage.setItem("tp_sjalfvirkt_leid", l); } catch { /* */ } }, LEID);
  const SLEPPA = arg("sleppa", "");
  if (SLEPPA) await page.addInitScript((l) => { try { localStorage.setItem("tp_sjalfvirkt_sleppa", l); } catch { /* */ } }, SLEPPA);
  const VIK = arg("vikmork", "");
  if (VIK) await page.addInitScript((v) => { try { localStorage.setItem("tp_sjalfvirkt_vikmork", v); } catch { /* */ } }, fs.readFileSync(VIK, "utf8"));
  const log = [];
  page.on("console", (m) => { const t = m.text(); if (/\[sjálfvirkt\]|\[veggir\]|\[EI\]|\[SLT\]/.test(t)) log.push(t.slice(0, 4000)); });
  const t0 = Date.now();
  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&ham=teikning&sjalfvirkt=1`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 180000 });
  await page.locator("[data-sjalfvirkt]").waitFor({ timeout: 400000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "01_opnad.png") });
  console.log("opnað og verkferlið byrjað:", ((Date.now() - t0) / 1000).toFixed(0), "s");
  if (STODVA) {
    await page.waitForTimeout(STODVA);
    await page.getByRole("button", { name: /^Stöðva/ }).click();
    console.log("ýtt á Stöðva");
  }
  // bíða: lokið, eða spurning
  let sidast = "";
  for (;;) {
    const s = await page.evaluate(() => {
      const st = window.__tpSjalfvirkt?.getState();
      return st ? { keyrir: st.keyrir, spurning: !!st.spurning, skref: st.skref.map((k) => k.id + ":" + k.stada + ":" + (k.texti || "").slice(0, 120)) } : null;
    });
    const lysing = s ? s.skref.filter((x) => /:keyrir:/.test(x)).join(" | ") : "";
    if (lysing && lysing !== sidast) { console.log("  ", ((Date.now() - t0) / 1000).toFixed(0) + " s", lysing); sidast = lysing; }
    if (s && (s.spurning || !s.keyrir)) break;
    if (Date.now() - t0 > 25 * 60000) throw new Error("verkferlið kláraði ekki á 25 mín");
    await page.waitForTimeout(1000);
  }
  const spurning = await page.evaluate(() => !!window.__tpSjalfvirkt.getState().spurning);
  if (spurning) {
    const dlg = page.locator("[data-sjalfvirkt-spurning]");
    const texti = (await dlg.innerText()).replace(/\s+/g, " ");
    console.log("   spurning:", texti);
    check("leiðrétt hæð: spurt „Hæðin er leiðrétt í höndunum — Bæta við nýju / Hætta við“", /Hæðin er leiðrétt í höndunum/.test(texti), texti);
    const fokus = await page.evaluate(() => document.activeElement?.textContent?.trim());
    check("sjálfgefið: „Hætta við“ hefur fókus", fokus === "Hætta við", fokus);
    await page.screenshot({ path: path.join(OUT, "02_spurning.png") });
    await dlg.getByRole("button", { name: SVAR === "baeta" ? "Bæta við nýju" : "Hætta við" }).click();
    await page.waitForFunction(() => !window.__tpSjalfvirkt.getState().keyrir, null, { timeout: 120000 });
  }
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => {
    const s = window.__tpSjalfvirkt.getState();
    return { skref: s.skref, yfirlit: s.yfirlit, vistun: s.vistun, vistunTexti: s.vistunTexti, maeling: s.maeling, vikmork: s.vikmorkTexti };
  });
  const sek = ((Date.now() - t0) / 1000).toFixed(0);
  console.log("\n" + st.skref.map((k) => `  ${k.id.padEnd(9)} ${k.stada.padEnd(7)} ${((k.ms || 0) / 1000).toFixed(1).padStart(6)} s  ${k.texti}`).join("\n"));
  console.log("  yfirlit:", st.yfirlit);
  console.log("  vistun:", st.vistun, st.vistunTexti, "·", sek, "s alls");
  await page.screenshot({ path: path.join(OUT, "02_lokid.png") });
  // nærmynd: rammað á húsið (⌘0 = allt borðið)
  fs.writeFileSync(path.join(OUT, "skref.json"), JSON.stringify({ lykill: LYKILL, cid: CID, haed: HAED, hreinsa: HREINSA, anSkurdar: AN_SKURDAR, sek: Number(sek), ...st, maeling: undefined, log }, null, 1));
  if (st.maeling) fs.writeFileSync(path.join(OUT, "maeling.json"), JSON.stringify(st.maeling));
  const vist = vistanir.find((v) => v.body && v.body.haedir);
  if (vist) {
    const h = vist.body.haedir.find((x) => x.id === HAED);
    fs.writeFileSync(path.join(OUT, "vistun.json"), JSON.stringify({ method: vist.method, url: vist.url, haed: h, updated_by: vist.body.updated_by }));
  }

  // ── prófanir ──
  check("öll skref kláruðust (lokið / sleppt / villa með skýringu) — ekkert hékk", st.skref.every((k) => ["lokid", "sleppt", "villa", "stodvad"].includes(k.stada) && (k.stada !== "villa" || k.texti)), JSON.stringify(st.skref.map((k) => k.id + ":" + k.stada)));
  if (STODVA) {
    check("Stöðva: ekkert vistað í úttekt", !vistanir.length && st.vistun === "stodvad", JSON.stringify({ n: vistanir.length, vistun: st.vistun }));
  } else if (spurning) {
    if (SVAR === "baeta") check("„Bæta við nýju“: vistað, leidrett helst „turbopaint“", !!vist && vist.body.haedir.find((x) => x.id === HAED)?.leidrett?.af === "turbopaint", JSON.stringify(vist?.body?.haedir?.find((x) => x.id === HAED)?.leidrett));
    else check("„Hætta við“: EKKERT skrifað í teikning_bord", vistanir.length === 0 && st.vistun === "haett", JSON.stringify({ n: vistanir.length, vistun: st.vistun }));
  } else {
    const h = vist && vist.body.haedir.find((x) => x.id === HAED);
    check("óleiðrétt hæð vistaðist sjálfkrafa (sama vistunarleið og „Vista í úttekt“) með leidrett {af:'sjalfvirkt'}", !!h && h.leidrett && h.leidrett.af === "sjalfvirkt" && !!h.leidrett.kl, JSON.stringify(h && h.leidrett));
    check("veggjaLinur vistaðar", !!h && Array.isArray(h.veggjaLinur) && h.veggjaLinur.length > 0, String(h && h.veggjaLinur && h.veggjaLinur.length));
    if (AN_SKURDAR) check("fundinn skurður vistaðist á hæðina (sjalf:false, skurdurAf:'sjalfvirkt')", !!h && h.skurdur && h.skurdur.w > 0 && h.sjalf === false && h.skurdurAf === "sjalfvirkt", JSON.stringify(h && { skurdur: h.skurdur, sjalf: h.sjalf, af: h.skurdurAf }));
    // aðrar hæðir óbreyttar (sama innihald og í svarinu sem kom)
  }
  // ⌘Z: allt í einu skrefi
  const fyrirZ = await page.evaluate(() => window.__tpStore.getState().objects.length);
  await page.mouse.click(5, 300);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);
  const eftirZ = await page.evaluate(() => ({ n: window.__tpStore.getState().objects.length, veggir: window.__tpStore.getState().objects.filter((o) => o.greining && o.veggur).length }));
  check("⌘Z tekur allt verkferlið í EINU skrefi (engir veggir verkferlisins eftir)", eftirZ.veggir === 0, JSON.stringify({ fyrirZ, eftirZ }));
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(500);

  const ut = skrifBeidnir.filter((s) => !verndud.some((v) => s === v.method + " " + v.url) && !/teikning_bord/.test(s));
  check("ekkert skrif fór út (vörður): " + [...new Set(verndud.map((v) => v.method + " " + v.url.replace(/^.*\/(rest|storage)\/v1\//, "")))].join(", "), ut.length === 0, JSON.stringify(ut));
  check("engar villur á síðunni", errs.length === 0, errs.join(" | "));
  console.log(`\n${ok.length}/${ok.length + bad.length} · ${LYKILL} · ${sek} s`);
  if (bad.length) console.log("BRÁST:\n" + bad.join("\n"));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
