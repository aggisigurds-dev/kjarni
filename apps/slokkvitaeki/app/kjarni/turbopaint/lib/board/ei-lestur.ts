// EI-lestur eftir veggjagreiningu (Agnar 21.10.2026: „kannski þarf að setja einhvert combo — lesa EI-60/30 veggina, lesa hurðarop,
// tengja síðan á milli"): „Greina veggi" les nú EI-merkin og festir þau á veggina sem komu inn — eins og „Sjálfvirkt".
// Röð: 1) vegghjálp úr Búnaðargreiningu (vigur-PDF: EI-merki beint úr textalaginu — nákvæm, enginn OCR); 2) annars OCR á teikninguna
// (sama lestur og sjálfvirka ferlið). Veggir sem voru á teikningunni FYRIR greininguna eru læstir á meðan svo EI breytir þeim aldrei.

import { replaceCrossingMarks } from "./crossings";
import { eiUrTexta, lesaTextaTeikningar } from "./detect-firewalls";
import { beitaEi, veggirTeikningar } from "./ei-beiting";
import type { EiMidi } from "./ei-festing";
import { newId, useBoardStore } from "./store";
import type { ImageObject } from "./types";
import { eiMidarUrVegghjalpi, saekjaVegghjalp } from "./vegghjalp";

/** Lengsta bið eftir textalestri (OCR) — eftir það heldur ferlið áfram án EI (sama þak og Sjálfvirkt). */
export const EI_OCR_THAK_MS = 8 * 60_000;

export interface EiLestur {
  uppruni: "vegghjalp" | "ocr" | "ekkert";
  /** merki sem fundust (öll flokkuð: EI-30, EI-60, EI-CS) */
  merki: number;
  eldveggir: number;
  /** merki sem fundu engan vegg */
  lausir: number;
  texti: string;
}

function medThaki<T>(p: Promise<T>, ms: number, hvad: string): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = window.setTimeout(() => rej(new Error(`${hvad} tók of langan tíma`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        res(v);
      },
      (e) => {
        window.clearTimeout(t);
        rej(e);
      }
    );
  });
}

/** Les EI-merki teikningarinnar og festir eldveggi á veggina (EITT ⌘Z-skref). `lota` = auðkenni greiningarlotunnar sem nýju veggirnir
 * eru merktir með — aðrir veggir teikningarinnar eru læstir á meðan. */
export async function lesaOgFestaEi(planId: string, dpm: number, lota: string, onProgress?: (texti: string) => void): Promise<EiLestur> {
  const plan = () => useBoardStore.getState().objects.find((o): o is ImageObject => o.id === planId && o.type === "image") ?? null;
  const p0 = plan();
  if (!p0) return { uppruni: "ekkert", merki: 0, eldveggir: 0, lausir: 0, texti: "Teikningin fannst ekki — EI ekki lesið" };

  let midar: EiMidi[] | null = null;
  let uppruni: EiLestur["uppruni"] = "ocr";
  let merki = 0;
  try {
    const vh = await saekjaVegghjalp(p0);
    if (vh) {
      // Vigur-PDF: textalagið er niðurstaðan — engin merki þar = engir eldveggir (OCR á myndinni myndi bara giska).
      midar = eiMidarUrVegghjalpi(vh, p0);
      uppruni = "vegghjalp";
      merki = vh.ei.length;
    }
  } catch (err) {
    console.warn("[ei] vegghjálp úr Búnaðargreiningu náðist ekki — OCR í staðinn", err);
  }
  if (!midar) {
    onProgress?.("Les texta teikningarinnar (OCR)…");
    const p = plan();
    if (!p) return { uppruni: "ekkert", merki: 0, eldveggir: 0, lausir: 0, texti: "Teikningin fannst ekki — EI ekki lesið" };
    const texti = await medThaki(lesaTextaTeikningar(p, { medBlek: true, lodrett: true, onProgress: (msg) => onProgress?.(msg) }), EI_OCR_THAK_MS, "textalesturinn");
    const ei = await eiUrTexta(p, texti);
    midar = ei.midar;
    merki = ei.hits.length;
  }
  if (!midar.some((m) => !m.reyk)) {
    return {
      uppruni,
      merki,
      eldveggir: 0,
      lausir: 0,
      texti: merki ? `${merki} EI-merki, öll reykþéttar hurðir (EI-CS) eða utan flokka — engir eldveggir` : "Engin EI-30 / EI-60 merki á teikningunni",
    };
  }

  const st = useBoardStore.getState();
  const p = plan();
  if (!p) return { uppruni, merki, eldveggir: 0, lausir: 0, texti: "Teikningin fannst ekki — EI ekki fest" };
  // veggir sem voru þar fyrir greininguna (ekki úr þessari lotu) eru læstir — EI breytir þeim aldrei
  const fastir = new Set(veggirTeikningar(st.objects, p).filter((o) => o.greining !== lota).map((o) => o.id));
  st.commitHistory();
  const objs = st.objects.map((o) => (fastir.has(o.id) ? { ...o, locked: true } : o));
  const b = beitaEi(objs, p, midar, { seiling: 1.1 * dpm, sjalf: null, lota, nyttId: newId });
  const upph = new Map(st.objects.map((o) => [o.id, o]));
  const ut = b.objects.map((o) => (fastir.has(o.id) ? upph.get(o.id) ?? o : o));
  useBoardStore.setState({ objects: replaceCrossingMarks(ut), selectedIds: [] });
  const lausir = b.festing.lausir.length;
  return {
    uppruni,
    merki,
    eldveggir: b.eldveggir,
    lausir,
    texti: `${b.eldveggir} eldveggir á veggjum úr ${merki} EI-merkjum${uppruni === "vegghjalp" ? " (úr textalagi PDF)" : ""}` + (lausir ? ` · ${lausir} merki fundu engan vegg` : "") + " · ⌘Z afturkallar",
  };
}
