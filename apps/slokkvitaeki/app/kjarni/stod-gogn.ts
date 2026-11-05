/* Sameiginlegt efni Stjórnstöðvarinnar — Ragnarök (ragnarok/RagnarokView) og þemasýnin (StodView) lesa sama
 * kerfalistann, síurnar og hjálparföllin, svo eitt kerfi bætist við á einum stað. */

export type StodKerfi = {
  name: string;
  kind: string;
  desc: string;
  href: string;
  state: "VIRKT" | "DRÖG" | "YTRA";
  /** tákn þemasýnarinnar (stroke-SVG í StodView) */
  ico: "pensill" | "litir" | "grind" | "maelabord" | "lykill" | "skjal" | "flug" | "tilraun" | "teningur" | "merki" | "skrifstofa" | "thetting" | "skaeri";
};

export const SYSTEMS: StodKerfi[] = [
  { name: "TurboPaint", kind: "TÓL", desc: "Gólfplön — leitaðu eftir heimilisfangi og settu teikninguna á borðið.", href: "/kjarni/turbopaint", state: "VIRKT", ico: "pensill" },
  { name: "ArtCraft", kind: "TÓL", desc: "Mynd- og myndbandatól, Móta-ritillinn, sjálfvirk tól og einkastúdíó — opnaðu þau beint hér úr Kjarnanum.", href: "/kjarni/artcraft", state: "VIRKT", ico: "litir" },
  { name: "Borð", kind: "TÓL", desc: "Sérsniðið stjórnborð — draganleg spjöld með lifandi gögnum, tenglum og klukku.", href: "/bord", state: "VIRKT", ico: "grind" },
  { name: "Stjórnborð", kind: "VEFUR", desc: "Stjórnborð vefsins — síður, pantanir, mælingar og tengingar.", href: "/stjorn", state: "VIRKT", ico: "maelabord" },
  { name: "Kerfi", kind: "EINING", desc: "Þjónustukerfið — viðskiptavinir, búnaður, skoðanir, sala og verkstæði.", href: "/kerfi", state: "VIRKT", ico: "lykill" },
  { name: "Borgarferðir", kind: "TÓL", desc: "Flugleit og bestu pakkarnir í nóvember — Manchester og Glasgow, flug, töskur og hótel fyrir 4.", href: "/borgarferdir", state: "VIRKT", ico: "flug" },
  { name: "Skjalarinn", kind: "TÓL", desc: "Skjöl, pdf og skrár á einum stað.", href: "/skjalarinn", state: "VIRKT", ico: "skjal" },
  { name: "Prufusvæði", kind: "DRÖG", desc: "Blokkir, þemu og skikt — tilraunir, ekkert hér er lokaútgáfa.", href: "/draft", state: "DRÖG", ico: "tilraun" },
  { name: "3dwork", kind: "YTRA", desc: "STL/mesh vinnustöð — opnast í nýjum glugga.", href: "/3dwork", state: "YTRA", ico: "teningur" },
  { name: "Marks", kind: "YTRA", desc: "Whiteboard, möppur og covers — opnast í nýjum glugga.", href: "/marks", state: "YTRA", ico: "merki" },
  /* 05.11.2026 (Agnar): skrifstofuforritin úr ArtCraft, Skráning/Yfirsýn þéttinga og Bakgrunnur fengu eigin spjöld. */
  { name: "OfficeCraft", kind: "TÓL", desc: "Ritvinnsla, töflur, kynningar, PDF, CAD, viðmót, vektorar og hljóð — skrifstofuforritin á einum stað.", href: "/kjarni/officecraft", state: "VIRKT", ico: "skrifstofa" },
  { name: "Ajour-Craft", kind: "TÓL", desc: "Brunaþéttingar á verkstöðum — skráning, yfirsýn þéttinga og greining, í stað Ajour.", href: "/kjarni/skraning", state: "VIRKT", ico: "thetting" },
  { name: "Bakgrunnur", kind: "TÓL", desc: "Fjarlægðu vegg, borð og skugga af vörumynd — tilbúin mynd á sekúndum, í vafranum eða skýinu.", href: "/kjarni/artcraft/bakgrunnur", state: "VIRKT", ico: "skaeri" },
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
