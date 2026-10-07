/* „Stærð allra merkja" (Agnar 07.10.2026: „ég get heldur ekki breytt stærðunum á öllum merkingunum í einu, þarf að gera
 * hvert fyrir sig").
 *   node tools/turbopaint-staerd-allra.cjs [http://localhost:4123] [úttaksmappa]
 * Fiskislóð 41 (1612, 1. hæð hmuaaaw83rg9) í Slökkvitækjaham, raunveruleg mús og lyklaborð:
 *   opnun beitir stimpilStaerd hæðarinnar → sleðinn „Stærð allra merkja" dreginn niður: öll merki minni, miðjur kyrrar
 *   → ⌘Z skilar öllu í einu skrefi (⌘Y aftur) → 3 tákn valin (smellur + Shift-smellur) → stærðarsleði eiginleikaspjaldsins:
 *   aðeins þau breytast → „Vista í úttekt": sendingin (gripin) ber stimpilStaerd = nýju stærðina, staerd valinna merkja,
 *   og ÓBREYTTAR staðsetningar allra merkja.
 * ENGIN skrif fara út: turbopaint-vordur.cjs grípur borðið/myndir; teikning_bord lesið EINU sinni, fryst, skrif gripin. */
const path = require("path");
const { raesa, opnaUttekt, teljari, mappa } = require("./turbopaint-hjalp.cjs");

const BASE = process.argv[2] || "http://localhost:4123";
const OUT = mappa(process.argv, "turbopaint-staerd-allra-myndir");
const CID = 1612, HAED = "hmuaaaw83rg9";
const { ok, bad, check } = teljari();

