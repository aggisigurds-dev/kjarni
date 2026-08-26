export const SKINS = [
  { id: "command", label: "Command", hint: "Ísblátt HUD-stjórnborð" },
  { id: "atlas", label: "Atlas", hint: "Bláprent · kortaborð" },
  { id: "pulse", label: "Pulse", hint: "Vaktborð · ops" },
  { id: "helix", label: "Helix", hint: "Rásir · lab" },
  { id: "vector", label: "Vector", hint: "Fjólublá geimstöð" },
  { id: "don", label: "Don", hint: "Gull · maffía" },
] as const;

export type SkinId = (typeof SKINS)[number]["id"];
export const SKIN_IDS: SkinId[] = SKINS.map((skin) => skin.id);
export const SKIN_KEY = "kjarni_skin";

export const TOOLS = [
  { id: "kjarni", label: "Stjórnstöð", href: "/kjarni" },
  { id: "stjorn", label: "Stjórnborð", href: "/stjorn" },
  { id: "kerfi", label: "Kerfi", href: "/kerfi" },
  { id: "skjalarinn", label: "Skjalarinn", href: "/skjalarinn" },
  { id: "draft", label: "Prufusvæði", href: "/draft" },
  { id: "3dwork", label: "3dwork", href: "/3dwork", ext: true },
] as const;

export type ToolId = (typeof TOOLS)[number]["id"];

export function readSkin(): SkinId {
  if (typeof window === "undefined") return "command";
  const stored = window.localStorage.getItem(SKIN_KEY);
  const fromHtml = document.documentElement.dataset.kjarniSkin;
  if (SKIN_IDS.includes(stored as SkinId)) return stored as SkinId;
  return SKIN_IDS.includes(fromHtml as SkinId) ? (fromHtml as SkinId) : "command";
}
