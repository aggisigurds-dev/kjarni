'use client';

/**
 * The table: a three.js scene that draws every part, animates them between the
 * scattered and assembled arrangements, and reports clicks back up.
 *
 * React owns the data; this component owns the WebGL objects and reconciles one
 * against the other. Meshes are keyed by part id so a re-render never rebuilds
 * geometry that has not actually changed.
 *
 * The gunsmith callouts are HTML, not WebGL. Their world anchors are projected
 * to screen space inside the render loop and written straight to the DOM, so
 * dragging the camera never triggers a React render.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { smoothNormals } from '@/lib/3dwork/normals';
import { snapHint, snapNumber, snapTranslation, type Aabb } from '@/lib/3dwork/snap';

export interface ViewportPart {
  id: string;
  color: string;
  soup: Float32Array;
  /** Where the part should end up; it eases there rather than jumping. */
  target: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  /** Spare variants are drawn faded so the fitted part reads clearly. */
  dimmed: boolean;
}

export interface ViewportCallout {
  /** Slot id. */
  id: string;
  label: string;
  detail: string;
  anchor: { x: number; y: number; z: number };
  filled: boolean;
  /** Which variant of how many is fitted, for the x/y counter. */
  index: number;
  variants: number;
}

interface ViewportProps {
  parts: ViewportPart[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  wireframe: boolean;
  showGrid: boolean;
  /** Isolate: the selected part stays solid, everything else goes to glass. */
  xray: boolean;
  measuring: boolean;
  measurePoints: [number, number, number][];
  onMeasurePoint: (point: [number, number, number]) => void;
  callouts: ViewportCallout[];
  onCalloutSelect: (slotId: string) => void;
  onCalloutCycle: (slotId: string, direction: 1 | -1) => void;
  /** Change this value to re-frame the camera on everything. */
  frameToken: number;
  /** When true, parts can be put into move mode and dragged. */
  dragEnabled: boolean;
  /** The part currently in move mode — only it is grabbable in the view. */
  moveModeId: string | null;
  /** Whether a grab translates the part or spins it. */
  manipMode: 'move' | 'rotate';
  /** When rotating, lock to one world axis or spin freely. */
  rotateAxis: 'free' | 'x' | 'y' | 'z';
  /** Millimetre grid a drag snaps onto. */
  moveStep: number;
  /** Degree grid a rotate-drag snaps onto. */
  rotateStep: number;
  /** How far a face/centre/anchor may pull a drag, mm. */
  magnetMm: number;
  /** Other parts to magnet against, in world millimetres. */
  snapNeighbors: { id: string; box: Aabb }[];
  /** Slot anchors to snap a part's centre onto. */
  snapAnchors: { x: number; y: number; z: number }[];
  onSnapHint?: (hint: string | null) => void;
  /** Double-tap on a part: put it into move mode. */
  onEnterMoveMode: (id: string) => void;
  /** Commit a world-space move of a part (delta added to its offset). */
  onDragMove: (id: string, delta: { x: number; y: number; z: number }) => void;
  /** Commit a rotation of a part (delta degrees added to its rotation). */
  onDragRotate: (id: string, delta: { x: number; y: number; z: number }) => void;
}

const DEG = Math.PI / 180;
const EASE = 0.18;
const GHOST_COLOR = '#38bdf8';

/** Callout lane geometry, in pixels. */
const LANE_TOP = 44;
const LANE_BOTTOM_INSET = 76;
const LANE_MIN_GAP = 132;
const LANE_EDGE = 74;

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  meshRoot: THREE.Group;
  overlay: THREE.Group;
  grid: THREE.GridHelper;
  selection: THREE.BoxHelper;
  meshes: Map<string, THREE.Mesh>;
  targets: Map<string, THREE.Vector3>;
  raf: number;
}

