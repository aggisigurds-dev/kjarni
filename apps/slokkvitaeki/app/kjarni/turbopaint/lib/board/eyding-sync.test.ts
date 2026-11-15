// Eyðing milli tækja og offline-eintök (persistence.ts). Borði er mjúk-eytt (deleted=true) en pushBoard skrifar
// deleted=false, svo eytt borð lifnaði við á ÖLLUM tækjum um leið og annað tæki opnaði sitt eintak. Prófin hér læsa:
//   · tæki sem ræsir á borði sem var eytt annars staðar opnar næsta borð og ýtir því eydda ekki upp aftur,
//   · opnað eytt borð er ekki ýtt nema það breytist (þá lifnar það við MEÐ nýju vinnunni — engin vinna glatast),
//   · listBoards hreinsar staðbundin eintök eyddra borða — en ekki óýtta vinnu,
//   · eydaBordi: ský fyrst (án nets breytist ekkert), og engin ýting lendir á eftir eyðingunni,
//   · „Sækja fyrir offline" uppfærir eldra eintak en skrifar aldrei yfir nýrri staðbundna vinnu; offlineStadaBords.
//
// Gervi-umhverfi: `window` með stýranlegum tímamælum (ýtingar keyrðar þegar prófið vill), lítill IndexedDB og gervi-ský
// sem svarar PostgREST-köllum supabase-js á turbopaint_boards (select / upsert / update) og skráir öll skrif.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardDocument } from "./types";

// ── Gervi-IndexedDB (sama og skodun.test.ts) ─────────────────────────────────────────────────────────────────────
const idbGogn = new Map<string, unknown>();
type Bid = { result?: unknown; onsuccess?: () => void; oncomplete?: () => void; onupgradeneeded?: () => void };
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
      idbGogn.set(k, structuredClone(v));
      ljuka(tx);
      return {};
    },
    delete(k: string) {
      idbGogn.delete(k);
      ljuka(tx);
      return {};
    },
    get(k: string) {
      const r: Bid = {};
      ljuka(r, structuredClone(idbGogn.get(k)));
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

// ── Gervi-vafri með stýranlegum tímamælum ────────────────────────────────────────────────────────────────────────
const bidandi = new Map<number, () => void>();
let naestaTimaId = 1;
(globalThis as Record<string, unknown>).window = {
  setTimeout: (fn: () => void) => {
    const id = naestaTimaId++;
    bidandi.set(id, fn);
    return id;
  },
  clearTimeout: (id: number) => void bidandi.delete(id),
  addEventListener() {},
  removeEventListener() {},
};
(globalThis as Record<string, unknown>).document = { addEventListener() {}, visibilityState: "visible" };
const bida = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Keyrir tímamæla sem bíða (t.d. schedulePush eftir 2,5 s) strax og bíður eftir að ýtingin klárist. */
async function keyraBidandi() {
  for (let umferd = 0; umferd < 4 && bidandi.size; umferd++) {
    const fns = [...bidandi.values()];
    bidandi.clear();
    for (const fn of fns) fn();
    await bida(60);
  }
}

// ── Gervi-ský: turbopaint_boards ─────────────────────────────────────────────────────────────────────────────────
type Rod = { id: string; name: string; doc: BoardDocument | null; deleted: boolean; updated_at: string };
const sky = new Map<string, Rod>();
const skrif: { adgerd: "upsert" | "update"; id: string; gogn: Record<string, unknown> }[] = [];
let uppfaerslaBregst = false;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const method = (init?.method || req?.method || "GET").toUpperCase();
  const json = { "content-type": "application/json" };
  if (!url.pathname.endsWith("/rest/v1/turbopaint_boards")) return new Response("[]", { status: 200, headers: json });
  const p = url.searchParams;
  const passar = (r: Rod) => {
    for (const [k, v] of p) {
      if (k === "select" || k === "order" || k === "limit") continue;
      const gildi = String((r as unknown as Record<string, unknown>)[k]);
      if (v.startsWith("eq.") && gildi !== v.slice(3)) return false;
      if (v.startsWith("in.(") && !v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")).includes(gildi)) return false;
    }
    return true;
  };
  if (method === "GET") {
    const dalkar = (p.get("select") || "*").split(",").map((d) => d.trim());
    const radir = [...sky.values()].filter(passar).map((r) => Object.fromEntries(dalkar.map((d) => [d, (r as unknown as Record<string, unknown>)[d]])));
    return new Response(JSON.stringify(radir), { status: 200, headers: json });
  }
  const body = JSON.parse(String(init?.body ?? "null")) as Record<string, unknown> | Record<string, unknown>[];
  if (method === "POST") {
    for (const r of Array.isArray(body) ? body : [body]) {
      skrif.push({ adgerd: "upsert", id: String(r.id), gogn: r });
      sky.set(String(r.id), { ...(sky.get(String(r.id)) as Rod), ...(r as unknown as Rod) });
    }
    return new Response(null, { status: 201 });
  }
  if (method === "PATCH") {
    if (uppfaerslaBregst) throw new TypeError("Failed to fetch"); // án nets
    for (const r of [...sky.values()].filter(passar)) {
      skrif.push({ adgerd: "update", id: r.id, gogn: body as Record<string, unknown> });
      Object.assign(r, body);
    }
    return new Response(null, { status: 204 });
  }
  return new Response("[]", { status: 200, headers: json });
}) as typeof fetch;

