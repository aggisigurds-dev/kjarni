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

export function meshHint(hasMesh: boolean, name = ""): string {
  if (hasMesh) return name ? `Möskvi: ${name}. Taktu mynd eða snúðu í videó.` : "Möskvi tilbúinn.";
  return "Stúdíóið býr ekki til photoreal 3D-möskva úr ljósmyndum. Settu inn GLB/GLTF (Meshy, Tripo, Ready Player Me) — þá er hægt að snúa, taka still og sauma hringvideó.";
}
