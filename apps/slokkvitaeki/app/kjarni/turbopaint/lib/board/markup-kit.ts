import { newId } from "./ids";
import { getSymbol } from "./symbols";
import { getStampSize } from "./symbol-settings";
import type { BoardObject, ImageObject, StickyObject, SymbolObject } from "./types";

export function makeSymbol(
  symbolId: string,
  x: number,
  y: number,
  label?: string,
  size?: number
): SymbolObject {
  const px = size ?? getStampSize();
  const def = getSymbol(symbolId);
  // Enginn merkimiði nema kallarinn biðji um hann. Áður fékk dregið tákn fulla
  // heitið („Slökkvitæki · Léttvatn") undir sér en stimplað ekkert — Agnar:
  // „sometimes there comes a text and sometimes not.. just skip the text".
  // Sjálfvirka merkingin (SLT-1, ÚT …) sendir sinn merkimiða áfram sjálf.
  // Heitið í lagalistanum og magntöflunni er alltaf heiti táknsins, svo
  // flokkunin þar haldist óháð því hvort merkimiði sést á borðinu.
  return {
    id: newId(),
    type: "symbol",
    symbolId,
    x,
    y,
    size: px,
    label: label ?? "",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: def.name,
  };
}

function note(x: number, y: number, text: string, fill: string): StickyObject {
  return {
    id: newId(),
    type: "sticky",
    x,
    y,
    width: 240,
    height: 150,
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

export function markupKitForPlan(plan: Pick<ImageObject, "id" | "x" | "y" | "width" | "height">): BoardObject[] {
  return [
    note(
      plan.x + plan.width + 48,
      plan.y,
      "Staðsetning slökkvitækja, brunaslangna og skilta fylgir 165.BR1. Dragðu tákn til og bættu við af bakkanum neðst.",
      "#fde047"
    ),
  ].map((obj) => ({ ...obj, parentId: plan.id }));
}

export const TRAY_SYMBOLS = [
  "extinguisher",
  "extinguisher-duft",
  "extinguisher-co2",
  "extinguisher-lettvatn",
  "sign-extinguisher",
  "hose",
  "sign-hose",
  "hydrant",
  "alarm",
  "detector",
  "blanket",
  "exit",
  "assembly",
  "firstaid",
  "electric",
  "firedoor",
  "firewall",
  "nosmoke",
] as const;

export const SYMBOL_DRAG_TYPE = "application/x-turbopaint-symbol";
