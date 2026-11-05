'use client';

/**
 * The Söfn page's picture: a collection's parts assembled as an AR-15 on a
 * plate — the way a new board from them is laid out (assemblyLayout) — with the
 * 20 cm line. Drawn from light copies of the meshes (simplifySoup) kept on this
 * computer by version id, so the next visit draws at once and only a changed
 * part is fetched again. Turn it with a finger or the mouse; tap a part to pick it.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Loader2, LocateFixed } from 'lucide-react';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadFavoriteGeometry, type Place } from '@/lib/3dwork/favorites';
import { lookFor } from '@/lib/3dwork/finish';
import { computeBounds, type Bounds } from '@/lib/3dwork/mesh';
import { AR_SLOTS, BOARD_HEIGHT_MM, collectionLayout } from '@/lib/3dwork/parts-library';
import { simplifySoup } from '@/lib/3dwork/preview-mesh';
import { loadGeometry, saveGeometry } from '@/lib/3dwork/storage';

export interface HeroPart {
  id: string;
  name: string;
  versionId: string;
  color: string;
  finishId?: string;
  /** Its category: the AR-15 slot it takes, if any. */
  category?: string;
  /** Where the user put it when arranging the collection, and how it is turned; none for the automatic layout. */
  place?: Place;
  /** Its depth layer, when put on one by hand; none: from its category. */
  layer?: number;
}

/** Triangles per part in the picture: enough to read the shape, light enough for a phone. */
const PREVIEW_TRIANGLES = 150_000;
// v2: made with the budget-searching simplifier — the first copies were far too coarse.
const previewKey = (versionId: string) => `preview2:${versionId}`;

/** A light copy of a saved part's mesh: kept on this computer, or fetched once and made. */
export async function previewOf(versionId: string): Promise<Float32Array | null> {
  const kept = await loadGeometry(previewKey(versionId));
  if (kept) return kept;
  const full = await loadFavoriteGeometry(versionId);
  if (!full) return null;
  const light = simplifySoup(full, PREVIEW_TRIANGLES);
  void saveGeometry(previewKey(versionId), light);
  return light;
}

/** The main body first, then the other slots, so the frame stands before the rest arrives. */
function loadOrder(parts: readonly HeroPart[]): HeroPart[] {
  const rank = (part: HeroPart) => {
    const slot = AR_SLOTS.findIndex((entry) => entry.category === part.category);
    return slot < 0 ? AR_SLOTS.length : slot;
  };
  return [...parts].sort((a, b) => rank(a) - rank(b));
}

interface Scene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  plate: THREE.Mesh;
  line: THREE.Mesh;
  meshes: Map<string, { mesh: THREE.Mesh; bounds: Bounds; name: string; category?: string; place?: Place }>;
  draw: () => void;
  moved: boolean;
}

