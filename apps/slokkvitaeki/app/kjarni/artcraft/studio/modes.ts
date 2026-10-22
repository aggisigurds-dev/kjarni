/** Studio work modes: stills, video, then the person you are editing. */

export const STUDIO_MODE_KEY = "kjarni_private_studio_mode";

export const STUDIO_MODES = [
  {
    id: "still",
    label: "Stakar",
    hint: "Ein mynd í einu — föt, bakgrunnur, stúdíómyndataka.",
  },
  {
    id: "video",
    label: "Videó",
    hint: "Hreyfimynd og athafnir út frá síðustu mynd.",
  },
  {
    id: "person",
    label: "Persóna",
    hint: "Prófíll, hringur og 3D-stelling. Hver er þetta.",
  },
] as const;

export type StudioMode = (typeof STUDIO_MODES)[number]["id"];

export function isStudioMode(value: string): value is StudioMode {
  return STUDIO_MODES.some((mode) => mode.id === value);
}

export function studioModeOf(value: string | null | undefined): StudioMode {
  return value && isStudioMode(value) ? value : "still";
}

export function studioModeHint(id: StudioMode): string {
  return STUDIO_MODES.find((mode) => mode.id === id)?.hint || STUDIO_MODES[0].hint;
}

export function readStoredMode(): StudioMode {
  if (typeof window === "undefined") return "still";
  return studioModeOf(window.localStorage.getItem(STUDIO_MODE_KEY));
}

export function writeStoredMode(id: StudioMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STUDIO_MODE_KEY, id);
}
