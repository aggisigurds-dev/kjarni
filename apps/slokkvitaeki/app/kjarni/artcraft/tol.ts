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
  {
    id: "vidgerd",
    name: "Ljósmyndaviðgerð",
    role: "Andlit & áferð",
    desc: "Laga óskýr andlit, rauð augu og áferð — staðbundinn netþjónn á vélinni þinni.",
    icon: "🩹",
    href: "/kjarni/artcraft/vidgerd",
    ready: true,
  },
  {
    id: "kastljos",
    name: "Kastljós",
    role: "Birta",
    desc: "Finnur persónuna og stillir birtu sitt í hvoru lagi á henni og bakgrunninum — upp, niður, hægri, vinstri.",
    icon: "🔦",
    href: "/kjarni/artcraft/kastljos",
    ready: true,
  },
  {
    id: "mota",
    name: "Móta",
    role: "Lögun",
    desc: "Mjókka, þenja eða draga líkamslínur með bursta sem þú stillir — í vafranum, engin mynd send neitt.",
    icon: "🖌️",
    href: "/kjarni/artcraft/mota",
    ready: true,
  },
  {
    id: "comfy",
    name: "ComfyUI",
    role: "Texti → mynd",
    desc: "Teiknar með þínu eigin ComfyUI á vélinni — staðbundið hnútaverk, engin mynd send neitt. Þarf ComfyUI í gangi.",
    icon: "🧩",
    href: "/kjarni/artcraft/comfy",
    ready: true,
  },
] as const;
