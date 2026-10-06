/**
 * Copy / cut / paste for board objects (⌘C · ⌘X · ⌘V).
 *
 * The copied objects go two places: the store (so a paste works even when the
 * browser refuses clipboard access) and the system clipboard as tagged JSON,
 * so the same selection can be pasted onto another board or in another tab.
 */

import { newId } from "./ids";
import type { BoardObject, SymbolObject } from "./types";

interface ClipboardPayload {
  turbopaint: 1;
  objects: BoardObject[];
}

export function serializeClipboard(objects: BoardObject[]): string {
  const payload: ClipboardPayload = { turbopaint: 1, objects };
  return JSON.stringify(payload);
}

function looksLikeObject(value: unknown): value is BoardObject {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return typeof o.type === "string" && typeof o.x === "number" && typeof o.y === "number";
}

/** The objects inside pasted text, or null when the text is not ours. */
export function parseClipboard(text: string): BoardObject[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes('"turbopaint"')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<ClipboardPayload>;
    if (parsed.turbopaint !== 1 || !Array.isArray(parsed.objects)) return null;
    const objects = parsed.objects.filter(looksLikeObject);
    return objects.length ? objects : null;
  } catch {
    return null;
  }
}

/** Top-left corner of a set of objects — what lands under the cursor on paste. */
export function objectsOrigin(objects: BoardObject[]): { x: number; y: number } {
  let x = Infinity;
  let y = Infinity;
  for (const o of objects) {
    if (o.x < x) x = o.x;
    if (o.y < y) y = o.y;
  }
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

/**
 * Afrit tákns sem er tengt úttekt: tæki er aðeins á einum stað, svo afrit af tæki verður venjulegt tákn sömu tegundar
 * (án raðnúmers); afrit af Teikning-stimpli heldur stimplinum en fær nýtt id við vistun („Vista í úttekt").
 */
export function anUttektarTengingar<T extends BoardObject>(o: T): T {
  const s = o as BoardObject;
  if (s.type !== "symbol" || s.uttektUnitId == null || s.uttektUnitId === "") return o;
  const stimpill = s.uttektKind === "sign" || String(s.uttektUnitId).startsWith("s:");
  const copy: SymbolObject = { ...s };
  delete copy.uttektUnitId;
  if (stimpill) {
    if (!copy.uttektSign) copy.uttektSign = String(s.uttektUnitId).split(":")[1] || undefined;
    copy.uttektKind = "sign";
  } else {
    delete copy.uttektKind;
    delete copy.uttektSign;
    copy.label = "";
  }
  return copy as BoardObject as T;
}

/**
 * Fresh copies: new ids (groups re-keyed together so a pasted group stays a
 * group), shifted by `offset`, never locked — a pasted thing is there to be
 * moved.
 */
export function cloneForPaste(
  objects: BoardObject[],
  offset: { x: number; y: number }
): BoardObject[] {
  const groupMap = new Map<string, string>();
  return objects.map((o) => {
    const copy: BoardObject = {
      ...anUttektarTengingar(structuredClone(o)),
      id: newId(),
      x: o.x + offset.x,
      y: o.y + offset.y,
      locked: false,
    };
    if (copy.groupId) {
      if (!groupMap.has(copy.groupId)) groupMap.set(copy.groupId, newId());
      copy.groupId = groupMap.get(copy.groupId);
    }
    return copy;
  });
}
