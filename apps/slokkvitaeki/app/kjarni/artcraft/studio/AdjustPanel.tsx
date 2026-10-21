"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  DEFAULT_BODY,
  cloneRaster,
  createRaster,
  fitSize,
  liquifyInPlace,
  maskHasPaint,
  paintMask,
  strokePoints,
  warpBody,
  type BodyAmounts,
  type LiquifyMode,
  type Raster,
} from "./adjust";

export type StudioTool = LiquifyMode | "paint" | "erase";

type Props = {
  source: string;
  presetMask?: string | null;
  presetMaskTick?: number;
  onWorkingChange: (next: { image: string; mask: string | null }) => void;
};

const TOOLS: Array<{ id: StudioTool; label: string; hint: string }> = [
  { id: "expand", label: "Þenja", hint: "Ýtir líkamslínu út" },
  { id: "shrink", label: "Minnka", hint: "Dregur líkamslínu inn" },
  { id: "drag", label: "Draga", hint: "Færir línu með músinni" },
  { id: "paint", label: "Mála", hint: "Promptið vinnur á rauða svæðinu" },
  { id: "erase", label: "Stroka", hint: "Tekur málun af" },
];

function rasterFromImage(img: HTMLImageElement, max = 1024): Raster {
  const size = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return createRaster(size.width, size.height, 0);
  ctx.drawImage(img, 0, 0, size.width, size.height);
  const data = ctx.getImageData(0, 0, size.width, size.height);
  return { data: new Uint8ClampedArray(data.data), width: size.width, height: size.height };
}

function rasterToDataUrl(raster: Raster, type = "image/png"): string {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  return canvas.toDataURL(type);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki opnað myndina"));
    img.src = src;
  });
}

