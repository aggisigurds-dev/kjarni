/** Plain Icelandic menu: what this site is, and what you can click. */

export const HVAD_HREF = "/kjarni/hvad";

export const THRIR = [
  {
    id: "vefur",
    nafn: "Þessi vefur",
    lysing: "Kjarni. Hér smellir þú á tól — teikningar, skjöl, kúnnar.",
  },
  {
    id: "spjall",
    nafn: "Spjallið",
    lysing: "Cursor. Veldu Claude eða Grok uppi í spjallinu. Skrifaðu hvað þú vilt. Ekkert extra skref.",
  },
  {
    id: "kodi",
    nafn: "Kóðinn",
    lysing: "GitHub. Þar er kjarni vistaður. Þú þarft ekki að opna hann til að nota vefinn.",
  },
] as const;

export type Adgerd = {
  nafn: string;
  lysing: string;
  href: string;
  uti?: boolean;
};

export const ADGERDIR: Adgerd[] = [
  {
    nafn: "Teikna gólfplön",
    lysing: "Leitaðu að heimilisfangi og merktu á teikningu.",
    href: "/kjarni/turbopaint",
  },
  {
    nafn: "ArtCraft",
    lysing: "Myndir og sköpunartól.",
    href: "/kjarni/artcraft",
  },
  {
    nafn: "Kúnnar og tæki",
    lysing: "Viðskiptavinir, búnaður, skoðanir.",
    href: "/kerfi",
  },
  {
    nafn: "Skjöl",
    lysing: "PDF og skrár.",
    href: "/skjalarinn",
  },
  {
    nafn: "Bókamerki",
    lysing: "Marks — möppur og töflur.",
    href: "/marks",
    uti: true,
  },
  {
    nafn: "3D hlutir",
    lysing: "STL og mesh.",
    href: "/3dwork",
    uti: true,
  },
  {
    nafn: "Brunahólf",
    lysing: "Hubinn sem er í notkun í dag.",
    href: "https://brunaholf.netlify.app",
    uti: true,
  },
  {
    nafn: "Slökkvitæki",
    lysing: "Appið sem er í notkun í dag.",
    href: "https://slokkvitaeki.netlify.app",
    uti: true,
  },
];
