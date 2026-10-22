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

export type MeshGuideKind = "studio" | "web" | "download" | "desktop" | "later";

export type MeshGuide = {
  id: string;
  label: string;
  kind: MeshGuideKind;
  href: string;
  why: string;
  steps: string[];
};

/** Click-by-click guides shown in the studio. Studio first, then web tools, then optional later. */
export const MESH_GUIDES: MeshGuide[] = [
  {
    id: "studio",
    label: "Ekkert extra forrit",
    kind: "studio",
    href: "",
    why: "Innbyggði 3D-líkaminn dugar. Þú þarft ekki Meshy né Sketchfab til að fylla hringinn.",
    steps: [
      "Settu 1–2 myndir á Framan og Hægri ¾ í hringnum hér fyrir ofan.",
      "Ýttu á Fylla vantar horn með 3D.",
      "Bak og hliðar koma af 3D-grunninum. Myndirnar þínar málast á nálæg horn.",
    ],
  },
  {
    id: "meshy",
    label: "Meshy — ljósmynd í 3D í vafranum",
    kind: "web",
    href: "https://www.meshy.ai/features/image-to-3d",
    why: "Einfaldast ef þú vilt raunverulegri líkama en leirmannequin. Reikningur, stundum greitt.",
    steps: [
      "Opnaðu Meshy, skráðu þig, veldu Image to 3D.",
      "Settu inn framanmynd (PNG eða JPG). Veldu A-Pose / Pose ef það er í boði.",
      "Ýttu á Generate, bíddu, svo Download og veldu GLB (ekki FBX).",
      "Hér: Setja inn GLB, svo Fylla vantar horn með 3D.",
    ],
  },
  {
    id: "tripo",
    label: "Tripo — ljósmynd í 3D í vafranum",
    kind: "web",
    href: "https://www.tripo3d.ai/features/image-to-3d-model",
    why: "Sama leið og Meshy, önnur síða. Veldu þetta ef Meshy er upptekið eða þú átt þegar reikning.",
    steps: [
      "Opnaðu Tripo, skráðu þig, dragðu framanmynd inn.",
      "Ýttu á Generate. Bíddu þar til líkanið birtist.",
      "Export / Download og veldu GLB.",
      "Hér: Setja inn GLB, svo Fylla vantar horn með 3D.",
    ],
  },
  {
    id: "sketchfab",
    label: "Sketchfab — sækja tilbúinn líkama",
    kind: "download",
    href: "https://sketchfab.com/3d-models?features=downloadable&q=realistic+adult+woman&sort_by=-likeCount",
    why: "Tilbúinn 3D-manneskja, ekki úr þínum myndum. Passaðu að sækja GLB og að leyfið leyfi notkun.",
    steps: [
      "Opnaðu leitina. Downloadable á að vera kveikt.",
      "Veldu fullorðna manneskju. Download, veldu glTF eða GLB (ekki FBX).",
      "Hér: Setja inn GLB, svo Fylla vantar horn með 3D.",
    ],
  },
  {
    id: "modly",
    label: "Modly — forrit í tölvunni",
    kind: "desktop",
    href: "https://modly3d.app",
    why: "Myndin fer ekki á netið. Þarf skjákort og uppsetningu. Ekki fyrsta skrefið.",
    steps: [
      "Sæktu Modly frá síðunni (Windows, Linux eða Apple Silicon).",
      "Settu inn framanmynd, keyrðu Image → Generate Mesh.",
      "Exportaðu GLB.",
      "Hér: Setja inn GLB, svo Fylla vantar horn með 3D.",
    ],
  },
  {
    id: "duix",
    label: "Duix-Avatar",
    kind: "later",
    href: "https://github.com/duixcom/Duix.Avatar",
    why: "Tal og klónun. Ekki til að fylla hringinn.",
    steps: [],
  },
  {
    id: "smplx",
    label: "SMPL-X",
    kind: "later",
    href: "https://smpl-x.is.tue.mpg.de/",
    why: "Líkamsform úr mælingum. Akademískt, ekki byrja hér.",
    steps: [],
  },
];

export const MESH_IMPORT = MESH_GUIDES.filter((g) => g.kind === "web" || g.kind === "download" || g.kind === "desktop").map(
  (g) => g.label.split(" — ")[0],
) as readonly string[];

export const MESH_EXPORT_ONLY = MESH_GUIDES.filter((g) => g.kind === "later").map((g) => g.label);

export function meshGuides(kind?: MeshGuideKind): MeshGuide[] {
  return kind ? MESH_GUIDES.filter((g) => g.kind === kind) : MESH_GUIDES;
}

export type CaptureYaws = (yaws: number[]) => Promise<Partial<Record<number, string>>>;

export function meshHint(hasMesh: boolean, name = ""): string {
  if (hasMesh) {
    return name
      ? `Möskvi: ${name}. Taktu mynd, snúðu í videó, eða fylltu vantar horn með þessum líkama.`
      : "Möskvi tilbúinn.";
  }
  return "Innbyggður 3D-líkami fyllir vantar horn. Myndirnar þínar málast á nálæg sjónarhorn. Leiðbeiningar og hlekkir eru hér fyrir neðan — þú þarft ekkert extra forrit til að byrja.";
}
