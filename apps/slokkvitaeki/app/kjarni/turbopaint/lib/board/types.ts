export type Tool =
  | "select"
  | "hand"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "polyline"
  | "pen"
  | "text"
  | "sticky"
  | "symbol"
  | "measure"
  | "calibrate"
  | "firewall"
  | "eraser"
  | "crop"
  | "hvitta"
  | "hvitpensill"
  | "eydalinu"
  | "room"
  | "checkbox"
  | "fjolcrop";

export type ImportQuality = "fast" | "standard" | "print";

export type LineKind = "line" | "arrow" | "polyline" | "pen" | "measure";

export type DashStyle = "solid" | "dashed" | "dotted";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface ImportProgress {
  fileName: string;
  percent: number;
  message: string;
}

interface BaseObject {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  name: string;
  /** When set, this object moves with the imported page (image) it belongs to. */
  parentId?: string;
  /** Objects sharing a groupId select and move as one unit (Hópa / ⌘G). */
  groupId?: string;
  /** Named drawing / piping layer (`teikning`, `almennt`, `kalt`, …). */
  layerId?: string;
}

export interface ImageObject extends BaseObject {
  type: "image";
  assetId: string;
  width: number;
  height: number;
  /** Pixels per PDF point when the page was rasterized (viewport.scale). */
  pixelsPerPdfPoint?: number;
  /** Upprunalega skráin (TIF / PDF) í fullri upplausn — fyrir greiningu (veggir, litir, texti). Skjámyndin
   * (assetId) er klemmd við 40 MP svo síminn ráði við hana; frumskráin er það ekki. Sótt aðeins þegar þarf. */
  frumAssetId?: string;
  frumNafn?: string;
  /** Síða í frumskránni (PDF-síða eða TIF-IFD), 0-talið. */
  frumSida?: number;
  /** Svæði sem notandinn hvíttaði („Hreinsa svæði"), í hlutföllum myndarinnar (0–1). Veggjagreining hunsar þau. */
  hvittad?: { x: number; y: number; w: number; h: number }[];
  /** Tenging við úttektarteikningu Slökkvitæki-appsins (lib/board/uttekt.ts). */
  uttekt?: UttektTenging;
  /** Hvaðan teikningin kom (skjalasafnsslóð — permalink eða bein PDF-slóð) og stærð alls blaðsins á borðinu við
   * innflutning. 3D les blaðstærðina (teikn-blad) og fær þannig raunkvarða í 1:100; skurður síðar breytir ekki b/h. */
  heimild?: { slod: string; b: number; h: number };
  /** Hluti af blaði („Croppa oft", Agnar 06.10.2026: 1–3 grunnmyndir hlið við hlið á EINU blaði): myndin var skorin úr
   * blaðinu og man hvaðan — svæðið í dílum FRUMMYNDAR, stærð frummyndar og slóð blaðsins í sniði teikning_bord. „Tengja
   * við hæð" gerir úr þessu úttektartengingu (uttekt.myndSkurdur = svaedi). */
  bladhluti?: BladHluti;
}

/** Hluti af blaði (sjá ImageObject.bladhluti). */
export interface BladHluti {
  /** Númer hlutans í „Croppa oft" (1, 2, 3 …) — merkið á myndinni meðan hún er ótengd. */
  nr: number;
  /** Svæði blaðsins sem myndin sýnir, dílar frummyndar (heiltölur). */
  svaedi: { x: number; y: number; w: number; h: number };
  frumB: number;
  frumH: number;
  /** image_url blaðsins í teikning_bord (`/.netlify/functions/teikn-mynd?url=<permalink>`) — sama strengur og hæðin
   * sem var opnuð ber, svo hæðir á sama blaði beri sömu slóð. Vantar = ekki hægt að stofna nýja hæð af hlutanum. */
  imageUrl?: string | null;
  /** Staðurinn (fyrirtaeki.id) sem blaðið var opnað úr. */
  companyId?: number;
}

/** Mynd á borðinu ↔ hæð í teikning_bord. frumB/frumH = stærð frummyndar; skurdur = svæði hússins á blaðinu
 * (dílar frummyndar) — borðið opnast rammað á það og dekkir utan við, myndin sjálf er ósnert. */
