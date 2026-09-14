// pdf.js 5.7 kallar Map.prototype.getOrInsertComputed (ES2026 „upsert"-tillagan)
// bæði í aðalþræði og í workernum. Chromium ≤141, eldri Safari og Firefox eiga
// aðferðina ekki og PDF-innflutningur dó þá með „getOrInsertComputed is not a
// function" (fannst 14.09.2026 í headless Chromium 141 — sama vafra og eldri
// símar/tölvur keyra). Sama polyfill er skeytt fremst á public/pdfjs/pdf.worker.min.mjs.
// Flutt inn FYRST í import-files.ts og WhiteboardApp.tsx svo hún sé komin áður en
// pdfjs-dist er metið.

type Upsertable<K, V> = {
  has(key: K): boolean;
  get(key: K): V | undefined;
  set(key: K, value: V): unknown;
};

function installUpsert(proto: object) {
  const p = proto as Record<string, unknown>;
  if (typeof p.getOrInsert !== "function") {
    Object.defineProperty(proto, "getOrInsert", {
      configurable: true,
      writable: true,
      value: function getOrInsert<K, V>(this: Upsertable<K, V>, key: K, value: V): V {
        if (this.has(key)) return this.get(key) as V;
        this.set(key, value);
        return value;
      },
    });
  }
  if (typeof p.getOrInsertComputed !== "function") {
    Object.defineProperty(proto, "getOrInsertComputed", {
      configurable: true,
      writable: true,
      value: function getOrInsertComputed<K, V>(
        this: Upsertable<K, V>,
        key: K,
        compute: (key: K) => V
      ): V {
        if (this.has(key)) return this.get(key) as V;
        const value = compute(key);
        this.set(key, value);
        return value;
      },
    });
  }
}

if (typeof Map !== "undefined") installUpsert(Map.prototype);
if (typeof WeakMap !== "undefined") installUpsert(WeakMap.prototype);

export {};
