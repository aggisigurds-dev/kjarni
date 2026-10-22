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

type Figure = {
  shoulder: number;
  torso: number;
  hip: number;
  limb: number;
  inseam: number;
};

export function figureOf(kind: BodyKind, build: BodyBuild): Figure {
  const builds: Record<BodyBuild, Figure> = {
    slim: { shoulder: 96, torso: 68, hip: 78, limb: 13, inseam: 430 },
    average: { shoulder: 118, torso: 86, hip: 96, limb: 16, inseam: 410 },
    athletic: { shoulder: 142, torso: 98, hip: 94, limb: 20, inseam: 400 },
    solid: { shoulder: 136, torso: 118, hip: 122, limb: 22, inseam: 380 },
  };
  const fig = { ...builds[build] };
  if (kind === "woman") {
    fig.shoulder -= 8;
    fig.hip += 10;
  }
  if (kind === "man") {
    fig.shoulder += 10;
    fig.hip -= 6;
  }
  return fig;
}

export function adaptBasePrompt(name: string, base: StudioBase): string {
  const who = name.trim() || "the same adult person";
  const sex =
    base.kind === "woman" ? "adult woman" : base.kind === "man" ? "adult man" : "adult person";
  return `photorealistic ${sex} ${who} matching this mannequin base, keep the same body proportions, limb length and A-pose joints, same identity as the face references, studio lighting, sharp focus, single person, no extra limbs`;
}

export function mergeBase(user: string, name: string, base: StudioBase): string {
  const line = adaptBasePrompt(name, base);
  const text = user.trim();
  if (!text) return line;
  if (text.includes("matching this mannequin base")) return text;
  return `${text}, ${line}`;
}

function limb(x1: number, y1: number, x2: number, y2: number, w: number, fill: string): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" />`;
}

function joint(x: number, y: number, fill: string): string {
  return `<circle cx="${x}" cy="${y}" r="7" fill="${fill}" />`;
}

/** Clay A-pose adult mannequin with visible joints. SVG so tests and the UI share one drawing. */
export function mannequinSvg(base: StudioBase): string {
  const fig = figureOf(base.kind, base.build);
  const cx = 256;
  const headY = 92;
  const neckY = 148;
  const shoulderY = 178;
  const hipY = 400;
  const kneeY = hipY + fig.inseam * 0.48;
  const ankleY = hipY + fig.inseam;
  const armOut = fig.shoulder * 0.72;
  const elbowX = cx + armOut + 36;
  const wristX = cx + armOut + 78;
  const elbowY = shoulderY + 118;
  const wristY = elbowY + 118;
  const fill = "#c4b29a";
  const line = "#8d7a62";
  const jointFill = "#5c4d3a";
  const skin = fill;
  const parts = [
    `<rect width="512" height="1024" fill="#1a1a1a" />`,
    `<ellipse cx="${cx}" cy="${headY}" rx="38" ry="44" fill="${skin}" />`,
    limb(cx, neckY - 12, cx, shoulderY, 16, skin),
    `<rect x="${cx - fig.torso / 2}" y="${shoulderY}" width="${fig.torso}" height="${hipY - shoulderY}" rx="28" fill="${skin}" />`,
    `<ellipse cx="${cx}" cy="${hipY}" rx="${fig.hip / 2}" ry="22" fill="${skin}" />`,
    limb(cx - fig.shoulder / 2, shoulderY, cx - elbowX + cx, elbowY, fig.limb, skin),
    limb(cx + fig.shoulder / 2, shoulderY, elbowX, elbowY, fig.limb, skin),
    limb(cx - elbowX + cx, elbowY, cx - wristX + cx, wristY, fig.limb * 0.85, skin),
    limb(elbowX, elbowY, wristX, wristY, fig.limb * 0.85, skin),
    limb(cx - fig.hip * 0.28, hipY, cx - 28, kneeY, fig.limb + 4, skin),
    limb(cx + fig.hip * 0.28, hipY, cx + 28, kneeY, fig.limb + 4, skin),
    limb(cx - 28, kneeY, cx - 22, ankleY, fig.limb, skin),
    limb(cx + 28, kneeY, cx + 22, ankleY, fig.limb, skin),
    joint(cx - fig.shoulder / 2, shoulderY, jointFill),
    joint(cx + fig.shoulder / 2, shoulderY, jointFill),
    joint(cx - elbowX + cx, elbowY, jointFill),
    joint(elbowX, elbowY, jointFill),
    joint(cx - wristX + cx, wristY, jointFill),
    joint(wristX, wristY, jointFill),
    joint(cx - fig.hip * 0.28, hipY, jointFill),
    joint(cx + fig.hip * 0.28, hipY, jointFill),
    joint(cx - 28, kneeY, jointFill),
    joint(cx + 28, kneeY, jointFill),
    joint(cx - 22, ankleY, jointFill),
    joint(cx + 22, ankleY, jointFill),
    `<text x="256" y="1008" text-anchor="middle" fill="${line}" font-size="22" font-family="sans-serif">${escapeXml(base.label)}</text>`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 1024" width="512" height="1024">${parts.join("")}</svg>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function mannequinDataUrl(base: StudioBase): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mannequinSvg(base))}`;
}

export function isAdultBase(base: StudioBase): boolean {
  return Boolean(base.kind && base.build);
}
