/** Neutral adult mannequin bases so identity is painted onto locked proportions. */

export const BASE_DENOISING = 0.42;

export type BodyKind = "woman" | "man" | "neutral";
export type BodyBuild = "slim" | "average" | "athletic" | "solid";

export type StudioBase = {
  id: string;
  label: string;
  kind: BodyKind;
  build: BodyBuild;
};

export const STUDIO_BASES: StudioBase[] = [
  { id: "w-slim", label: "Kona · grönn", kind: "woman", build: "slim" },
  { id: "w-avg", label: "Kona · meðal", kind: "woman", build: "average" },
  { id: "w-ath", label: "Kona · sterk", kind: "woman", build: "athletic" },
  { id: "m-avg", label: "Karl · meðal", kind: "man", build: "average" },
  { id: "m-ath", label: "Karl · sterkur", kind: "man", build: "athletic" },
  { id: "n-solid", label: "Hlutlaus · þétt", kind: "neutral", build: "solid" },
];

export function studioBase(id: string): StudioBase {
  return STUDIO_BASES.find((b) => b.id === id) || STUDIO_BASES[1];
}

export const LOOK_KEY = "kjarni_private_studio_look";

export type HairLength = "bald" | "short" | "medium" | "long";

export const SKIN_TONES = [
  { id: "fair", label: "Ljós", prompt: "fair light skin", mid: "#f3c9ad", light: "#fbe0cc", deep: "#c99678", joint: "#9a6a50" },
  { id: "warm", label: "Beige", prompt: "warm beige skin", mid: "#e2b89a", light: "#f0d0b6", deep: "#b07a5c", joint: "#8a5c44" },
  { id: "tan", label: "Brúnuð", prompt: "sun-tanned skin", mid: "#c99268", light: "#dcb088", deep: "#8d5c38", joint: "#6a4228" },
  { id: "olive", label: "Ólífa", prompt: "olive skin", mid: "#b8885c", light: "#c9a078", deep: "#7a5234", joint: "#5a3a24" },
  { id: "brown", label: "Brún", prompt: "brown skin", mid: "#8a5a38", light: "#a8744c", deep: "#5a3420", joint: "#3e2416" },
  { id: "deep", label: "Dökk", prompt: "deep dark skin", mid: "#4a2e20", light: "#6a4430", deep: "#2a1810", joint: "#1a100c" },
] as const;

export const HAIR_COLORS = [
  { id: "black", label: "Svart", prompt: "black hair", hex: "#1a1410" },
  { id: "brown", label: "Brúnt", prompt: "brown hair", hex: "#4a2e18" },
  { id: "blonde", label: "Blond", prompt: "blonde hair", hex: "#d4b06a" },
  { id: "red", label: "Rautt", prompt: "red hair", hex: "#a04424" },
  { id: "gray", label: "Grátt", prompt: "gray hair", hex: "#8a8680" },
  { id: "white", label: "Hvítt", prompt: "white hair", hex: "#e8e4dc" },
] as const;

export const HAIR_LENGTHS: Array<{ id: HairLength; label: string; prompt: string }> = [
  { id: "bald", label: "Sköllótt", prompt: "bald head" },
  { id: "short", label: "Stutt", prompt: "short hair" },
  { id: "medium", label: "Miðlungs", prompt: "medium-length hair" },
  { id: "long", label: "Sítt", prompt: "long hair" },
];

export const BUILD_CHIPS: Array<{ id: BodyBuild; label: string; prompt: string }> = [
  { id: "slim", label: "Slim", prompt: "slim lean build" },
  { id: "average", label: "Meðal", prompt: "average build" },
  { id: "athletic", label: "Athletic", prompt: "athletic muscular build" },
  { id: "solid", label: "Þétt", prompt: "solid heavier build" },
];

export type SkinId = (typeof SKIN_TONES)[number]["id"];
export type HairId = (typeof HAIR_COLORS)[number]["id"];

export type BodyLook = {
  heightCm: number;
  weightKg: number;
  build: BodyBuild;
  skin: SkinId;
  hair: HairId;
  hairLength: HairLength;
};

export const DEFAULT_LOOK: BodyLook = {
  heightCm: 170,
  weightKg: 68,
  build: "average",
  skin: "warm",
  hair: "brown",
  hairLength: "medium",
};

export function clampHeight(cm: number): number {
  return Math.round(Math.min(200, Math.max(150, cm)));
}

export function clampWeight(kg: number): number {
  return Math.round(Math.min(130, Math.max(45, kg)));
}

