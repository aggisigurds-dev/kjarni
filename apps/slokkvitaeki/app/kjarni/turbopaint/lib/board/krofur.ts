import { MVS165 } from "./mvs165";

/* ÞARFAGREINING — hvað þarf húsnæðið?
 *
 * Reiknar kröfuna út frá gólffleti og notkunarflokki og ber hana saman við það
 * sem er komið á borðið. Allar tölur og heimildir koma frá Arnold
 * (brunavarna-sérfræðingi Slökkvitækis):
 *
 *   • Byggingarreglugerð 112/2012, gr. 9.4.3, 9.4.5, 9.4.6, 9.8.7
 *   • Brunamálastofnun 165.BR1 — val og staðsetning handslökkvitækja
 *   • Reglugerð 1068/2011 um slökkvitæki
 *
 * ⚠️ Þetta er LEIÐBEINANDI. Endanlegt samþykki brunavarna er hjá hönnuði og
 *    slökkviliði sveitarfélagsins — sérstaklega í byggingarleyfisskyldri
 *    framkvæmd. Það stendur í viðmótinu, ekki bara hér.
 */

export type Notkunarflokkur = 1 | 2 | 3 | 4 | 5 | 6;

export const NOTKUNARFLOKKAR: { gildi: Notkunarflokkur; heiti: string }[] = [
  { gildi: 1, heiti: "1 · Skrifstofur, iðnaður" },
  { gildi: 2, heiti: "2 · Verslun, samkomur" },
  { gildi: 3, heiti: "3 · Íbúðir" },
  { gildi: 4, heiti: "4 · Gisting" },
  { gildi: 5, heiti: "5 · Sjúkra- og vistheimili" },
  { gildi: 6, heiti: "6 · Leikskólar, skólar" },
];

export type Stada = "í lagi" | "vantar" | "óvíst";

export type Krafa = {
  bunadur: string;
  krafa: string;
  /** Fjöldi sem reglan krefst — null þegar krafan er ekki talnaleg. */
  þarf: number | null;
  komid: number;
  stada: Stada;
  rokstudningur: string;
  heimild: string;
};

export type TharfaInntak = {
  m2: number;
  flokkur: Notkunarflokkur;
  /** Slöngukefli eða úðakerfi á hæðinni helmingar slökkviþörfina. */
  keflaEdaUdakerfi: boolean;
  /** Talið af borðinu. */
  komid: {
    slokkvitaeki: number;
    kefli: number;
    skiltiSlokkvitaekis: number;
    skiltiKeflis: number;
    flottaskilti: number;
    utgangar: number;
    reykskynjarar: number;
  };
};

function stada(þarf: number | null, komid: number): Stada {
  if (þarf == null) return "óvíst";
  return komid >= þarf ? "í lagi" : "vantar";
}

