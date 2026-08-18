'use client';

/**
 * The 2D board: a millimetre drafting sheet for measuring and sketching.
 *
 * Two layers on purpose. The traced part outline goes on a canvas because a
 * real STL can produce a hundred thousand segments and that many DOM nodes
 * would not survive a pan. The sketch itself — a handful of shapes you click
 * and drag — stays as SVG so it can be interactive.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Minus, MousePointer2, Square, Tag, Type } from 'lucide-react';
import {
  TOOL_LABELS,
  dimensionGeometry,
  shapeLabel,
  sketchTotals,
  type Point2,
  type Sketch,
  type SketchShape,
  type SketchTool,
} from '@/lib/3dwork/sketch';
import { VIEW_PLANE_LABELS, type Outline2D, type ViewPlane } from '@/lib/3dwork/silhouette';
import { formatLength } from '@/lib/3dwork/format';
import { ACTION_GHOST, ACTION_PRIMARY, LABEL, PANEL, VALUE } from './ui';

interface SketchBoardProps {
  sketch: Sketch;
  onChange: (sketch: Sketch) => void;
  outline: Outline2D | null;
  outlineBusy: boolean;
  plane: ViewPlane;
  onPlaneChange: (plane: ViewPlane) => void;
  traceName: string | null;
  onTrace: () => void;
  onClearTrace: () => void;
  onExportSvg: () => void;
  onSendToCutList: (lengthMm: number) => void;
}

const TOOL_ICONS: Record<SketchTool, React.ElementType> = {
  select: MousePointer2,
  line: Minus,
  rect: Square,
  circle: Circle,
  dimension: Tag,
  note: Type,
};

const TOOLS: SketchTool[] = ['select', 'line', 'rect', 'circle', 'dimension', 'note'];

const newShapeId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Grid step in mm, chosen so lines stay roughly 8+ px apart at this zoom. */
function gridStep(zoom: number): number {
  const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  return candidates.find((step) => step * zoom >= 8) ?? 1000;
}

