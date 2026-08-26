import { get, set } from "idb-keyval";
import { hydrateAssets } from "./assets";
import { createDemoBoard } from "./demo-board";
import { useBoardStore } from "./store";
import type { BoardDocument, BoardObject } from "./types";

const DOC_KEY = "kjarni-board-v1";

/** v1 boards locked imported pages; unlock them once so they can be dragged. */
export function migrateBoardObjects(objects: BoardObject[]): BoardObject[] {
  return objects.map((obj) => (obj.type === "image" && obj.locked ? { ...obj, locked: false } : obj));
}

export async function loadBoard() {
  const saved = await get<BoardDocument>(DOC_KEY);
  if (saved?.objects?.length) {
    await hydrateAssets(saved.assetIds ?? []);
    useBoardStore.getState().replaceBoard({
      name: saved.name || "TurboPaint",
      objects: (saved.version ?? 1) < 2 ? migrateBoardObjects(saved.objects) : saved.objects,
      camera: saved.camera,
      pixelsPerMeter: saved.pixelsPerMeter,
      grid: saved.grid ?? true,
      snap: saved.snap ?? true,
    });
  } else {
    const objects = await createDemoBoard();
    useBoardStore.getState().replaceBoard({
      name: "Helluhraun 10 · 2. hæð",
      objects,
      camera: { x: 40, y: 48, scale: 0.55 },
      pixelsPerMeter: null,
      grid: true,
      snap: true,
    });
    await persistBoard();
  }
  useBoardStore.getState().setHydrated(true);
}

export async function persistBoard() {
  const state = useBoardStore.getState();
  const assetIds = state.objects
    .filter((o) => o.type === "image")
    .map((o) => o.assetId);
  const doc: BoardDocument = {
    version: 2,
    name: state.name,
    objects: state.objects,
    camera: state.camera,
    pixelsPerMeter: state.pixelsPerMeter,
    grid: state.grid,
    snap: state.snap,
    assetIds: [...new Set(assetIds)],
  };
  await set(DOC_KEY, doc);
}

export async function resetBoard() {
  const objects = await createDemoBoard();
  useBoardStore.getState().replaceBoard({
    name: "Nýtt TurboPaint borð",
    objects,
    camera: { x: 40, y: 48, scale: 0.55 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  await persistBoard();
}

export async function clearBoard() {
  useBoardStore.getState().replaceBoard({
    name: "Nýtt borð",
    objects: [],
    camera: { x: 80, y: 80, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  await persistBoard();
}

let saveTimer: number | undefined;

export function schedulePersist() {
  if (typeof window === "undefined") return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void persistBoard();
  }, 700);
}