function buildGeometry(soup: Float32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(soup, 3));
  // Not computeVertexNormals: on a soup with no shared vertices that gives
  // every triangle its own face normal, so a pipe renders as a ring of hard
  // strips however finely it is tessellated. Smoothing within a crease angle
  // makes round surfaces read as round while leaving real edges sharp.
  geometry.setAttribute('normal', new THREE.BufferAttribute(smoothNormals(soup), 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function Viewport({
  parts,
  selectedId,
  onSelect,
  wireframe,
  showGrid,
  xray,
  measuring,
  measurePoints,
  onMeasurePoint,
  callouts,
  onCalloutSelect,
  onCalloutCycle,
  frameToken,
  dragEnabled,
  moveModeId,
  manipMode,
  rotateAxis,
  moveStep,
  rotateStep,
  magnetMm,
  snapNeighbors,
  snapAnchors,
  onSnapHint,
  onEnterMoveMode,
  onDragMove,
  onDragRotate,
}: ViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<SceneRefs | null>(null);

  // Callout DOM, addressed by slot id and positioned from the render loop.
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const leaderRefs = useRef(new Map<string, SVGLineElement>());
  const dotRefs = useRef(new Map<string, SVGCircleElement>());
  const calloutData = useRef<ViewportCallout[]>(callouts);
  calloutData.current = callouts;

  // Handlers change every render; a ref keeps the pointer listener stable.
  const handlers = useRef({
    onSelect,
    onMeasurePoint,
    measuring,
    dragEnabled,
    moveModeId,
    manipMode,
    rotateAxis,
    moveStep,
    rotateStep,
    magnetMm,
    snapNeighbors,
    snapAnchors,
    onSnapHint,
    onEnterMoveMode,
    onDragMove,
    onDragRotate,
  });
  handlers.current = {
    onSelect,
    onMeasurePoint,
    measuring,
    dragEnabled,
    moveModeId,
    manipMode,
    rotateAxis,
    moveStep,
    rotateStep,
    magnetMm,
    snapNeighbors,
    snapAnchors,
    onSnapHint,
    onEnterMoveMode,
    onDragMove,
    onDragRotate,
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth || 1, host.clientHeight || 1);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      (host.clientWidth || 1) / (host.clientHeight || 1),
      1,
      20000
    );
    camera.position.set(420, 320, 520);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8bec9, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1, 2, 1.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.9);
    fill.position.set(-1.4, 0.6, -1);
    scene.add(fill);

    const grid = new THREE.GridHelper(1600, 32, 0x64748b, 0xcbd5e1);
    (grid.material as THREE.Material).opacity = 0.45;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const meshRoot = new THREE.Group();
    scene.add(meshRoot);
    const overlay = new THREE.Group();
    scene.add(overlay);

    const selection = new THREE.BoxHelper(new THREE.Object3D(), 0xd97706);
    selection.visible = false;
    scene.add(selection);

    const state: SceneRefs = {
      renderer,
      scene,
      camera,
      controls,
      meshRoot,
      overlay,
      grid,
      selection,
      meshes: new Map(),
      targets: new Map(),
      raf: 0,
    };
    refs.current = state;

    const projected = new THREE.Vector3();

    /** Place the callout labels in two lanes and de-overlap each lane. */
    const layoutCallouts = () => {
      const list = calloutData.current;
      if (list.length === 0) return;

      const width = renderer.domElement.clientWidth || 1;
      const height = renderer.domElement.clientHeight || 1;

      const placed: { id: string; sx: number; sy: number; lane: 'top' | 'bottom'; x: number }[] = [];

      for (const callout of list) {
        const label = labelRefs.current.get(callout.id);
        if (!label) continue;

        projected.set(callout.anchor.x, callout.anchor.y, callout.anchor.z).project(camera);
        const behind = projected.z > 1;
        const sx = (projected.x * 0.5 + 0.5) * width;
        const sy = (-projected.y * 0.5 + 0.5) * height;

        if (behind) {
          label.style.opacity = '0';
          label.style.pointerEvents = 'none';
          const leader = leaderRefs.current.get(callout.id);
          const dot = dotRefs.current.get(callout.id);
          if (leader) leader.setAttribute('opacity', '0');
          if (dot) dot.setAttribute('opacity', '0');
          continue;
        }

        label.style.opacity = '1';
        label.style.pointerEvents = 'auto';
        placed.push({
          id: callout.id,
          sx,
          sy,
          // Anchors above the middle of the frame get the top lane.
          lane: sy < height * 0.5 ? 'top' : 'bottom',
          x: Math.min(Math.max(sx, LANE_EDGE), width - LANE_EDGE),
        });
      }

      // Spread each lane so labels never sit on top of one another.
      for (const lane of ['top', 'bottom'] as const) {
        const row = placed.filter((entry) => entry.lane === lane).sort((a, b) => a.x - b.x);
        for (let i = 1; i < row.length; i++) {
          if (row[i].x - row[i - 1].x < LANE_MIN_GAP) row[i].x = row[i - 1].x + LANE_MIN_GAP;
        }
        // If the shuffle pushed past the right edge, walk the whole row back.
        const overflow = row.length > 0 ? row[row.length - 1].x - (width - LANE_EDGE) : 0;
        if (overflow > 0) for (const entry of row) entry.x -= overflow;
      }

      for (const entry of placed) {
        const label = labelRefs.current.get(entry.id);
        const leader = leaderRefs.current.get(entry.id);
        const dot = dotRefs.current.get(entry.id);
        const y = entry.lane === 'top' ? LANE_TOP : height - LANE_BOTTOM_INSET;

        if (label) label.style.transform = `translate3d(${entry.x}px, ${y}px, 0) translate(-50%, -50%)`;
        if (leader) {
          leader.setAttribute('x1', String(entry.x));
          leader.setAttribute('y1', String(entry.lane === 'top' ? y + 16 : y - 16));
          leader.setAttribute('x2', String(entry.sx));
          leader.setAttribute('y2', String(entry.sy));
          leader.setAttribute('opacity', '1');
        }
        if (dot) {
          dot.setAttribute('cx', String(entry.sx));
          dot.setAttribute('cy', String(entry.sy));
          dot.setAttribute('opacity', '1');
        }
      }
    };

    const tick = () => {
      state.raf = requestAnimationFrame(tick);
      // Ease every mesh toward its arrangement position; this is what makes
      // scatter and assemble read as one motion instead of a jump cut.
      for (const [id, mesh] of state.meshes) {
        const target = state.targets.get(id);
        if (target && mesh.position.distanceToSquared(target) > 1e-4) {
          mesh.position.lerp(target, EASE);
        }
      }
      if (state.selection.visible) state.selection.update();
      state.controls.update();
      state.renderer.render(state.scene, state.camera);
      layoutCallouts();
    };
    tick();

    const observer = new ResizeObserver(() => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    observer.observe(host);

    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const dragPlane = new THREE.Plane();
    const dragPoint = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    const worldBox = new THREE.Box3();
    const ROT_PER_PX = 0.35; // degrees of rotation per pixel dragged
    let downAt: { x: number; y: number } | null = null;
    let lastTap: { id: string; t: number } = { id: '', t: 0 };
    // Set while a move-mode grab is in progress; null the rest of the time.
    let drag:
      | {
          id: string;
          startClient: { x: number; y: number };
          startPoint: THREE.Vector3;
          startPos: THREE.Vector3;
          startRot: THREE.Euler;
          mode: 'move' | 'rotate';
          moved: boolean;
        }
      | null = null;

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (event: PointerEvent) => {
      downAt = { x: event.clientX, y: event.clientY };
      drag = null;
      const h = handlers.current;
      // A grab moves or rotates only the part that is in move mode; everything
      // else — including a merely-selected part — still orbits the camera.
      if (!h.dragEnabled || h.measuring || !event.isPrimary || !h.moveModeId) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...state.meshes.values()], false);
      if (hits.length === 0) return;
      const id = (hits[0].object as THREE.Mesh).userData.partId as string | undefined;
      const mesh = id ? state.meshes.get(id) : undefined;
      if (!id || id !== h.moveModeId || !mesh) return;

      // Move within the plane that faces the camera, through the grab point.
      camera.getWorldDirection(camDir);
      dragPlane.setFromNormalAndCoplanarPoint(camDir, hits[0].point);
      drag = {
        id,
        startClient: { x: event.clientX, y: event.clientY },
        startPoint: hits[0].point.clone(),
        startPos: mesh.position.clone(),
        startRot: mesh.rotation.clone(),
        mode: h.manipMode,
        moved: false,
      };
      // Stop the orbit for this gesture. OrbitControls already saw the down, but
      // its move handler bails while disabled, so the camera stays put.
      state.controls.enabled = false;
      renderer.domElement.style.cursor = 'grabbing';
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort */
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      const mesh = state.meshes.get(drag.id);
      if (!mesh) return;
      const h = handlers.current;
      if (drag.mode === 'rotate') {
        const yawPx = (event.clientX - drag.startClient.x) * ROT_PER_PX;
        const pitchPx = (event.clientY - drag.startClient.y) * ROT_PER_PX;
        const step = Math.max(0.1, h.rotateStep);
        const axis = h.rotateAxis;
        const next = drag.startRot.clone();
        if (axis === 'x' || axis === 'y' || axis === 'z') {
          // Dominant screen axis drives a single world axis — the CAD way to
          // get a rotation to land where you meant it.
          const amount = snapNumber(Math.abs(yawPx) >= Math.abs(pitchPx) ? yawPx : -pitchPx, step);
          next[axis] = drag.startRot[axis] + amount * DEG;
        } else if (event.shiftKey) {
          next.z = drag.startRot.z + snapNumber(yawPx, step) * DEG;
        } else {
          next.x = drag.startRot.x + snapNumber(pitchPx, step) * DEG;
          next.y = drag.startRot.y + snapNumber(yawPx, step) * DEG;
        }
        mesh.rotation.copy(next);
      } else {
        setPointer(event);
        raycaster.setFromCamera(pointer, camera);
        if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
        const x = drag.startPos.x + (dragPoint.x - drag.startPoint.x);
        const y = drag.startPos.y + (dragPoint.y - drag.startPoint.y);
        const z = drag.startPos.z + (dragPoint.z - drag.startPoint.z);
        mesh.position.set(x, y, z);
        mesh.updateMatrixWorld();

        worldBox.setFromObject(mesh);
        if (!worldBox.isEmpty()) {
          const neighbors = h.snapNeighbors
            .filter((entry) => entry.id !== drag!.id)
            .map((entry) => entry.box);
          const snap = snapTranslation(
            {
              min: [worldBox.min.x, worldBox.min.y, worldBox.min.z],
              max: [worldBox.max.x, worldBox.max.y, worldBox.max.z],
            },
            neighbors,
            { grid: h.moveStep, magnet: h.magnetMm, anchors: h.snapAnchors }
          );
          mesh.position.x += snap.delta.x;
          mesh.position.y += snap.delta.y;
          mesh.position.z += snap.delta.z;
          h.onSnapHint?.(snapHint(snap.hits));
        }

        // Keep the ease target in step so the part does not spring back.
        const target = state.targets.get(drag.id);
        if (target) target.copy(mesh.position);
        else state.targets.set(drag.id, mesh.position.clone());
      }
      if (downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) drag.moved = true;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (drag) {
        state.controls.enabled = true;
        renderer.domElement.style.cursor = '';
        try {
          renderer.domElement.releasePointerCapture(event.pointerId);
        } catch {
          /* nothing captured */
        }
        const mesh = state.meshes.get(drag.id);
        const h = handlers.current;
        if (drag.moved && mesh) {
          if (drag.mode === 'rotate') {
            h.onDragRotate(drag.id, {
              x: (mesh.rotation.x - drag.startRot.x) / DEG,
              y: (mesh.rotation.y - drag.startRot.y) / DEG,
              z: (mesh.rotation.z - drag.startRot.z) / DEG,
            });
          } else {
            h.onDragMove(drag.id, {
              x: mesh.position.x - drag.startPos.x,
              y: mesh.position.y - drag.startPos.y,
              z: mesh.position.z - drag.startPos.z,
            });
          }
        } else if (mesh) {
          // A grab that never crossed the threshold is just a tap: undo any
          // sub-threshold drift and leave the part where it was.
          mesh.position.copy(drag.startPos);
          mesh.rotation.copy(drag.startRot);
          state.targets.get(drag.id)?.copy(drag.startPos);
        }
        h.onSnapHint?.(null);
        drag = null;
        downAt = null;
        return;
      }

      // Ignore the pointer-up that ends an orbit drag.
      if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) {
        downAt = null;
        return;
      }
      downAt = null;

      setPointer(event);
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects([...state.meshes.values()], false);
      if (hits.length === 0) {
        // Tapping empty space clears the selection (and exits move mode).
        if (!handlers.current.measuring) handlers.current.onSelect(null);
        return;
      }

      const hit = hits[0];
      if (handlers.current.measuring) {
        handlers.current.onMeasurePoint([hit.point.x, hit.point.y, hit.point.z]);
        return;
      }
      const id = (hit.object as THREE.Mesh).userData.partId as string | undefined;
      if (!id) return;
      // Double-tap puts a part into move mode; a single tap just selects it.
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (handlers.current.dragEnabled && lastTap.id === id && now - lastTap.t < 320) {
        lastTap = { id: '', t: 0 };
        handlers.current.onEnterMoveMode(id);
      } else {
        lastTap = { id, t: now };
        handlers.current.onSelect(id);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    return () => {
      cancelAnimationFrame(state.raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      for (const mesh of state.meshes.values()) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      refs.current = null;
    };
  }, []);

  const frameAll = useCallback(() => {
    const state = refs.current;
    if (!state || state.meshes.size === 0) return;

    const box = new THREE.Box3();
    for (const mesh of state.meshes.values()) box.expandByObject(mesh);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1) * 0.5;
    const distance = (radius / Math.sin((state.camera.fov * DEG) / 2)) * 1.5;

    state.controls.target.copy(center);
    state.camera.position.copy(center).add(new THREE.Vector3(0.55, 0.42, 1).setLength(distance));
    state.camera.near = Math.max(distance / 500, 0.1);
    state.camera.far = distance * 20;
    state.camera.updateProjectionMatrix();
    state.controls.update();
  }, []);

  // Reconcile the scene against the part list.
  useEffect(() => {
    const state = refs.current;
    if (!state) return;

    const live = new Set(parts.map((part) => part.id));
    for (const [id, mesh] of state.meshes) {
      if (live.has(id)) continue;
      state.meshRoot.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      state.meshes.delete(id);
      state.targets.delete(id);
    }

    // Isolate only means something once a part is actually selected.
    const isolating = xray && selectedId !== null && live.has(selectedId);

    for (const part of parts) {
      let mesh = state.meshes.get(part.id);

      if (!mesh) {
        mesh = new THREE.Mesh(
          buildGeometry(part.soup),
          new THREE.MeshStandardMaterial({ metalness: 0.15, roughness: 0.55 })
        );
        mesh.userData.partId = part.id;
        // Start where it belongs so newly added parts do not fly in.
        mesh.position.set(part.target.x, part.target.y, part.target.z);
        state.meshRoot.add(mesh);
        state.meshes.set(part.id, mesh);
      } else if (mesh.userData.soup !== part.soup) {
        mesh.geometry.dispose();
        mesh.geometry = buildGeometry(part.soup);
      }
      mesh.userData.soup = part.soup;

      const material = mesh.material as THREE.MeshStandardMaterial;
      const ghosted = isolating && part.id !== selectedId;

      if (ghosted) {
        material.color.set(GHOST_COLOR);
        material.transparent = true;
        material.opacity = 0.2;
        material.depthWrite = false;
      } else {
        material.color.set(part.color);
        material.transparent = part.dimmed;
        material.opacity = part.dimmed ? 0.22 : 1;
        material.depthWrite = !part.dimmed;
      }

      material.wireframe = wireframe;
      // Ghosts render after the solids so the isolated part shows through.
      mesh.renderOrder = ghosted ? 1 : 0;
      material.needsUpdate = true;

      mesh.rotation.set(part.rotation.x * DEG, part.rotation.y * DEG, part.rotation.z * DEG);
      mesh.scale.set(part.scale.x, part.scale.y, part.scale.z);
      state.targets.set(part.id, new THREE.Vector3(part.target.x, part.target.y, part.target.z));
    }
  }, [parts, wireframe, xray, selectedId]);

  useEffect(() => {
    const state = refs.current;
    if (!state) return;
    const mesh = selectedId ? state.meshes.get(selectedId) : undefined;
    state.selection.visible = Boolean(mesh);
    if (mesh) {
      state.selection.setFromObject(mesh);
      state.selection.update();
    }
  }, [selectedId, parts]);

  useEffect(() => {
    const state = refs.current;
    if (state) state.grid.visible = showGrid;
  }, [showGrid]);

  // Redraw the ruler: a dot per click, a line between consecutive pairs.
  useEffect(() => {
    const state = refs.current;
    if (!state) return;

    // Detach first: removing while iterating `children` would skip entries.
    const previous = state.overlay.children.slice();
    state.overlay.clear();
    for (const child of previous) {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }

    if (measurePoints.length === 0) return;

    const dotGeometry = new THREE.SphereGeometry(1, 16, 12);
    const scale = Math.max(2, state.camera.position.length() / 120);
    for (const point of measurePoints) {
      const dot = new THREE.Mesh(
        dotGeometry.clone(),
        new THREE.MeshBasicMaterial({ color: 0xd97706, depthTest: false })
      );
      dot.position.set(point[0], point[1], point[2]);
      dot.scale.setScalar(scale);
      dot.renderOrder = 10;
      state.overlay.add(dot);
    }
    dotGeometry.dispose();

    if (measurePoints.length >= 2) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
          measurePoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
        ),
        new THREE.LineBasicMaterial({ color: 0xd97706, depthTest: false })
      );
      line.renderOrder = 11;
      state.overlay.add(line);
    }
  }, [measurePoints]);

  useEffect(() => {
    if (frameToken === 0) return;
    // Wait a frame: on the first import the meshes have only just been added,
    // and the canvas may not have its final size yet.
    const handle = requestAnimationFrame(() => frameAll());
    return () => cancelAnimationFrame(handle);
  }, [frameToken, frameAll]);

  const cursor = useMemo(() => (measuring ? 'crosshair' : 'grab'), [measuring]);

  return (
    <div ref={hostRef} className="relative h-full w-full" style={{ cursor }}>
      {callouts.length > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <svg className="absolute inset-0 h-full w-full">
            {callouts.map((callout) => (
              <g key={callout.id}>
                <line
                  ref={(element) => {
                    if (element) leaderRefs.current.set(callout.id, element);
                    else leaderRefs.current.delete(callout.id);
                  }}
                  stroke={callout.filled ? '#059669' : '#94a3b8'}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0}
                />
                <circle
                  ref={(element) => {
                    if (element) dotRefs.current.set(callout.id, element);
                    else dotRefs.current.delete(callout.id);
                  }}
                  r={3}
                  fill={callout.filled ? '#059669' : '#94a3b8'}
                  opacity={0}
                />
              </g>
            ))}
          </svg>

          {callouts.map((callout) => (
            <div
              key={callout.id}
              ref={(element) => {
                if (element) labelRefs.current.set(callout.id, element);
                else labelRefs.current.delete(callout.id);
              }}
              className="absolute left-0 top-0 will-change-transform"
              style={{ opacity: 0 }}
            >
              <div
                className={`flex items-stretch overflow-hidden rounded border backdrop-blur-sm ${
                  callout.filled
                    ? 'border-emerald-500 bg-white/90'
                    : 'border-slate-300 bg-white/90'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onCalloutCycle(callout.id, -1)}
                  disabled={callout.variants < 2}
                  className="px-1.5 text-slate-500 transition-colors hover:text-emerald-600 disabled:opacity-25"
                  aria-label={`Previous ${callout.label}`}
                >
                  ‹
                </button>

                <button
                  type="button"
                  onClick={() => onCalloutSelect(callout.id)}
                  className="min-w-[74px] px-2 py-1 text-left"
                >
                  <div
                    className={`text-[0.58rem] font-extrabold uppercase tracking-[0.06em] ${
                      callout.filled ? 'text-emerald-600' : 'text-slate-500'
                    }`}
                  >
                    {callout.label}
                  </div>
                  <div className="max-w-[120px] truncate text-[0.68rem] font-bold text-slate-800">
                    {callout.detail}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onCalloutCycle(callout.id, 1)}
                  disabled={callout.variants < 2}
                  className="px-1.5 text-slate-500 transition-colors hover:text-emerald-600 disabled:opacity-25"
                  aria-label={`Next ${callout.label}`}
                >
                  ›
                </button>

                {callout.variants > 1 && (
                  <span className="flex items-center bg-slate-100 px-1.5 font-mono text-[0.58rem] text-slate-500">
                    {callout.index + 1}/{callout.variants}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
