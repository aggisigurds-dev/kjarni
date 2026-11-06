// Vafraleið veggjagreiningar skönnunar: teikningin á borðinu → grátóna vinnumynd af húsinu (skurði hæðarinnar) í föstum
// kvarða blaðsins → skonnunarVeggir (í vinnuþræði) → veggir í borðhnitum. Sama greining og Teikning-glugginn (383).

import { getAssetBlob } from "./assets";
import {
  butarIBord,
  graTonar,
  greiningarSvaedi,
  skonnunarVeggir,
  type SkonnunarVeggir,
  type Talning,
} from "./skonnun-veggir";
import { bakgrunnsTonn, finnaThunnaVeggi, maelaHallaMyndar } from "./thunnir-veggir";
import { SJALFGEFIN_VIKMORK } from "./veggja-hreinsun";
import type { VeggTegund } from "./teikning-veggir";
import type { ImageObject } from "./types";
import { anda } from "./anda";

export interface VeggirSkonnunar {
  /** Veggir og gler í borðhnitum (miðlína + þykkt + tegund). */
  veggir: { p: number[]; t: number; tegund?: VeggTegund }[];
  talning: Talning;
  ms: number;
}

const andaUI = anda;

/** Grátónamynd svæðisins: minnkað í helmingsþrepum (stór minnkun í einu skrefi tekur fáa díla — sbr. skonnun.ts). */
async function vinnumynd(bmp: ImageBitmap, g: ReturnType<typeof greiningarSvaedi>): Promise<Uint8Array> {
  {
    const u = g.uppspretta;
    let src: CanvasImageSource = bmp;
    let sx = u.x, sy = u.y, sw = u.w, sh = u.h;
    while (sw > g.W * 2 || sh > g.H * 2) {
      const nw = Math.max(g.W, Math.ceil(sw / 2)), nh = Math.max(g.H, Math.ceil(sh / 2));
      const c = document.createElement("canvas");
      c.width = nw;
      c.height = nh;
      const x = c.getContext("2d");
      if (!x) throw new Error("Gat ekki opnað striga");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, nw, nh);
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = "high";
      x.drawImage(src, sx, sy, sw, sh, 0, 0, nw, nh);
      if (src instanceof HTMLCanvasElement) {
        src.width = 0;
        src.height = 0;
      }
      src = c;
      sx = 0;
      sy = 0;
      sw = nw;
      sh = nh;
      await andaUI();
    }
    const c = document.createElement("canvas");
    c.width = g.W;
    c.height = g.H;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) throw new Error("Gat ekki opnað striga");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, g.W, g.H);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(src, sx, sy, sw, sh, 0, 0, g.W, g.H);
    if (src instanceof HTMLCanvasElement) {
      src.width = 0;
      src.height = 0;
    }
    const gra = graTonar(x.getImageData(0, 0, g.W, g.H).data, g.W, g.H);
    c.width = 0;
    c.height = 0;
    return gra;
  }
}

/** Keyrir greininguna í vinnuþræði; á aðalþræðinum ef þráðurinn fæst ekki. */
function keyra(gra: Uint8Array, W: number, H: number, kvardi: number, fb: number, fh: number, dilarAMetra: number | null): Promise<SkonnunarVeggir> {
  let w: Worker | null = null;
  try {
    w = new Worker(new URL("./skonnun-veggir-verk.ts", import.meta.url));
  } catch {
    w = null;
  }
  if (!w) return Promise.resolve(skonnunarVeggir(gra, W, H, kvardi, fb, fh, { dilarAMetra }));
  const verk = w;
  return new Promise<SkonnunarVeggir>((res, rej) => {
    verk.onmessage = (e: MessageEvent<SkonnunarVeggir & { villa?: string }>) => {
      verk.terminate();
      if (e.data.villa) rej(new Error(e.data.villa));
      else res(e.data);
    };
    verk.onerror = (e) => {
      verk.terminate();
      // vinnuþráðurinn ræstist ekki (t.d. gamall vafri) — reikna hér í staðinn
      try {
        res(skonnunarVeggir(gra, W, H, kvardi, fb, fh, { dilarAMetra }));
      } catch (err) {
        rej(err instanceof Error ? err : new Error(e.message || "Veggjagreining mistókst"));
      }
    };
    verk.postMessage({ id: 1, gra, W, H, kvardi, fb, fh, dilarAMetra });
  });
}

