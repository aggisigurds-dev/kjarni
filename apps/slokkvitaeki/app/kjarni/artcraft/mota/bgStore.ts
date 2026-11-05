/** Eigin bakgrunnar í Móta — myndir sem notandinn setur inn og vill nota
 *  aftur. Geymdar í IndexedDB í vafranum (á þessu tæki), smækkaðar í mest
 *  3000 px, með lítilli smámynd fyrir listann. */

export type SavedBackground = { id: string; name: string; blob: Blob; thumb: string; created: number };

const DB_NAME = "kjarni-mota";
const STORE = "backgrounds";
const MAX_SIDE = 3000;
const THUMB = 160;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Vafrinn leyfir ekki vistun mynda (IndexedDB vantar)"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Gat ekki opnað myndageymsluna"));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? req.error ?? new Error("Vistun í vafra mistókst"));
        };
      }),
  );
}

async function scaled(file: Blob, maxSide: number, type: string, quality: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað mynd");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Gat ekki vistað mynd"))), type, quality),
    );
  } finally {
    bmp.close();
  }
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function listBackgrounds(): Promise<SavedBackground[]> {
  const all = await run<SavedBackground[]>("readonly", (s) => s.getAll() as IDBRequest<SavedBackground[]>);
  return all.sort((a, b) => b.created - a.created);
}

export async function addBackground(file: File): Promise<SavedBackground> {
  const blob = await scaled(file, MAX_SIDE, "image/jpeg", 0.92);
  const thumb = await dataUrl(await scaled(file, THUMB, "image/jpeg", 0.8));
  const item: SavedBackground = {
    id: `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: (file.name || "Bakgrunnur").replace(/\.[^.]+$/, "").slice(0, 24) || "Bakgrunnur",
    blob,
    thumb,
    created: Date.now(),
  };
  await run("readwrite", (s) => s.put(item));
  return item;
}

export async function removeBackground(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** Útklippt manneskja (`cutout`, gegnsæ) ofan á `background`, í stærð
 *  frumritsins. Bakgrunnurinn fyllir rammann (cover), miðjaður. */
export async function placeOnBackground(cutout: Blob, background: Blob, width: number, height: number): Promise<Blob> {
  const [cut, bg] = await Promise.all([createImageBitmap(cutout), createImageBitmap(background)]);
  try {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað mynd");
    ctx.imageSmoothingQuality = "high";
    const k = Math.max(width / bg.width, height / bg.height);
    const dw = bg.width * k;
    const dh = bg.height * k;
    ctx.drawImage(bg, (width - dw) / 2, (height - dh) / 2, dw, dh);
    ctx.drawImage(cut, 0, 0, width, height);
    return await new Promise((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Gat ekki vistað mynd"))), "image/jpeg", 0.95),
    );
  } finally {
    cut.close();
    bg.close();
  }
}
