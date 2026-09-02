export type SymbolCategory = "eldur" | "flotti" | "oryggi" | "bygging";

export type SymbolKind = "fire" | "exit" | "info" | "warning" | "neutral";

export interface SafetySymbol {
  id: string;
  name: string;
  short: string;
  category: SymbolCategory;
  kind: SymbolKind;
  /** Teikningin sem táknið notar — sjálfgefið id-ið sjálft. Tækjategundirnar
   *  þrjár deila slökkvitækja-teikningunni og skilja sig að með lit einum. */
  glyphId?: string;
  /** Reitalitur, víki hann frá flokkslitnum. */
  bg?: string;
  /** Litur teikningarinnar, víki hann frá flokkslitnum. */
  fg?: string;
  /** Útlína utan um teikninguna — CO₂ er dökkrautt með svartri útlínu. */
  outline?: string;
  /** Táknið var búið til í Táknastjóranum, ekki innbyggt. */
  userMade?: boolean;
}

export const SYMBOL_CATEGORIES: { id: SymbolCategory; label: string }[] = [
  { id: "eldur", label: "Brunavarnir" },
  { id: "flotti", label: "Flóttaleiðir" },
  { id: "oryggi", label: "Öryggi" },
  { id: "bygging", label: "Bygging" },
];

export const SAFETY_SYMBOLS: SafetySymbol[] = [
  { id: "extinguisher", name: "Slökkvitæki", short: "SLT", category: "eldur", kind: "fire" },
  { id: "extinguisher-duft", name: "Slökkvitæki · Duft", short: "DFT", category: "eldur", kind: "fire", glyphId: "extinguisher", fg: "#1d4ed8" },
  { id: "extinguisher-co2", name: "Slökkvitæki · CO₂", short: "CO2", category: "eldur", kind: "fire", glyphId: "extinguisher", fg: "#7f1d1d", outline: "#0c0a09" },
  { id: "extinguisher-lettvatn", name: "Slökkvitæki · Léttvatn", short: "LÉT", category: "eldur", kind: "fire", glyphId: "extinguisher", fg: "#0d9488" },
  { id: "sign-extinguisher", name: "Skilti slökkvitækis", short: "SKL", category: "eldur", kind: "fire" },
  { id: "hose", name: "Brunaslanga / slöngukefli", short: "BRSL", category: "eldur", kind: "fire" },
  { id: "sign-hose", name: "Skilti brunaslöngu", short: "SLS", category: "eldur", kind: "fire" },
  { id: "hydrant", name: "Brunahani", short: "HAN", category: "eldur", kind: "fire" },
  { id: "alarm", name: "Brunahnappur", short: "ALM", category: "eldur", kind: "fire" },
  { id: "detector", name: "Reykskynjari", short: "RSK", category: "eldur", kind: "fire" },
  { id: "sprinkler", name: "Úðakerfi", short: "UDK", category: "eldur", kind: "fire" },
  { id: "blanket", name: "Slökkuteppi", short: "TEP", category: "eldur", kind: "fire" },
  { id: "firedoor", name: "Eldvarnarhurð", short: "EVH", category: "eldur", kind: "fire" },
  { id: "firewall", name: "Eldveggur", short: "EI", category: "eldur", kind: "fire" },
  { id: "exit", name: "Neyðarútgangur", short: "ÚT", category: "flotti", kind: "exit" },
  { id: "route", name: "Flóttaleið", short: "FLÓ", category: "flotti", kind: "exit" },
  { id: "assembly", name: "Safnsvæði", short: "SAF", category: "flotti", kind: "exit" },
  { id: "stairs", name: "Stigi", short: "STG", category: "flotti", kind: "exit" },
  { id: "e-light", name: "Neyðarljós", short: "NLJ", category: "flotti", kind: "exit" },
  { id: "firstaid", name: "Skyndihjálp", short: "SHJ", category: "oryggi", kind: "info" },
  { id: "phone", name: "Neyðarsími", short: "SÍM", category: "oryggi", kind: "info" },
  { id: "nosmoke", name: "Reykingarbann", short: "REY", category: "oryggi", kind: "warning" },
  { id: "electric", name: "Rafmagnstafla", short: "RAF", category: "oryggi", kind: "warning" },
  { id: "water", name: "Vatnsloki", short: "VAT", category: "oryggi", kind: "info" },
  { id: "gas", name: "Gasloki", short: "GAS", category: "oryggi", kind: "warning" },
  { id: "elevator", name: "Lyfta", short: "LYF", category: "bygging", kind: "neutral" },
  { id: "wc", name: "Snyrting", short: "WC", category: "bygging", kind: "neutral" },
  { id: "pin", name: "Staðsetning", short: "PIN", category: "bygging", kind: "neutral" },
];

let userSymbols: SafetySymbol[] = [];
let renames: Record<string, string> = {};

/** Táknastillingarnar kalla þetta þegar þær hlaðast eða breytast. */
export function applySymbolCustomisation(custom: SafetySymbol[], names: Record<string, string>) {
  userSymbols = custom;
  renames = names;
}

function renamed(s: SafetySymbol): SafetySymbol {
  const n = renames[s.id];
  return n && n !== s.name ? { ...s, name: n } : s;
}

/** Innbyggð tákn OG þau sem notandinn bjó til, með gildandi nöfnum. */
export function allSymbols(): SafetySymbol[] {
  return [...SAFETY_SYMBOLS, ...userSymbols].map(renamed);
}

export function getSymbol(id: string): SafetySymbol {
  const hit = SAFETY_SYMBOLS.find((s) => s.id === id) ?? userSymbols.find((s) => s.id === id);
  return renamed(hit ?? SAFETY_SYMBOLS[0]);
}

/** Litirnir sem táknið teiknast með — eigin litir ganga fyrir flokkslitnum. */
export function symbolPaint(sym: SafetySymbol): { bg: string; fg: string; outline?: string } {
  const base = symbolColors(sym.kind);
  return { bg: sym.bg ?? base.bg, fg: sym.fg ?? base.fg, outline: sym.outline };
}

export function symbolColors(kind: SymbolKind): { bg: string; fg: string } {
  switch (kind) {
    case "fire":
      return { bg: "#e11d2e", fg: "#ffffff" };
    case "exit":
      return { bg: "#15803d", fg: "#ffffff" };
    case "info":
      return { bg: "#1d4ed8", fg: "#ffffff" };
    case "warning":
      return { bg: "#eab308", fg: "#1c1917" };
    default:
      return { bg: "#44403c", fg: "#ffffff" };
  }
}
