/** Camera, expression and wardrobe chips that stack onto the studio prompt. */

export type LookGroup = "camera" | "face" | "wardrobe";

export type LookChip = {
  id: string;
  group: LookGroup;
  label: string;
  prompt: string;
};

export const LOOK_GROUPS: Array<{ id: LookGroup; label: string }> = [
  { id: "camera", label: "Myndavél" },
  { id: "face", label: "Svipbrigði" },
  { id: "wardrobe", label: "Fatnaður" },
];

export const LOOK_CHIPS: LookChip[] = [
  { id: "close", group: "camera", label: "Nálægt", prompt: "tight head-and-shoulders close-up, sharp eyes" },
  { id: "cowboy", group: "camera", label: "Cowboy", prompt: "cowboy shot from mid-thigh up" },
  { id: "full", group: "camera", label: "Heill líkami", prompt: "full body studio shot, head to toe" },
  { id: "low", group: "camera", label: "Lágt horn", prompt: "low camera angle, heroic stance" },
  { id: "high", group: "camera", label: "Hátt horn", prompt: "slight high angle, looking down a little" },
  { id: "smile", group: "face", label: "Bros", prompt: "gentle natural smile, same face identity" },
  { id: "serious", group: "face", label: "Alvara", prompt: "serious calm expression, same face identity" },
  { id: "laugh", group: "face", label: "Hlátur", prompt: "soft laugh, same face identity" },
  { id: "sideeye", group: "face", label: "Hliðaraugnaráð", prompt: "looking off camera, same face identity" },
  { id: "keep", group: "wardrobe", label: "Sömu föt", prompt: "same clothes as the reference photo" },
  { id: "suit", group: "wardrobe", label: "Svart jakkaföt", prompt: "black tailored suit, same adult person, keep face" },
  { id: "shirt", group: "wardrobe", label: "Hvít skyrta", prompt: "white shirt and simple trousers, same adult person, keep face" },
  { id: "leather", group: "wardrobe", label: "Leðurjakki", prompt: "black leather jacket, same adult person, keep face" },
  { id: "dress", group: "wardrobe", label: "Rauður kjól", prompt: "red dress, same adult person, keep face and pose" },
];

export const LOOKBOOK_SHOTS = [
  { id: "close", label: "Nálægt", prompt: "tight portrait close-up, sharp in-focus face" },
  { id: "threeq", label: "¾", prompt: "three-quarter view, same adult person, same clothes" },
  { id: "full", label: "Heill líkami", prompt: "full body studio photograph, head to toe, same clothes" },
  { id: "side", label: "Hlið", prompt: "side profile, same adult person, same clothes, keep face identity" },
] as const;

export const LOOKBOOK_DENOISING = 0.42;

export function lookChip(id: string): LookChip | undefined {
  return LOOK_CHIPS.find((c) => c.id === id);
}

export function toggleLook(selected: string[], id: string): string[] {
  const chip = lookChip(id);
  if (!chip) return selected;
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  const withoutGroup = selected.filter((x) => lookChip(x)?.group !== chip.group);
  return [...withoutGroup, id];
}

export function looksLine(selected: string[]): string {
  return selected
    .map((id) => lookChip(id)?.prompt)
    .filter((x): x is string => Boolean(x))
    .join(", ");
}

export function mergeLooks(user: string, selected: string[]): string {
  const looks = looksLine(selected);
  const base = user.trim();
  if (!looks) return base;
  if (!base) return looks;
  if (base.includes(looks)) return base;
  return `${base}, ${looks}`;
}

export function lookbookPrompt(shotId: string, who = ""): string {
  const shot = LOOKBOOK_SHOTS.find((s) => s.id === shotId) || LOOKBOOK_SHOTS[0];
  const person = who.trim() ? `same adult person ${who.trim()}` : "the same adult person";
  return `lookbook still of ${person}, ${shot.prompt}, keep face identity, studio photograph, sharp focus`;
}

export const MAX_QUEUE = 4;

export function pushQueue(queue: string[], id: string): string[] {
  if (!id || queue.includes(id) || queue.length >= MAX_QUEUE) return queue.slice();
  return [...queue, id];
}

export function dropQueue(queue: string[], index: number): string[] {
  return queue.filter((_, i) => i !== index);
}

export function sequenceFrames(queueLen: number, frames: number): number {
  const n = Math.max(1, queueLen);
  return Math.max(4, Math.min(8, Math.round(frames / n)));
}