export function skinOfId(id: string): (typeof SKIN_TONES)[number] {
  return SKIN_TONES.find((s) => s.id === id) || SKIN_TONES[1];
}

export function hairOfId(id: string): (typeof HAIR_COLORS)[number] {
  return HAIR_COLORS.find((h) => h.id === id) || HAIR_COLORS[1];
}

export function lengthOf(id: string): (typeof HAIR_LENGTHS)[number] {
  return HAIR_LENGTHS.find((h) => h.id === id) || HAIR_LENGTHS[2];
}

export function parseLook(raw: unknown): BodyLook {
  const row = raw && typeof raw === "object" ? (raw as Partial<BodyLook>) : {};
  return {
    heightCm: clampHeight(Number(row.heightCm) || DEFAULT_LOOK.heightCm),
    weightKg: clampWeight(Number(row.weightKg) || DEFAULT_LOOK.weightKg),
    build: BUILD_CHIPS.some((b) => b.id === row.build) ? (row.build as BodyBuild) : DEFAULT_LOOK.build,
    skin: SKIN_TONES.some((s) => s.id === row.skin) ? (row.skin as SkinId) : DEFAULT_LOOK.skin,
    hair: HAIR_COLORS.some((h) => h.id === row.hair) ? (row.hair as HairId) : DEFAULT_LOOK.hair,
    hairLength: HAIR_LENGTHS.some((h) => h.id === row.hairLength)
      ? (row.hairLength as HairLength)
      : DEFAULT_LOOK.hairLength,
  };
}

export function readStoredLook(): BodyLook {
  if (typeof window === "undefined") return DEFAULT_LOOK;
  try {
    return parseLook(JSON.parse(window.localStorage.getItem(LOOK_KEY) || "null"));
  } catch {
    return DEFAULT_LOOK;
  }
}

export function lookLine(look: BodyLook): string {
  const skin = skinOfId(look.skin);
  const hair = hairOfId(look.hair);
  const length = lengthOf(look.hairLength);
  const build = BUILD_CHIPS.find((b) => b.id === look.build) || BUILD_CHIPS[1];
  return `${look.heightCm} cm, ${look.weightKg} kg, ${build.prompt}, ${skin.prompt}, ${length.prompt}, ${hair.prompt}`;
}

type Figure = {
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  arm: number;
  thigh: number;
  calf: number;
  inseam: number;
};

export function figureOf(kind: BodyKind, build: BodyBuild): Figure {
  const builds: Record<BodyBuild, Figure> = {
    slim: { shoulder: 108, chest: 86, waist: 64, hip: 90, arm: 16, thigh: 28, calf: 16, inseam: 428 },
    average: { shoulder: 128, chest: 104, waist: 78, hip: 106, arm: 20, thigh: 34, calf: 19, inseam: 412 },
    athletic: { shoulder: 154, chest: 122, waist: 86, hip: 104, arm: 24, thigh: 38, calf: 22, inseam: 400 },
    solid: { shoulder: 148, chest: 128, waist: 108, hip: 132, arm: 26, thigh: 44, calf: 24, inseam: 384 },
  };
  const fig = { ...builds[build] };
  if (kind === "woman") {
    fig.shoulder -= 6;
    fig.chest -= 4;
    fig.waist -= 8;
    fig.hip += 14;
    fig.thigh += 2;
  }
  if (kind === "man") {
    fig.shoulder += 12;
    fig.chest += 10;
    fig.waist += 4;
    fig.hip -= 4;
    fig.arm += 2;
    fig.thigh += 2;
  }
  return fig;
}

export function figureFor(base: StudioBase, look: BodyLook = DEFAULT_LOOK): Figure {
  const fig = figureOf(base.kind, look.build || base.build);
  const height = clampHeight(look.heightCm);
  const weight = clampWeight(look.weightKg);
  const tall = height / 170;
  const bmi = weight / ((height / 100) * (height / 100));
  const mass = Math.min(1.42, Math.max(0.74, bmi / 22));
  return {
    shoulder: fig.shoulder * (0.94 + mass * 0.08),
    chest: fig.chest * mass,
    waist: fig.waist * mass,
    hip: fig.hip * mass,
    arm: fig.arm * mass,
    thigh: fig.thigh * mass,
    calf: fig.calf * mass,
    inseam: fig.inseam * tall,
  };
}

export function adaptBasePrompt(name: string, base: StudioBase, look: BodyLook = DEFAULT_LOOK): string {
  const who = name.trim() || "the same adult person";
  const sex =
    base.kind === "woman" ? "adult woman" : base.kind === "man" ? "adult man" : "adult person";
  return `photorealistic ${sex} ${who}, ${lookLine(look)}, matching this realistic mannequin base, keep the same body volume, proportions, limb length and A-pose joints, same identity as the face references, studio lighting, sharp focus, single person, no extra limbs`;
}

