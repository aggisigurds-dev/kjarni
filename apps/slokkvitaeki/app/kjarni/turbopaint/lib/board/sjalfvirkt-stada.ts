// Staða sjálfvirka verkferlisins („Sjálfvirkt" í Teikning → TurboPaint ?sjalfvirkt=1) — framvinduspjaldið
// (components/kjarni/SjalfvirktSpjald.tsx) les hana, verkferlið (sjalfvirkt.ts) skrifar hana. Útlitsstaða vafrans: ekkert
// hér vistast. Prófanir lesa hana um window.__tpSjalfvirkt (líka `maeling` — línurnar í dílum frummyndar).

import { create } from "zustand";

export type SkrefId = "gaedi" | "skurdur" | "veggir" | "hreinsun" | "hurdir" | "ei" | "taeki" | "vista";
export type SkrefStada = "bida" | "keyrir" | "lokid" | "sleppt" | "villa" | "stodvad";

export interface Skref {
  id: SkrefId;
  heiti: string;
  stada: SkrefStada;
  /** Hvað gerðist (tölur) — eða hvers vegna það brást. */
  texti: string;
  /** Framvinda innan skrefsins (0–100) meðan það keyrir, ef þekkt. */
  pros?: number | null;
  ms?: number;
}

export const SKREF_HEITI: Record<SkrefId, string> = {
  gaedi: "Hæstu gæði",
  skurdur: "Skera að byggingu",
  veggir: "Veggir",
  hreinsun: "Hreinsun",
  hurdir: "Hurðir",
  ei: "Eldveggir (EI)",
  taeki: "Tæki (SLT / BRSL)",
  vista: "Vista í úttekt",
};

/** Skýring á hverju skrefi: hvaða vél vinnur og hvers vegna — sýnd í spjaldinu („Hvernig?") og í Greining-flipanum. */
export const SKREF_SKYRING: Record<SkrefId, string> = {
  gaedi: "Teikningin er sótt í bestu gæðum sem skjalasafnið á: TIF-frumrit (300 dpi), vigur-PDF eða skönnuð PDF. Bara lítil JPEG-mynd? Þá verður allt eftir á ónákvæmara og skrefið segir það.",
  skurdur: "Húsið er fundið sem stærsti veggjaklasinn og blaðið skorið að því með 2,5 % spássíu. Skurður sem þú hefur gert sjálfur eða hæð sem þú hefur leiðrétt er aldrei snert.",
  veggir: "Vigur-PDF: línur teikningarinnar eru lesnar beint og flokkaðar í veggi og gler. Það er nákvæmast. Skönnun: veggjavélin (U-Net á skrifstofutölvunni, nokkrar mínútur) og myndgreining í vafranum til vara.",
  hreinsun: "Strik og punktar eytt, línur réttar, samlínu bútar sameinaðir, veggir smelltir saman og stakir bútar fjarlægðir. Veggir sem þú hefur leiðrétt eru fastir.",
  hurdir: "Hurðir fundnar á tvo vegu: bil í veggjum sem eru 0,7 til 1,3 m, og hurðabogar (fjórðungshringur frá hjör). Gluggar verða gler. Hurð sker vegginn undir sér.",
  ei: "Texti teikningarinnar er lesinn einu sinni með OCR. EI-30 og EI-60 merkin eru fest á næsta vegg sem eldveggur og brunahólfin reiknuð út frá þeim. EI-CS (reykþétt) telst ekki eldveggur.",
  taeki: "SLT og BRSL eru lesin úr sama texta og sett á táknin, ásamt búnaði í römmum (R, S, H, B) og skiltum. Tæki sem eru skráð hjá staðnum tengjast táknunum í stað þess að verða ný.",
  vista: "Óleiðrétt hæð vistast sjálfkrafa. Hæð sem þú hefur leiðrétt vistast aðeins ef þú velur „Bæta við nýju“. Allt verkferlið er eitt Afturkalla-skref.",
};

export type Spurning = { texti: string; skyring: string; svara: (s: "baeta" | "haetta") => void };

/** Línur í dílum frummyndar (sama kerfi og veggjaLinur) — fyrir mælingar á móti leiðréttingum Agnars. */
export type MaelLina = { p: number[]; t: number; tegund?: string };
export interface Maeling {
  cid: number;
  haedId: string;
  frum: { b: number; h: number };
  skurdur: { x: number; y: number; w: number; h: number } | null;
  skurdurFundinn: boolean;
  leid: string;
  /** Hráar línur greiningarinnar (eftir að tvítekningar ofan á föstum línum féllu) — FYRIR hreinsun. */
  hrar: MaelLina[];
  /** Eftir hreinsun (1–6), án hurða og án „utan húss". */
  hreinsadar: MaelLina[];
  hurdir: MaelLina[];
  /** Öll göt sem hurðagreiningin skoðaði, með prófunum (bogi, lína í bili, útveggur) og úrskurði. */
  kandidatar?: (MaelLina & { gm: number; gerd: string; laust: boolean; bogi: boolean; lina: boolean; utveggur: boolean; nidurstada: string | null })[];
  /** Það sem verkferlið skilar (veggir + gler + hurðir + eldveggir), fyrir vistun. */
  lokalinur: MaelLina[];
  fastar: number;
  talning: Record<string, unknown>;
  ms: Record<string, number>;
}

export interface SjalfvirktState {
  synilegt: boolean;
  keyrir: boolean;
  stodva: boolean;
  skref: Skref[];
  yfirlit: string | null;
  spurning: Spurning | null;
  /** Vistunin: null = ekki enn, „vistad", „haett" (ekki vistað), „villa" (vistun brást — Reyna aftur). */
  vistun: null | "vistar" | "vistad" | "haett" | "villa" | "stodvad";
  vistunTexti: string;
  /** „Reyna aftur" á vistun sem brást. */
  reynaAftur: (() => void) | null;
  maeling: Maeling | null;
  vikmorkTexti: string;
  byrja: () => void;
  setja: (id: SkrefId, s: Partial<Omit<Skref, "id" | "heiti">>) => void;
  stodvaKeyrslu: () => void;
  loka: () => void;
  set: (s: Partial<SjalfvirktState>) => void;
}

const nySkref = (): Skref[] => (Object.keys(SKREF_HEITI) as SkrefId[]).map((id) => ({ id, heiti: SKREF_HEITI[id], stada: "bida", texti: "" }));

export const useSjalfvirkt = create<SjalfvirktState>((set, get) => ({
  synilegt: false,
  keyrir: false,
  stodva: false,
  skref: nySkref(),
  yfirlit: null,
  spurning: null,
  vistun: null,
  vistunTexti: "",
  reynaAftur: null,
  maeling: null,
  vikmorkTexti: "",
  byrja: () =>
    set({ synilegt: true, keyrir: true, stodva: false, skref: nySkref(), yfirlit: null, spurning: null, vistun: null, vistunTexti: "", reynaAftur: null, maeling: null }),
  setja: (id, s) => set({ skref: get().skref.map((k) => (k.id === id ? { ...k, ...s } : k)) }),
  stodvaKeyrslu: () => {
    const sp = get().spurning;
    set({ stodva: true });
    if (sp) sp.svara("haetta");
  },
  loka: () => set({ synilegt: false }),
  set: (s) => set(s),
}));
