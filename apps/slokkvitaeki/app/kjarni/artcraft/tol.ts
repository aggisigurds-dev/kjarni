/** In-browser auto tools — not the seven WASM editors. */

export function artcraftBakgrunnurWhiteHref(): string {
  return "/kjarni/artcraft/bakgrunnur?botn=hvitt";
}

export const AUTO_TOOLS = [
  {
    id: "bakgrunnur",
    name: "Fjarlægja bakgrunn",
    role: "Vörumyndir",
    desc: "Veggur, borð og skuggi fara. PNG með gegnsæi, í vafranum.",
    icon: "✂️",
    href: "/kjarni/artcraft/bakgrunnur",
    ready: true,
  },
  {
    id: "hvitt",
    name: "Á hvítan bakgrunn",
    role: "Vörumyndir",
    desc: "Sama klipping, svo varan er sett á hreint hvítt — tilbúið í verslun.",
    icon: "⬜",
    href: artcraftBakgrunnurWhiteHref(),
    ready: true,
  },
  {
    id: "studio",
    name: "Einkastúdíó",
    role: "Texti → mynd",
    desc: "Staðbundið líkan á vélinni þinni. Þarf Forge / Automatic1111.",
    icon: "🔓",
    href: "/kjarni/artcraft/studio",
    ready: true,
  },
] as const;