export function mergeBase(user: string, name: string, base: StudioBase, look: BodyLook = DEFAULT_LOOK): string {
  const line = adaptBasePrompt(name, base, look);
  const text = user.trim();
  if (!text) return line;
  if (text.includes("matching this realistic mannequin base")) return text;
  return `${text}, ${line}`;
}

function n(value: number): string {
  return value.toFixed(1);
}

/** Tapered limb with volume — store-mannequin, not a stick. */
function capsule(x1: number, y1: number, x2: number, y2: number, r1: number, r2: number, fill: string): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a1x = x1 + nx * r1;
  const a1y = y1 + ny * r1;
  const a2x = x1 - nx * r1;
  const a2y = y1 - ny * r1;
  const b1x = x2 + nx * r2;
  const b1y = y2 + ny * r2;
  const b2x = x2 - nx * r2;
  const b2y = y2 - ny * r2;
  return `<path fill="${fill}" d="M ${n(a1x)} ${n(a1y)} L ${n(b1x)} ${n(b1y)} A ${n(r2)} ${n(r2)} 0 0 1 ${n(b2x)} ${n(b2y)} L ${n(a2x)} ${n(a2y)} A ${n(r1)} ${n(r1)} 0 0 1 ${n(a1x)} ${n(a1y)} Z" />`;
}

function joint(x: number, y: number, fill: string): string {
  return `<circle cx="${n(x)}" cy="${n(y)}" r="3.2" fill="${fill}" opacity="0.32" />`;
}

function hairLayer(look: BodyLook, cx: number, headY: number): string {
  if (look.hairLength === "bald") return "";
  const fill = hairOfId(look.hair).hex;
  const top = `<ellipse class="ac-hair" cx="${cx}" cy="${n(headY - 24)}" rx="38" ry="24" fill="${fill}" />`;
  if (look.hairLength === "short") {
    return `${top}<path class="ac-hair" fill="${fill}" d="M ${n(cx - 38)} ${n(headY - 10)} Q ${n(cx - 44)} ${n(headY + 16)} ${n(cx - 22)} ${n(headY + 10)} L ${n(cx - 18)} ${n(headY - 8)} Z" /><path class="ac-hair" fill="${fill}" d="M ${n(cx + 38)} ${n(headY - 10)} Q ${n(cx + 44)} ${n(headY + 16)} ${n(cx + 22)} ${n(headY + 10)} L ${n(cx + 18)} ${n(headY - 8)} Z" />`;
  }
  if (look.hairLength === "medium") {
    return `${top}<path class="ac-hair" fill="${fill}" d="M ${n(cx - 40)} ${n(headY - 8)} Q ${n(cx - 52)} ${n(headY + 36)} ${n(cx - 28)} ${n(headY + 52)} Q ${n(cx - 18)} ${n(headY + 20)} ${n(cx - 16)} ${n(headY - 4)} Z" /><path class="ac-hair" fill="${fill}" d="M ${n(cx + 40)} ${n(headY - 8)} Q ${n(cx + 52)} ${n(headY + 36)} ${n(cx + 28)} ${n(headY + 52)} Q ${n(cx + 18)} ${n(headY + 20)} ${n(cx + 16)} ${n(headY - 4)} Z" />`;
  }
  return `${top}<path class="ac-hair" fill="${fill}" d="M ${n(cx - 40)} ${n(headY - 6)} Q ${n(cx - 58)} ${n(headY + 70)} ${n(cx - 34)} ${n(headY + 128)} Q ${n(cx - 16)} ${n(headY + 40)} ${n(cx - 14)} ${n(headY - 2)} Z" /><path class="ac-hair" fill="${fill}" d="M ${n(cx + 40)} ${n(headY - 6)} Q ${n(cx + 58)} ${n(headY + 70)} ${n(cx + 34)} ${n(headY + 128)} Q ${n(cx + 16)} ${n(headY + 40)} ${n(cx + 14)} ${n(headY - 2)} Z" /><path class="ac-hair" fill="${fill}" d="M ${n(cx - 20)} ${n(headY + 20)} Q ${n(cx)} ${n(headY + 150)} ${n(cx + 20)} ${n(headY + 20)} Z" />`;
}

