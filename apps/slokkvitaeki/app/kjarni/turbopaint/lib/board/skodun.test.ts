// Skoðunarhamur (skodun.ts): slóðin sem „Greining fasteignar" opnar, og SÖNNUNIN að skoðun skrifar ekkert — hvorki í
// IndexedDB né Supabase (rest/storage) — fyrr en „Vista sem borð", sem fer sömu leið og nýtt borð + innflutningur.
//
// Gervi-umhverfi: `window` (svo getSupabase búi til raunverulegan supabase-js-biðlara), njósnar-`fetch` sem skráir ÖLL
// netköll, og lítill IndexedDB sem skráir öll skrif (idb-keyval notar aðeins open/transaction/objectStore/put/get/delete).
import assert from "node:assert/strict";
import { test } from "node:test";

type Kall = { method: string; url: string; body?: string };
const netkoll: Kall[] = [];
const idbSkrif: string[] = [];
const idbGogn = new Map<string, unknown>();
let tímamælar = 0;

// ── Gervi-IndexedDB ──────────────────────────────────────────────────────────────────────────────────────────────
type Bid = { result?: unknown; error?: unknown; onsuccess?: () => void; oncomplete?: () => void; onerror?: () => void; onabort?: () => void; onupgradeneeded?: () => void };
const ljuka = (r: Bid, result?: unknown) =>
  setTimeout(() => {
    r.result = result;
    r.onsuccess?.();
    r.oncomplete?.();
  }, 0);
function faersla() {
  const tx: Bid & { objectStore?: () => unknown } = {};
  const store = {
    transaction: tx,
    put(v: unknown, k: string) {
      idbSkrif.push("put " + k);
      idbGogn.set(k, v);
      ljuka(tx);
      return {};
    },
    delete(k: string) {
      idbSkrif.push("delete " + k);
      idbGogn.delete(k);
      ljuka(tx);
      return {};
    },
    get(k: string) {
      const r: Bid = {};
      ljuka(r, idbGogn.get(k));
      return r;
    },
  };
  tx.objectStore = () => store;
  return tx;
}
const gerviDb = { createObjectStore() {}, transaction: () => faersla() };
(globalThis as Record<string, unknown>).indexedDB = {
  open() {
    const r: Bid = {};
    setTimeout(() => {
      r.result = gerviDb;
      r.onupgradeneeded?.();
      r.onsuccess?.();
    }, 0);
    return r;
  },
};

