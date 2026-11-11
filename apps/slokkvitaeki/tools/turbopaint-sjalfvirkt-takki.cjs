/* Prófar takkann „Sjálfvirkt" við hlið Greining á Nesdekk Breiðhöfði 13, 2. hæð.
 * ÖLL skrif í Supabase eru gripin — ekkert fer út á lifandi úttekt.
 *
 *   node tools/turbopaint-sjalfvirkt-takki.cjs [http://localhost:4127] [úttaksmappa]
 */
const path = require("path");
const fs = require("fs");
const { raesa, teljari, mappa } = require("./turbopaint-hjalp.cjs");

const BASE = process.argv[2] || "http://localhost:4127";
const OUT = mappa(process.argv, "turbopaint-sjalfvirkt-takki-myndir");
const CID = 219;
const HAED = "hc219x4b8e2";
const { ok, bad, check } = teljari();

(async () => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Aðeins localhost");
  const vistanir = [];
  const { b, page, errs, verndud, skrifBeidnir } = await raesa({
    teikningBord: async (route) => {
      const req = route.request();
      if (req.method() === "GET" || req.method() === "HEAD") {
        if (!new RegExp("company_id=eq\\." + CID + "\\b").test(req.url())) return route.fallback();
        const res = await route.fetch();
        let j;
        try {
          j = await res.json();
        } catch {
          return route.fulfill({ response: res });
        }
        const rows = Array.isArray(j) ? j : [j];
        for (const r of rows) {
          for (const h of (r && r.haedir) || []) {
            if (h.id !== HAED) continue;
            delete h.veggjaLinur;
            delete h.leidrett;
            h.pdfVeggir = [];
            h.veggir = [];
            delete h.vinnumynd;
          }
        }
        const headers = { ...res.headers() };
        delete headers["content-length"];
        delete headers["content-encoding"];
        return route.fulfill({ status: res.status(), headers, body: JSON.stringify(j) });
      }
      let body = null;
      try {
        body = JSON.parse(req.postData() || "null");
      } catch {
        body = null;
      }
      vistanir.push({ method: req.method(), url: req.url().replace(/^.*\/rest\/v1\//, ""), body });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
    },
  });

  // Sleppa OCR svo veggir + hurðir sjáist á mínútum; EI/tæki bíða.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tp_sjalfvirkt_sleppa", "ocr");
    } catch {
      /* */
    }
  });
  const log = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/\[sjálfvirkt\]|\[veggir\]/.test(t)) log.push(t.slice(0, 4000));
  });

  const t0 = Date.now();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/kjarni/turbopaint?uttekt=${CID}&haed=${HAED}&b=6006&h=2931&ham=teikning`, { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 180000 });
  await page.waitForFunction(
    (cid) => {
      const s = window.__tpStore?.getState();
      if (!s || s.importProgress) return false;
      return !!s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === cid);
    },
    CID,
    { timeout: 300000 }
  );
  await page.waitForTimeout(1500);

  const takki = page.locator("[data-sjalfvirkt-takki]");
  check("takkinn „Sjálfvirkt“ sést við hlið Greining", (await takki.count()) === 1, await page.locator("[data-greining-takki]").count());
  check("Greining-flipinn er áfram til (aukalegt, ekki í staðinn)", (await page.locator("[data-greining-takki]").count()) === 1, "");
  await page.screenshot({ path: path.join(OUT, "01_takki.png") });

  await takki.click();
  await page.locator("[data-sjalfvirkt]").waitFor({ timeout: 20000 });
  check("framvinduspjald opnast við smell", true, "");
  await page.screenshot({ path: path.join(OUT, "02_byrjad.png") });

  let sidast = "";
  for (;;) {
    const s = await page.evaluate(() => {
      const st = window.__tpSjalfvirkt?.getState();
      return st ? { keyrir: st.keyrir, spurning: !!st.spurning, skref: st.skref.map((k) => k.id + ":" + k.stada + ":" + (k.texti || "").slice(0, 140)) } : null;
    });
    const lysing = s ? s.skref.filter((x) => /:keyrir:/.test(x)).join(" | ") : "";
    if (lysing && lysing !== sidast) {
      console.log("  ", ((Date.now() - t0) / 1000).toFixed(0) + " s", lysing);
      sidast = lysing;
    }
    if (s && (s.spurning || !s.keyrir)) break;
    if (Date.now() - t0 > 20 * 60000) throw new Error("verkferlið kláraði ekki á 20 mín");
    await page.waitForTimeout(1000);
  }

  if (await page.evaluate(() => !!window.__tpSjalfvirkt.getState().spurning)) {
    await page.locator("[data-sjalfvirkt-spurning]").getByRole("button", { name: "Hætta við" }).click();
    await page.waitForFunction(() => !window.__tpSjalfvirkt.getState().keyrir, null, { timeout: 60000 });
  }

  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => {
    const s = window.__tpSjalfvirkt.getState();
    const b = window.__tpStore.getState();
    const veggir = b.objects.filter((o) => o.type === "polyline" && o.veggur);
    const teg = {};
    for (const o of veggir) {
      const t = o.veggTegund || "veggur";
      teg[t] = (teg[t] || 0) + 1;
    }
    return { skref: s.skref, yfirlit: s.yfirlit, vistun: s.vistun, vistunTexti: s.vistunTexti, teg, n: veggir.length };
  });
  const sek = ((Date.now() - t0) / 1000).toFixed(0);
  console.log("\n" + st.skref.map((k) => `  ${k.id.padEnd(9)} ${k.stada.padEnd(7)} ${((k.ms || 0) / 1000).toFixed(1).padStart(6)} s  ${k.texti}`).join("\n"));
  console.log("  yfirlit:", st.yfirlit);
  console.log("  veggir á borði:", st.n, st.teg);
  console.log("  vistun:", st.vistun, st.vistunTexti, "·", sek, "s");
  await page.screenshot({ path: path.join(OUT, "03_lokid.png") });
  fs.writeFileSync(path.join(OUT, "skref.json"), JSON.stringify({ cid: CID, haed: HAED, sek: Number(sek), ...st, log }, null, 1));

  check("öll skref kláruðust", st.skref.every((k) => ["lokid", "sleppt", "villa", "stodvad"].includes(k.stada)), JSON.stringify(st.skref.map((k) => k.id + ":" + k.stada)));
  check("einhverjir veggir komu á borðið", st.n > 0, String(st.n));
  const ut = skrifBeidnir.filter((s) => !verndud.some((v) => s === v.method + " " + v.url) && !/teikning_bord/.test(s));
  check("ekkert skrif fór út (vörður grípur vistun)", ut.length === 0, JSON.stringify(ut));
  check("engar villur á síðunni", errs.length === 0, errs.join(" | "));
  console.log(`\n${ok.length}/${ok.length + bad.length} · Breiðhöfði 2. hæð · ${sek} s`);
  if (bad.length) console.log("BRÁST:\n" + bad.join("\n"));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