(async () => {
  const gripin = [];
  let fryst = null;
  const { b, page, errs, verndud, skrifBeidnir } = await raesa({
    teikningBord: async (route) => {
      const req = route.request();
      if (req.method() === "GET" || req.method() === "HEAD") {
        if (!/company_id=eq\.1612\b/.test(req.url())) return route.fallback();
        if (!fryst) fryst = await (await route.fetch()).text();
        return route.fulfill({ status: 200, contentType: "application/json", body: fryst });
      }
      gripin.push({ method: req.method(), body: req.postData() });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ company_id: CID }]) });
    },
  });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });
  const stada = () =>
    page.evaluate(() => {
      const s = window.__tpStore.getState();
      const m = s.objects.find((o) => o.type === "image" && o.uttekt && o.uttekt.companyId === 1612);
      const T = s.objects
        .filter((o) => o.type === "symbol" && !String(o.name || "").startsWith("165.BR1") && ((o.uttektUnitId != null && o.uttektUnitId !== "") || String(o.symbolId).startsWith("teikn:")))
        .map((o) => {
          const a = ((o.rotation || 0) * Math.PI) / 180, h = o.size / 2;
          return { id: o.id, u: o.uttektUnitId == null ? null : String(o.uttektUnitId), size: o.size, cx: o.x + h * Math.cos(a) - h * Math.sin(a), cy: o.y + h * Math.sin(a) + h * Math.cos(a), hidden: !!o.hidden };
        });
      return { t: { T: m.uttekt.stimpilStaerd, vid: m.uttekt.stimpilStaerdVid, e: m.uttekt.taknEining }, takn: T, sel: s.selectedIds.slice(), cam: s.camera };
    });
  const skja = (x, y) =>
    page.evaluate(([x, y]) => {
      const cam = window.__tpStore.getState().camera;
      const r = document.querySelector(".tp-sheet").getBoundingClientRect();
      return { x: r.left + x * cam.scale + cam.x, y: r.top + y * cam.scale + cam.y };
    }, [x, y]);
  /** Dregur sleða (raunveruleg mús) frá núverandi gildi að `til`. */
  const dragaSleda = async (loc, til) => {
    const box = await loc.boundingBox();
    const [min, max, nu] = await loc.evaluate((e) => [Number(e.min), Number(e.max), Number(e.value)]);
    const pad = 8;
    const xAf = (v) => box.x + pad + ((v - min) / (max - min)) * (box.width - 2 * pad);
    const y = box.y + box.height / 2;
    await page.mouse.move(xAf(nu), y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(xAf(nu) + ((xAf(til) - xAf(nu)) * i) / 10, y);
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  const midjaKyrr = (a, b2) => a.every((x) => { const y = b2.find((z) => z.id === x.id); return y && Math.hypot(x.cx - y.cx, x.cy - y.cy) < 1e-6; });

  // ── opna ──────────────────────────────────────────────────────────────────────────────────────────────────
  await opnaUttekt(page, { BASE, cid: CID, haed: HAED, b: 4244, h: 6006, ham: "slokkvitaeki" });
  const fersk = JSON.parse(fryst);
  const rod = Array.isArray(fersk) ? fersk[0] : fersk;
  const h0 = rod.haedir.find((h) => h.id === HAED);
  const s0 = await stada();
  const T0 = s0.t.T;
  console.log("opnað:", JSON.stringify({ tenging: s0.t, takn: s0.takn.length, stimpilStaerdHaedar: h0.stimpilStaerd }));
  check(`opnun beitir stimpilStaerd hæðarinnar (${h0.stimpilStaerd}) — tengingin ber hana`, T0 === Math.round(Number(h0.stimpilStaerd) || 56) && s0.t.vid === T0 && s0.t.e > 0, JSON.stringify(s0.t));
  const rangar = h0.markers
    .map((mk) => ({ mk, t: s0.takn.find((x) => x.u === String(mk.unitId)) }))
    .filter(({ mk, t }) => t && Math.abs(t.size / s0.t.e - (Number(mk.staerd) ? Math.max(10, Math.min(160, Math.round(Number(mk.staerd)))) : T0)) > 0.01);
  check("hvert merki = (eigin staerd || stimpilStaerd) Teikning-px · eining", rangar.length === 0, JSON.stringify(rangar.slice(0, 3)));
  const sledi = page.getByRole("slider", { name: "Stærð allra merkja" });
  await sledi.waitFor({ timeout: 10000 });
  check("sleðinn „Stærð allra merkja“ sýnir stærð hæðarinnar", Number(await sledi.inputValue()) === T0, await sledi.inputValue());
  await shot("01_opnad.png");

  // ── draga sleðann niður (≈ helmingur) ───────────────────────────────────────────────────────────────────────
  const markmid = Math.max(10, Math.round(T0 / 2));
  await dragaSleda(sledi, markmid);
  const s1 = await stada();
  const T1 = s1.t.T;
  console.log("   dregið:", T0, "→", T1);
  check(`sleðinn dreginn niður: ${T0} → ${T1} px`, T1 < T0 && T1 >= 10 && Number(await sledi.inputValue()) === T1, String(T1));
  const vaent = (x) => Math.max(10, Math.min(160, (x.size / s0.t.e) * (T1 / T0))) * s0.t.e;
  check(
    `ÖLL ${s0.takn.length} úttektartákn minnkuðu í sama hlutfalli (${(T1 / T0).toFixed(3)})`,
    s0.takn.every((x) => { const y = s1.takn.find((z) => z.id === x.id); return y && Math.abs(y.size - vaent(x)) < 1e-6 && y.size < x.size; }),
    JSON.stringify(s0.takn.slice(0, 3).map((x) => [x.size, s1.takn.find((z) => z.id === x.id)?.size, vaent(x)]))
  );
  check("miðja hvers tákns kyrr", midjaKyrr(s0.takn, s1.takn), "");
  await shot("02_dregid_nidur.png");

  // ── ⌘Z = eitt skref ────────────────────────────────────────────────────────────────────────────────────────
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  const s2 = await stada();
  check("⌘Z (fókus enn á sleðanum): öll táknin aftur í upphaflega stærð í EINU skrefi", s2.t.T === T0 && s0.takn.every((x) => { const y = s2.takn.find((z) => z.id === x.id); return y && Math.abs(y.size - x.size) < 1e-9; }) && midjaKyrr(s0.takn, s2.takn), JSON.stringify(s2.t));
  check("sleðinn sýnir aftur upphaflegu stærðina", Number(await sledi.inputValue()) === T0, await sledi.inputValue());
  await shot("03_ctrl_z.png");
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(300);
  const s3 = await stada();
  check("⌘Y: dráttinn aftur", s3.t.T === T1 && s1.takn.every((x) => Math.abs(s3.takn.find((z) => z.id === x.id).size - x.size) < 1e-9), JSON.stringify(s3.t));

  // ── 3 tákn valin → stærð valinna ───────────────────────────────────────────────────────────────────────────
  const r = await page.evaluate(() => document.querySelector(".tp-sheet").getBoundingClientRect().toJSON());
  const aSkja = [];
  for (const x of s3.takn.filter((t) => t.u && !t.hidden)) {
    const p = await skja(x.cx, x.cy);
    if (p.x > r.left + 30 && p.x < r.right - 30 && p.y > r.top + 120 && p.y < r.bottom - 90) aSkja.push({ ...x, p });
  }
  // þrjú sem standa langt hvert frá öðru (smellur hittir rétt tákn)
  aSkja.sort((a, c) => a.p.x - c.p.x);
  const valin = [aSkja[0], aSkja[Math.floor(aSkja.length / 2)], aSkja[aSkja.length - 1]];
  check("fann 3 tengd tákn á skjánum", valin.length === 3 && new Set(valin.map((v) => v.id)).size === 3, String(aSkja.length));
  await page.keyboard.press("Escape");
  await page.mouse.click(valin[0].p.x, valin[0].p.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(valin[1].p.x, valin[1].p.y);
  await page.mouse.click(valin[2].p.x, valin[2].p.y);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(300);
  const s4 = await stada();
  check("smellur + Shift-smellur: nákvæmlega 3 tákn valin", s4.sel.length === 3 && valin.every((v) => s4.sel.includes(v.id)), JSON.stringify(s4.sel));
  const valSledi = page.getByRole("slider", { name: "Stærð valinna tákna" });
  await valSledi.waitFor({ timeout: 5000 });
  const V = Math.min(160, T1 + 25);
  await dragaSleda(valSledi, V);
  const s5 = await stada();
  const Vr = Number(await valSledi.inputValue());
  console.log("   valin:", valin.map((v) => v.u).join(", "), "→", Vr, "px");
  check(`stærð valinna: öll 3 fá ${Vr} px (≈ ${V}) — hvert um sína miðju`, Vr > T1 && valin.every((v) => { const y = s5.takn.find((z) => z.id === v.id); return Math.abs(y.size / s0.t.e - Vr) < 1e-6; }) && midjaKyrr(valin, s5.takn), JSON.stringify(valin.map((v) => s5.takn.find((z) => z.id === v.id).size / s0.t.e)));
  const onnur = s3.takn.filter((x) => !valin.some((v) => v.id === x.id));
  check(`aðeins valin tákn breyttust (${onnur.length} önnur óbreytt)`, onnur.every((x) => { const y = s5.takn.find((z) => z.id === x.id); return Math.abs(y.size - x.size) < 1e-9 && Math.abs(y.cx - x.cx) < 1e-9; }), "");
  check("„Stærð allra merkja“ óbreytt við stærð valinna", s5.t.T === T1, String(s5.t.T));
  await shot("04_thrju_valin_staerri.png");

  // ── Vista í úttekt (gripið) ─────────────────────────────────────────────────────────────────────────────────
  await page.keyboard.press("Escape");
  const n0 = gripin.length;
  await page.getByRole("button", { name: /Vista í úttekt/ }).click();
  for (let i = 0; i < 300 && gripin.length === n0; i++) await page.waitForTimeout(100);
  await page.waitForTimeout(500);
  check("„Vista í úttekt“ skrifaði einu sinni (gripið, ekki sent)", gripin.length === n0 + 1, String(gripin.length - n0));
  const sent = JSON.parse(gripin[gripin.length - 1].body);
  const h1 = sent.haedir.find((h) => h.id === HAED);
  check(`sendingin: stimpilStaerd hæðarinnar = ${T1}`, h1.stimpilStaerd === T1, String(h1.stimpilStaerd));
  const fM = (u) => h0.markers.find((m) => String(m.unitId) === String(u));
  const sM = (u) => h1.markers.find((m) => String(m.unitId) === String(u));
  const faerd = h0.markers.filter((m) => { const n = sM(m.unitId); return !n || n.x !== m.x || n.y !== m.y; });
  check(`staðsetningar ALLRA ${h0.markers.length} merkja óbreyttar`, faerd.length === 0 && h1.markers.length === h0.markers.length, JSON.stringify(faerd.slice(0, 3)));
  check(`valin merki fá staerd ${Vr}`, valin.every((v) => sM(v.u).staerd === Vr), JSON.stringify(valin.map((v) => sM(v.u))));
  const aukaStaerd = h1.markers.filter((m) => !valin.some((v) => v.u === String(m.unitId)) && m.staerd != null && !(fM(m.unitId).staerd != null));
  check("önnur merki án eigin stærðar fá ENGA staerd (fylgja stærð hæðarinnar)", aukaStaerd.length === 0, JSON.stringify(aukaStaerd.slice(0, 3)));
  const eigin = h0.markers.filter((m) => m.staerd != null && !valin.some((v) => v.u === String(m.unitId)));
  check(`merki með eigin stærð (${eigin.length}) halda hlutfallinu (staerd × ${T1}/${T0})`, eigin.every((m) => sM(m.unitId).staerd === Math.max(10, Math.min(160, Math.round(m.staerd * (T1 / T0))))), JSON.stringify(eigin.map((m) => [m.staerd, sM(m.unitId).staerd])));
  check("aðrar hæðir óbreyttar", sent.haedir.filter((h) => h.id !== HAED).every((h) => JSON.stringify(h) === JSON.stringify(rod.haedir.find((x) => x.id === h.id))), "");
  await page.waitForTimeout(400);
  const s6 = await stada();
  check("eftir vistun: viðmiðið = nýja stærðin (næsta vistun skrifar ekki aftur)", s6.t.vid === T1, JSON.stringify(s6.t));
  await shot("05_vistad.png");

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