export interface UttektTenging {
  companyId: number;
  haedId: string;
  frumB: number;
  frumH: number;
  skurdur?: { x: number; y: number; w: number; h: number } | null;
  /** Myndin á borðinu er SKORIN úr blaðinu („Croppa oft" / „Croppa teikningu"): svæði blaðsins sem hún sýnir, dílar
   * frummyndar. Öll hnit fara þá um skurðinn: frum = myndSkurdur.x + (borðX − mynd.x) / mynd.width · myndSkurdur.w.
   * Vantar = myndin er allt blaðið (eins og áður). */
  myndSkurdur?: { x: number; y: number; w: number; h: number } | null;
  /** Hæðin er NÝ — stofnuð með „Tengja við hæð → + Ný hæð" og ekki enn til í teikning_bord. „Vista í úttekt" bætir
   * henni við (aftast) og fjarlægir þetta merki. */
  nyHaed?: { nafn: string };
  /** Lyklar merkjanna (unitId) sem borðið sýnir af hæðinni — sett við opnun og eftir hverja vistun. Merki á listanum
   * sem er horfið af borðinu var tekið af teikningunni og fer úr hæðinni við vistun; merki sem bættist við í appinu
   * eftir opnun (ekki á listanum) er látið í friði. Vantar (eldra borð) = ekkert er fjarlægt. */
  merki?: string[];
  /** „Stærð allra merkja" (Agnar 07.10.2026): sjálfgefin stærð merkja hæðarinnar í skjápunktum Teikning-gluggans
   * (= `stimpilStaerd` hæðarinnar, 10–160). Tákn á borðinu eru `stimpilStaerd · taknEining` borðdílar (eða eigin
   * `staerd` merkis · taknEining). Vantar (eldra borð) = gamla stærðarreglan (stimpilstærð TurboPaint). */
  stimpilStaerd?: number;
  /** `stimpilStaerd` hæðarinnar við opnun / síðustu vistun — vistun skrifar `stimpilStaerd` aðeins ef hún breyttist. */
  stimpilStaerdVid?: number;
  /** Borðdílar á hvern skjádíl Teikning-gluggans (sett við opnun/tengingu: lengri hlið hússins ÷ 28 = 56 px). Geymt svo
   * stærðirnar haldist þótt skurður myndarinnar breytist síðar („Croppa teikningu"). */
  taknEining?: number;
  /** `skurdur` var fundinn af sjálfvirka verkferlinu (húsið á blaðinu) — „Vista í úttekt" skrifar hann í hæðina. */
  skurdurSjalfvirkt?: boolean;
}

export interface RectObject extends BaseObject {
  type: "rect";
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  /** Rými í fermetratöku: birtist í RÝMI-kafla Magntöflunnar með m². */
  isRoom?: boolean;
  /** Rými sem telst EKKI með í nettó (svalir, geymsla, bílskúr …). */
  roomExcluded?: boolean;
  /** False = sleppa rýminu úr magntöflu (númer 1, 2, 3 og m²-lína). Vantar = talið. */
  roomCounted?: boolean;
  /** Fill-alpha for the room wash (0–1). Stroke and labels stay solid. */
  roomOpacity?: number;
  /** Leiðbeinandi fjöldi gata sem eftir eru í rýminu (heil tala ≥ 0). */
  roomGataCount?: number;
  /** Gátreitur: hakreitur með ✓-merki í horni sem grænkar þegar hakað er. */
  isCheckbox?: boolean;
  /** Veggbútur greindur úr teikningunni (lag „Veggir"). Endurgreining skiptir þeim út; handteiknaðir haldast. */
  veggur?: boolean;
  checked?: boolean;
}

