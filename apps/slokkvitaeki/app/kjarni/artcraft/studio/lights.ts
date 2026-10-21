/** Studio lighting plan → prompt fragment for Forge / A1111. */

export const LIGHTS_KEY = "kjarni_private_studio_lights";

export const LIGHT_COLORS = [
  { id: "white", label: "Hvítt", prompt: "white strobe" },
  { id: "bronze", label: "Brons", prompt: "bronze gel" },
  { id: "daylight", label: "Dagsbirt", prompt: "daylight balanced flash" },
  { id: "warm", label: "Volgt", prompt: "warm tungsten gel" },
  { id: "pink", label: "Bleikt", prompt: "pink gel" },
] as const;

export const LIGHT_MODS = [
  { id: "umbrella85", label: "85\" silfur paraply", prompt: "85 inch silver umbrella" },
  { id: "umbrella110", label: "110\" silfur paraply", prompt: "110 inch silver umbrella" },
  { id: "softbox", label: "Softbox", prompt: "softbox" },
  { id: "bare", label: "Ber flass", prompt: "bare flash" },
] as const;

export const BACKGROUNDS = [
  { id: "pink", label: "Bleikur", prompt: "pink seamless backdrop" },
  { id: "white", label: "Hvítur", prompt: "white seamless high-key backdrop" },
  { id: "grey", label: "Grár", prompt: "grey studio backdrop" },
  { id: "black", label: "Svartur", prompt: "black low-key backdrop" },
  { id: "blue", label: "Blár", prompt: "blue seamless backdrop" },
] as const;

export type LightColorId = (typeof LIGHT_COLORS)[number]["id"];
export type LightModId = (typeof LIGHT_MODS)[number]["id"];
export type BackgroundId = (typeof BACKGROUNDS)[number]["id"];
export type LightSlot = "left" | "right" | "key";
export type PlanPreset = "highkey" | "rembrandt" | "butterfly" | "off";

export type StudioLight = {
  power: number;
  color: LightColorId;
  modifier: LightModId;
};

export type LightPlan = {
  preset: PlanPreset;
  background: BackgroundId;
  left: StudioLight;
  right: StudioLight;
  key: StudioLight;
};

export const LIGHT_SLOTS: Array<{ id: LightSlot; label: string }> = [
  { id: "left", label: "Vinstri" },
  { id: "right", label: "Hægri" },
  { id: "key", label: "Lykilljós" },
];

export const PLAN_PRESETS: Array<{ id: PlanPreset; label: string }> = [
  { id: "highkey", label: "High-key, 3 ljós" },
  { id: "rembrandt", label: "Rembrandt" },
  { id: "butterfly", label: "Butterfly" },
  { id: "off", label: "Slökkt" },
];

export const DEFAULT_LIGHT_PLAN: LightPlan = {
  preset: "highkey",
  background: "pink",
  left: { power: 7, color: "bronze", modifier: "umbrella85" },
  right: { power: 7, color: "bronze", modifier: "umbrella85" },
  key: { power: 8, color: "bronze", modifier: "umbrella110" },
};

export function clampPower(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, Math.round(n)));
}

export function bumpPower(n: number, dir: 1 | -1): number {
  return clampPower(n + dir);
}

function colorPrompt(id: LightColorId): string {
  return LIGHT_COLORS.find((c) => c.id === id)?.prompt || "white strobe";
}

function modPrompt(id: LightModId): string {
  return LIGHT_MODS.find((m) => m.id === id)?.prompt || "softbox";
}

function bgPrompt(id: BackgroundId): string {
  return BACKGROUNDS.find((b) => b.id === id)?.prompt || "studio backdrop";
}

export function lightLine(slot: LightSlot, light: StudioLight): string | null {
  if (light.power <= 0) return null;
  const where = slot === "left" ? "left" : slot === "right" ? "right" : "front key";
  return `${where} ${modPrompt(light.modifier)}, ${colorPrompt(light.color)}, power ${light.power}/10`;
}

export function lightingPrompt(plan: LightPlan): string {
  const parts = [
    lightLine("left", plan.left),
    lightLine("right", plan.right),
    lightLine("key", plan.key),
  ].filter((x): x is string => Boolean(x));
  if (parts.length === 0) return "";
  const style =
    plan.preset === "rembrandt"
      ? "Rembrandt studio lighting"
      : plan.preset === "butterfly"
        ? "butterfly beauty lighting"
        : "three-light high-key studio flash";
  return `${style}, ${bgPrompt(plan.background)}, ${parts.join(", ")}`;
}

function clonePlan(plan: LightPlan): LightPlan {
  return {
    preset: plan.preset,
    background: plan.background,
    left: { ...plan.left },
    right: { ...plan.right },
    key: { ...plan.key },
  };
}

export function applyPreset(id: PlanPreset): LightPlan {
  if (id === "off") {
    return {
      preset: "off",
      background: "grey",
      left: { power: 0, color: "white", modifier: "umbrella85" },
      right: { power: 0, color: "white", modifier: "umbrella85" },
      key: { power: 0, color: "white", modifier: "softbox" },
    };
  }
  if (id === "rembrandt") {
    return {
      preset: "rembrandt",
      background: "grey",
      left: { power: 9, color: "white", modifier: "softbox" },
      right: { power: 3, color: "white", modifier: "umbrella85" },
      key: { power: 0, color: "white", modifier: "umbrella110" },
    };
  }
  if (id === "butterfly") {
    return {
      preset: "butterfly",
      background: "white",
      left: { power: 3, color: "white", modifier: "umbrella85" },
      right: { power: 3, color: "white", modifier: "umbrella85" },
      key: { power: 9, color: "white", modifier: "softbox" },
    };
  }
  return clonePlan({ ...DEFAULT_LIGHT_PLAN, preset: "highkey" });
}

export function mergePrompt(user: string, plan: LightPlan): string {
  const light = lightingPrompt(plan);
  const base = user.trim();
  if (!light) return base;
  if (!base) return light;
  if (base.includes(light)) return base;
  return `${base}, ${light}`;
}

export function readStoredLights(): LightPlan {
  if (typeof window === "undefined") return DEFAULT_LIGHT_PLAN;
  try {
    const raw = window.localStorage.getItem(LIGHTS_KEY);
    if (!raw) return DEFAULT_LIGHT_PLAN;
    const parsed = JSON.parse(raw) as Partial<LightPlan>;
    const base = applyPreset(parsed.preset || "highkey");
    return {
      preset: parsed.preset || base.preset,
      background: BACKGROUNDS.some((b) => b.id === parsed.background) ? parsed.background! : base.background,
      left: { ...base.left, ...parsed.left, power: clampPower(parsed.left?.power ?? base.left.power) },
      right: { ...base.right, ...parsed.right, power: clampPower(parsed.right?.power ?? base.right.power) },
      key: { ...base.key, ...parsed.key, power: clampPower(parsed.key?.power ?? base.key.power) },
    };
  } catch {
    return DEFAULT_LIGHT_PLAN;
  }
}