export function SketchBoard({
  sketch,
  onChange,
  outline,
  outlineBusy,
  plane,
  onPlaneChange,
  traceName,
  onTrace,
  onClearTrace,
  onExportSvg,
  onSendToCutList,
}: SketchBoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [size, setSize] = useState({ width: 800, height: 500 });
  const [zoom, setZoom] = useState(2);
  const [pan, setPan] = useState<Point2>({ x: 0, y: 0 });
  const [tool, setTool] = useState<SketchTool>('select');
  const [snap, setSnap] = useState(true);
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ from: Point2; to: Point2 } | null>(null);
  const [cursor, setCursor] = useState<Point2>({ x: 0, y: 0 });

  // Screen position of world origin. Pan shifts it; Y is flipped so millimetres
  // run up the page the way they do on a drawing.
  const origin = useMemo(
    () => ({ x: size.width / 2 + pan.x, y: size.height / 2 + pan.y }),
    [size, pan]
  );

  const toScreen = useCallback(
    (point: Point2) => ({ x: origin.x + point.x * zoom, y: origin.y - point.y * zoom }),
    [origin, zoom]
  );

  const toWorld = useCallback(
    (x: number, y: number): Point2 => {
      const world = { x: (x - origin.x) / zoom, y: (origin.y - y) / zoom };
      if (!snap) return world;
      const step = Math.max(0.5, gridStep(zoom) / 5);
      return {
        x: Math.round(world.x / step) * step,
        y: Math.round(world.y / step) * step,
      };
    },
    [origin, zoom, snap]
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: host.clientWidth || 1, height: host.clientHeight || 1 });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Frame the traced outline when it arrives.
  useEffect(() => {
    if (!outline || outline.segments.length === 0) return;
    const { bounds } = outline;
    const fit = Math.min(
      (size.width * 0.8) / Math.max(bounds.width, 1),
      (size.height * 0.8) / Math.max(bounds.height, 1)
    );
    const next = Math.max(0.2, Math.min(fit, 40));
    setZoom(next);
    setPan({
      x: -((bounds.minX + bounds.maxX) / 2) * next,
      y: ((bounds.minY + bounds.maxY) / 2) * next,
    });
  }, [outline, size.width, size.height]);

  // Redraw the grid and the traced outline.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);

    const step = gridStep(zoom);
    const startX = Math.floor((0 - origin.x) / zoom / step) * step;
    const endX = Math.ceil((size.width - origin.x) / zoom / step) * step;
    const startY = Math.floor((origin.y - size.height) / zoom / step) * step;
    const endY = Math.ceil(origin.y / zoom / step) * step;

    context.lineWidth = 1;
    for (let x = startX; x <= endX; x += step) {
      const sx = origin.x + x * zoom;
      // Every fifth line is heavier, and the axis heavier still.
      context.strokeStyle = x === 0 ? '#94a3b8' : Math.round(x / step) % 5 === 0 ? '#dbe2ea' : '#eef2f6';
      context.beginPath();
      context.moveTo(sx, 0);
      context.lineTo(sx, size.height);
      context.stroke();
    }
    for (let y = startY; y <= endY; y += step) {
      const sy = origin.y - y * zoom;
      context.strokeStyle = y === 0 ? '#94a3b8' : Math.round(y / step) % 5 === 0 ? '#dbe2ea' : '#eef2f6';
      context.beginPath();
      context.moveTo(0, sy);
      context.lineTo(size.width, sy);
      context.stroke();
    }

    if (outline && outline.segments.length > 0) {
      const segments = outline.segments;
      context.strokeStyle = 'rgba(37, 99, 235, 0.55)';
      context.lineWidth = 1;
      context.beginPath();
      for (let i = 0; i + 3 < segments.length; i += 4) {
        context.moveTo(origin.x + segments[i] * zoom, origin.y - segments[i + 1] * zoom);
        context.lineTo(origin.x + segments[i + 2] * zoom, origin.y - segments[i + 3] * zoom);
      }
      context.stroke();
    }
  }, [size, zoom, origin, outline]);

  const commit = useCallback(
    (shape: SketchShape) => {
      onChange({ shapes: [...sketch.shapes, shape] });
      setSelectedShape(shape.id);
    },
    [sketch.shapes, onChange]
  );

  const onPointerDown = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = toWorld(event.clientX - rect.left, event.clientY - rect.top);

    if (tool === 'select') {
      setSelectedShape(null);
      return;
    }

    if (tool === 'note') {
      commit({ id: newShapeId(), kind: 'note', at: point, text: 'Note' });
      setTool('select');
      return;
    }

    (event.target as Element).setPointerCapture?.(event.pointerId);
    setDraft({ from: point, to: point });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = toWorld(event.clientX - rect.left, event.clientY - rect.top);
    setCursor(point);

    if (draft) setDraft({ from: draft.from, to: point });
    else if (tool === 'select' && event.buttons === 1) {
      setPan((current) => ({
        x: current.x + event.movementX,
        y: current.y + event.movementY,
      }));
    }
  };

  const onPointerUp = () => {
    if (!draft) return;
    const { from, to } = draft;
    setDraft(null);

    // A click without a drag is not a shape.
    if (Math.hypot(to.x - from.x, to.y - from.y) < 0.2) return;

    switch (tool) {
      case 'line':
        commit({ id: newShapeId(), kind: 'line', a: from, b: to });
        break;
      case 'rect':
        commit({ id: newShapeId(), kind: 'rect', a: from, b: to });
        break;
      case 'circle':
        commit({
          id: newShapeId(),
          kind: 'circle',
          center: from,
          radius: Math.hypot(to.x - from.x, to.y - from.y),
        });
        break;
      case 'dimension':
        commit({ id: newShapeId(), kind: 'dimension', a: from, b: to, offset: 10 });
        break;
      default:
        break;
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    // Keep the point under the cursor fixed while zooming.
    const before = { x: (px - origin.x) / zoom, y: (origin.y - py) / zoom };
    const next = Math.max(0.1, Math.min(200, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    setZoom(next);
    setPan({
      x: px - size.width / 2 - before.x * next,
      y: py - size.height / 2 + before.y * next,
    });
  };

  const removeShape = (id: string) => {
    onChange({ shapes: sketch.shapes.filter((shape) => shape.id !== id) });
    setSelectedShape((current) => (current === id ? null : current));
  };

  const totals = sketchTotals(sketch);

  const renderShape = (shape: SketchShape) => {
    const active = selectedShape === shape.id;
    const stroke = active ? '#d97706' : '#0f172a';

    switch (shape.kind) {
      case 'line': {
        const a = toScreen(shape.a);
        const b = toScreen(shape.b);
        return (
          <g key={shape.id} onClick={() => setSelectedShape(shape.id)} className="cursor-pointer">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={2} />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 6}
              fill={stroke}
              fontSize={10}
              fontFamily="monospace"
              textAnchor="middle"
            >
              {shapeLabel(shape).replace('Line ', '')}
            </text>
          </g>
        );
      }
      case 'rect': {
        const a = toScreen(shape.a);
        const b = toScreen(shape.b);
        return (
          <g key={shape.id} onClick={() => setSelectedShape(shape.id)} className="cursor-pointer">
            <rect
              x={Math.min(a.x, b.x)}
              y={Math.min(a.y, b.y)}
              width={Math.abs(b.x - a.x)}
              height={Math.abs(b.y - a.y)}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
            />
          </g>
        );
      }
      case 'circle': {
        const center = toScreen(shape.center);
        return (
          <g key={shape.id} onClick={() => setSelectedShape(shape.id)} className="cursor-pointer">
            <circle
              cx={center.x}
              cy={center.y}
              r={shape.radius * zoom}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
            />
          </g>
        );
      }
      case 'dimension': {
        const geometry = dimensionGeometry(shape);
        const a = toScreen(geometry.a);
        const b = toScreen(geometry.b);
        const oa = toScreen(geometry.offsetA);
        const ob = toScreen(geometry.offsetB);
        const mid = toScreen(geometry.mid);
        return (
          <g key={shape.id} onClick={() => setSelectedShape(shape.id)} className="cursor-pointer">
            <g stroke={active ? '#d97706' : '#b45309'} strokeWidth={1.5}>
              <line x1={a.x} y1={a.y} x2={oa.x} y2={oa.y} />
              <line x1={b.x} y1={b.y} x2={ob.x} y2={ob.y} />
              <line x1={oa.x} y1={oa.y} x2={ob.x} y2={ob.y} />
            </g>
            <text
              x={mid.x}
              y={mid.y - 5}
              fill="#b45309"
              fontSize={11}
              fontFamily="monospace"
              textAnchor="middle"
            >
              {Math.hypot(shape.b.x - shape.a.x, shape.b.y - shape.a.y).toFixed(1)}
            </text>
          </g>
        );
      }
      case 'note': {
        const at = toScreen(shape.at);
        return (
          <g key={shape.id} onClick={() => setSelectedShape(shape.id)} className="cursor-pointer">
            <circle cx={at.x} cy={at.y} r={3} fill="#d97706" />
            <text x={at.x + 7} y={at.y + 4} fill={stroke} fontSize={11} fontFamily="sans-serif">
              {shape.text}
            </text>
          </g>
        );
      }
    }
  };

  const renderDraft = () => {
    if (!draft) return null;
    const a = toScreen(draft.from);
    const b = toScreen(draft.to);
    const common = { stroke: '#059669', strokeWidth: 1.5, strokeDasharray: '4 3', fill: 'none' };

    if (tool === 'circle') {
      return (
        <circle
          cx={a.x}
          cy={a.y}
          r={Math.hypot(b.x - a.x, b.y - a.y)}
          {...common}
        />
      );
    }
    if (tool === 'rect') {
      return (
        <rect
          x={Math.min(a.x, b.x)}
          y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)}
          height={Math.abs(b.y - a.y)}
          {...common}
        />
      );
    }
    return (
      <g>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} />
        <text
          x={(a.x + b.x) / 2}
          y={(a.y + b.y) / 2 - 6}
          fill="#059669"
          fontSize={11}
          fontFamily="monospace"
          textAnchor="middle"
        >
          {Math.hypot(draft.to.x - draft.from.x, draft.to.y - draft.from.y).toFixed(1)} mm
        </text>
      </g>
    );
  };

  return (
    <div className="flex h-full gap-2">
      <div className={`${PANEL} flex w-56 shrink-0 flex-col overflow-hidden`}>
        <div className="border-b border-slate-300 px-3 py-2">
          <span className={LABEL}>Drafting board</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <span className={`${LABEL} mb-1 block`}>Tools</span>
          <div className="mb-4 grid grid-cols-3 gap-1">
            {TOOLS.map((entry) => {
              const Icon = TOOL_ICONS[entry];
              return (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setTool(entry)}
                  title={TOOL_LABELS[entry]}
                  className={`flex flex-col items-center gap-1 rounded border px-1 py-2 text-[0.55rem] font-bold uppercase transition-colors ${
                    tool === entry
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                      : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {TOOL_LABELS[entry]}
                </button>
              );
            })}
          </div>

          <label className="mb-3 flex items-center gap-2 text-[0.7rem] text-slate-700">
            <input
              type="checkbox"
              checked={snap}
              onChange={(event) => setSnap(event.target.checked)}
              className="accent-emerald-500"
            />
            Snap to grid
          </label>

          <span className={`${LABEL} mb-1 block`}>Trace a part</span>
          <select
            className="mb-2 w-full rounded border border-slate-300 bg-slate-200 px-2 py-1.5 text-[0.7rem] text-slate-800"
            value={plane}
            onChange={(event) => onPlaneChange(event.target.value as ViewPlane)}
            aria-label="Projection plane"
          >
            {(Object.keys(VIEW_PLANE_LABELS) as ViewPlane[]).map((entry) => (
              <option key={entry} value={entry}>
                {VIEW_PLANE_LABELS[entry]}
              </option>
            ))}
          </select>

          <button type="button" className={`${ACTION_GHOST} mb-1 w-full`} onClick={onTrace} disabled={outlineBusy}>
            {outlineBusy ? 'Tracing…' : 'Trace selected part'}
          </button>
          {traceName && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="truncate text-[0.65rem] text-sky-600">{traceName}</span>
              <button
                type="button"
                onClick={onClearTrace}
                className="text-[0.6rem] font-bold uppercase text-slate-500 hover:text-rose-600"
              >
                clear
              </button>
            </div>
          )}

          <span className={`${LABEL} mb-1 block`}>Sheet</span>
          <div className={`${PANEL} mb-3 px-2 py-1.5`}>
            <div className="flex justify-between py-0.5">
              <span className={LABEL}>Shapes</span>
              <span className={VALUE}>{totals.shapes}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className={LABEL}>Drawn length</span>
              <span className={VALUE}>{formatLength(totals.cutLength)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className={LABEL}>Dimensions</span>
              <span className={VALUE}>{totals.dimensions}</span>
            </div>
          </div>

          <div className="space-y-1">
            <button type="button" className={`${ACTION_PRIMARY} w-full`} onClick={onExportSvg}>
              Export SVG (1:1)
            </button>
            <button
              type="button"
              className={`${ACTION_GHOST} w-full`}
              onClick={() => onSendToCutList(totals.cutLength)}
              disabled={totals.cutLength <= 0}
            >
              Drawn length → cut list
            </button>
            <button
              type="button"
              className={`${ACTION_GHOST} w-full`}
              onClick={() => onChange({ shapes: [] })}
              disabled={totals.shapes === 0}
            >
              Clear sheet
            </button>
          </div>

          {sketch.shapes.length > 0 && (
            <>
              <span className={`${LABEL} mb-1 mt-4 block`}>Objects</span>
              <div className="space-y-1">
                {sketch.shapes.map((shape) => (
                  <div
                    key={shape.id}
                    className={`flex items-center gap-1 rounded border px-1.5 py-1 ${
                      selectedShape === shape.id
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-slate-200'
                    }`}
                  >
                    {shape.kind === 'note' ? (
                      <input
                        className="min-w-0 flex-1 bg-transparent text-[0.65rem] text-slate-800 outline-none"
                        value={shape.text}
                        onChange={(event) =>
                          onChange({
                            shapes: sketch.shapes.map((other) =>
                              other.id === shape.id ? { ...shape, text: event.target.value } : other
                            ),
                          })
                        }
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedShape(shape.id)}
                        className="min-w-0 flex-1 truncate text-left text-[0.65rem] text-slate-700"
                      >
                        {shapeLabel(shape)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeShape(shape.id)}
                      className="text-slate-400 hover:text-rose-600"
                      aria-label={`Delete ${shapeLabel(shape)}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div ref={hostRef} className={`${PANEL} relative min-h-0 flex-1 overflow-hidden`}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <svg
          className="absolute inset-0 h-full w-full"
          style={{ cursor: tool === 'select' ? 'grab' : 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
          {sketch.shapes.map(renderShape)}
          {renderDraft()}
        </svg>

        <div className="pointer-events-none absolute bottom-2 left-2 flex gap-4 rounded bg-white/90 px-2 py-1 font-mono text-[0.65rem] text-slate-500">
          <span>
            X <span className="text-slate-800">{cursor.x.toFixed(1)}</span>
          </span>
          <span>
            Y <span className="text-slate-800">{cursor.y.toFixed(1)}</span>
          </span>
          <span>
            <span className={LABEL}>grid </span>
            {gridStep(zoom)} mm
          </span>
          <span>
            <span className={LABEL}>zoom </span>
            {zoom.toFixed(2)}×
          </span>
        </div>

        <div className="pointer-events-none absolute right-2 top-2 rounded bg-white/90 px-2 py-1 text-[0.6rem] font-bold uppercase tracking-wider text-slate-500">
          {tool === 'select' ? 'drag to pan · wheel to zoom' : `drag to draw ${TOOL_LABELS[tool]}`}
        </div>
      </div>
    </div>
  );
}
