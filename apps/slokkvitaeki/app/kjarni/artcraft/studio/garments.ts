/** Delete a garment, then add a new one. In-place "change pants to shorts" rewrites the whole person. */

export type GarmentSlot = "top" | "sleeves" | "pants" | "shoes";

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
      "add fitted adult shorts on the hips and thighs only, bare lower legs, keep shoes if present, same adult person, keep face body and pose, photorealistic, no extra people",
  },
  {
    id: "skinny",
    slot: "pants",
    label: "Þröngar buxur",
    maskId: "pants",
    prompt:
      "add tight slim-fit long trousers, same adult person, keep face pose and shoes, photorealistic, no extra people",
  },
  {
    id: "longPants",
    slot: "pants",
    label: "Langar buxur",
    maskId: "pants",
    prompt:
      "add long straight trousers, same adult person, keep face pose and shoes, photorealistic, no extra people",
  },
  {
    id: "shortSleeve",
    slot: "sleeves",
    label: "Stutterma",
    maskId: "shortSleeveZone",
    prompt:
      "add short sleeves on the shoulders, bare lower arms, keep the same torso, same adult person, keep face and pose, photorealistic, no extra people",
  },
  {
    id: "sleeveless",
    slot: "sleeves",
    label: "Ermalaus",
    maskId: "sleeves",
    prompt:
      "sleeveless top, bare adult arms, keep the same torso, same adult person, keep face and pose, photorealistic, no extra people",
  },
  {
    id: "longSleeve",
    slot: "sleeves",
    label: "Síðerma",
    maskId: "sleeves",
    prompt:
      "add long sleeves on the arms, keep the same torso, same adult person, keep face and pose, photorealistic, no extra people",
  },
  {
    id: "tee",
    slot: "top",
    label: "Stutterma bolur",
    maskId: "top",
    prompt:
      "add a short-sleeve t-shirt on the torso, same adult person, keep face pose and lower body, photorealistic, no extra people",
  },
  {
    id: "longTee",
    slot: "top",
    label: "Síðerma bolur",
    maskId: "top",
    prompt:
      "add a long-sleeve top on the torso, same adult person, keep face pose and lower body, photorealistic, no extra people",
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
  if (slot === "pants") {
    return "remove the trousers, bare adult legs from hip to ankle, keep shoes if present, same adult person, keep face body and pose, photorealistic, no extra people";
  }
  if (slot === "sleeves") {
    return "remove the sleeves, bare adult arms, keep the same torso clothing, same adult person, keep face and pose, photorealistic, no extra people";
  }
  if (slot === "top") {
    return "remove this top, keep lower-body clothes, same adult person, keep face and pose, photorealistic, no extra people";
  }
  return "remove the shoes, keep the same adult person and pose, photorealistic, no extra people";
}

export function addMaskId(add: GarmentAdd, fallback: string): string {
  return add.maskId || fallback;
}
