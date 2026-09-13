/**
 * Which parts are picked on the bench: one primary part — the one the inspector
 * shows and single-part tools act on — plus any marked alongside it.
 *
 * Pure, so the click rules can be tested without a canvas.
 */

export interface PartSelection {
  selectedId: string | null;
  marked: ReadonlySet<string>;
}

export interface NextSelection {
  selectedId: string | null;
  marked: Set<string>;
}

/** Whether this part is picked, as the primary or marked alongside it. */
export function isPicked(current: PartSelection, id: string): boolean {
  return current.selectedId === id || current.marked.has(id);
}

/** Make this part the primary one, picking it if it was not, and keep the rest. */
export function makePrimary(current: PartSelection, id: string): NextSelection {
  const marked = new Set(current.marked);
  if (current.selectedId) marked.add(current.selectedId);
  marked.delete(id);
  return { selectedId: id, marked };
}

/**
 * A click on a part, or on nothing.
 *
 * A plain click on a part that is not picked starts the selection over, and a
 * plain click on nothing clears it. A plain click on a part that is already
 * picked only makes it the primary one, so a stray click — or the first half of
 * a double-click — never throws a selection of several parts away.
 *
 * An additive click (Ctrl, ⌘, Shift, or sticky selection) adds the part, or
 * takes it away again if it was picked, the primary included.
 */
export function clickSelection(
  current: PartSelection,
  id: string | null,
  additive: boolean
): NextSelection {
  if (id === null) {
    return additive
      ? { selectedId: current.selectedId, marked: new Set(current.marked) }
      : { selectedId: null, marked: new Set() };
  }
  if (!additive) {
    return isPicked(current, id) ? makePrimary(current, id) : { selectedId: id, marked: new Set() };
  }
  if (id === current.selectedId) {
    const rest = [...current.marked].filter((other) => other !== id);
    const next = rest.pop() ?? null;
    return { selectedId: next, marked: new Set(rest) };
  }
  if (current.marked.has(id)) {
    const marked = new Set(current.marked);
    marked.delete(id);
    return { selectedId: current.selectedId, marked };
  }
  return makePrimary(current, id);
}

/** Every one of these parts, keeping the primary if it is among them. */
export function selectAll(ids: readonly string[], current: PartSelection): NextSelection {
  const primary =
    current.selectedId && ids.includes(current.selectedId) ? current.selectedId : (ids[0] ?? null);
  return { selectedId: primary, marked: new Set(ids.filter((id) => id !== primary)) };
}

/** The parts among these that were not picked, and none of those that were. */
export function invertSelection(ids: readonly string[], current: PartSelection): NextSelection {
  const chosen = ids.filter((id) => !isPicked(current, id));
  return { selectedId: chosen[0] ?? null, marked: new Set(chosen.slice(1)) };
}

/** Every picked part, primary first. */
export function pickedIds(current: PartSelection): string[] {
  const marked = [...current.marked].filter((id) => id !== current.selectedId);
  return current.selectedId ? [current.selectedId, ...marked] : marked;
}