function torsoPath(
  cx: number,
  shoulderY: number,
  hipY: number,
  fig: Figure,
  fill: string,
): string {
  const neck = 18;
  const chestY = shoulderY + 72;
  const waistY = shoulderY + 158;
  const crotchY = hipY + 38;
  const sl = cx - fig.shoulder / 2;
  const sr = cx + fig.shoulder / 2;
  const cl = cx - fig.chest / 2;
  const cr = cx + fig.chest / 2;
  const wl = cx - fig.waist / 2;
  const wr = cx + fig.waist / 2;
  const hl = cx - fig.hip / 2;
  const hr = cx + fig.hip / 2;
  return `<path fill="${fill}" d="M ${n(cx - neck)} ${n(shoulderY - 10)}
    C ${n(sl + 8)} ${n(shoulderY - 6)} ${n(sl)} ${n(shoulderY + 8)} ${n(sl)} ${n(shoulderY + 18)}
    C ${n(cl)} ${n(chestY)} ${n(cl + 2)} ${n(waistY - 20)} ${n(wl)} ${n(waistY)}
    C ${n(hl + 4)} ${n(hipY - 10)} ${n(hl)} ${n(hipY + 8)} ${n(hl + 10)} ${n(hipY + 22)}
    Q ${n(cx - 10)} ${n(crotchY)} ${n(cx)} ${n(crotchY)}
    Q ${n(cx + 10)} ${n(crotchY)} ${n(hr - 10)} ${n(hipY + 22)}
    C ${n(hr)} ${n(hipY + 8)} ${n(hr - 4)} ${n(hipY - 10)} ${n(wr)} ${n(waistY)}
    C ${n(cr - 2)} ${n(waistY - 20)} ${n(cr)} ${n(chestY)} ${n(sr)} ${n(shoulderY + 18)}
    C ${n(sr)} ${n(shoulderY + 8)} ${n(sr - 8)} ${n(shoulderY - 6)} ${n(cx + neck)} ${n(shoulderY - 10)}
    Q ${n(cx)} ${n(shoulderY - 16)} ${n(cx - neck)} ${n(shoulderY - 10)} Z" />`;
}

