// Hleður lagnablaði / yfirlitsblaði (vigur-PDF, síða 1) í vafranum: strik og fletir með lit, og texti með stöðu.
// Hrein rökfræði býr í lagnir.ts; hér er aðeins pdf.js-hliðin.

import { PDFJS_WORKER_SRC, pdfJsDocumentOptions } from "./pdfjs-setup";
import { lesaLitaLog, type LitaLog, type Texti } from "./lagnir";
import type { PdfOps } from "./pdf-veggir";

export interface LagnaBlad {
  nafn: string;
  /** Stærð síðunnar í pt. */
  w: number;
  h: number;
  log: LitaLog;
  texti: Texti[];
}

/** Grá/svört/hvít strik eru bakgrunnur — mörg hundruð þúsund. Aðeins löng halda sér; lituð strik (brunaveggir o.fl.) öll. */
const BAKGRUNNUR_MINNST = 4;

function erHlutlaus(lit: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(lit);
  return !m || (m[1] === m[2] && m[2] === m[3]);
}

export async function hladaLagnaBlad(file: File): Promise<LagnaBlad> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  const pdf = await pdfjs.getDocument(pdfJsDocumentOptions(await file.arrayBuffer())).promise;
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const ol = await page.getOperatorList();
  const log = lesaLitaLog(pdfjs.OPS as unknown as PdfOps, ol.fnArray as number[], ol.argsArray as unknown[], vp.transform);
  log.strik = log.strik.filter((x) => !erHlutlaus(x.lit) || Math.hypot(x.s[2] - x.s[0], x.s[3] - x.s[1]) >= BAKGRUNNUR_MINNST);
  const tc = await page.getTextContent();
  const texti: Texti[] = [];
  for (const it of tc.items) {
    if (!("str" in it)) continue;
    const s = it.str.trim();
    if (!s) continue;
    const m = pdfjs.Util.transform(vp.transform, it.transform as number[]);
    texti.push({ s, x: m[4] + (it.width ?? 0) / 2, y: m[5] - (it.height ?? 0) / 2 });
  }
  return { nafn: file.name.replace(/\.pdf$/i, ""), w: vp.width, h: vp.height, log, texti };
}
