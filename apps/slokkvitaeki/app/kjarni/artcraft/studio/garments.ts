/** Delete a garment, then add a new one. In-place "change pants to shorts" rewrites the whole person. */

export type GarmentSlot = "top" | "sleeves" | "pants" | "shoes";

/** Inpaint must reconstruct the body under the clothes, never punch a hole. */
export const GARMENT_FILL =
  "fill every masked pixel, reconstruct the body underneath, continue the anatomy, no hole, no gap, no transparency, no missing limbs, painted masked region only";

export const GARMENT_NEGATIVE =
  "hole, gap, empty cutout, missing legs, missing arms, missing limb, transparency, checkerboard, background showing through the body, amputated, cropped body, floating clothes, discontinuity";

export type GarmentAdd = {
  id: string;
  slot: GarmentSlot;
  label: string;
  maskId: string;
  prompt: string;
};

export const GARMENT_ADDS: GarmentAdd[] = [
  {
    id: "shorts",
    slot: "pants",
    label: "Stuttbuxur",
    maskId: "shortsZone",
    prompt:
      "add fitted adult shorts over the existing reconstructed legs, keep the lower legs fully visible and complete below the hem, do not erase the legs, no hole, same adult person, keep face body and pose, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "skinny",
    slot: "pants",
    label: "Þröngar buxur",
    maskId: "pants",
    prompt:
      "add tight slim-fit long trousers over the existing legs, keep the legs complete underneath, no hole, same adult person, keep face pose and shoes, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "longPants",
    slot: "pants",
    label: "Langar buxur",
    maskId: "pants",
    prompt:
      "add long straight trousers over the existing legs, keep the legs complete underneath, no hole, same adult person, keep face pose and shoes, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "shortSleeve",
    slot: "sleeves",
    label: "Stutterma",
    maskId: "shortSleeveZone",
    prompt:
      "add short sleeves over the existing reconstructed arms, keep the lower arms fully visible and complete, do not erase the arms, no hole, keep the same torso, same adult person, keep face and pose, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "sleeveless",
    slot: "sleeves",
    label: "Ermalaus",
    maskId: "sleeves",
    prompt:
      "sleeveless top over the existing reconstructed arms, keep the arms fully visible and complete, no hole, keep the same torso, same adult person, keep face and pose, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "longSleeve",
    slot: "sleeves",
    label: "Síðerma",
    maskId: "sleeves",
    prompt:
      "add long sleeves over the existing arms, keep the arms complete underneath, no hole, keep the same torso, same adult person, keep face and pose, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "tee",
    slot: "top",
    label: "Stutterma bolur",
    maskId: "top",
    prompt:
      "add a short-sleeve t-shirt over the existing torso, keep the body complete underneath, no hole, same adult person, keep face pose and lower body, photorealistic, no extra people, painted masked region only",
  },
  {
    id: "longTee",
    slot: "top",
    label: "Síðerma bolur",
    maskId: "top",
    prompt:
      "add a long-sleeve top over the existing torso, keep the body complete underneath, no hole, same adult person, keep face pose and lower body, photorealistic, no extra people, painted masked region only",
  },
];

export function slotOfRegion(id: string, kind?: string): GarmentSlot | null {
  if (id === "top") return "top";
  if (id === "sleeves" || id === "shortSleeveZone") return "sleeves";
  if (id === "pants" || id === "shortsZone") return "pants";
  if (id === "shoes") return "shoes";
  if (kind === "clothes") return "pants";
  return null;
}

export function isGarmentChip(id: string): boolean {
  return id === "top" || id === "sleeves" || id === "pants" || id === "shoes";
}

export function addsForSlot(slot: GarmentSlot | null): GarmentAdd[] {
  if (!slot) return [];
  return GARMENT_ADDS.filter((row) => row.slot === slot);
}

export function garmentRemovePrompt(slot: GarmentSlot): string {
  const under =
    slot === "pants"
      ? "take off the trousers and reconstruct the adult legs that were underneath, continue the hips into complete photorealistic legs down to the ankles, matching skin"
      : slot === "sleeves"
        ? "take off the sleeves and reconstruct the adult arms that were underneath, continue the shoulders into complete arms, matching skin, keep the torso clothes"
        : slot === "top"
          ? "take off this top and reconstruct the adult torso that was underneath, continue the body, matching skin, keep lower-body clothes"
          : "take off the shoes and reconstruct the adult feet that were underneath, continue the ankles into complete feet, matching skin";
  return `${under}, ${GARMENT_FILL}, same adult person, keep unmasked face and pose, photorealistic, no extra people`;
}

/** Second pass if the first fill still misses limb continuation. */
export function garmentContinuePrompt(slot: GarmentSlot): string {
  const limb =
    slot === "pants"
      ? "continue generating the adult legs, complete both legs from hip to ankle, matching skin and pose"
      : slot === "sleeves"
        ? "continue generating the adult arms, complete both arms, matching skin and pose"
        : slot === "top"
          ? "continue generating the adult torso, complete the body, matching skin"
          : "continue generating the adult feet, complete the anatomy, matching skin";
  return `${limb}, ${GARMENT_FILL}, same adult person, keep unmasked pixels, photorealistic, no extra people`;
}

export function addMaskId(add: GarmentAdd, fallback: string): string {
  return add.maskId || fallback;
}
