'use client';

/**
 * The table: a three.js scene that draws every part, animates them between the
 * scattered and assembled arrangements, and reports clicks back up.
 *
 * React owns the data; this component owns the WebGL objects and reconciles one
 * against the other. Meshes are keyed by part id so a re-render never rebuilds
 * geometry that has not actually changed.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

export interface ViewportHandle {
  frameAll(): void;
  snapshot(): string | null;
}

interface ViewportProps {
  parts: ViewportPart[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  wireframe: boolean;
  showGrid: boolean;
  measuring: boolean;
  measurePoints: [number, number, number][];
  onMeasurePoint: (point: [number, number, number]) => void;
  /** Change this value to re-frame the camera on everything. */
  frameToken: number;
}

const DEG = Math.PI / 180;
const EASE = 0.18;

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
  geometry.computeVertexNormals();
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
  measuring,
  measurePoints,
  onMeasurePoint,
  frameToken,
}: ViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<SceneRefs | null>(null);
  // Handlers change every render; a ref keeps the pointer listener stable.
  const handlers = useRef({ onSelect, onMeasurePoint, measuring });
  handlers.current = { onSelect, onMeasurePoint, measuring };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth || 1, host.clientHeight || 1);
    host.appendChild(renderer.domElement);

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

    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1, 2, 1.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.9);
    fill.position.set(-1.4, 0.6, -1);
    scene.add(fill);

    const grid = new THREE.GridHelper(1600, 32, 0x64748b, 0x334155);
    (grid.material as THREE.Material).opacity = 0.45;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const meshRoot = new THREE.Group();
    scene.add(meshRoot);
    const overlay = new THREE.Group();
    scene.add(overlay);

    const selection = new THREE.BoxHelper(new THREE.Object3D(), 0xf59e0b);
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
    let downAt: { x: number; y: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      downAt = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      // Ignore the pointer-up that ends an orbit drag.
      if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) {
        downAt = null;
        return;
      }
      downAt = null;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const hits = raycaster.intersectObjects([...state.meshes.values()], false);
      if (hits.length === 0) {
        if (!handlers.current.measuring) handlers.current.onSelect(null);
        return;
      }

      const hit = hits[0];
      if (handlers.current.measuring) {
        handlers.current.onMeasurePoint([hit.point.x, hit.point.y, hit.point.z]);
        return;
      }
      const id = (hit.object as THREE.Mesh).userData.partId as string | undefined;
      if (id) handlers.current.onSelect(id);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    return () => {
      cancelAnimationFrame(state.raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
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
    const distance = (radius / Math.sin((state.camera.fov * DEG) / 2)) * 1.6;

    state.controls.target.copy(center);
    state.camera.position.copy(center).add(new THREE.Vector3(0.75, 0.55, 1).setLength(distance));
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
      material.color.set(part.color);
      material.wireframe = wireframe;
      material.transparent = part.dimmed;
      material.opacity = part.dimmed ? 0.22 : 1;
      material.depthWrite = !part.dimmed;
      material.needsUpdate = true;

      mesh.rotation.set(part.rotation.x * DEG, part.rotation.y * DEG, part.rotation.z * DEG);
      mesh.scale.set(part.scale.x, part.scale.y, part.scale.z);
      state.targets.set(part.id, new THREE.Vector3(part.target.x, part.target.y, part.target.z));
    }
  }, [parts, wireframe]);

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
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false })
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
        new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false })
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

  return <div ref={hostRef} className="h-full w-full" style={{ cursor }} />;
}
