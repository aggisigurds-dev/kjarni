'use client';

/**
 * Raða — a collection arranged by hand: its parts seen from the side, flat
 * (orthographic), every part centred in depth, on a 5 cm grid with the table
 * and the 20 cm line. Drag a part to move it left, right, up or down (to the
 * millimetre; the arrow keys nudge the picked one), turn it (90° or 5° steps,
 * „Snúa við" turns it end for end, „Velta" rolls it a quarter turn towards
 * you), drag the background to pan, wheel or pinch to zoom, paint the picked
 * part — a colour or a metal (chrome, brushed steel, gold, silver, bronze) —
 * and switch depth layers off to see inside: 1 the outside, 2 what runs
 * through it, 3 what sits in that, 4 the rest; a part can be put on another. „Vista" stores the
 * places and colours with the parts in the library, and the collection's
 * picture stands as arranged; „Sjálfvirkt" hands every part back to the
 * AR-15 layout. The user, 17.10.2026: "ekkert endilega í 3d, 2d yrði líka
 * alveg í lagi — bara draga hlutina hægri vinstri upp og niður … og geta
 * málað partana þar líka".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Check, ChevronDown, Eye, EyeOff, FlipHorizontal2, Layers, Loader2, Rotate3d, RotateCcw, RotateCw, X } from 'lucide-react';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { toast } from 'sonner';
import { tidyTurn, type ArrangeChange, type Place } from '@/lib/3dwork/favorites';
import { FINISHES, lookFor, type Finish } from '@/lib/3dwork/finish';
import { computeBounds, type Bounds } from '@/lib/3dwork/mesh';
import { BOARD_HEIGHT_MM, defaultLayer, failureNote, LAYER_COUNT, sideLayout } from '@/lib/3dwork/parts-library';
import { previewOf, type HeroPart } from './collection-hero';
import { ACTION_GHOST, ACTION_PRIMARY } from './ui';

/** How far the picked part stands out in front, mm — so it is drawn over the others. */
const LIFT_MM = 400;

/** The metals' names here. */
const FINISH_NAMES: Record<string, string> = {
  chrome: 'Króm',
  'brushed-steel': 'Burstað stál',
  gold: 'Gull',
  silver: 'Silfur',
  bronze: 'Brons',
};

/** Colours to paint with: the bench's plastics and a few steels. */
const PAINTS = [
  '#f5f5f4', '#9ca3af', '#4b5563', '#1f2937', '#111111', '#ef4444', '#f97316', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#38bdf8', '#3b82f6', '#a855f7', '#ec4899', '#a16207',
];

/** The world axes a part turns about: z points at you, so a turn about it is a turn in the picture. */
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) } as const;

interface Item {
  mesh: THREE.Mesh;
  bounds: Bounds;
}