export function CollectionHero({
  parts,
  selectedId,
  hiddenIds,
  onPick,
}: {
  parts: readonly HeroPart[];
  selectedId: string | null;
  hiddenIds: ReadonlySet<string>;
  onPick: (id: string | null) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const three = useRef<Scene | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; name?: string } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // The scene, made once.
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    // A room to reflect, so the metal finishes read as metal.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = environment;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3b4252, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(-0.6, 1.4, 1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(1, 0.4, -0.8);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1, 3, 1),
      new THREE.MeshStandardMaterial({ color: 0xd8dce3, roughness: 0.9, metalness: 0 })
    );
    scene.add(plate);
    const line = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    scene.add(line);

    let frame = 0;
    const draw = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderer.render(scene, camera);
      });
    };
    const state: Scene = { renderer, scene, camera, controls, plate, line, meshes: new Map(), draw, moved: false };
    three.current = state;
    controls.addEventListener('change', draw);
    controls.addEventListener('start', () => {
      state.moved = true;
    });

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // A tap (not a turn) picks the part under the finger, or nothing.
    let down: { x: number; y: number; at: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY, at: performance.now() };
    };
    const pointerUp = (event: PointerEvent) => {
      if (!down) return;
      const still = Math.hypot(event.clientX - down.x, event.clientY - down.y) < 6 && performance.now() - down.at < 600;
      down = null;
      if (!still) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      camera.updateMatrixWorld();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointer, camera);
      const visible = [...state.meshes.entries()].filter(([, entry]) => entry.mesh.visible);
      const hit = ray.intersectObjects(visible.map(([, entry]) => entry.mesh), false)[0];
      const id = hit ? visible.find(([, entry]) => entry.mesh === hit.object)?.[0] ?? null : null;
      onPickRef.current(id);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      controls.dispose();
      for (const entry of state.meshes.values()) {
        entry.mesh.geometry.dispose();
        (entry.mesh.material as THREE.Material).dispose();
      }
      plate.geometry.dispose();
      (plate.material as THREE.Material).dispose();
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  // The parts: each light mesh fetched or read from this computer, one at a time.
  const signature = parts
    .map((part) => `${part.id}:${part.versionId}:${part.color}:${part.finishId ?? ''}:${part.category ?? ''}:${part.place?.x ?? ''},${part.place?.y ?? ''},${part.place?.q?.join(',') ?? ''}`)
    .join('|');
  useEffect(() => {
    const state = three.current;
    if (!state) return;
    let cancelled = false;
    const wanted = new Map(parts.map((part) => [part.id, part]));
    // Parts gone from the collection, or changed, leave the picture.
    for (const [id, entry] of state.meshes) {
      const part = wanted.get(id);
      if (part && entry.mesh.userData.versionId === part.versionId && entry.category === part.category) {
        // The same mesh: only where it stands or its colour may have changed.
        entry.place = part.place;
        const look = lookFor(part);
        const material = entry.mesh.material as THREE.MeshStandardMaterial;
        material.color.set(look.color);
        material.metalness = look.metalness;
        material.roughness = look.roughness;
        continue;
      }
      state.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
      state.meshes.delete(id);
    }
    const todo = loadOrder(parts).filter((part) => !state.meshes.has(part.id));
    setFailed([]);
    setVersion((value) => value + 1);
    if (todo.length === 0) {
      setProgress(null);
      return;
    }
    void (async () => {
      const missing: string[] = [];
      for (const [index, part] of todo.entries()) {
        if (cancelled) return;
        setProgress({ done: index, total: todo.length, name: part.name });
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
        // Centred on its own box, so it stands at its place and turns about its middle.
        const bounds = computeBounds(soup);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(soup, 3));
        geometry.translate(-bounds.center[0], -bounds.center[1], -bounds.center[2]);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const look = lookFor(part);
        const material = new THREE.MeshStandardMaterial({ color: look.color, metalness: look.metalness, roughness: look.roughness });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.versionId = part.versionId;
        state.scene.add(mesh);
        state.meshes.set(part.id, { mesh, bounds, name: part.name, category: part.category, place: part.place });
        setVersion((value) => value + 1);
      }
      if (cancelled) return;
      setProgress(null);
      setFailed(missing);
    })();
    return () => {
      cancelled = true;
    };
    // `parts` is read through its signature: a new array with the same parts must not reload anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Layout, plate, highlight and camera, whenever the parts or what is shown change.
  useEffect(() => {
    const state = three.current;
    if (!state) return;
    const shown = [...state.meshes.entries()].filter(([id]) => !hiddenIds.has(id));
    for (const [id, entry] of state.meshes) entry.mesh.visible = !hiddenIds.has(id);
    const places = collectionLayout(
      shown.map(([, entry]) => ({ bounds: entry.bounds, category: entry.category, name: entry.name, place: entry.place }))
    );
    const all = new THREE.Box3();
    shown.forEach(([id, entry], index) => {
      const place = places[index];
      entry.mesh.position.set(place.x, place.y, place.z);
      entry.mesh.quaternion.fromArray(entry.place?.q ?? [0, 0, 0, 1]);
      entry.mesh.updateMatrixWorld();
      all.expandByObject(entry.mesh);
      const material = entry.mesh.material as THREE.MeshStandardMaterial;
      const dim = selectedId !== null && selectedId !== id;
      material.transparent = dim;
      material.opacity = dim ? 0.28 : 1;
      material.depthWrite = !dim;
      material.emissive.set(selectedId === id ? 0x10b981 : 0x000000);
      material.emissiveIntensity = selectedId === id ? 0.35 : 0;
      material.needsUpdate = true;
    });

    if (all.isEmpty()) all.set(new THREE.Vector3(-150, 0, -60), new THREE.Vector3(150, BOARD_HEIGHT_MM + 60, 60));
    const margin = 40;
    const width = all.max.x - all.min.x + margin * 2;
    const depth = all.max.z - all.min.z + margin * 2;
    state.plate.scale.set(width, 1, depth);
    state.plate.position.set((all.min.x + all.max.x) / 2, -1.5, (all.min.z + all.max.z) / 2);
    state.line.scale.set(all.max.x - all.min.x + margin, 1, 1);
    state.line.position.set((all.min.x + all.max.x) / 2, BOARD_HEIGHT_MM, 0);

    if (!state.moved) fit(state, all);
    state.draw();
  }, [version, hiddenIds, selectedId]);

  const recentre = () => {
    const state = three.current;
    if (!state) return;
    const all = new THREE.Box3();
    for (const entry of state.meshes.values()) if (entry.mesh.visible) all.expandByObject(entry.mesh);
    if (all.isEmpty()) return;
    state.moved = false;
    fit(state, all);
    state.draw();
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-gradient-to-b from-slate-100 to-slate-200">
      <div ref={box} className="absolute inset-0" />
      {progress && (
        <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[80%] items-center gap-1.5 rounded bg-white/90 px-2 py-1 text-[0.68rem] text-slate-700 shadow">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="truncate">
            Sæki {progress.done + 1}/{progress.total}
            {progress.name ? ` — ${progress.name}` : ''}
          </span>
        </div>
      )}
      {!progress && failed.length > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-2 max-w-[80%] truncate rounded bg-amber-50/95 px-2 py-1 text-[0.65rem] text-amber-800 shadow">
          Fann ekki möskvann í: {failed.join(', ')}
        </div>
      )}
      <button
        type="button"
        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow hover:bg-white"
        onClick={recentre}
        aria-label="Sýna allt aftur"
        title="Sýna allt aftur"
      >
        <LocateFixed className="h-4 w-4" />
      </button>
    </div>
  );
}

/** The camera on the parts from the side, toward the stock and a little above, the tray nearest — as the preview pictures were drawn. */
function fit(state: Scene, all: THREE.Box3) {
  const centre = all.getCenter(new THREE.Vector3());
  const radius = Math.max(all.getSize(new THREE.Vector3()).length() / 2, 50);
  const fov = (state.camera.fov * Math.PI) / 180;
  const aspect = Math.max(state.camera.aspect, 0.4);
  // Far enough for the whole sphere to fit the narrower of the two directions.
  const distance = (radius / Math.sin(Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * aspect)) / 2)) * 0.95;
  const azimuth = (30 * Math.PI) / 180;
  const elevation = (22 * Math.PI) / 180;
  state.camera.position.set(
    centre.x + distance * Math.cos(elevation) * Math.sin(azimuth),
    centre.y + distance * Math.sin(elevation),
    centre.z + distance * Math.cos(elevation) * Math.cos(azimuth)
  );
  state.camera.near = Math.max(distance / 100, 0.5);
  state.camera.far = distance * 20;
  state.camera.updateProjectionMatrix();
  state.controls.target.copy(centre);
  state.controls.update();
}
