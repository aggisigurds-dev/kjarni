export const SKINS = [
  { id: "ragnarok", label: "Ragnarök", hint: "Bráðið gull · svart stál" },
  { id: "command", label: "Command", hint: "Ísblátt HUD-stjórnborð" },
  { id: "atlas", label: "Atlas", hint: "Bláprent · kortaborð" },
  { id: "pulse", label: "Pulse", hint: "Vaktborð · ops" },
  { id: "helix", label: "Helix", hint: "Rásir · lab" },
  { id: "vector", label: "Vector", hint: "Fjólublá geimstöð" },
  { id: "don", label: "Don", hint: "Gull · maffía" },
] as const;

export type SkinId = (typeof SKINS)[number]["id"];
export const SKIN_IDS: SkinId[] = SKINS.map((skin) => skin.id);
/* v2 (24.09.2026): Ragnarök varð sjálfgefið útlit. Nýr lykill svo allir lendi
 * einu sinni á því — eldra val (kjarni_skin) er hunsað; hin útlitin eru enn í röðinni. */
export const SKIN_KEY = "kjarni_skin_v2";
export const DEFAULT_SKIN: SkinId = "ragnarok";

export const TOOLS = [
  { id: "kjarni", label: "Stjórnstöð", href: "/kjarni" },
  { id: "turbopaint", label: "TurboPaint", href: "/kjarni/turbopaint" },
  { id: "bord", label: "Borð", href: "/bord" },
  { id: "stjorn", label: "Stjórnborð", href: "/stjorn" },
  { id: "kerfi", label: "Kerfi", href: "/kerfi" },
  { id: "skjalarinn", label: "Skjalarinn", href: "/skjalarinn" },
  { id: "draft", label: "Prufusvæði", href: "/draft" },
  { id: "3dwork", label: "3dwork", href: "/3dwork", ext: true },
  { id: "marks", label: "Marks", href: "/marks", ext: true },
] as const;

export type ToolId = (typeof TOOLS)[number]["id"];

export function readSkin(): SkinId {
  if (typeof window === "undefined") return DEFAULT_SKIN;
  const stored = window.localStorage.getItem(SKIN_KEY);
  const fromHtml = document.documentElement.dataset.kjarniSkin;
  if (SKIN_IDS.includes(stored as SkinId)) return stored as SkinId;
  return SKIN_IDS.includes(fromHtml as SkinId) ? (fromHtml as SkinId) : DEFAULT_SKIN;
}