export interface EllipseObject extends BaseObject {
  type: "ellipse";
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface LineObject extends BaseObject {
  type: LineKind;
  points: number[];
  stroke: string;
  strokeWidth: number;
  dash: DashStyle;
  /** Innslegin RAUN-lengd í metrum (Kvarði) — yfirskrifar reiknaða lengd á merkimiða. */
  meters?: number;
  /** Greindur veggur (miðlína úr veggjagreiningu; strokeWidth = þykkt veggjarins). */
  veggur?: boolean;
  /** Tegund veggjar (leiðrétting): venjulegur veggur, glerveggur/gluggi, hurð eða eldveggur EI-60 / EI-30. Vantar = veggur. */
  veggTegund?: "veggur" | "gler" | "hurd" | "ei60" | "ei30";
  /** Veggurinn kom úr „Greina veggi" — auðkenni lotunnar (`g<tími36>`), svo hægt sé að eyða einni greiningu í heild. */
  greining?: string;
}

export interface TextObject extends BaseObject {
  type: "text";
  text: string;
  fontSize: number;
  fill: string;
  width: number;
  fontStyle: "normal" | "bold";
  align: "left" | "center";
}

export interface StickyObject extends BaseObject {
  type: "sticky";
  text: string;
  width: number;
  height: number;
  fill: string;
  fontSize: number;
}

export interface SymbolObject extends BaseObject {
  type: "symbol";
  symbolId: string;
  size: number;
  label: string;
  /** Tenging við úttektarteikninguna (lib/board/uttekt.ts): uttaeki.id tækisins, eða stimpils-id Teikning-gluggans
   * (`s:<merki>:<id>`). Vantar = tákn sem notandinn setti sjálfur. */
  uttektUnitId?: number | string;
  /** `kind` merkisins í teikning_bord — „sign" á stimplum. */
  uttektKind?: string;
  /** Stimpill Teikning-gluggans (neyðarútgangur, ut, hose, rafmagn, skilti_slt …). Á ótengdu tákni = stimpillinn sem
   * það vistast sem (valið í „Merki" í tækjalistanum). */
  uttektSign?: string;
  /** Stærð táknsins (borðdílar) þegar það kom úr úttektinni eða var sett — breytist hún hefur notandinn stækkað/minnkað
   * táknið og ný `staerd` vistast í merkið. */
  uttektPx?: number;
  /** `color` merkisins í teikning_bord — plötuliturinn eins og Teikning-glugginn teiknar hann. */
  uttektLitur?: string;
  /** Tæki sem „SLT / BRSL af teikningu" setti: `slt` = slökkvitæki án ákveðinnar tegundar, `brsl` = brunaslanga.
   * Tenging þess (uttektUnitId) er BRÁÐABIRGÐA þar til vistað er — „Vista í úttekt" úthlutar upp á nýtt (tákn með
   * tegund fyrst, svo SLT, svo BRSL; sjalftenging.ts uthlutaTaekjum) og tekur merkið af. */
  sltLestur?: "slt" | "brsl";
}

export type BoardObject =
  | ImageObject
  | RectObject
  | EllipseObject
  | LineObject
  | TextObject
  | StickyObject
  | SymbolObject;

export interface BoardDocument {
  version: 1 | 2;
  name: string;
  objects: BoardObject[];
  camera: Camera;
  pixelsPerMeter: number | null;
  grid: boolean;
  snap: boolean;
  assetIds: string[];
  /** Frumskrár teikninga (TIF/PDF). Vistaðar í skýið en EKKI sóttar við opnun borðs — aðeins í greiningu. */
  frumAssetIds?: string[];
  /** Named plumbing / drawing layers. Missing on older boards. */
  layers?: import("./layers").BoardLayer[];
  /** Id of the layer new strokes land on. */
  activeLayerId?: string;
  /** Board id when synced across devices (turbopaint_boards.id). */
  boardId?: string;
  /** ISO timestamp of the last local save — last-write-wins between devices. */
  updatedAt?: string;
  /** Sync-samningur klientsins. 2 = efnis-stimplun (PR #59+). Pull hunsar
   * skjöl án syncRev — þau koma frá eldri, óöruggum klientum. */
  syncRev?: number;
}

export const IMPORT_MAX_PX: Record<ImportQuality, number> = {
  fast: 3200,
  standard: 7200,
  print: 12500,
};

export const STROKE_PRESETS = ["#1c1917", "#FE653F", "#16a34a", "#2563eb", "#ca8a04", "#7c3aed", "#ffffff"];
export const FILL_PRESETS = [
  "transparent",
  "#FE653F33",
  "#16a34a33",
  "#2563eb33",
  "#fde047",
  "#86efac",
  "#93c5fd",
  "#f9a8d4",
  "#fdba74",
  "#ffffff",
];
export const STICKY_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4", "#fdba74", "#e7e5e4"];
export const STROKE_WIDTHS = [1, 2, 4, 8, 12, 18];