/** Þunnir veggir (tvöföld hárfín lína sem rennur saman í ~0,15 m rák á skönnuninni) á skannaðri teikningu — borðhnit.
 * Mynd svæðisins er greind í ~50 dílum á metra (ekki 2800 dílum á blaðið eins og veggjagreiningin: þar hverfur rákin).
 * Finnur líka málsetningarlínur og rekkabrúnir — hreinsunin og „utan húss" fella þær sem tengjast ekki húsinu. */
export async function greinaThunnaVeggi(plan: ImageObject, dpmBord: number): Promise<{ p: number[]; t: number; tegund?: VeggTegund }[]> {
  const blob = getAssetBlob(plan.assetId);
  if (!blob || !(dpmBord > 0) || !(plan.width > 0)) return [];
  const bmp = await createImageBitmap(blob);
  const g0 = greiningarSvaedi(plan, { w: bmp.width, h: bmp.height });
  const dpmFrum = dpmBord * (g0.myndSvaedi.w / plan.width);
  // ≤ 50 dílar á metra og ≤ 40 MP. TOPPURINN ER 4 × W·H bæti (160 MB á þakinu), MÆLT AF LISBETH 05.11.2026: grátónamyndin
  // hér, dökk-gríman, EIN afleidd gríma (skekkt eða umsnúin — skekkta er sleppt áður en umsnúna verður til) og rof-gríman `e`
  // sem leitaRaka úthlutar sjálft. Var 5 × W·H áður en skekkta gríman var sett í eigið svið. TurboPaint keyrir í iframe á
  // síma, svo hækki einhver þakið á það að fara í kerfisrýni fyrst (verk e13288e6).
  let k = Math.min(1, 50 / dpmFrum);
  const mp = g0.sk.w * g0.sk.h * k * k;
  if (mp > 40e6) k *= Math.sqrt(40e6 / mp);
  const g = { ...g0, kvardi: k, W: Math.max(1, Math.round(g0.sk.w * k)), H: Math.max(1, Math.round(g0.sk.h * k)) };
  let gra: Uint8Array;
  try {
    gra = await vinnumynd(bmp, g);
  } finally {
    bmp.close();
  }
  await andaUI();
  const th = finnaThunnaVeggi(gra, g.W, g.H, { dpm: dpmFrum * k });
  const frum = th.map((v) => [v[0] / k, v[1] / k, v[2] / k, v[3] / k, v[4] / k] as number[]);
  return butarIBord(frum, g, plan);
}

/** SVIGRÚM Á HALLANUM (Agnar 05.11.2026: „geturðu ekki sett smá buffer á lesinguna, 1% halli leyfður eða álíka").
 *
 * Talan er EKKI 1%. 1% halli er 0,57°, og blaðið sem allt þetta snýst um — Nesdekk Breiðhöfði 13 2. hæð — mælist 0,63°:
 * 1% svigrúm hefði gleypt nánast allt tilefnið. Í staðinn er þröskuldurinn leiddur af appinu sjálfu: hallinn skiptir máli
 * þegar hann færir langan vegg MEIRA en smellivikmörkin — `SJALFGEFIN_VIKMORK.smellaM`, FLUTT INN en ekki tvítekið hér,
 * svo talan fylgi ef því vikmarki er breytt. Neðan við það smellur veggurinn samt á sinn stað.
 *
 * LENGDIN KEMUR ÚR BLAÐINU, ekki úr fastri tölu. Fyrsta útgáfan notaði 40 m og það var rangt í hættulegu áttina
 * (Lisbeth 05.11.2026): á 121 m blaði — sem er raunstærðin hér, 6006 dílar — felur 0,21° heilar 45 cm færslu, þrefalt
 * smellivikmarkið, á meðan viðmótið lofaði að hallinn breytti engu. Á 121 m gefur reglan 0,071°, og hittir samt bæði
 * lifandi gildin: 1. hæð 0,07° (hornrétt) og 2. hæð 0,63° (skökk). Vikmörkin á 1. hæð verða þá 0,001°, svo endurmæling
 * sem gefur 0,08° og flettir yfir í „skakkt" er RÉTT, ekki bilun.
 *
 * ÞETTA GILDIR AÐEINS UM TÖLUNA SEM NOTANDINN SÉR OG GETUR TEKIÐ. `maelaHallaMyndar` sjálft fær ENGAN þröskuld: þar er
 * leitað í röðum á 6006 díla blaði þar sem 0,07° dregur rákina 7 díla — meira en þykkt hennar — svo þar munar um hvert
 * brot úr gráðu. Vélin heldur því áfram að leiðrétta sig nákvæmt þótt viðmótið segi „hornrétt". */