export default function AdjustPanel({ source, presetMask, presetMaskTick = 0, onWorkingChange }: Props) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const sculptedRef = useRef<Raster | null>(null);
  const previewRef = useRef<Raster | null>(null);
  const maskRef = useRef<Raster | null>(null);
  const undoRef = useRef<Array<{ kind: "mask" | "shape"; raster: Raster }>>([]);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  const bodyRef = useRef<BodyAmounts>(DEFAULT_BODY);
  const toolRef = useRef<StudioTool>("paint");
  const radiusRef = useRef(36);
  const strengthRef = useRef(0.55);
  const emitTimer = useRef<number>(0);

  const [tool, setTool] = useState<StudioTool>("paint");
  const [radius, setRadius] = useState(36);
  const [strength, setStrength] = useState(0.55);
  const [body, setBody] = useState<BodyAmounts>(DEFAULT_BODY);
  const [ready, setReady] = useState(false);
  const [painted, setPainted] = useState(false);

  toolRef.current = tool;
  radiusRef.current = radius;
  strengthRef.current = strength;
  bodyRef.current = body;

  function emit() {
    const preview = previewRef.current;
    const mask = maskRef.current;
    if (!preview) return;
    const image = rasterToDataUrl(preview);
    const maskUrl = mask && maskHasPaint(mask) ? rasterToDataUrl(mask) : null;
    onWorkingChange({ image, mask: maskUrl });
    setPainted(Boolean(maskUrl));
  }

  function scheduleEmit() {
    window.clearTimeout(emitTimer.current);
    emitTimer.current = window.setTimeout(emit, 80);
  }

  function paintPreview() {
    const sculpted = sculptedRef.current;
    if (!sculpted) return;
    const preview = previewRef.current || createRaster(sculpted.width, sculpted.height, 0);
    warpBody(sculpted, preview, bodyRef.current);
    previewRef.current = preview;
    const view = viewRef.current;
    const ctx = view?.getContext("2d");
    if (!view || !ctx) return;
    view.width = preview.width;
    view.height = preview.height;
    const frame = new ImageData(new Uint8ClampedArray(preview.data), preview.width, preview.height);
    const mask = maskRef.current;
    if (mask && maskHasPaint(mask)) {
      for (let i = 0; i < mask.data.length; i += 4) {
        const m = mask.data[i] / 255;
        if (m <= 0.04) continue;
        frame.data[i] = frame.data[i] * (1 - m * 0.55) + 220 * m * 0.55;
        frame.data[i + 1] = frame.data[i + 1] * (1 - m * 0.55) + 48 * m * 0.35;
        frame.data[i + 2] = frame.data[i + 2] * (1 - m * 0.55) + 48 * m * 0.35;
      }
    }
    ctx.putImageData(frame, 0, 0);
  }

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void loadImage(source).then((img) => {
      if (cancelled) return;
      const raster = rasterFromImage(img);
      sculptedRef.current = raster;
      previewRef.current = cloneRaster(raster);
      maskRef.current = createRaster(raster.width, raster.height, 0);
      undoRef.current = [];
      setBody(DEFAULT_BODY);
      bodyRef.current = DEFAULT_BODY;
      paintPreview();
      emit();
      setReady(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(emitTimer.current);
    };
    // source identity is the data URL the parent swapped in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (!ready) return;
    paintPreview();
    scheduleEmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, ready]);

  useEffect(() => {
    if (!ready || !presetMask || !maskRef.current) return;
    const target = maskRef.current;
    void loadImage(presetMask).then((img) => {
      const canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, target.width, target.height);
      const data = ctx.getImageData(0, 0, target.width, target.height);
      for (let i = 0; i < data.data.length; i += 4) {
        const on = data.data[i] > 20 || data.data[i + 3] > 20 ? 255 : 0;
        target.data[i] = on;
        target.data[i + 1] = on;
        target.data[i + 2] = on;
        target.data[i + 3] = 255;
      }
      setTool("paint");
      paintPreview();
      emit();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetMask, presetMaskTick, ready]);

  function canvasPoint(e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = viewRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function pushUndo() {
    const sculpted = sculptedRef.current;
    const mask = maskRef.current;
    if (!sculpted || !mask) return;
    const kind = toolRef.current === "paint" || toolRef.current === "erase" ? "mask" : "shape";
    undoRef.current.push({ kind, raster: cloneRaster(kind === "mask" ? mask : sculpted) });
    if (undoRef.current.length > 10) undoRef.current.shift();
  }

  function dab(x: number, y: number, prev: { x: number; y: number } | null) {
    const sculpted = sculptedRef.current;
    const mask = maskRef.current;
    if (!sculpted || !mask) return;
    const pts = prev ? strokePoints(prev.x, prev.y, x, y, Math.max(2, radiusRef.current * 0.32)) : [{ x, y }];
    const mode = toolRef.current;
    for (const p of pts) {
      if (mode === "paint") paintMask(mask, p.x, p.y, radiusRef.current, 255);
      else if (mode === "erase") paintMask(mask, p.x, p.y, radiusRef.current, 0);
      else {
        const moveX = prev ? x - prev.x : 0;
        const moveY = prev ? y - prev.y : 0;
        liquifyInPlace(sculpted, p.x, p.y, radiusRef.current, strengthRef.current, mode, moveX, moveY);
      }
    }
    paintPreview();
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    pushUndo();
    const p = canvasPoint(e);
    lastRef.current = p;
    dab(p.x, p.y, null);
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = canvasPoint(e);
    dab(p.x, p.y, lastRef.current);
    lastRef.current = p;
  }

  function onPointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    scheduleEmit();
  }

  function undo() {
    const last = undoRef.current.pop();
    if (!last) return;
    if (last.kind === "mask") {
      if (maskRef.current) maskRef.current.data.set(last.raster.data);
    } else if (sculptedRef.current) {
      sculptedRef.current.data.set(last.raster.data);
    }
    paintPreview();
    scheduleEmit();
  }

  function resetShape() {
    void loadImage(source).then((img) => {
      const raster = rasterFromImage(img);
      sculptedRef.current = raster;
      undoRef.current = [];
      setBody(DEFAULT_BODY);
      bodyRef.current = DEFAULT_BODY;
      paintPreview();
      emit();
    });
  }

  function clearMask() {
    const mask = maskRef.current;
    if (!mask) return;
    mask.data.fill(0);
    for (let i = 3; i < mask.data.length; i += 4) mask.data[i] = 255;
    paintPreview();
    emit();
  }

  const painting = tool === "paint" || tool === "erase";

  return (
    <div className="ac-adjust">
      <div className="ac-row ac-tools">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ac-btn ghost ${tool === item.id ? "on" : ""}`}
            title={item.hint}
            onClick={() => setTool(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="ac-hint">
        {painting
          ? "Málaðu yfir svæði sem promptið á að fókusa á. Rautt breytist, restin helst."
          : "Strjúktu yfir líkamslínu til að þenja, minnka eða draga. Stilltu svo bringur, miðju og mjaðmir."}
      </p>
      <div className={`ac-adjust-stage ${ready ? "" : "wait"}`}>
        <canvas
          ref={viewRef}
          className="ac-adjust-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className="ac-settings">
        <label className="ac-range">
          Burstastærð {radius}px
          <input
            type="range"
            min={8}
            max={140}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          />
        </label>
        <label className={`ac-range ${painting ? "dim" : ""}`}>
          Styrkur {strength.toFixed(2)}
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={strength}
            disabled={painting}
            onChange={(e) => setStrength(Number(e.target.value))}
          />
        </label>
        <label className="ac-range">
          Bringur / efri {body.bust.toFixed(2)}
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={body.bust}
            onChange={(e) => setBody((cur) => ({ ...cur, bust: Number(e.target.value) }))}
          />
        </label>
        <label className="ac-range">
          Miðja / líkamslína {body.waist.toFixed(2)}
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={body.waist}
            onChange={(e) => setBody((cur) => ({ ...cur, waist: Number(e.target.value) }))}
          />
        </label>
        <label className="ac-range">
          Mjaðmir {body.hips.toFixed(2)}
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={body.hips}
            onChange={(e) => setBody((cur) => ({ ...cur, hips: Number(e.target.value) }))}
          />
        </label>
        <label className="ac-range">
          Heildarbreidd {body.width.toFixed(2)}
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={body.width}
            onChange={(e) => setBody((cur) => ({ ...cur, width: Number(e.target.value) }))}
          />
        </label>
      </div>
      <div className="ac-row">
        <button type="button" className="ac-btn ghost" onClick={undo}>
          Afturkalla
        </button>
        <button type="button" className="ac-btn ghost" onClick={resetShape}>
          Endurstilla lögun
        </button>
        <button type="button" className="ac-btn ghost" onClick={clearMask} disabled={!painted}>
          Hreinsa maska
        </button>
      </div>
    </div>
  );
}