// ── Gervi-vafri + njósnar-fetch ─────────────────────────────────────────────────────────────────────────────────
(globalThis as Record<string, unknown>).window = {
  setTimeout: (f: () => void, ms?: number) => {
    tímamælar++;
    return setTimeout(f, ms) as unknown as number;
  },
  clearTimeout: (t: number) => clearTimeout(t as unknown as NodeJS.Timeout),
  addEventListener() {},
  removeEventListener() {},
};
(globalThis as Record<string, unknown>).document = { addEventListener() {}, visibilityState: "visible" };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = input instanceof Request ? input : null;
  const url = req ? req.url : String(input);
  const method = (init?.method || req?.method || "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : undefined;
  netkoll.push({ method, url, body });
  if (method === "HEAD") return new Response(null, { status: 404 }); // ekki í fötunni → hlaðið upp
  if (url.includes("/storage/v1/object/")) return new Response(JSON.stringify({ Key: "x" }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("[]", { status: 201, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const SLOD = "https://teikningar.hafnarfjordur.is/data/Dalshraun_10_1_0019.pdf";
const ALFABORG =
  "https://skjalasafn.reykjavik.is/fotoweb/archives/5000-A%C3%B0aluppdr%C3%A6ttir/A%C3%B0aluppdr%C3%A6ttir/2022/11/2022-10-1139929.pdf.info";

test("slóðin: hrá, vafin í teikn-mynd/teikn-pdf (afstæð og full), titill eða heiti úr skránni", async () => {
  const { lesaSkodunarBeidni, skodunarSlod, afvefjaSlod, TURBOPAINT_SLOD } = await import("./skodun");
  assert.deepEqual(lesaSkodunarBeidni("?skoda=" + encodeURIComponent(SLOD) + "&titill=" + encodeURIComponent("Dalshraun 10 · 1. hæð")), {
    slod: SLOD,
    titill: "Dalshraun 10 · 1. hæð",
  });
  // image_url teikning_bord / data-mynd í 451: /.netlify/functions/teikn-mynd?url=<permalink>
  const vafin = "/.netlify/functions/teikn-mynd?url=" + encodeURIComponent(ALFABORG);
  assert.equal(lesaSkodunarBeidni("?skoda=" + encodeURIComponent(vafin))?.slod, ALFABORG);
  assert.equal(afvefjaSlod("https://slokkvitaeki.netlify.app/.netlify/functions/teikn-pdf?url=" + encodeURIComponent(SLOD)), SLOD);
  // Titill vantar → skráarnafnið
  assert.equal(lesaSkodunarBeidni("?skoda=" + encodeURIComponent(SLOD))?.titill, "Dalshraun_10_1_0019");
  assert.equal(lesaSkodunarBeidni("?skoda=" + encodeURIComponent(ALFABORG))?.titill, "2022-10-1139929");
  // Ekki teikning / ekki https / engin breyta
  assert.equal(lesaSkodunarBeidni("?skoda=" + encodeURIComponent("http://teikningar.hafnarfjordur.is/a.pdf")), null);
  assert.equal(lesaSkodunarBeidni("?skoda=javascript%3Aalert(1)"), null);
  assert.equal(lesaSkodunarBeidni("?plan=" + encodeURIComponent(SLOD)), null);
  // Sniðmátið sem takkinn notar gengur fram og til baka
  const s = skodunarSlod(ALFABORG, "Álfaborg 1. hæð");
  assert.ok(s.startsWith(TURBOPAINT_SLOD + "?skoda=https%3A%2F%2Fskjalasafn.reykjavik.is"));
  assert.deepEqual(lesaSkodunarBeidni(new URL(s).search), { slod: ALFABORG, titill: "Álfaborg 1. hæð" });
});

test("engin vistun í skoðunarham: teiknað, merkt, persistBoard/schedulePersist/eyða — 0 netköll, 0 IndexedDB-skrif", async () => {
  const p = await import("./persistence");
  const { putAsset, deleteAsset, getAssetBlob } = await import("./assets");
  const { useBoardStore } = await import("./store");
  const { erSkodun, skodunBreytt, useSkodun } = await import("./skodun");

  p.opnaSkodun("Dalshraun 10 · 1. hæð", SLOD);
  assert.equal(erSkodun(), true);
  assert.equal(p.getCurrentBoardId(), null);
  assert.equal(useBoardStore.getState().hydrated, true);
  assert.equal(useBoardStore.getState().name, "Dalshraun 10 · 1. hæð");

  // Innflutningurinn: skjámynd + frumskrá (PDF) í minni — eins og importFiles gerir
  await putAsset("skjamynd1", new Blob([new Uint8Array(64)], { type: "image/png" }));
  await putAsset("frum1", new Blob([new Uint8Array(32)], { type: "application/pdf" }));
  useBoardStore.getState().addObjects([
    { id: "mynd1", type: "image", assetId: "skjamynd1", frumAssetId: "frum1", x: 0, y: 0, width: 7517, height: 5321, rotation: 0, opacity: 1, locked: false, hidden: false, name: "Dalshraun_10_1_0019" },
  ]);
  useSkodun.setState({ grunnur: useBoardStore.getState().objects });
  assert.equal(skodunBreytt(useBoardStore.getState().objects), false);
  // Notandinn teiknar á skoðunina
  useBoardStore.getState().addObjects([
    { id: "pen1", type: "pen", x: 0, y: 0, points: [0, 0, 80, 80], stroke: "#111", strokeWidth: 2, dash: "solid", rotation: 0, opacity: 1, locked: false, hidden: false, name: "Penni" },
  ]);
  assert.equal(skodunBreytt(useBoardStore.getState().objects), true);

  // Allir skrif-staðirnir
  p.schedulePersist();
  await p.persistBoard();
  await p.pullIfNewer();
  await p.loadBoard();
  await p.deleteCurrentBoard();
  await deleteAsset("frum-sem-er-ekki-til");
  await new Promise((r) => setTimeout(r, 30));

  assert.deepEqual(netkoll, [], "skoðun sendi netkall: " + JSON.stringify(netkoll));
  assert.deepEqual(idbSkrif, [], "skoðun skrifaði í IndexedDB: " + idbSkrif.join(", "));
  assert.equal(tímamælar, 0, "skoðun stillti vistunar-/ýtingartíma");
  assert.ok(getAssetBlob("skjamynd1"), "myndin er í minni flipans");
  assert.equal(p.getCurrentBoardId(), null, "ekkert borð varð til");
  assert.equal(useBoardStore.getState().objects.length, 2, "teikningin og strikið standa á skoðunarborðinu");
});

test("„Vista sem borð\": SAMA leið og nýtt borð + innflutningur — IndexedDB, borðalisti, upphleðsla, upsert", async () => {
  const p = await import("./persistence");
  const { erSkodun, useSkodun, drogFingur } = await import("./skodun");
  const { useBoardStore } = await import("./store");

  // Skoðunin opnaðist með drögum (#drog=) á mynd1 → „Vista sem borð" merkir myndina `thjalfun` (þjálfunargögn)
  useSkodun.setState({ drog: { fingur: drogFingur("d1~33717,40483,34322,40481,153v"), planId: "mynd1" } });
  const r = await p.vistaSkodunSemBord();
  assert.equal(erSkodun(), false);
  assert.equal(p.getCurrentBoardId(), r.id);
  assert.equal(r.sky, "synced");

  // IndexedDB: myndirnar, borðið og borðalistinn (nýja borðið er núverandi)
  assert.ok(idbSkrif.includes("put kjarni-asset-skjamynd1"));
  assert.ok(idbSkrif.includes("put kjarni-asset-frum1"));
  assert.ok(idbSkrif.includes("put tp-board-v1:" + r.id));
  const index = idbGogn.get("tp-index-v1") as { currentId: string; boards: { id: string; name: string }[] };
  assert.equal(index.currentId, r.id);
  assert.equal(index.boards[0].name, "Dalshraun 10 · 1. hæð");

  // Ský: hvor mynd hlaðin upp í turbopaint-fötuna, svo upsert borðsins — sömu köll og pushBoard venjulegs borðs
  const skrif = netkoll.filter((k) => k.method !== "GET" && k.method !== "HEAD");
  const slodir = skrif.map((k) => k.method + " " + new URL(k.url).pathname);
  assert.deepEqual(slodir, [
    "POST /storage/v1/object/turbopaint/skjamynd1.png",
    "POST /storage/v1/object/turbopaint/frum1.png",
    "POST /rest/v1/turbopaint_boards",
  ]);
  const upsert = JSON.parse(skrif[2].body || "{}");
  assert.equal(upsert.id, r.id);
  assert.equal(upsert.name, "Dalshraun 10 · 1. hæð");
  assert.equal(upsert.deleted, false);
  assert.deepEqual(upsert.doc.assetIds, ["skjamynd1"]);
  assert.deepEqual(upsert.doc.frumAssetIds, ["frum1"]);
  assert.equal(upsert.doc.objects.length, 2);
  const mynd = upsert.doc.objects.find((o: { id: string }) => o.id === "mynd1");
  assert.equal(mynd.thjalfun.drog, "f4e8b068");
  assert.equal(mynd.thjalfun.yfirfarid, true);
  assert.ok(!Number.isNaN(Date.parse(mynd.thjalfun.kl)));
  assert.equal(upsert.doc.objects.find((o: { id: string }) => o.id === "pen1").thjalfun, undefined, "aðeins teikningin merkt");
  assert.equal(useSkodun.getState().drog, null, "drögin gleymast eftir vistun");

  // Eftir vistun er þetta venjulegt borð: næsta breyting vistast eins og alltaf
  idbSkrif.length = 0;
  useBoardStore.getState().setName("Dalshraun 10 · 1. hæð (merkt)");
  await p.persistBoard();
  assert.ok(idbSkrif.includes("put tp-board-v1:" + r.id));
});

test("drög: þjappað snið fram og til baka, rusl hunsað, borðhnit", async () => {
  const { lesaDrog, skrifaDrog, drogIBord, lesaSkodunarBeidni, skodunarSlod } = await import("./skodun");
  const s = skrifaDrog(
    [
      { p: [100, 200, 900, 200], t: 15, tegund: "veggur" },
      { p: [300, 200, 390, 200], t: 15, tegund: "hurd" },
      { p: [500, 50, 700, 50], t: 8, tegund: "gler" },
    ],
    1000,
    500
  );
  assert.ok(s.startsWith("d1~"));
  const d = lesaDrog(s + "~rusl~1,2,3~99999999,0,0,0,5v")!;
  assert.equal(d.length, 3);
  assert.deepEqual(d.map((l) => l.tegund), ["veggur", "hurd", "gler"]);
  const b = drogIBord(d, { x: 10, y: 20, width: 2000, height: 1000 });
  assert.deepEqual(b[1].p, [10 + 600, 20 + 400, 10 + 780, 20 + 400]);
  assert.equal(b[0].t, 30);
  assert.equal(lesaDrog("rusl"), null);
  assert.equal(lesaDrog("d1~"), null);
  const slod = skodunarSlod(SLOD, "Berjavellir 6") + "&drog=" + encodeURIComponent(s);
  assert.equal(lesaSkodunarBeidni(new URL(slod).search)?.drog, s);
  assert.equal(lesaSkodunarBeidni(new URL(skodunarSlod(SLOD)).search)?.drog, undefined);
  // í brotinu (#drog=…): kommur og ~ óbreytt
  const u = new URL(skodunarSlod(SLOD) + "#drog=" + s);
  assert.equal(lesaSkodunarBeidni(u.search, u.hash)?.drog, s);
});

test("drogFingur: FNV-1a 32 (sama fall og raun_saekja.js í þjálfunarpípunni)", async () => {
  const { drogFingur } = await import("./skodun");
  assert.equal(drogFingur(""), "811c9dc5");
  assert.equal(drogFingur("a"), "e40c292c");
  assert.equal(drogFingur("d1~33717,40483,34322,40481,153v"), "f4e8b068");
});

test("skoðun án draga: „Vista sem borð\" merkir ekkert", async () => {
  const p = await import("./persistence");
  const { useSkodun } = await import("./skodun");
  const { useBoardStore } = await import("./store");
  p.opnaSkodun("Án draga", SLOD);
  assert.equal(useSkodun.getState().drog, null, "ný skoðun byrjar án draga");
  useBoardStore.getState().addObjects([
    { id: "mynd2", type: "image", assetId: "skjamynd1", x: 0, y: 0, width: 100, height: 70, rotation: 0, opacity: 1, locked: false, hidden: false, name: "B" },
  ]);
  netkoll.length = 0;
  await p.vistaSkodunSemBord();
  const upsert = JSON.parse(netkoll.filter((k) => k.method === "POST" && k.url.includes("/rest/v1/turbopaint_boards")).pop()?.body || "{}");
  assert.equal(upsert.doc.objects[0].thjalfun, undefined);
});