/** Styttri en 10 m blöð fá ekki 0,86° svigrúm — neðri klemma svo lítið blað verði ekki undanþegið. */
export const HALLA_VIDMID_M = 10;
export function hallaThroskuldur(metrar: number): number {
  const L = Math.max(HALLA_VIDMID_M, metrar > 0 ? metrar : HALLA_VIDMID_M);
  return (Math.atan(SJALFGEFIN_VIKMORK.smellaM / L) * 180) / Math.PI;
}
/** Óháð blaði — notað þar sem lengdin er óþekkt (t.d. texti í viðmóti áður en mælt er). */
export const HALLA_THROSKULDUR = hallaThroskuldur(HALLA_VIDMID_M);

/** HALLI BLAÐSINS Í GRÁÐUM, mældur á MYNDINNI sjálfri — ekki á veggjunum sem þegar liggja á borðinu.
 *
 * AGNAR 05.11.2026: „skannaða blaðið þarna er aðeins skakt, svo allar línur þurfa að vera ööööörlítið á ská."
 * Fyrsta útgáfa stillingarinnar „Halli blaðsins" mældi `maelaSkekkju` á veggjunum á borðinu — en Agnar teiknar sína
 * veggi ásrétta, svo stillingin sagði „beint" á blaði sem er mælanlega 0,57° skakkt (Nesdekk Breiðhöfði 13 2. hæð,
 * staðfest á lifandi vefnum). Það var einmitt það sem hann var að reyna að laga, svo talan verður að koma úr blaðinu.
 *
 * Hallinn er stórsæ stærð: 1600 dílar á langhliðina gefa ~0,02° upplausn (skrefið í maelaHallaMyndar er 0,00025) og
 * kosta tvo litla W·H buffera — margfalt ódýrara en greiningarmyndin, svo þetta má keyra þegar notandinn opnar
 * stillinguna sjálfur. Skilar GRÁÐUM í sömu átt og `maelaSkekkju` (lína sem hallar niður til hægri er negatíf):
 * `maelaHallaMyndar` skilar `t` þannig að lárétt lína blaðsins uppfylli `y + t·x = c`, svo hallatalan er `−t`.
 * 0 ef ekkert sker sig úr, og 0 líka ef hallinn er undir `HALLA_THROSKULDUR` (sjá þar). */
export async function maelaHallaBlads(plan: ImageObject, dpmFrum?: number | null): Promise<number | null> {
  // BROSTINN LESTUR ER EKKI „HORNRÉTT" (Lisbeth 05.11.2026): hydrateAssets fyllir blob-mapið ósamhverft úr IndexedDB, svo
  // blaðið getur verið ólesið þegar spjaldið opnast. Skilaði þetta 0 sagði viðmótið „blaðið mælist hornrétt" um mælingu
  // sem var aldrei gerð. `null` = náðist ekki að mæla; 0 = mælt og beint.
  const blob = getAssetBlob(plan.assetId);
  if (!blob || !(plan.width > 0)) return null;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const g0 = greiningarSvaedi(plan, { w: bmp.width, h: bmp.height });
  const k = Math.min(1, 1600 / Math.max(g0.sk.w, g0.sk.h));
  const g = { ...g0, kvardi: k, W: Math.max(1, Math.round(g0.sk.w * k)), H: Math.max(1, Math.round(g0.sk.h * k)) };
  let gra: Uint8Array;
  try {
    gra = await vinnumynd(bmp, g);
  } finally {
    bmp.close();
  }
  await andaUI();
  const t = await hallaIThraedi(gra, g.W, g.H);
  if (t == null) return null;
  const gradur = t ? -(Math.atan(t) * 180) / Math.PI : 0;
  // Þröskuldurinn fer eftir LENGSTA VEGG BLAÐSINS, ekki fastri tölu (Lisbeth 05.11.2026): á 121 m blaði fól fasta 40 m
  // viðmiðið 45 cm færslu — þrefalt smellivikmarkið — á meðan viðmótið lofaði „minna en smellivikmörkin".
  const metrar = dpmFrum && dpmFrum > 0 ? Math.max(g0.sk.w, g0.sk.h) / dpmFrum : 0;
  return Math.abs(gradur) < hallaThroskuldur(metrar) ? 0 : gradur;
}

