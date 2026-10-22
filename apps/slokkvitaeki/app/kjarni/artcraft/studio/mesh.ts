/** Bring-your-own 3D mesh. The studio does not reconstruct a photoreal body from photos. */

export const MESH_ACCEPT = ".glb,.gltf,model/gltf-binary,model/gltf+json";
export const MESH_SPIN_FRAMES = 12;

export function isMeshFile(file: File | undefined): boolean {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return name.endsWith(".glb") || name.endsWith(".gltf") || file.type.includes("gltf");
}

export function spinYaws(count = MESH_SPIN_FRAMES): number[] {
  const n = Math.min(24, Math.max(6, Math.round(count)));
  return Array.from({ length: n }, (_, i) => Math.round((i / n) * 360) % 360);
}

export const IMPRINT_YAW = 50;

export const STANDIN_NAME = "Innbyggður líkami";

export function yawGap(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
}

export function shouldStampPhoto(slotDeg: number, photoDeg: number): boolean {
  return yawGap(slotDeg, photoDeg) <= IMPRINT_YAW;
}

/** Tools that already export GLB/GLTF the studio can load. */
export const MESH_IMPORT = ["Sketchfab", "Blendkit", "Meshy", "Tripo", "Ready Player Me", "Modly"] as const;

/** Research/desktop pipelines. They do not run in the studio; export a GLB and import it. */
export const MESH_EXPORT_ONLY = ["IDOL", "Duix-Avatar", "SimAvatar", "StableGen", "SMPL-X"] as const;

export type CaptureYaws = (yaws: number[]) => Promise<Partial<Record<number, string>>>;

export function meshHint(hasMesh: boolean, name = ""): string {
  if (hasMesh) {
    return name
      ? `Möskvi: ${name}. Taktu mynd, snúðu í videó, eða fylltu vantar horn með þessum líkama.`
      : "Möskvi tilbúinn.";
  }
  return "Innbyggður 3D-líkami fyllir vantar horn. Myndirnar þínar málast á nálæg sjónarhorn; bak og hliðar koma af grunninum. GLB frá Sketchfab, Blendkit, Meshy, Tripo, Ready Player Me eða Modly kemur í staðinn. IDOL, Duix, SimAvatar, StableGen og SMPL-X búa til möskva í öðru forriti; flytja þarf GLB hingað.";
}
