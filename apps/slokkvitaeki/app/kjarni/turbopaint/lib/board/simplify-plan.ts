import { getAssetBlob } from "./assets";
import { newId } from "./ids";
import {
  downsampleRgba,
  traceWallsFromRgba,
  type TraceWallsOptions,
  type TraceWallsResult,
} from "./trace-walls";
import type { BoardObject, ImageObject, LineObject } from "./types";

/** Name stamped on traced wall polylines — used for the Veggir layer. */
export const CLEAN_WALL_NAME = "Veggur";

/** Working resolution. Full-res permalinks are tens of megabytes of pixels. */
export const CLEAN_TRACE_MAX = 2200;

export function isCleanWall(obj: BoardObject): obj is LineObject {
  return obj.type === "polyline" && obj.name.startsWith(CLEAN_WALL_NAME);
}

export function isSourcePlan(obj: BoardObject): obj is ImageObject {
  return obj.type === "image";
}

function yieldToUi() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function loadPlanRgba(plan: ImageObject): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Teikningin er ekki í minni — opnaðu borðið aftur");
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gat ekki lesið teikninguna");
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
  return { data: image.data, width: image.width, height: image.height };
}

function polylineFromLocal(
  local: number[],
  plan: ImageObject,
  srcW: number,
  srcH: number,
  workScale: number
): LineObject {
  const sx = plan.width / srcW;
  const sy = plan.height / srcH;
  const points: number[] = [];
  for (let i = 0; i < local.length; i += 2) {
    points.push(
      plan.x + (local[i] / workScale) * sx,
      plan.y + (local[i + 1] / workScale) * sy
    );
  }
  return {
    id: newId(),
    type: "polyline",
    x: 0,
    y: 0,
    points,
    stroke: "#1c1917",
    strokeWidth: 3,
    dash: "solid",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: CLEAN_WALL_NAME,
    parentId: plan.id,
  };
}

export type RedrawWallsResult = {
  objects: LineObject[];
  trace: TraceWallsResult;
  sourceHidden: boolean;
};

/**
 * Trace major walls on an imported plan and return vector polylines in board
 * space. Caller adds them to the store and may hide the source raster.
 */
export async function redrawWallsFromPlan(
  plan: ImageObject,
  options?: TraceWallsOptions & {
    onProgress?: (message: string, percent: number) => void;
  }
): Promise<RedrawWallsResult> {
  options?.onProgress?.("Les teikningu…", 8);
  const src = await loadPlanRgba(plan);
  await yieldToUi();
  options?.onProgress?.("Minnka niður í vinnsluupplausn…", 22);
  const work = downsampleRgba(src.data, src.width, src.height, CLEAN_TRACE_MAX);
  await yieldToUi();
  options?.onProgress?.("Finn þykka veggi, hendi málsetningum…", 55);
  const trace = traceWallsFromRgba(work.data, work.width, work.height, options);
  await yieldToUi();
  options?.onProgress?.("Teikna veggi sem vektora…", 88);
  const objects = trace.polylines.map((pts) =>
    polylineFromLocal(pts, plan, src.width, src.height, work.scale)
  );
  return { objects, trace, sourceHidden: true };
}
