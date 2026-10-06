// Hamir TurboPaint (Agnar 03.10.2026: „setja inn hnappa og stýringar sem ég þarf og setja einhverja hama svo það sé
// einfaldara að vinna í hverju fyrir sig" · „turboprint á að vera svona vinnuengine. Sem getur síðan keyrt með mismunandi
// Ham útfærslur"). Hver hamur ræður hvaða aðgerðir standa í hamstikunni og hvaða tákn eru í slánni — borðið, lögin og
// gögnin eru þau sömu í öllum hömum. Valinn hamur er útlitsval vafrans (localStorage), ekki staða gagna.

import { create } from "zustand";

export type HamurId = "teikning" | "slokkvitaeki" | "brunathettingar" | "brunakerfi" | "rymi";

/** Aðgerðir sem hamstikan getur sýnt; WhiteboardApp tengir hverja við sína virkni. */
export type HamAdgerd =
  | "hreinsa"
  | "hreinsa-svaedi"
  | "strokledur"
  | "eyda-linu"
  | "veggir"
  | "kvarda"
  | "thrividd"
  | "slt-brsl"
  | "ei"
  | "eldveggur"
  | "gegnumtok"
  | "rymi"
  | "gatreitur";

export interface Hamur {
  id: HamurId;
  heiti: string;
  stutt: string;
  /** Ein lína um hvað er gert í hamnum. */
  lysing: string;
  adgerdir: HamAdgerd[];
  /** Tákn í slánni (null = sláin falin). Eigin tákn Agnars bætast alltaf við þar sem sláin sést. */
  takn: string[] | null;
  /** Aukatákn TurboPaint sem Teikning-glugginn á ekki — standa sér í slánni og vistast ekki í úttektina. */
  auka?: string[];
}

/** Merkjasafn Teikning-gluggans í slánni: tækjategundirnar fjórar og merkin tíu (433), í sömu röð og þar. */
const TEIKNING_TAEKI = ["teikn:lettvatn", "teikn:duft", "teikn:co2", "teikn:slanga"];
const TEIKNING_MERKI = [
  "teikn:neydarutgangur",
  "teikn:ut",
  "teikn:hose",
  "teikn:rafmagn",
  "teikn:skilti_slt",
  "teikn:skilti_slanga",
  "teikn:reykskynjari",
  "teikn:hitaskynjari",
  "teikn:bjalla",
  "teikn:segull",
];

export const HAMIR: Hamur[] = [
  {
    id: "teikning",
    heiti: "Teikning og greining",
    stutt: "Teikning",
    lysing: "Flyttu inn teikninguna, kvarðaðu, hreinsaðu og greindu veggina — grunnurinn fyrir hina hamana.",
    adgerdir: ["kvarda", "eyda-linu", "strokledur", "hreinsa-svaedi", "hreinsa", "veggir", "thrividd"],
    takn: null,
  },
  {
    id: "slokkvitaeki",
    heiti: "Slökkvitæki",
    stutt: "Slökkvitæki",
    lysing: "Raðaðu slökkvitækjum, slöngum og skiltum — SLT/BRSL af teikningunni setur hönnuðu staðina sjálfkrafa.",
    adgerdir: ["slt-brsl", "thrividd"],
    // Sama safn og Teikning-glugginn (Agnar 06.10.2026: „Samræma merkingar þarna á milli").
    takn: [...TEIKNING_TAEKI, ...TEIKNING_MERKI],
    auka: ["blanket", "e-light"],
  },
  {
    id: "brunathettingar",
    heiti: "Brunaþéttingar",
    stutt: "Brunaþéttingar",
    lysing: "Eldveggir (EI-30 / EI-60), eldvarnarhurðir og gegnumtök lagna í gegnum brunahólfandi veggi.",
    adgerdir: ["ei", "eldveggur", "gegnumtok", "veggir"],
    takn: ["firewall", "firedoor", "pin"],
  },
  {
    id: "brunakerfi",
    heiti: "Brunakerfi",
    stutt: "Brunakerfi",
    lysing: "Skynjarar, brunahnappar, úðakerfi, neyðarlýsing og stjórnstöð — talið í magntöflunni.",
    adgerdir: ["thrividd"],
    takn: ["teikn:reykskynjari", "teikn:hitaskynjari", "teikn:bjalla", "teikn:segull", "teikn:rafmagn"],
    auka: ["alarm", "sprinkler", "e-light", "hydrant", "phone"],
  },
  {
    id: "rymi",
    heiti: "Rýmisstaða",
    stutt: "Rými",
    lysing: "Teiknaðu rýmin og merktu hvað er klárt — gátreitir og staða hvers rýmis.",
    adgerdir: ["rymi", "gatreitur"],
    takn: ["wc", "stairs", "elevator", "pin"],
  },
];

export function getHamur(id: HamurId): Hamur {
  return HAMIR.find((h) => h.id === id) ?? HAMIR[0];
}

const LYKILL = "tp_hamur";

function lesaHam(): HamurId {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(LYKILL) : null;
    if (v && HAMIR.some((h) => h.id === v)) return v as HamurId;
  } catch {
    /* einkagluggi / lokað */
  }
  return "teikning";
}

export const useHamur = create<{ hamur: HamurId; setHamur: (h: HamurId) => void }>((set) => ({
  hamur: "teikning",
  setHamur: (hamur) => {
    try {
      window.localStorage.setItem(LYKILL, hamur);
    } catch {
      /* ekkert */
    }
    set({ hamur });
  },
}));

/** Les vistaðan ham eftir hydration (forðast misræmi milli þjóns og vafra). */
export function hladaHam() {
  useHamur.setState({ hamur: lesaHam() });
}

/** Tákn slánnar í hamnum: listi hamsins ∩ ófalin, auk eigin tákna. null = sláin falin. */
export function taknIHam(hamur: HamurId, eigin: string[]): string[] | null {
  const s = taknIHamSkipt(hamur, eigin);
  return s ? [...s.teikning, ...s.auka] : null;
}

/** Sláin skipt: merkjasafn Teikning-gluggans fyrst, aukatákn TurboPaint (og eigin tákn) sér. null = sláin falin. */
export function taknIHamSkipt(hamur: HamurId, eigin: string[]): { teikning: string[]; auka: string[] } | null {
  const h = getHamur(hamur);
  if (!h.takn) return null;
  const teikning = h.takn.filter((id) => id.startsWith("teikn:"));
  const fyrst = h.takn.filter((id) => !id.startsWith("teikn:"));
  const auka = [...fyrst, ...(h.auka ?? [])];
  return { teikning, auka: [...auka, ...eigin.filter((id) => !auka.includes(id) && !teikning.includes(id))] };
}