export function greinaTharfir(inn: TharfaInntak): {
  krofur: Krafa[];
  slokkvigildi: number;
  m2: number;
  athugasemdir: string[];
} {
  const { m2, flokkur, keflaEdaUdakerfi, komid } = inn;
  const ath: string[] = [];

  /* Slökkvigildi: ≥ 0,065 × gólfflötur, aldrei undir 26A. Kefli/úðakerfi á
   * hæðinni helmingar ÞÖRFINA — en 26A lágmarkið og tveggja tækja krafan
   * standa óbreytt (165.BR1). */
  const grunn = m2 * MVS165.classAPerSquareMeter;
  const eftirHelmingun = keflaEdaUdakerfi ? grunn / 2 : grunn;
  const slokkvigildi = Math.max(MVS165.minClassA, Math.ceil(eftirHelmingun));

  /* Fjöldi tækja: slökkvigildið deilt á dæmigert 13A tæki (léttvatn 9 l),
   * aldrei færri en tvö á hæð. Undantekning: ≤100 m² og lítið brunaálag →
   * eitt tæki ≥13A dugar. Við gefum EKKI afslátt sjálfkrafa af brunaálagi —
   * það er mat sem forritið getur ekki tekið — heldur nefnum það. */
  const afReikningi = Math.ceil(slokkvigildi / MVS165.typicalClassA);
  const tharfTaeki = Math.max(MVS165.minDevicesPerFloor, afReikningi);
  if (m2 > 0 && m2 <= 100) {
    ath.push(
      "Undir 100 m²: sé brunaálag lítið dugar EITT tæki ≥13A (165.BR1). Krafan hér sýnir tvö — metið á staðnum."
    );
  }

  /* Slöngukefli: skylda í notkunarflokki 1–2 yfir 500 m². Í flokkum 4–6 fer
   * það eftir brunaálagi og er því sett sem "óvíst" fremur en tala. */
  const keflaSkylda = (flokkur === 1 || flokkur === 2) && m2 > 500;
  const keflaOvisst = flokkur >= 4;
  /* Drægni 25–30 m slanga + allt að 9 m buna → eitt kefli á hverja 35–40 m
   * byggingar, aldrei færri en tvö á stórri hæð. */
  const tharfKefli = keflaSkylda ? Math.max(2, Math.ceil(m2 / 900)) : 0;

  /* Reykskynjarar: notkunarflokkur 3 → minnst einn á hverja 80 m² og minnst
   * einn á hverri hæð. Í atvinnuhúsnæði er sjálfvirkt brunaviðvörunarkerfi
   * hannað sérstaklega — þar vísum við á brunahönnuð. */
  const tharfSkynjarar = flokkur === 3 ? Math.max(1, Math.ceil(m2 / 80)) : null;
  if (flokkur !== 3 && m2 > 0) {
    ath.push(
      "Stærra atvinnuhúsnæði: sjálfvirkt brunaviðvörunarkerfi er hannað sérstaklega — Arnold rýnir þekju en hönnun er brunahönnuðar."
    );
  }

  const krofur: Krafa[] = [
    {
      bunadur: "Handslökkvitæki",
      krafa: `${tharfTaeki} stk · samtals ≥ ${slokkvigildi}A`,
      þarf: tharfTaeki,
      komid: komid.slokkvitaeki,
      stada: stada(tharfTaeki, komid.slokkvitaeki),
      rokstudningur: keflaEdaUdakerfi
        ? `0,065 × ${Math.round(m2)} m² = ${Math.ceil(grunn)}A, helmingað vegna kefla/úðakerfis → ${slokkvigildi}A (aldrei < 26A). Gönguleið ≤ 25 m.`
        : `0,065 × ${Math.round(m2)} m² = ${slokkvigildi}A (aldrei < 26A). Gönguleið að næsta tæki ≤ 25 m, minnst 2 tæki á hæð.`,
      heimild: "165.BR1 · byggingarreglugerð gr. 9.4.5",
    },
    {
      bunadur: "Slöngukefli",
      krafa: keflaSkylda ? `${tharfKefli} stk` : keflaOvisst ? "Fer eftir brunaálagi" : "Ekki skylda",
      þarf: keflaSkylda ? tharfKefli : null,
      komid: komid.kefli,
      stada: keflaSkylda ? stada(tharfKefli, komid.kefli) : keflaOvisst ? "óvíst" : "í lagi",
      rokstudningur: keflaSkylda
        ? `Notkunarflokkur ${flokkur} yfir 500 m². Drægni 25–30 m slanga + 9 m buna — öll horn verða að nást; ≈ eitt kefli á 35–40 m.`
        : keflaOvisst
          ? `Notkunarflokkur ${flokkur}: krafa metin af brunaálagi, ekki flatarmáli einu.`
          : `Notkunarflokkur ${flokkur} undir 500 m² — ekki skylda skv. gr. 9.4.6.`,
      heimild: "byggingarreglugerð gr. 9.4.6 · HMS-leiðbeining",
    },
    {
      bunadur: "Skilti slökkvitækja (F001)",
      krafa: `${tharfTaeki} stk — eitt yfir hverju tæki`,
      þarf: tharfTaeki,
      komid: komid.skiltiSlokkvitaekis,
      stada: stada(tharfTaeki, komid.skiltiSlokkvitaekis),
      rokstudningur:
        "Hvert tæki merkt stöðluðu skilti, sýnilegt óháð almennri lýsingu. Skilti án tækis er frávik í úttekt.",
      heimild: "gr. 9.8.7 · ISO 7010 F001",
    },
    {
      bunadur: "Skilti slöngukefla (F002)",
      krafa: keflaSkylda ? `${tharfKefli} stk` : "Eitt yfir hverju kefli",
      þarf: keflaSkylda ? tharfKefli : komid.kefli || null,
      komid: komid.skiltiKeflis,
      stada: stada(keflaSkylda ? tharfKefli : komid.kefli || null, komid.skiltiKeflis),
      rokstudningur: "Hvert kefli merkt; keflið rautt, miðja 1–1,5 m frá gólfi.",
      heimild: "gr. 9.8.7 · ISO 7010 F002",
    },
    {
      bunadur: "Flóttaleiðaskilti (E001/E002)",
      krafa: komid.utgangar ? `${komid.utgangar} stk — eitt á hvern útgang` : "Eitt á hvern útgang",
      þarf: komid.utgangar || null,
      komid: komid.flottaskilti,
      stada: stada(komid.utgangar || null, komid.flottaskilti),
      rokstudningur:
        "Grænt skilti yfir/við hverja flóttaleið og útgang; stefnuörvar þar sem leiðin er ekki augljós.",
      heimild: "gr. 9.8.7 · ISO 7010 E001/E002",
    },
    {
      bunadur: "Reykskynjarar",
      krafa: tharfSkynjarar ? `${tharfSkynjarar} stk` : "Skv. hönnun kerfis",
      þarf: tharfSkynjarar,
      komid: komid.reykskynjarar,
      stada: tharfSkynjarar ? stada(tharfSkynjarar, komid.reykskynjarar) : "óvíst",
      rokstudningur: tharfSkynjarar
        ? `Notkunarflokkur 3: minnst einn á hverja 80 m² og einn á hverri hæð. ≥ 75 dB(A) í svefnherbergjum.`
        : "Atvinnuhúsnæði: sjálfvirkt brunaviðvörunarkerfi hannað sérstaklega.",
      heimild: "byggingarreglugerð gr. 9.4.3–9.4.4",
    },
  ];

  return { krofur, slokkvigildi, m2, athugasemdir: ath };
}