// ── Hjálparföll ──────────────────────────────────────────────────────────────────────────────────────────────────
function skjal(id: string, name: string, updatedAt: string): BoardDocument {
  return {
    version: 2,
    name,
    objects: [],
    camera: { x: 0, y: 0, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
    assetIds: [],
    frumAssetIds: [],
    boardId: id,
    updatedAt,
    syncRev: 2,
  } as BoardDocument;
}
/** Borð á þessu tæki (IndexedDB + borðalisti). */
function aTaekinu(id: string, name: string, updatedAt: string) {
  idbGogn.set(`tp-board-v1:${id}`, skjal(id, name, updatedAt));
  const index = (idbGogn.get("tp-index-v1") as { currentId: string | null; boards: { id: string; name: string; updatedAt: string }[] }) ?? {
    currentId: null,
    boards: [],
  };
  index.boards = [...index.boards.filter((b) => b.id !== id), { id, name, updatedAt }];
  idbGogn.set("tp-index-v1", index);
}
/** Röð í skýinu. Skýið skilar tíma á „+00:00"-sniði — staðbundin skjöl bera „Z": samanburður verður að vera tölulegur. */
function iSkyinu(id: string, name: string, updatedAtZ: string, deleted: boolean) {
  sky.set(id, { id, name, doc: skjal(id, name, updatedAtZ), deleted, updated_at: updatedAtZ.replace(".000Z", "+00:00") });
}
const vistadIStadbundid = () => (idbGogn.get("tp-index-v1") as { boards: { id: string }[] }).boards.map((b) => b.id).sort();
const upsertA = (id: string) => skrif.filter((s) => s.adgerd === "upsert" && s.id === id);

const T0 = "2026-11-10T10:00:00.000Z";
const T1 = "2026-11-12T10:00:00.000Z";
const T2 = "2026-11-13T08:00:00.000Z";
const T3 = "2026-11-13T12:00:00.000Z";

test("erNyrra: tölulegur samanburður þvert á Z / +00:00; sami tími er ekki nýrri; óþáttanlegt er nei", async () => {
  const { erNyrra } = await import("./persistence");
  assert.equal(erNyrra("2026-11-12T10:00:00.5Z", "2026-11-12T10:00:00+00:00"), true);
  assert.equal(erNyrra("2026-11-12T10:00:00.000Z", "2026-11-12T10:00:00+00:00"), false);
  assert.equal(erNyrra("2026-11-12T10:00:00+00:00", "2026-11-12T10:00:00.000Z"), false);
  // Strengjasamanburður myndi segja „.12+" < „.120" — tölulega eru þetta sami tíminn
  assert.equal(erNyrra("2026-11-12T10:00:00.12+00:00", "2026-11-12T10:00:00.120Z"), false);
  assert.equal(erNyrra(undefined, T1), false);
  assert.equal(erNyrra("rugl", T1), false);
});

test("ræsing á borði sem var eytt á öðru tæki: næsta borð opnast og eydda borðið er EKKI ýtt upp aftur", async () => {
  const p = await import("./persistence");
  aTaekinu("X", "Eytt á símanum", T1);
  aTaekinu("Y", "Annað borð", T0);
  (idbGogn.get("tp-index-v1") as { currentId: string }).currentId = "X";
  iSkyinu("X", "Eytt á símanum", T1, true);
  iSkyinu("Y", "Annað borð", T0, false);

  await p.loadBoard();
  await keyraBidandi();

  assert.equal(p.getCurrentBoardId(), "Y", "næsta borð opnaðist");
  assert.equal(idbGogn.has("tp-board-v1:X"), false, "staðbundna eintakið af eydda borðinu er farið");
  assert.deepEqual(vistadIStadbundid(), ["Y"]);
  assert.deepEqual(upsertA("X"), [], "eydda borðinu var ýtt upp aftur: " + JSON.stringify(upsertA("X")));
  assert.equal(sky.get("X")!.deleted, true, "eyðingin stendur í skýinu");
});

test("opnað borð sem var eytt annars staðar er ekki ýtt — nema það breytist (þá lifnar það við með nýju vinnunni)", async () => {
  const p = await import("./persistence");
  const { useBoardStore } = await import("./store");
  aTaekinu("Z", "Gamalt eintak", T2);
  iSkyinu("Z", "Gamalt eintak", T2, true);

  await p.switchBoard("Z");
  await keyraBidandi();
  assert.equal(p.getCurrentBoardId(), "Z");
  assert.deepEqual(upsertA("Z"), [], "óbreytt eytt borð var ýtt upp aftur");
  assert.equal(sky.get("Z")!.deleted, true);

  // Ný vinna á borðinu eftir eyðinguna → hún má ekki glatast: borðið fer upp aftur með henni
  useBoardStore.getState().setName("Gamalt eintak — ný vinna");
  await p.persistBoard();
  await keyraBidandi();
  const upp = upsertA("Z");
  assert.equal(upp.length, 1);
  assert.equal(upp[0].gogn.deleted, false);
  assert.equal(upp[0].gogn.name, "Gamalt eintak — ný vinna");
  assert.equal(sky.get("Z")!.deleted, false);
});

test("listBoards hreinsar staðbundin eintök af borðum sem var eytt annars staðar — en ekki óýtta vinnu", async () => {
  const p = await import("./persistence");
  aTaekinu("A", "Eytt, ekkert nýtt hér", T1);
  aTaekinu("B", "Eytt, en óýtt vinna hér", T3);
  aTaekinu("C", "Lifandi", T0);
  iSkyinu("A", "Eytt, ekkert nýtt hér", T1, true);
  iSkyinu("B", "Eytt, en óýtt vinna hér", T1, true);
  iSkyinu("C", "Lifandi", T0, false);

  const listi = (await p.listBoards()).map((b) => b.id).sort();
  assert.equal(listi.includes("A"), false, "eytt borð sést enn í listanum");
  assert.ok(listi.includes("B"), "borð með óýttri vinnu hvarf");
  assert.ok(listi.includes("C") && listi.includes("Y") && listi.includes("Z"));
  assert.equal(idbGogn.has("tp-board-v1:A"), false);
  assert.ok(idbGogn.has("tp-board-v1:B"));
  assert.equal(vistadIStadbundid().includes("A"), false);
});

test("eydaBordi á opna borðinu: ský fyrst — án nets breytist ekkert; með neti eytt alls staðar og ekkert ýtt á eftir", async () => {
  const p = await import("./persistence");
  assert.equal(p.getCurrentBoardId(), "Z");

  uppfaerslaBregst = true;
  await assert.rejects(p.eydaBordi("Z"), /Náði ekki að eyða/);
  assert.equal(p.getCurrentBoardId(), "Z", "borðið er enn opið");
  assert.ok(idbGogn.has("tp-board-v1:Z"), "staðbundna eintakið stendur");
  assert.ok(vistadIStadbundid().includes("Z"));
  assert.equal(sky.get("Z")!.deleted, false);

  uppfaerslaBregst = false;
  const fyrir = skrif.length;
  await p.eydaBordi("Z");
  await keyraBidandi();
  assert.equal(sky.get("Z")!.deleted, true, "eytt í skýinu");
  assert.notEqual(p.getCurrentBoardId(), "Z", "næsta borð opnaðist");
  assert.equal(idbGogn.has("tp-board-v1:Z"), false);
  assert.deepEqual(skrif.slice(fyrir).filter((s) => s.id === "Z" && s.adgerd === "upsert"), [], "ýting lenti á eftir eyðingunni");

  // Annað borð en það opna: sama regla
  await p.eydaBordi("C");
  assert.equal(sky.get("C")!.deleted, true);
  assert.equal(idbGogn.has("tp-board-v1:C"), false);
});

test("„Sækja fyrir offline\": eldra eintak uppfærist úr skýinu, nýrri staðbundin vinna er aldrei yfirskrifuð; offlineStadaBords", async () => {
  const p = await import("./persistence");
  aTaekinu("W", "W — gamla útgáfan", T1);
  iSkyinu("W", "W — nýja útgáfan", T2, false);
  aTaekinu("V", "V — nýrri vinna á tækinu", T3);
  iSkyinu("V", "V — eldri í skýinu", T2, false);

  // Áður: ✓ en eldri útgáfa í símanum
  assert.equal(await p.offlineStadaBords("W", T2.replace(".000Z", "+00:00")), "eldri");

  const w = await p.g_oraBordOfflineTilbuid("W");
  assert.deepEqual(w, { ok: true, vantar: 0, uppfaert: true });
  assert.equal((idbGogn.get("tp-board-v1:W") as BoardDocument).name, "W — nýja útgáfan");
  assert.equal(await p.offlineStadaBords("W", T2.replace(".000Z", "+00:00")), "ja");

  const v = await p.g_oraBordOfflineTilbuid("V");
  assert.deepEqual(v, { ok: true, vantar: 0, uppfaert: false });
  assert.equal((idbGogn.get("tp-board-v1:V") as BoardDocument).name, "V — nýrri vinna á tækinu", "ný vinna var yfirskrifuð");

  assert.equal(await p.offlineStadaBords("ekki-til"), "nei");
});