export function CollectionArranger({
  title,
  parts,
  onSave,
  onClose,
}: {
  title: string;
  parts: readonly HeroPart[];
  onSave: (changes: ArrangeChange[]) => Promise<void>;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const items = useRef(new Map<string, Item>());
  const places = useRef(new Map<string, Place>());
  // What each part was painted: a colour, or a metal finish with its colour.
  const paints = useRef(new Map<string, { color: string; finishId?: string }>());
  // Each part's depth layer, and the ones switched off.
  const layers = useRef(new Map<string, number>(parts.map((part) => [part.id, part.layer ?? defaultLayer(part.category)])));
  const [hiddenLayers, setHiddenLayers] = useState<Set<number>>(() => new Set());
  const [layered, setLayered] = useState(false);
  // The layer controls fold away, so the picture keeps the screen (18.10.2026, on the phone).
  const [showLayers, setShowLayers] = useState(false);
  const view = useRef<{
    renderer: THREE.WebGLRenderer;
    camera: THREE.OrthographicCamera;
    scene: THREE.Scene;
    draw: () => void;
    fit: () => void;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  const [progress, setProgress] = useState<{ done: number; total: number } | null>({ done: 0, total: parts.length });
  // What changed: a part moved (then every place is stored), back to automatic, or only colours.
  const [moved, setMoved] = useState(false);
  const [auto, setAuto] = useState(false);
  const [painted, setPainted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readout, setReadout] = useState<Place | null>(null);

  const put = useCallback((id: string, place: Place) => {
    const item = items.current.get(id);
    places.current.set(id, place);
    if (!item) return;
    item.mesh.position.set(place.x, place.y, selectedRef.current === id ? LIFT_MM : 0);
    item.mesh.quaternion.fromArray(place.q ?? [0, 0, 0, 1]);
  }, []);

  // The scene, the parts and the gestures — made once.
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      toast.error('Vafrinn gat ekki teiknað þrívídd.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // A room to reflect, so chrome, steel and gold read as metal and not as grey plastic.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = environment;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3b4252, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(-0.4, 0.8, 1);
    scene.add(key);

    // 5 cm grid, the table at 0 and the 20 cm line.
    const grid: number[] = [];
    for (let x = -3000; x <= 3000; x += 50) grid.push(x, -2000, -500, x, 3000, -500);
    for (let y = -2000; y <= 3000; y += 50) grid.push(-3000, y, -500, 3000, y, -500);
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    const gridLines = new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: 0xcbd5e1 }));
    scene.add(gridLines);
    const flat = (y: number, color: number) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-3000, y, -400, 3000, y, -400], 3));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
      scene.add(line);
      return line;
    };
    const table = flat(0, 0x475569);
    const twenty = flat(BOARD_HEIGHT_MM, 0xef4444);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
    camera.position.set(0, 150, 2000);
    let pxPerMm = 1;

    let frame = 0;
    const draw = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderer.render(scene, camera);
      });
    };
    const frustum = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.left = -width / 2 / pxPerMm;
      camera.right = width / 2 / pxPerMm;
      camera.top = height / 2 / pxPerMm;
      camera.bottom = -height / 2 / pxPerMm;
      camera.updateProjectionMatrix();
      draw();
    };
    // Everything in sight, with a margin.
    const fit = () => {
      const all = new THREE.Box3();
      for (const item of items.current.values()) all.expandByObject(item.mesh);
      if (all.isEmpty()) all.set(new THREE.Vector3(-200, 0, 0), new THREE.Vector3(200, 300, 0));
      all.expandByPoint(new THREE.Vector3(all.min.x, 0, 0));
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      const size = all.getSize(new THREE.Vector3());
      pxPerMm = Math.min(width / (size.x * 1.12 + 1), height / (size.y * 1.15 + 1));
      const centre = all.getCenter(new THREE.Vector3());
      camera.position.set(centre.x, centre.y, 2000);
      frustum();
    };
    view.current = { renderer, camera, scene, draw, fit };
    const observer = new ResizeObserver(frustum);
    observer.observe(host);

    // The world point under a pointer, on the plane the parts stand in.
    const worldAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector3(
        camera.position.x + (clientX - rect.left - rect.width / 2) / pxPerMm,
        camera.position.y - (clientY - rect.top - rect.height / 2) / pxPerMm,
        0
      );
    };
    const partAt = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      camera.updateMatrixWorld();
      ray.setFromCamera(
        new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1),
        camera
      );
      const meshes = [...items.current.entries()].filter(([, item]) => item.mesh.visible);
      const hits = ray.intersectObjects(meshes.map(([, item]) => item.mesh), false);
      const ids = hits.map((hit) => meshes.find(([, item]) => item.mesh === hit.object)?.[0]).filter((id): id is string => Boolean(id));
      // The picked part first, even where another covers it; else the one in front.
      return ids.find((id) => id === selectedRef.current) ?? ids[0] ?? null;
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { id: string; dx: number; dy: number } | null = null;
    let pan: { x: number; y: number; cx: number; cy: number; still: boolean } | null = null;
    let pinch: { distance: number; scale: number } | null = null;

    const down = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: pxPerMm };
        drag = null;
        pan = null;
        return;
      }
      const id = partAt(event.clientX, event.clientY);
      if (id) {
        const place = places.current.get(id) ?? { x: 0, y: 0 };
        const at = worldAt(event.clientX, event.clientY);
        drag = { id, dx: place.x - at.x, dy: place.y - at.y };
        setSelectedId(id);
        setReadout(place);
      } else {
        pan = { x: event.clientX, y: event.clientY, cx: camera.position.x, cy: camera.position.y, still: true };
      }
    };
    const move = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pxPerMm = Math.min(40, Math.max(0.05, (pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(pinch.distance, 1)));
        frustum();
        return;
      }
      if (drag) {
        const at = worldAt(event.clientX, event.clientY);
        const place = { ...places.current.get(drag.id), x: Math.round(at.x + drag.dx), y: Math.round(at.y + drag.dy) };
        put(drag.id, place);
        setReadout(place);
        setMoved(true);
        setAuto(false);
        draw();
      } else if (pan) {
        const dx = event.clientX - pan.x;
        const dy = event.clientY - pan.y;
        if (Math.hypot(dx, dy) > 4) pan.still = false;
        camera.position.x = pan.cx - dx / pxPerMm;
        camera.position.y = pan.cy + dy / pxPerMm;
        draw();
      }
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pan?.still) {
        setSelectedId(null);
        setReadout(null);
      }
      if (pointers.size === 0) {
        drag = null;
        pan = null;
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const before = worldAt(event.clientX, event.clientY);
      pxPerMm = Math.min(40, Math.max(0.05, pxPerMm * Math.exp(-event.deltaY * 0.0015)));
      frustum();
      const after = worldAt(event.clientX, event.clientY);
      camera.position.x += before.x - after.x;
      camera.position.y += before.y - after.y;
      draw();
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('pointercancel', up);
    renderer.domElement.addEventListener('wheel', wheel, { passive: false });

    // The parts, light meshes, one at a time; where each starts comes once all are in.
    let cancelled = false;
    void (async () => {
      const missing: string[] = [];
      for (const [index, part] of parts.entries()) {
        if (cancelled) return;
        setProgress({ done: index, total: parts.length });
        let soup: Float32Array | null = null;
        try {
          soup = await previewOf(part.versionId);
        } catch {
          soup = null;
        }
        if (cancelled) return;
        if (!soup || soup.length < 9) {
          missing.push(part.name);
          continue;
        }
        // Centred on its own box: it stands at its place and turns about its middle.
        const bounds = computeBounds(soup);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(soup, 3));
        geometry.translate(-bounds.center[0], -bounds.center[1], -bounds.center[2]);
        geometry.computeVertexNormals();
        const look = lookFor(part);
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: look.color, metalness: look.metalness, roughness: look.roughness })
        );
        scene.add(mesh);
        items.current.set(part.id, { mesh, bounds });
      }
      if (cancelled) return;
      const ready = parts.filter((part) => items.current.has(part.id));
      const start = sideLayout(
        ready.map((part) => ({ bounds: items.current.get(part.id)!.bounds, category: part.category, name: part.name, place: part.place }))
      );
      ready.forEach((part, index) => put(part.id, start[index]));
      setProgress(null);
      if (missing.length) toast.error(`Fann ekki möskvann í: ${missing.join(', ')}`);
      fit();
    })();

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('pointercancel', up);
      renderer.domElement.removeEventListener('wheel', wheel);
      for (const item of items.current.values()) {
        item.mesh.geometry.dispose();
        (item.mesh.material as THREE.Material).dispose();
      }
      items.current.clear();
      for (const line of [gridLines, table, twenty]) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      }
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      view.current = null;
    };
    // Made once for the parts it opened with; a change in the library meanwhile waits for the next opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The picked part glows a little and stands in front of the rest.
  useEffect(() => {
    for (const [id, item] of items.current) {
      const material = item.mesh.material as THREE.MeshStandardMaterial;
      material.emissive.set(id === selectedId ? 0x10b981 : 0x000000);
      material.emissiveIntensity = id === selectedId ? 0.35 : 0;
      const place = places.current.get(id);
      if (place) put(id, place);
    }
    view.current?.draw();
  }, [selectedId, put]);

  // Arrow keys nudge the picked part a millimetre (ten with Shift); Escape lets go of it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const id = selectedRef.current;
      if (!id || event.target instanceof HTMLInputElement) return;
      if (event.key === 'Escape') {
        setSelectedId(null);
        setReadout(null);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'r' || key === 'q' || key === 'e' || key === 'f') {
        event.preventDefault();
        if (key === 'f') turnRef.current(id, 'y', 180);
        else if (key === 'r') turnRef.current(id, 'z', event.shiftKey ? 90 : -90);
        else turnRef.current(id, 'z', key === 'q' ? 5 : -5);
        return;
      }
      const step = event.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const place = places.current.get(id) ?? { x: 0, y: 0 };
      const next = { ...place, x: place.x + delta[0], y: place.y + delta[1] };
      put(id, next);
      setReadout(next);
      setMoved(true);
      setAuto(false);
      view.current?.draw();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [put]);

  /** Turn a part about one of the world axes, about its own middle; null degrees sets it straight. */
  const turn = (id: string, axis: keyof typeof AXES, degrees: number | null) => {
    const place = places.current.get(id) ?? { x: 0, y: 0 };
    const now = new THREE.Quaternion().fromArray(place.q ?? [0, 0, 0, 1]);
    const next =
      degrees === null ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(AXES[axis], (degrees * Math.PI) / 180).multiply(now);
    const q = tidyTurn(next.toArray());
    const turned: Place = q ? { x: place.x, y: place.y, q } : { x: place.x, y: place.y };
    put(id, turned);
    setReadout(turned);
    setMoved(true);
    setAuto(false);
    view.current?.draw();
  };
  const turnRef = useRef(turn);
  turnRef.current = turn;

  /** Paint the picked part a colour, or give it a metal finish. */
  const paint = (colour: string, finish?: Finish) => {
    if (!selectedId) return;
    const choice = finish ? { color: finish.color, finishId: finish.id } : { color: colour };
    paints.current.set(selectedId, choice);
    const item = items.current.get(selectedId);
    if (item) {
      const look = lookFor(choice);
      const material = item.mesh.material as THREE.MeshStandardMaterial;
      material.color.set(look.color);
      material.metalness = look.metalness;
      material.roughness = look.roughness;
    }
    setPainted(true);
    view.current?.draw();
  };

  // Layers switched off hide their parts; a hidden part cannot stay picked.
  useEffect(() => {
    for (const [id, item] of items.current) item.mesh.visible = !hiddenLayers.has(layers.current.get(id) ?? 4);
    if (selectedRef.current && hiddenLayers.has(layers.current.get(selectedRef.current) ?? 4)) {
      setSelectedId(null);
      setReadout(null);
    }
    view.current?.draw();
  }, [hiddenLayers, progress]);

  const toggleLayer = (layer: number) =>
    setHiddenLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  /** Put the picked part on another depth layer. */
  const moveToLayer = (layer: number) => {
    if (!selectedId) return;
    layers.current.set(selectedId, layer);
    setLayered(true);
    const item = items.current.get(selectedId);
    if (item) item.mesh.visible = !hiddenLayers.has(layer);
    if (hiddenLayers.has(layer)) {
      setSelectedId(null);
      setReadout(null);
    }
    view.current?.draw();
  };
  const layerCount = (layer: number) => parts.filter((part) => (layers.current.get(part.id) ?? 4) === layer).length;

  // Every part back where the AR-15 layout puts it.
  const toAuto = () => {
    const ready = parts.filter((part) => items.current.has(part.id));
    const start = sideLayout(ready.map((part) => ({ bounds: items.current.get(part.id)!.bounds, category: part.category, name: part.name })));
    ready.forEach((part, index) => put(part.id, start[index]));
    setAuto(true);
    setMoved(false);
    setReadout(selectedId ? places.current.get(selectedId) ?? null : null);
    view.current?.fit();
  };

  const dirty = moved || auto || painted || layered;
  const save = async () => {
    const changes: ArrangeChange[] = parts.map((part) => {
      const paint = paints.current.get(part.id);
      const layer = layers.current.get(part.id);
      const startLayer = part.layer ?? defaultLayer(part.category);
      return {
        id: part.id,
        ...(auto ? { place: null } : moved ? { place: places.current.get(part.id) } : {}),
        ...(paint ? { color: paint.color, ...(paint.finishId ? { finishId: paint.finishId } : {}) } : {}),
        ...(layer !== undefined && layer !== startLayer ? { layer } : {}),
      };
    });
    setSaving(true);
    try {
      await onSave(changes.filter((change) => 'place' in change || 'color' in change || 'layer' in change));
      onClose();
    } catch (error) {
      toast.error(failureNote(error, 'Náði ekki að vista röðunina.'));
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm('Loka án þess að vista röðunina?')) return;
    onClose();
  };

  const selected = parts.find((part) => part.id === selectedId);
  const selectedPaint = selectedId ? paints.current.get(selectedId) ?? (selected ? { color: selected.color, finishId: selected.finishId } : undefined) : undefined;
  const selectedColour = selectedPaint?.finishId ? undefined : selectedPaint?.color;
  const selectedLayer = selectedId ? layers.current.get(selectedId) : undefined;
  const layerToggles = (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Lög">
      {Array.from({ length: LAYER_COUNT }, (_, index) => index + 1).map((layer) => {
        const off = hiddenLayers.has(layer);
        return (
          <button
            key={layer}
            type="button"
            className={`inline-flex min-h-8 items-center gap-1 rounded border px-2 text-[0.68rem] font-bold ${
              off
                ? 'border-dashed border-slate-300 bg-transparent text-slate-400'
                : 'border-[var(--wb-accent)] bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)]'
            }`}
            onClick={() => toggleLayer(layer)}
            aria-pressed={!off}
            title={`${off ? 'Kveikja á' : 'Slökkva á'} lagi ${layer} — ${['ytra byrðið', 'það sem fer í gegnum það', 'það sem er inni í því', 'annað'][layer - 1] ?? ''}`}
          >
            {off ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            Lag {layer}
            <span className="font-mono text-[0.6rem] opacity-70">{layerCount(layer)}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="wb-theme fixed inset-0 z-[80] flex flex-col bg-[var(--wb-ground)] text-[var(--wb-ink)]" role="dialog" aria-modal="true" aria-label={`Raða ${title}`}>
      <div className="flex items-center gap-1.5 border-b border-[var(--wb-panel-border)] bg-[var(--wb-panel)] px-2 py-1">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">Raða — {title}</span>
        <button
          type="button"
          className={`${ACTION_GHOST} inline-flex items-center gap-1`}
          onClick={toAuto}
          disabled={Boolean(progress) || saving}
          title="Sjálfvirkt — allt aftur í AR-15-uppröðunina"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sjálfvirkt</span>
        </button>
        <button type="button" className={`${ACTION_GHOST} inline-flex items-center gap-1`} onClick={close} disabled={saving} title="Hætta við">
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Hætta við</span>
        </button>
        <button
          type="button"
          className={`${ACTION_PRIMARY} inline-flex items-center gap-1`}
          onClick={() => void save()}
          disabled={!dirty || saving || Boolean(progress)}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Vista
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-gradient-to-b from-slate-50 to-slate-100">
        <div ref={box} className="absolute inset-0" />
        {progress && (
          <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded bg-white/90 px-2 py-1 text-[0.7rem] text-slate-700 shadow">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Sæki {Math.min(progress.done + 1, progress.total)}/{progress.total}…
          </div>
        )}
        <p className="pointer-events-none absolute bottom-2 left-2 right-2 hidden text-center text-[0.65rem] text-slate-500 md:block">
          Dragðu part til að færa hann · dragðu bakgrunninn til að hliðra · skrun eða klípa til að þysja · örvatakkar færa um 1 mm · R snýr 90°, Q/E 5°, F snýr við
        </p>
      </div>

      <div className="flex flex-col gap-1 border-t border-[var(--wb-panel-border)] bg-[var(--wb-panel)] px-2 py-1">
        <div className="flex items-center gap-1.5">
          <select
            className="min-h-8 min-w-0 flex-1 truncate rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-1.5 text-[0.72rem] font-bold text-[var(--wb-tool-ink)] sm:max-w-[18rem] sm:flex-none"
            value={selectedId ?? ''}
            onChange={(event) => {
              const id = event.target.value || null;
              setSelectedId(id);
              setReadout(id ? places.current.get(id) ?? null : null);
            }}
            aria-label="Velja part"
            title="Velja part — líka einn sem er falinn inni í öðrum"
          >
            <option value="">Velja part…</option>
            {parts.map((part) => (
              <option key={part.id} value={part.id}>
                {part.name}
              </option>
            ))}
          </select>
          {selected && readout && (
            <span className="shrink-0 font-mono text-[0.6rem] text-[var(--wb-ink-mute)]" title="x, y í mm">
              {Math.round(readout.x)}, {Math.round(readout.y)}
            </span>
          )}
          <button
            type="button"
            className={`ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 rounded border bg-[var(--wb-tool-bg)] px-2 text-[0.68rem] font-bold ${
              hiddenLayers.size > 0 ? 'border-amber-500 text-amber-800' : 'border-[var(--wb-tool-border)] text-[var(--wb-tool-ink)]'
            }`}
            onClick={() => setShowLayers((value) => !value)}
            aria-expanded={showLayers}
            title="Lög — slökkva á ytri lögum til að sjá inn, og setja part í lag"
          >
            <Layers className="h-3.5 w-3.5" />
            Lög{hiddenLayers.size > 0 ? ` · ${hiddenLayers.size} af` : ''}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLayers ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showLayers && (
          <div className="flex flex-wrap items-center gap-1">
            {layerToggles}
            {selected && (
              <div className="flex items-center gap-1" role="group" aria-label="Í lag">
                <span className="text-[0.62rem] font-bold text-[var(--wb-ink-mute)]">Í lag</span>
                {Array.from({ length: LAYER_COUNT }, (_, index) => index + 1).map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    className={`h-8 w-8 rounded border text-[0.7rem] font-bold ${
                      selectedLayer === layer
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]'
                    }`}
                    onClick={() => moveToLayer(layer)}
                    aria-pressed={selectedLayer === layer}
                    title={`Setja ${selected.name} í lag ${layer}`}
                  >
                    {layer}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selected ? (
          <>
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Snúa">
              {(
                [
                  { label: '90°', title: 'Snúa 90° rangsælis (Shift+R)', icon: RotateCcw, axis: 'z', degrees: 90 },
                  { label: '90°', title: 'Snúa 90° réttsælis (R)', icon: RotateCw, axis: 'z', degrees: -90 },
                  { label: '5°', title: 'Snúa 5° rangsælis (Q)', icon: RotateCcw, axis: 'z', degrees: 5 },
                  { label: '5°', title: 'Snúa 5° réttsælis (E)', icon: RotateCw, axis: 'z', degrees: -5 },
                  { label: 'Snúa við', title: 'Snúa endanum við — spegla á hlið (F)', icon: FlipHorizontal2, axis: 'y', degrees: 180 },
                  { label: 'Velta', title: 'Velta fjórðung að þér — sýnir aðra hlið', icon: Rotate3d, axis: 'x', degrees: 90 },
                ] as const
              ).map((button) => (
                <button
                  key={button.title}
                  type="button"
                  className="inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-1.5 text-[0.66rem] font-bold text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]"
                  onClick={() => selectedId && turn(selectedId, button.axis, button.degrees)}
                  title={button.title}
                  aria-label={button.title}
                >
                  <button.icon className="h-3.5 w-3.5" />
                  {button.label.endsWith('°') ? button.label : <span className="hidden sm:inline">{button.label}</span>}
                </button>
              ))}
              <button
                type="button"
                className="inline-flex min-h-8 shrink-0 items-center rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-1.5 text-[0.66rem] font-bold text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)] disabled:opacity-40"
                onClick={() => selectedId && turn(selectedId, 'z', null)}
                disabled={!readout?.q}
                title="Rétta partinn — eins og hann var vistaður"
              >
                Rétt
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Litur og málmur">
              {FINISHES.map((finish) => (
                <button
                  key={finish.id}
                  type="button"
                  className={`h-7 w-7 rounded-full border ${
                    selectedPaint?.finishId === finish.id ? 'ring-2 ring-emerald-500 ring-offset-1' : 'border-slate-400'
                  }`}
                  style={{ background: `linear-gradient(135deg, ${finish.color} 0%, #ffffff 45%, ${finish.color} 100%)` }}
                  onClick={() => paint(finish.color, finish)}
                  title={FINISH_NAMES[finish.id] ?? finish.name}
                  aria-label={`Málmur: ${FINISH_NAMES[finish.id] ?? finish.name}`}
                />
              ))}
              <span className="mx-0.5 h-5 w-px bg-slate-300" />
              {PAINTS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  className={`h-7 w-7 rounded-full border ${selectedColour === colour ? 'ring-2 ring-emerald-500 ring-offset-1' : 'border-slate-300'}`}
                  style={{ backgroundColor: colour }}
                  onClick={() => paint(colour)}
                  aria-label={`Mála ${colour}`}
                />
              ))}
              <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-dashed border-slate-400" title="Annar litur">
                <input
                  type="color"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={selectedColour && /^#[0-9a-f]{6}$/i.test(selectedColour) ? selectedColour : '#888888'}
                  onChange={(event) => paint(event.target.value)}
                  aria-label="Velja annan lit"
                />
                <span className="pointer-events-none flex h-full w-full items-center justify-center text-[0.7rem] text-slate-500">+</span>
              </label>
            </div>
          </>
        ) : (
          <span className="py-1 text-[0.7rem] text-[var(--wb-ink-mute)]">Pikkaðu á part til að færa hann, snúa eða mála.</span>
        )}
      </div>
    </div>
  );
}
