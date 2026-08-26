import { newId } from "./ids";
import { putAsset } from "./assets";
import type { BoardObject, SymbolObject, TextObject } from "./types";

function floorplanSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1120" viewBox="0 0 1800 1120">
  <rect width="1800" height="1120" fill="#f7f4ee"/>
  <g stroke="#c4bdb0" stroke-width="1" fill="none">
    ${Array.from({ length: 36 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="1120"/>`).join("")}
    ${Array.from({ length: 23 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="1800" y2="${i * 50}"/>`).join("")}
  </g>
  <rect x="80" y="70" width="1640" height="980" fill="#fff" stroke="#1c1917" stroke-width="8"/>
  <rect x="80" y="70" width="420" height="360" fill="#f4efe6" stroke="#1c1917" stroke-width="6"/>
  <rect x="500" y="70" width="540" height="360" fill="#eef4f0" stroke="#1c1917" stroke-width="6"/>
  <rect x="1040" y="70" width="680" height="360" fill="#f3eee8" stroke="#1c1917" stroke-width="6"/>
  <rect x="80" y="430" width="280" height="280" fill="#eef2f7" stroke="#1c1917" stroke-width="6"/>
  <rect x="360" y="430" width="360" height="280" fill="#f7f1ea" stroke="#1c1917" stroke-width="6"/>
  <rect x="720" y="430" width="420" height="280" fill="#f6f0e6" stroke="#1c1917" stroke-width="6"/>
  <rect x="1140" y="430" width="280" height="280" fill="#ece7df" stroke="#1c1917" stroke-width="6"/>
  <rect x="1420" y="430" width="300" height="280" fill="#e8f0ec" stroke="#1c1917" stroke-width="6"/>
  <rect x="80" y="710" width="1640" height="340" fill="#faf8f3" stroke="#1c1917" stroke-width="6"/>
  <rect x="80" y="710" width="520" height="340" fill="#f3eee6" stroke="#1c1917" stroke-width="6"/>
  <rect x="1260" y="710" width="460" height="340" fill="#eef3f7" stroke="#1c1917" stroke-width="6"/>
  <g fill="#fff" stroke="#1c1917" stroke-width="6">
    <rect x="248" y="424" width="84" height="14"/>
    <rect x="688" y="424" width="84" height="14"/>
    <rect x="1228" y="424" width="84" height="14"/>
    <rect x="1548" y="424" width="72" height="14"/>
    <rect x="74" y="548" width="14" height="84"/>
    <rect x="1714" y="548" width="14" height="84"/>
    <rect x="248" y="704" width="84" height="14"/>
    <rect x="868" y="704" width="110" height="14"/>
    <rect x="1488" y="704" width="84" height="14"/>
    <rect x="860" y="1044" width="140" height="14"/>
  </g>
  <g fill="none" stroke="#1c1917" stroke-width="3">
    <path d="M200 200 h90 v70 h-90 z"/>
    <path d="M200 290 h90 v70 h-90 z"/>
    <path d="M330 200 h90 v160 h-90 z"/>
    <path d="M580 160 h120 v70"/>
    <path d="M760 160 h120 v70"/>
    <path d="M1180 180 h90 v90 h-90 z"/>
    <path d="M1340 180 h90 v90 h-90 z"/>
    <path d="M1500 180 h90 v90 h-90 z"/>
    <path d="M1180 290 h90 v90 h-90 z"/>
    <path d="M1340 290 h90 v90 h-90 z"/>
    <path d="M1500 290 h90 v90 h-90 z"/>
    <rect x="420" y="470" width="70" height="200"/>
    <rect x="500" y="470" width="70" height="200"/>
    <rect x="580" y="470" width="70" height="200"/>
    <rect x="160" y="780" width="140" height="90"/>
    <rect x="330" y="780" width="140" height="90"/>
    <rect x="160" y="900" width="310" height="90"/>
    <rect x="1320" y="780" width="340" height="220"/>
  </g>
  <g font-family="Inter, Helvetica, Arial, sans-serif" fill="#44403c" text-anchor="middle">
    <text x="290" y="250" font-size="28" font-weight="600">Anddyri</text>
    <text x="770" y="250" font-size="28" font-weight="600">Skrifstofur</text>
    <text x="1380" y="250" font-size="28" font-weight="600">Fundarherbergi</text>
    <text x="220" y="575" font-size="24" font-weight="600">Tölvurými</text>
    <text x="540" y="575" font-size="24" font-weight="600">Lager</text>
    <text x="930" y="575" font-size="24" font-weight="600">Kaffistofa</text>
    <text x="1280" y="575" font-size="22" font-weight="600">Snyrting</text>
    <text x="1570" y="575" font-size="22" font-weight="600">Tæknirými</text>
    <text x="340" y="870" font-size="28" font-weight="600">Verkstæði</text>
    <text x="900" y="880" font-size="28" font-weight="600">Gangur / flóttaleið</text>
    <text x="1490" y="870" font-size="26" font-weight="600">Bílgeymsla</text>
    <text x="900" y="64" font-size="18" fill="#78716c">Helluhraun 10 · 2. hæð · dæmi um gólfplön</text>
  </g>
  <g fill="none" stroke="#16a34a" stroke-width="4" stroke-dasharray="14 10">
    <path d="M900 1050 v-320 h-180 v-280 h-420 v-140 H80"/>
    <path d="M900 1050 v-320 h420 v-20 H1720"/>
  </g>
</svg>`;
}

function symbol(
  symbolId: string,
  x: number,
  y: number,
  label: string
): SymbolObject {
  return {
    id: newId(),
    type: "symbol",
    symbolId,
    x,
    y,
    size: 56,
    label,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: label,
  };
}

function note(x: number, y: number, text: string, fill: string): BoardObject {
  return {
    id: newId(),
    type: "sticky",
    x,
    y,
    width: 200,
    height: 140,
    text,
    fill,
    fontSize: 16,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Minnispunktur",
  };
}

function caption(x: number, y: number, text: string, size = 22): TextObject {
  return {
    id: newId(),
    type: "text",
    x,
    y,
    text,
    fontSize: size,
    fill: "#1c1917",
    width: 420,
    fontStyle: "bold",
    align: "left",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Texti",
  };
}

export async function createDemoBoard(): Promise<BoardObject[]> {
  const svg = new Blob([floorplanSvg()], { type: "image/svg+xml" });
  const assetId = newId();
  await putAsset(assetId, svg);
  const floorplan: BoardObject = {
    id: newId(),
    type: "image",
    assetId,
    x: 80,
    y: 80,
    width: 1800,
    height: 1120,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Gólfplön · 2. hæð",
  };

  return [
    floorplan,
    ...[
    symbol("extinguisher", 140, 140, "SLT-0421"),
    symbol("extinguisher", 430, 480, "SLT-0422"),
    symbol("extinguisher", 1680, 140, "SLT-0430"),
    symbol("extinguisher", 200, 780, "SLT-0431"),
    symbol("hose", 1600, 760, "Slöngureel"),
    symbol("alarm", 300, 140, "Hnappur"),
    symbol("alarm", 1080, 480, "Hnappur"),
    symbol("detector", 760, 160, "Reykskynjari"),
    symbol("detector", 1380, 160, "Reykskynjari"),
    symbol("detector", 900, 760, "Reykskynjari"),
    symbol("exit", 820, 980, "Aðalútgangur"),
    symbol("exit", 80, 520, "Neyðarútgangur"),
    symbol("assembly", 820, 1220, "Safnsvæði"),
    symbol("firstaid", 980, 500, "Skyndihjálp"),
    symbol("electric", 1560, 500, "Tafla"),
    symbol("firedoor", 680, 400, "EI30"),
    symbol("nosmoke", 1480, 760, "Reykingarbann"),
    symbol("blanket", 860, 500, "Teppi"),
    note(
      1920,
      120,
      "Árleg skoðun — merktu slökkvitæki, slöngur og flóttaleiðir beint á gólfplönið.",
      "#fde047"
    ),
    note(
      1920,
      300,
      "Grænar strikaðar línur sýna flóttaleið. Bættu við örvum og mælingum eftir þörfum.",
      "#86efac"
    ),
    caption(80, 20, "TurboPaint · Brunavarnaplön", 28),
    {
      id: newId(),
      type: "arrow" as const,
      x: 900,
      y: 1220,
      points: [0, 0, 0, -140],
      stroke: "#15803d",
      strokeWidth: 6,
      dash: "solid" as const,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      name: "Ör",
    },
    ].map((obj) => ({ ...obj, parentId: floorplan.id })),
  ];
}
