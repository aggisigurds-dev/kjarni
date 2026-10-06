"use client";

// Skarpt lag ofan á PDF-teikningu þegar þysjað er nær en rastamyndin dugar (lib/board/skarpt-pdf.ts). Sýnilegi
// hlutinn er teiknaður úr vigur-PDF-inu í skjáupplausn eftir að myndavélin staðnæmist (220 ms), aðeins þar sem myndin
// sjálf ber blek. Lagið er „ui-only": á skjánum, ekki í útflutningi, og ekkert vistast.

import type Konva from "konva";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage } from "react-konva";
import { PDFJS_WORKER_SRC, pdfJsDocumentOptions } from "../../lib/board/pdfjs-setup";
import { SHEET_CONTRAST_FILTER } from "../../lib/board/sheet-contrast";
import { blekgrima, samaSvaedi, sidaPassar, skarptSvaedi, type SkarptSvaedi } from "../../lib/board/skarpt-pdf";
import { useBoardStore } from "../../lib/board/store";
import type { ImageObject } from "../../lib/board/types";

// Eitt skjal á frumskrá (operator-listinn geymist í pdf.js og næsta teikning er hraðari). Mest tvö í minni.
const skjol = new Map<string, Promise<PDFDocumentProxy | null>>();
function hladaPdf(frumAssetId: string): Promise<PDFDocumentProxy | null> {
  let p = skjol.get(frumAssetId);
  if (!p) {
    p = (async () => {
      const { saekjaFrum } = await import("../../lib/board/persistence");
      const blob = await saekjaFrum(frumAssetId);
      if (!blob) return null;
      const data = await blob.arrayBuffer();
      const haus = new Uint8Array(data, 0, Math.min(5, data.byteLength));
      if (String.fromCharCode(...haus) !== "%PDF-") return null;
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      return pdfjs.getDocument(pdfJsDocumentOptions(data)).promise;
    })().catch(() => null);
    skjol.set(frumAssetId, p);
    while (skjol.size > 2) {
      const [elst, ep] = skjol.entries().next().value as [string, Promise<PDFDocumentProxy | null>];
      skjol.delete(elst);
      void ep.then((d) => d?.destroy());
    }
  }
  return p;
}

type Lag = { canvas: HTMLCanvasElement; sv: SkarptSvaedi; raster: HTMLImageElement };

export function SkarptPdfLag({ obj, raster }: { obj: ImageObject; raster: HTMLImageElement | undefined }) {
  const camera = useBoardStore((s) => s.camera);
  const nodeRef = useRef<Konva.Image>(null);
  const [lag, setLag] = useState<Lag | null>(null);
  const lagRef = useRef<Lag | null>(null);
  lagRef.current = lag;
  const kynslod = useRef(0);
  const verk = useRef<RenderTask | null>(null);
  const erPdf = !!obj.frumAssetId && /\.pdf$/i.test(obj.frumNafn || "");

  useEffect(() => {
    if (!erPdf || !raster || !obj.frumAssetId) return;
    const nr = ++kynslod.current;
    const t = window.setTimeout(async () => {
      const stage = nodeRef.current?.getStage() ?? null;
      const skjar = stage ? { w: stage.width(), h: stage.height() } : { w: window.innerWidth, h: window.innerHeight };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const sv = skarptSvaedi(obj, camera, skjar, dpr, raster.naturalWidth || raster.width);
      if (!sv) {
        if (lagRef.current) setLag(null);
        return;
      }
      // sama svæði af SÖMU mynd er þegar teiknað (breytt mynd — t.d. Hreinsa svæði — fær nýja grímu)
      if (lagRef.current?.raster === raster && samaSvaedi(lagRef.current.sv, sv)) return;
      const doc = await hladaPdf(obj.frumAssetId!);
      if (!doc || nr !== kynslod.current) return;
      const sida = await doc.getPage((obj.frumSida ?? 0) + 1);
      const vp1 = sida.getViewport({ scale: 1 });
      if (!sidaPassar(obj, { b: vp1.width, h: vp1.height }) || nr !== kynslod.current) return;
      // borðeiningar á pt (myndin getur hafa verið stækkuð á borðinu — hlutföllin ráða)
      const kPt = obj.width / vp1.width;
      const S = sv.k * kPt; // dílar skarpa strigans á pt
      const pdfC = document.createElement("canvas");
      pdfC.width = sv.cw;
      pdfC.height = sv.ch;
      const px = pdfC.getContext("2d");
      if (!px) return;
      px.fillStyle = "#ffffff";
      px.fillRect(0, 0, sv.cw, sv.ch);
      verk.current?.cancel();
      const vp = sida.getViewport({ scale: S, offsetX: -(sv.x / kPt) * S, offsetY: -(sv.y / kPt) * S });
      const rt = sida.render({ canvasContext: px, viewport: vp, canvas: pdfC });
      verk.current = rt;
      try {
        await rt.promise;
      } catch {
        return; // hætt við (ný staða) eða teikning mistókst — myndin stendur
      }
      if (nr !== kynslod.current) return;
      // Blekgríma úr myndinni sjálfri á sama svæði (í upplausn myndarinnar)
      const kr = (raster.naturalWidth || raster.width) / obj.width;
      const rw = Math.max(1, Math.ceil(sv.w * kr)), rh = Math.max(1, Math.ceil(sv.h * kr));
      const mC = document.createElement("canvas");
      mC.width = rw;
      mC.height = rh;
      const mx = mC.getContext("2d", { willReadFrequently: true });
      if (!mx) return;
      mx.fillStyle = "#ffffff";
      mx.fillRect(0, 0, rw, rh);
      mx.drawImage(raster, sv.x * kr, sv.y * kr, rw, rh, 0, 0, rw, rh);
      const gr = blekgrima(mx.getImageData(0, 0, rw, rh).data, rw, rh);
      const md = mx.createImageData(rw, rh);
      for (let i = 0; i < rw * rh; i++) md.data[i * 4 + 3] = gr[i];
      mx.putImageData(md, 0, 0);
      // Skarpa lagið: PDF-ið (sama birtuskil og myndin fékk við innflutning), aðeins innan grímunnar
      const ut = document.createElement("canvas");
      ut.width = sv.cw;
      ut.height = sv.ch;
      const ux = ut.getContext("2d");
      if (!ux) return;
      ux.filter = SHEET_CONTRAST_FILTER;
      ux.drawImage(pdfC, 0, 0);
      ux.filter = "none";
      ux.globalCompositeOperation = "destination-in";
      ux.imageSmoothingEnabled = true;
      ux.drawImage(mC, 0, 0, sv.cw, sv.ch);
      pdfC.width = 0;
      mC.width = 0;
      setLag({ canvas: ut, sv, raster });
    }, 220);
    return () => window.clearTimeout(t);
  }, [erPdf, raster, obj, camera]);

  // Ný mynd (Hreinsa svæði, strokleður, Eyða línu …): gamla lagið hverfur STRAX — gríma þess er úrelt og sýndi annars
  // það sem var strokað út þar til nýja lagið er teiknað.
  useEffect(() => {
    if (lagRef.current && lagRef.current.raster !== raster) setLag(null);
  }, [raster]);

  useEffect(() => () => verk.current?.cancel(), []);

  if (!erPdf) return null;
  return (
    <KonvaImage
      ref={nodeRef}
      image={lag?.canvas}
      x={lag?.sv.x ?? 0}
      y={lag?.sv.y ?? 0}
      width={lag?.sv.w ?? 1}
      height={lag?.sv.h ?? 1}
      visible={!!lag}
      listening={false}
      name="ui-only skarpt-pdf"
    />
  );
}
