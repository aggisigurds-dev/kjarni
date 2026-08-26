"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StationChrome } from "../StationChrome";

const GRID = 32;
const STORE = "kjarni_turbopaint";
const WALL = "#1a2744";
const FILLS = ["#dbeafe", "#d1fae5", "#fde68a", "#fecaca", "#e9d5ff", "#f3f4f6"];

type Tool = "select" | "wall" | "room" | "door" | "pen" | "label" | "eraser";
type Pt = { x: number; y: number };
type Shape =
  | { id: string; kind: "wall" | "door"; a: Pt; b: Pt }
  | { id: string; kind: "room"; a: Pt; b: Pt; fill: string; label: string }
  | { id: string; kind: "pen"; pts: Pt[]; color: string }
  | { id: string; kind: "label"; p: Pt; text: string };

const nid = () => Math.random().toString(36).slice(2, 9);
const snap = (n: number) => Math.round(n / GRID) * GRID;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function norm(a: Pt, b: Pt) {
  return { a: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, b: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } };
}

const STARTER: Shape[] = [
  { id: "r1", kind: "room", a: { x: 64, y: 64 }, b: { x: 384, y: 288 }, fill: "#dbeafe", label: "Anddyri" },
  { id: "r2", kind: "room", a: { x: 384, y: 64 }, b: { x: 672, y: 288 }, fill: "#d1fae5", label: "Eldhús" },
  { id: "r3", kind: "room", a: { x: 64, y: 288 }, b: { x: 672, y: 512 }, fill: "#fde68a", label: "Stofa" },
  { id: "d1", kind: "door", a: { x: 384, y: 160 }, b: { x: 384, y: 192 } },
  { id: "d2", kind: "door", a: { x: 320, y: 288 }, b: { x: 352, y: 288 } },
];

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Velja" },
  { id: "wall", label: "Veggur" },
  { id: "room", label: "Herbergi" },
  { id: "door", label: "Hurð" },
  { id: "pen", label: "Penni" },
  { id: "label", label: "Texti" },
  { id: "eraser", label: "Stroka" },
];

function hit(s: Shape, p: Pt): boolean {
  if (s.kind === "wall" || s.kind === "door") {
    const len = dist(s.a, s.b) || 1;
    const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * (s.b.x - s.a.x) + (p.y - s.a.y) * (s.b.y - s.a.y)) / (len * len)));
    return dist(p, { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }) < 10;
  }
  if (s.kind === "room") {
    const { a, b } = norm(s.a, s.b);
    return p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y;
  }
  if (s.kind === "pen") return s.pts.some((q) => dist(q, p) < 8);
  return dist(s.p, p) < 28;
}

