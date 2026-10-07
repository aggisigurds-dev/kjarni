/* „Veggjavél (skrifstofutölvan)" þegar engin vél svarar (07.10.2026):
 *   node tools/turbopaint-veggjavel-bid.cjs [http://localhost:4123] [úttaksmappa]
 * ENGIN beiðni fer út: automation_triggers er hermt í vafranum (INSERT fær gervi-auðkenni, staðan er alltaf `bida`).
 *   1. annað verk í gangi á brúnni (hermt: Blender `running`) → eftir 2 mín: „upptekin við annað verk", beðið áfram;
 *   2. ekkert verk í gangi → næsta fyrirspurn: „Skrifstofutölvan svarar ekki — er hún í gangi?" (skýr villa);
 *   3. „← Greining í vafranum" skilar greiningu vafrans óbreyttri. Tekur ~2½ mín (raunverulegur tími). */
const path = require("path");
const { raesa, opnaUttekt, teljari, mappa } = require("./turbopaint-hjalp.cjs");

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = mappa(process.argv, "turbopaint-veggjavel-bid-myndir");
const CID = 661, HAED = "hmua8v42ink6";
const { ok, bad, check } = teljari();

(async () => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Aðeins localhost");
  const { b, ctx, page, errs, verndud, skrifBeidnir } = await raesa({
    teikningBord: async (route) => {
      const req = route.request();
      if (req.method() === "GET" || req.method() === "HEAD") return route.fallback();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
    },
  });
  // Hermt automation_triggers — EKKERT fer út í gagnagrunninn.
  let annadIGangi = true;
  const kollud = { insert: 0, stada: 0, upptekin: 0, sidasta: 0, ut: 0 };
  await ctx.route("**/rest/v1/automation_triggers*", async (route) => {
    const req = route.request(), u = req.url();
    const json = (x) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(x) });
    if (req.method() === "POST") { kollud.insert++; return json([{ id: 990000001 }]); }
    if (/id=eq\.990000001/.test(u)) { kollud.stada++; return json([{ status: "bida", result: null, requested_at: new Date().toISOString() }]); }
    if (/status=eq\.running/.test(u)) { kollud.upptekin++; return json(annadIGangi ? [{ workflow: "blender", started_at: new Date().toISOString() }] : []); }
    if (/workflow=eq\.veggjavel/.test(u)) { kollud.sidasta++; return json([]); }   // engin fyrri niðurstaða
    kollud.ut++;
    return json([]);
  });

  await opnaUttekt(page, { BASE, cid: CID, haed: HAED, b: 6006, h: 4298, ham: "teikning", veggir: false });
  await page.getByRole("button", { name: "Breyta veggjum" }).first().click();
  const spjald = page.getByRole("region", { name: "Veggjaritill" });
  await spjald.waitFor({ timeout: 10000 });
  await spjald.getByRole("button", { name: /Greina veggi/ }).click();
  const dlg = page.getByRole("dialog", { name: "Greina veggi" });
  const nidurst = dlg.locator("[data-greining-nidurstada]");
  await nidurst.waitFor({ timeout: 180000 });
  await page.waitForTimeout(500);
  const vafriT = (await nidurst.innerText()).replace(/\s+/g, " ");

  await dlg.locator("[data-veggjavel]").click();
  const stada = dlg.locator("[data-veggjavel-stada]");
  await page.waitForFunction(() => document.querySelector("[data-veggjavel-stada]")?.getAttribute("data-veggjavel-stada") === "bida", null, { timeout: 15000 });
  check("beiðni „send“ (hermd) og staðan er biðröð", kollud.insert === 1 && (await stada.getAttribute("data-veggjavel-stada")) === "bida", JSON.stringify(kollud));
  check("engir veggir sýndir meðan beðið er", (await nidurst.count()) === 0, "");

  // 1) annað verk í gangi → eftir 2 mín: upptekin, ekki villa
  const t0 = Date.now();
  await page.waitForFunction(() => /upptekin við annað verk/.test(document.querySelector("[data-veggjavel-stada]")?.textContent || ""), null, { timeout: 160000 });
  const t1 = (Date.now() - t0) / 1000;
  const upT = (await stada.innerText()).replace(/\s+/g, " ");
  console.log("   eftir", t1.toFixed(0), "s:", upT.slice(0, 140));
  check("annað verk (blender) í gangi: „upptekin við annað verk (blender)“ eftir ~2 mín — EKKI villa", (await stada.getAttribute("data-veggjavel-stada")) === "bida" && /upptekin við annað verk \(blender\)/.test(upT) && t1 > 100, `${t1} ${upT}`);
  await page.screenshot({ path: path.join(OUT, "01_upptekin.png") });

  // 2) ekkert í gangi → skýr villa við næstu fyrirspurn
  annadIGangi = false;
  await page.waitForFunction(() => document.querySelector("[data-veggjavel-stada]")?.getAttribute("data-veggjavel-stada") === "villa", null, { timeout: 15000 });
  const villaT = (await dlg.locator("[data-veggjavel-villa]").innerText()).trim();
  check("engin vél svarar: „Skrifstofutölvan svarar ekki — er hún í gangi?“", villaT === "Skrifstofutölvan svarar ekki — er hún í gangi?", villaT);
  const n0 = kollud.stada;
  await page.waitForTimeout(7000);
  check("hætt að spyrja eftir villuna", kollud.stada === n0, `${n0} → ${kollud.stada}`);
  check("„Reyna aftur“ og „← Greining í vafranum“ í boði", (await dlg.getByRole("button", { name: "Reyna aftur" }).count()) === 1 && (await dlg.getByRole("button", { name: /Greining í vafranum/ }).count()) === 1, "");
  await page.screenshot({ path: path.join(OUT, "02_svarar_ekki.png") });

  // 3) aftur í greiningu vafrans
  await dlg.getByRole("button", { name: /Greining í vafranum/ }).click();
  await page.waitForTimeout(500);
  const aftur = (await nidurst.innerText()).replace(/\s+/g, " ");
  check("„← Greining í vafranum“ skilar greiningu vafrans óbreyttri", aftur === vafriT && (await dlg.locator("[data-veggjavel]").count()) === 1, `${vafriT} | ${aftur}`);

  const ut = skrifBeidnir.filter((s) => !verndud.some((v) => s === v.method + " " + v.url) && !/teikning_bord|automation_triggers/.test(s));
  check("ekkert fór út (automation_triggers hermt, annað gripið af verðinum)", ut.length === 0 && kollud.ut === 0, JSON.stringify({ ut, kollud }));
  check("engar villur á síðunni", errs.length === 0, errs.join(" | "));
  console.log(`\n${ok.length}/${ok.length + bad.length} · köll á hermt automation_triggers: ${JSON.stringify(kollud)}`);
  if (bad.length) console.log("BRÁST:\n" + bad.join("\n"));
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
