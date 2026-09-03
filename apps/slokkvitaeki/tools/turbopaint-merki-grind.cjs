/* Sannar að tákn festist ekki lengur við grindina — en veggir/form geri það enn.
 * Alvöru músardráttur á strigann, ekki hermun á store-inu. */
const { chromium } = require("playwright");
const OUT = "/tmp/claude-0/-home-user/357c1d3d-b8ca-5909-8704-0dc2fc40aa5f/scratchpad";
const ok = [], bad = [];
const check = (n, c, extra) => (c ? ok : bad).push(n + (c ? "" : `   ← ${extra}`));

(async () => {
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext()).newPage();
  await page.setViewportSize({ width: 1600, height: 950 });
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto("http://localhost:4123/kjarni/turbopaint", { waitUntil: "domcontentloaded" });
  await page.locator(".tp-toolbar").waitFor({ timeout: 40000 });
  await page.waitForTimeout(6000);

  await page.evaluate(() => {
    const s = window.__tpStore.getState();
    s.setCamera({ x: 0, y: 0, scale: 1 });          // heimshnit == skjáhnit
    if (!s.snap) s.toggleSnap();                     // grind-festing KVEIKT
    s.setTool("select");
    const base = { rotation: 0, opacity: 1, locked: false, hidden: false };
    s.addObjects([
      { id: "merki", type: "symbol", symbolId: "extinguisher", x: 300, y: 300, size: 40, label: "", name: "Slökkvitæki", ...base },
      { id: "kassi", type: "rect", x: 600, y: 300, width: 80, height: 80, fill: "transparent",
        stroke: "#2563eb", strokeWidth: 2, cornerRadius: 0, name: "Ferningur", ...base },
    ], false);
  });
  await page.waitForTimeout(700);
  const grid = await page.evaluate(() => window.__tpStore.getState().gridGap);
  const box = await page.locator("canvas").first().boundingBox();

  // Dragur sem er VÍSVITANDI ekki margfeldi af grindarbilinu
  const DX = 37, DY = 23;
  const drag = async (cx, cy) => {
    await page.mouse.move(box.x + cx, box.y + cy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + cx + (DX * i) / 6, box.y + cy + (DY * i) / 6);
    await page.mouse.up();
    await page.waitForTimeout(400);
  };

  await drag(320, 320);                              // miðja merkisins
  await drag(640, 340);                              // miðja kassans
  const after = await page.evaluate(() => {
    const o = window.__tpStore.getState().objects;
    const g = (id) => { const x = o.find(v => v.id === id); return x && { x: Math.round(x.x), y: Math.round(x.y) }; };
    return { merki: g("merki"), kassi: g("kassi"), snap: window.__tpStore.getState().snap };
  });

  check("grind-festing er KVEIKT í prófinu", after.snap === true);
  check(`merki lendir nákvæmlega þar sem sleppt var (300+${DX}, 300+${DY})`,
        Math.abs(after.merki.x - (300 + DX)) <= 1 && Math.abs(after.merki.y - (300 + DY)) <= 1,
        JSON.stringify(after.merki));
  check("merki er EKKI á grindarpunkti", after.merki.x % grid !== 0 || after.merki.y % grid !== 0,
        `${JSON.stringify(after.merki)} grid=${grid}`);
  check("ferningur festist ENN við grindina", after.kassi.x % grid === 0 && after.kassi.y % grid === 0,
        `${JSON.stringify(after.kassi)} grid=${grid}`);
  check("ferningurinn hreyfðist í raun", after.kassi.x !== 600 || after.kassi.y !== 300, JSON.stringify(after.kassi));

  // Stimplun lendir nákvæmlega á smellinum
  await page.evaluate(() => {
    const s = window.__tpStore.getState();
    s.setStyle({ symbolId: "extinguisher" });
    s.setTool("symbol");
  });
  await page.waitForTimeout(300);
  await page.mouse.click(box.x + 517, box.y + 613);
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => {
    const o = window.__tpStore.getState().objects.filter(v => v.type === "symbol" && v.id !== "merki");
    const last = o[o.length - 1];
    return last && { cx: Math.round(last.x + last.size / 2), cy: Math.round(last.y + last.size / 2) };
  });
  check("stimplað tákn miðjast á smellinum (517, 613)",
        st && Math.abs(st.cx - 517) <= 1 && Math.abs(st.cy - 613) <= 1, JSON.stringify(st));

  await page.screenshot({ path: `${OUT}/j-stokk.png` });
  console.log(`grindarbil = ${grid}`);
  console.log(ok.map(n => "  ✔ " + n).join("\n"));
  if (bad.length) console.log(bad.map(n => "  ✘ " + n).join("\n"));
  console.log(`\n${ok.length}/${ok.length + bad.length} · villur: ${errs.length ? errs.join(" | ") : "engar"}`);
  await b.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error("BROTNAÐI:", e.message); process.exit(1); });
