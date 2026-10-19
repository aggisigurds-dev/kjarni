/* Sameiginlegt efni Stjórnstöðvarinnar — Ragnarök (ragnarok/RagnarokView) og þemasýnin (StodView) lesa sama
 * kerfalistann, síurnar og hjálparföllin, svo eitt kerfi bætist við á einum stað. */

export type StodKerfi = {
  name: string;
  kind: string;
  desc: string;
  href: string;
  state: "VIRKT" | "DRÖG" | "YTRA";
  /** tákn þemasýnarinnar (stroke-SVG í StodView) */
  ico: "pensill" | "litir" | "grind" | "maelabord" | "lykill" | "skjal" | "tilraun" | "teningur" | "merki";
};

export const SYSTEMS: StodKerfi[] = [
  { name: "TurboPaint", kind: "TÓL", desc: "Gólfplön — leitaðu eftir heimilisfangi og settu teikninguna á borðið.", href: "/kjarni/turbopaint", state: "VIRKT", ico: "pensill" },
  { name: "ArtCraft", kind: "TÓL", desc: "13 sköpunarviðmót, sjálfvirk tól og einkastúdíó — opnaðu þau beint hér úr Kjarnanum.", href: "/kjarni/artcraft", state: "VIRKT", ico: "litir" },
  { name: "Borð", kind: "TÓL", desc: "Sérsniðið stjórnborð — draganleg spjöld með lifandi gögnum, tenglum og klukku.", href: "/bord", state: "VIRKT", ico: "grind" },
  { name: "Stjórnborð", kind: "VEFUR", desc: "Stjórnborð vefsins — síður, pantanir, mælingar og tengingar.", href: "/stjorn", state: "VIRKT", ico: "maelabord" },
  { name: "Kerfi", kind: "EINING", desc: "Þjónustukerfið — viðskiptavinir, búnaður, skoðanir, sala og verkstæði.", href: "/kerfi", state: "VIRKT", ico: "lykill" },
  { name: "Skjalarinn", kind: "TÓL", desc: "Skjöl, pdf og skrár á einum stað.", href: "/skjalarinn", state: "VIRKT", ico: "skjal" },
  { name: "Prufusvæði", kind: "DRÖG", desc: "Blokkir, þemu og skikt — tilraunir, ekkert hér er lokaútgáfa.", href: "/draft", state: "DRÖG", ico: "tilraun" },
  { name: "3dwork", kind: "YTRA", desc: "STL/mesh vinnustöð — opnast í nýjum glugga.", href: "/3dwork", state: "YTRA", ico: "teningur" },
  { name: "Marks", kind: "YTRA", desc: "Whiteboard, möppur og covers — opnast í nýjum glugga.", href: "/marks", state: "YTRA", ico: "merki" },
];

export const FILTERS = ["allt", "Kerfi", "Vefur", "Tól", "Verkfæri"] as const;
export type Filter = (typeof FILTERS)[number];

export const ext = (href: string) => (href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {});

/** DD.MM.YYYY */
export const dags = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};