/** Hallamælingin í vinnuþræði; á aðalþræðinum aðeins ef þráðurinn fæst ekki (gamall vafri). Skilar `null` ef hvorugt gekk. */
function hallaIThraedi(gra: Uint8Array, W: number, H: number): Promise<number | null> {
  let w: Worker | null = null;
  try {
    w = new Worker(new URL("./skonnun-veggir-verk.ts", import.meta.url));
  } catch {
    w = null;
  }
  const aAdalthraedi = () => {
    try {
      const thr = bakgrunnsTonn(gra) - 16;
      const m = new Uint8Array(W * H);
      for (let i = 0; i < m.length; i++) m[i] = gra[i] < thr ? 1 : 0;
      return maelaHallaMyndar(m, W, H);
    } catch {
      return null;
    }
  };
  if (!w) return Promise.resolve(aAdalthraedi());
  const verk = w;
  return new Promise<number | null>((res) => {
    verk.onmessage = (e: MessageEvent<{ halli?: number; villa?: string }>) => {
      verk.terminate();
      res(typeof e.data.halli === "number" ? e.data.halli : null);
    };
    verk.onerror = () => {
      verk.terminate();
      res(aAdalthraedi());
    };
    verk.postMessage({ verk: "halli", id: 1, gra, W, H }, [gra.buffer]);
  });
}

/** Veggir skannaðrar teikningar (sama greining og Teikning-glugginn) í borðhnitum. Gler fylgir sem tegundin „gler";
 * hurðargötin ekki — Teikning finnur þau sjálf úr bilunum. `dpmBord` = kvarði borðsins (borðdílar á metra) — síun
 * veggjanna (þykktarþak, mynstur) miðast við hann; vantar hann er 1:100 reiknað af stærð blaðsins. */
export async function greinaVeggiSkonnunar(plan: ImageObject, onProgress?: (percent: number) => void, dpmBord?: number | null): Promise<VeggirSkonnunar> {
  const t0 = performance.now();
  const blob = getAssetBlob(plan.assetId);
  if (!blob) throw new Error("Teikningin er ekki í minni — opnaðu borðið aftur");
  onProgress?.(10);
  const bmp = await createImageBitmap(blob);
  const g = greiningarSvaedi(plan, { w: bmp.width, h: bmp.height });
  onProgress?.(20);
  let gra: Uint8Array;
  try {
    gra = await vinnumynd(bmp, g);
  } finally {
    bmp.close();
  }
  onProgress?.(40);
  // borðdílar á metra → dílar frummyndar á metra (myndin á borðinu sýnir myndSvaedi af frummyndinni)
  const dpmFrum = dpmBord && dpmBord > 0 && plan.width > 0 ? dpmBord * (g.myndSvaedi.w / plan.width) : null;
  const r = await keyra(gra, g.W, g.H, g.kvardi, g.frum.b, g.frum.h, dpmFrum);
  onProgress?.(95);
  const veggir = [
    ...butarIBord(r.veggir, g, plan),
    ...butarIBord(r.gler, g, plan).map((v) => ({ ...v, tegund: "gler" as VeggTegund })),
  ];
  const ms = Math.round(performance.now() - t0);
  return { veggir, talning: { ...r.talning, ms }, ms };
}