/** Adult store mannequin with body volume. SVG so tests and the UI share one drawing. */
export function mannequinSvg(base: StudioBase, look: BodyLook = DEFAULT_LOOK): string {
  const fig = figureFor(base, look);
  const skin = skinOfId(look.skin);
  const gid = `skin-${base.id}-${look.skin}`;
  const tall = clampHeight(look.heightCm) / 170;
  const cx = 256;
  const headY = 86;
  const neckY = 136;
  const shoulderY = 172;
  const hipY = 398 + (tall - 1) * 36;
  const kneeY = hipY + fig.inseam * 0.48;
  const ankleY = hipY + fig.inseam;
  const lShoulderX = cx - fig.shoulder / 2;
  const rShoulderX = cx + fig.shoulder / 2;
  const lElbowX = lShoulderX - 58;
  const rElbowX = rShoulderX + 58;
  const elbowY = shoulderY + 128;
  const lWristX = lElbowX - 42;
  const rWristX = rElbowX + 42;
  const wristY = elbowY + 122;
  const lHipX = cx - fig.hip * 0.28;
  const rHipX = cx + fig.hip * 0.28;
  const lKneeX = cx - 30;
  const rKneeX = cx + 30;
  const lAnkleX = cx - 24;
  const rAnkleX = cx + 24;
  const chestY = shoulderY + 78;
  const parts = [
    `<defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${skin.light}" />
        <stop offset="0.45" stop-color="${skin.mid}" />
        <stop offset="1" stop-color="${skin.deep}" />
      </linearGradient>
      <radialGradient id="${gid}-head" cx="38%" cy="32%" r="70%">
        <stop offset="0" stop-color="${skin.light}" />
        <stop offset="1" stop-color="${skin.mid}" />
      </radialGradient>
    </defs>`,
    `<rect width="512" height="1024" fill="#141414" />`,
    `<ellipse cx="256" cy="980" rx="92" ry="10" fill="#0c0c0c" />`,
    capsule(lHipX, hipY + 8, lKneeX, kneeY, fig.thigh, fig.thigh * 0.78, `url(#${gid})`),
    capsule(rHipX, hipY + 8, rKneeX, kneeY, fig.thigh, fig.thigh * 0.78, `url(#${gid})`),
    capsule(lKneeX, kneeY, lAnkleX, ankleY, fig.calf + 2, fig.calf * 0.72, `url(#${gid})`),
    capsule(rKneeX, kneeY, rAnkleX, ankleY, fig.calf + 2, fig.calf * 0.72, `url(#${gid})`),
    `<ellipse cx="${n(lAnkleX + 10)}" cy="${n(ankleY + 16)}" rx="22" ry="10" fill="url(#${gid})" />`,
    `<ellipse cx="${n(rAnkleX - 10)}" cy="${n(ankleY + 16)}" rx="22" ry="10" fill="url(#${gid})" />`,
    torsoPath(cx, shoulderY, hipY, fig, `url(#${gid})`),
    `<rect x="${n(cx - 16)}" y="${n(neckY)}" width="32" height="${n(shoulderY - neckY + 6)}" rx="10" fill="url(#${gid})" />`,
    `<ellipse cx="${cx}" cy="${headY}" rx="40" ry="48" fill="url(#${gid}-head)" />`,
    `<ellipse cx="${n(cx - 38)}" cy="${n(headY + 6)}" rx="7" ry="11" fill="url(#${gid})" />`,
    `<ellipse cx="${n(cx + 38)}" cy="${n(headY + 6)}" rx="7" ry="11" fill="url(#${gid})" />`,
    `<ellipse cx="${n(cx - 14)}" cy="${n(headY - 2)}" rx="7" ry="4" fill="${skin.deep}" opacity="0.28" />`,
    `<ellipse cx="${n(cx + 14)}" cy="${n(headY - 2)}" rx="7" ry="4" fill="${skin.deep}" opacity="0.28" />`,
    `<ellipse cx="${cx}" cy="${n(headY + 14)}" rx="5" ry="8" fill="${skin.deep}" opacity="0.18" />`,
    hairLayer(look, cx, headY),
    capsule(lShoulderX, shoulderY + 10, lElbowX, elbowY, fig.arm + 4, fig.arm, `url(#${gid})`),
    capsule(rShoulderX, shoulderY + 10, rElbowX, elbowY, fig.arm + 4, fig.arm, `url(#${gid})`),
    capsule(lElbowX, elbowY, lWristX, wristY, fig.arm * 0.92, fig.arm * 0.7, `url(#${gid})`),
    capsule(rElbowX, elbowY, rWristX, wristY, fig.arm * 0.92, fig.arm * 0.7, `url(#${gid})`),
    `<ellipse cx="${n(lWristX - 4)}" cy="${n(wristY + 10)}" rx="12" ry="15" fill="url(#${gid})" />`,
    `<ellipse cx="${n(rWristX + 4)}" cy="${n(wristY + 10)}" rx="12" ry="15" fill="url(#${gid})" />`,
  ];
  if (base.kind === "woman") {
    parts.push(
      `<ellipse cx="${n(cx - fig.chest * 0.18)}" cy="${n(chestY)}" rx="${n(fig.chest * 0.2)}" ry="18" fill="${skin.light}" opacity="0.45" />`,
      `<ellipse cx="${n(cx + fig.chest * 0.18)}" cy="${n(chestY)}" rx="${n(fig.chest * 0.2)}" ry="18" fill="${skin.light}" opacity="0.45" />`,
    );
  } else {
    parts.push(
      `<ellipse cx="${n(cx - fig.chest * 0.16)}" cy="${n(chestY - 4)}" rx="${n(fig.chest * 0.16)}" ry="14" fill="${skin.deep}" opacity="0.16" />`,
      `<ellipse cx="${n(cx + fig.chest * 0.16)}" cy="${n(chestY - 4)}" rx="${n(fig.chest * 0.16)}" ry="14" fill="${skin.deep}" opacity="0.16" />`,
    );
  }
  parts.push(
    joint(lShoulderX, shoulderY + 8, skin.joint),
    joint(rShoulderX, shoulderY + 8, skin.joint),
    joint(lElbowX, elbowY, skin.joint),
    joint(rElbowX, elbowY, skin.joint),
    joint(lWristX, wristY, skin.joint),
    joint(rWristX, wristY, skin.joint),
    joint(lHipX, hipY + 6, skin.joint),
    joint(rHipX, hipY + 6, skin.joint),
    joint(lKneeX, kneeY, skin.joint),
    joint(rKneeX, kneeY, skin.joint),
    joint(lAnkleX, ankleY, skin.joint),
    joint(rAnkleX, ankleY, skin.joint),
    `<text x="256" y="1008" text-anchor="middle" fill="${skin.deep}" font-size="20" font-family="sans-serif">${escapeXml(base.label)}</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 1024" width="512" height="1024">${parts.join("")}</svg>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function mannequinDataUrl(base: StudioBase, look: BodyLook = DEFAULT_LOOK): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mannequinSvg(base, look))}`;
}

export function isAdultBase(base: StudioBase): boolean {
  return Boolean(base.kind && base.build);
}
