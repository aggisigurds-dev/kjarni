/**
 * Gátreitur — a draggable box with a tick badge in its bottom-right corner.
 * Unchecked it is a quiet grey frame; ticked, the whole area turns green.
 * Field checklists on a plan: "this zone is done / inspected / installed".
 *
 * Modelled as a RectObject with `isCheckbox`, so moving, resizing, copying,
 * grouping, exporting and syncing all come for free.
 */

import type { BoardObject, RectObject } from "./types";

export const DEFAULT_CHECKBOX_SIZE = 120;
export const CHECKBOX_STROKE = "#6b7280";
export const CHECKBOX_FILL = "#e5e7eb80";
export const CHECKBOX_CHECKED_STROKE = "#15803d";
export const CHECKBOX_CHECKED_FILL = "#22c55e80";
/** The tick itself: grey until checked, white on the green badge after. */
export const CHECKBOX_TICK = "#9ca3af";
export const CHECKBOX_BADGE = "#f9fafb";

export type CheckboxObject = RectObject & { isCheckbox: true };

export function isCheckbox(obj: BoardObject): obj is CheckboxObject {
  return obj.type === "rect" && obj.isCheckbox === true;
}

/** Badge geometry inside a box of w × h: a corner square that scales with the box. */
export function checkboxBadge(width: number, height: number) {
  const size = Math.max(14, Math.min(28, Math.round(Math.min(width, height) / 4)));
  const inset = Math.max(3, Math.round(size / 6));
  return { size, x: width - size - inset, y: height - size - inset };
}

/** Tick polyline for a badge of `size`, as Konva Line points (relative to the badge). */
export function tickPoints(size: number): number[] {
  return [0.22 * size, 0.55 * size, 0.42 * size, 0.76 * size, 0.8 * size, 0.28 * size];
}

/** The colours a checkbox box paints with right now. */
export function checkboxPaint(obj: CheckboxObject) {
  const checked = Boolean(obj.checked);
  return {
    checked,
    fill: checked ? CHECKBOX_CHECKED_FILL : obj.fill === "transparent" ? undefined : obj.fill,
    stroke: checked ? CHECKBOX_CHECKED_STROKE : obj.stroke,
    badgeFill: checked ? CHECKBOX_CHECKED_STROKE : CHECKBOX_BADGE,
    badgeStroke: checked ? "#ffffff" : CHECKBOX_TICK,
    tick: checked ? "#ffffff" : CHECKBOX_TICK,
  };
}

/** Where a checkbox lands when the tool is just clicked (no drag): centred on the click. */
export function checkboxBoxFromClick(x: number, y: number, size = DEFAULT_CHECKBOX_SIZE) {
  return { x: x - size / 2, y: y - size / 2, width: size, height: size };
}