export default function TurboPaintClient() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("wall");
  const [shapes, setShapes] = useState<Shape[]>(STARTER);
  const [sel, setSel] = useState<string | null>(null);
  const [fill, setFill] = useState(FILLS[0]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [labelBox, setLabelBox] = useState<{ x: number; y: number } | null>(null);
  const [labelText, setLabelText] = useState("");
  const history = useRef<Shape[][]>([STARTER]);
  const dragging = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const drawing = useRef(false);
  const loaded = useRef(false);
  const shapesRef = useRef(shapes);
  shapesRef.current = shapes;

  const pushHist = useCallback((next: Shape[]) => {
    history.current = [...history.current.slice(-40), next];
    setShapes(next);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const parsed = JSON.parse(raw) as Shape[];
        if (Array.isArray(parsed) && parsed.length) {
          setShapes(parsed);
          history.current = [parsed];
        }
      }
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(STORE, JSON.stringify(shapes)); } catch {}
  }, [shapes]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w < 8 || h < 8) return;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = getComputedStyle(wrap).getPropertyValue("--m-bg") || "#e8eef6";
    const line = getComputedStyle(wrap).getPropertyValue("--m-line") || "#cfdcea";
    const ink = getComputedStyle(wrap).getPropertyValue("--m-ink") || "#102038";
    ctx.fillStyle = bg.trim() || "#e8eef6";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = line.trim() || "#cfdcea";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += GRID) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += GRID) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    }
    const all = draft ? [...shapes, draft] : shapes;
    for (const s of all) {
      const active = s.id === sel;
      if (s.kind === "room") {
        const { a, b } = norm(s.a, s.b);
        ctx.fillStyle = s.fill;
        ctx.strokeStyle = active ? "#0ea5b7" : WALL;
        ctx.lineWidth = active ? 3 : 2;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        if (s.label) {
          ctx.fillStyle = ink.trim() || WALL;
          ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(s.label, (a.x + b.x) / 2, (a.y + b.y) / 2 + 4);
        }
      } else if (s.kind === "wall" || s.kind === "door") {
        ctx.strokeStyle = s.kind === "door" ? "#b45309" : active ? "#0ea5b7" : WALL;
        ctx.lineWidth = s.kind === "door" ? 8 : 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.a.x, s.a.y);
        ctx.lineTo(s.b.x, s.b.y);
        ctx.stroke();
      } else if (s.kind === "pen") {
        if (s.pts.length < 2) continue;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x, s.pts[0].y);
        s.pts.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      } else {
        ctx.fillStyle = active ? "#0ea5b7" : ink.trim() || WALL;
        ctx.font = "700 14px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(s.text, s.p.x, s.p.y);
      }
    }
    ctx.fillStyle = ink.trim() || WALL;
    ctx.font = "600 11px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("1 rúða = 1 m", 12, h - 14);
  }, [draft, sel, shapes]);

  useEffect(() => {
    draw();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  function pos(e: React.PointerEvent): Pt {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const p = pos(e);
    const s = { x: snap(p.x), y: snap(p.y) };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    if (tool === "select") {
      const found = [...shapes].reverse().find((sh) => hit(sh, p));
      setSel(found?.id ?? null);
      if (found) dragging.current = { id: found.id, ox: p.x, oy: p.y };
      return;
    }
    if (tool === "eraser") {
      const found = [...shapes].reverse().find((sh) => hit(sh, p));
      if (found) {
        pushHist(shapes.filter((sh) => sh.id !== found.id));
        if (sel === found.id) setSel(null);
      }
      return;
    }
    if (tool === "label") {
      setLabelBox({ x: s.x, y: s.y });
      setLabelText("");
      drawing.current = false;
      return;
    }
    if (tool === "wall" || tool === "door") {
      setDraft({ id: "draft", kind: tool, a: s, b: s });
      return;
    }
    if (tool === "room") {
      setDraft({ id: "draft", kind: "room", a: s, b: s, fill, label: "" });
      return;
    }
    if (tool === "pen") {
      setDraft({ id: "draft", kind: "pen", pts: [p], color: WALL });
    }
  }

  function onMove(e: React.PointerEvent) {
    const p = pos(e);
    const s = { x: snap(p.x), y: snap(p.y) };
    if (tool === "select" && dragging.current) {
      const dx = p.x - dragging.current.ox;
      const dy = p.y - dragging.current.oy;
      dragging.current = { ...dragging.current, ox: p.x, oy: p.y };
      setShapes((xs) => xs.map((sh) => {
        if (sh.id !== dragging.current?.id) return sh;
        if (sh.kind === "room" || sh.kind === "wall" || sh.kind === "door") {
          return { ...sh, a: { x: sh.a.x + dx, y: sh.a.y + dy }, b: { x: sh.b.x + dx, y: sh.b.y + dy } };
        }
        if (sh.kind === "pen") return { ...sh, pts: sh.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
        return { ...sh, p: { x: sh.p.x + dx, y: sh.p.y + dy } };
      }));
      return;
    }
    if (!drawing.current || !draft) return;
    if (draft.kind === "pen") {
      setDraft({ ...draft, pts: [...draft.pts, p] });
      return;
    }
    setDraft({ ...draft, b: s });
  }

  function onUp() {
    drawing.current = false;
    if (dragging.current) {
      dragging.current = null;
      pushHist(shapesRef.current);
      return;
    }
    const current = shapesRef.current;
    if (!draft) return;
    if ((draft.kind === "wall" || draft.kind === "door") && dist(draft.a, draft.b) > 8) {
      pushHist([...current, { ...draft, id: nid() }]);
    } else if (draft.kind === "room") {
      const { a, b } = norm(draft.a, draft.b);
      if (b.x - a.x > 16 && b.y - a.y > 16) pushHist([...current, { ...draft, id: nid(), a, b }]);
    } else if (draft.kind === "pen" && draft.pts.length > 1) {
      pushHist([...current, { ...draft, id: nid() }]);
    }
    setDraft(null);
  }

  function undo() {
    if (history.current.length < 2) return;
    history.current = history.current.slice(0, -1);
    setShapes(history.current[history.current.length - 1]);
    setSel(null);
  }

  function paintSelected(color: string) {
    setFill(color);
    if (!sel) return;
    pushHist(shapes.map((s) => (s.id === sel && s.kind === "room" ? { ...s, fill: color } : s)));
  }

  function commitLabel() {
    if (!labelBox) return;
    const text = labelText.trim();
    if (text) pushHist([...shapes, { id: nid(), kind: "label", p: labelBox, text }]);
    setLabelBox(null);
    setLabelText("");
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "golfplan.png";
    a.click();
  }

  function resetBoard() {
    if (!confirm("Hreinsa borðið og byrja upp á nýtt?")) return;
    pushHist(STARTER);
    setSel(null);
  }

  return (
    <StationChrome tool="turbopaint">
      <div className="tp">
        <aside className="tp-rail">
          <div className="tp-brand">
            <b>TurboPaint</b>
            <small>Gólfplan · teikniborð</small>
          </div>
          <div className="tp-tools" role="toolbar" aria-label="Teikniverkfæri">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={tool === t.id ? "on" : ""}
                aria-pressed={tool === t.id}
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="tp-fills" aria-label="Litir">
            {FILLS.map((c) => (
              <button
                key={c}
                type="button"
                className={fill === c ? "on" : ""}
                style={{ background: c }}
                aria-label={`Litur ${c}`}
                onClick={() => paintSelected(c)}
              />
            ))}
          </div>
          <div className="tp-acts">
            <button type="button" onClick={undo}>Afturkalla</button>
            <button type="button" onClick={exportPng}>PNG</button>
            <button type="button" className="danger" onClick={resetBoard}>Hreinsa</button>
          </div>
        </aside>
        <div className="tp-stage" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="tp-canvas"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {labelBox && (
            <form
              className="tp-label"
              style={{ left: labelBox.x, top: labelBox.y }}
              onSubmit={(e) => { e.preventDefault(); commitLabel(); }}
            >
              <input
                autoFocus
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                onBlur={commitLabel}
                placeholder="Texti"
              />
            </form>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
