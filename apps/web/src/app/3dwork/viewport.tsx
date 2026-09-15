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
 *
 * The 3D Builder view draws the same scene the way Microsoft 3D Builder does:
 * plain grey parts under even light, a blue outline around every picked part,
 * and a drag on any picked part moves all of them.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';

import { smoothNormals } from '@/lib/3dwork/normals';
import { isSlowMachine } from '@/lib/3dwork/slow-machine';
import { snapAngle, snapHint, snapTranslation, type Aabb } from '@/lib/3dwork/snap';

export interface ViewportPart {
  id: string;
  color: string;
  metalness: number;
  roughness: number;
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
  /** Every picked part: the selected one and any marked alongside it. */
  pickedIds: string[];
  /** A tap on a part or on nothing; `additive` when Ctrl, ⌘ or Shift was held. */
  onSelect: (id: string | null, additive: boolean) => void;
  /**
   * 3D Builder view: plain grey parts under even light, a blue outline around
   * every picked part, and a drag on any picked part moves all of them.
   */
  builder: boolean;
  /**
   * The cut the Slice dialog is about to make, in the selected part's own
   * coordinates. Drawn as a plane across the part; null when no cut is being
   * set up.
   */
  slicePreview: { axis: 'x' | 'y' | 'z'; position: number } | null;
  wireframe: boolean;
  showGrid: boolean;
  /** Isolate: the selected part stays solid, everything else goes to glass. */
  xray: boolean;
  measuring: boolean;
  measurePoints: [number, number, number][];
  onMeasurePoint: (point: [number, number, number]) => void;
  /** Paint vertices on the selected part (edge-align / hole-fill). */
  painting: boolean;
  paintRadiusMm: number;
  paintPartId: string | null;
  /** Local-space XYZ triples of already-painted vertices. */
  paintLocal: Float32Array;
  onPaintAt: (partId: string, localPoint: [number, number, number], erase: boolean) => void;
  callouts: ViewportCallout[];
  onCalloutSelect: (slotId: string) => void;
  onCalloutCycle: (slotId: string, direction: 1 | -1) => void;
  /** Change this value to re-frame the camera on everything. */
  frameToken: number;
  /** When true, parts can be put into move mode and dragged. */
  dragEnabled: boolean;
  /** The part currently in move mode — only it is grabbable in the plain view. */
  moveModeId: string | null;
  /** Whether a grab translates the part or spins it. */
  manipMode: 'move' | 'rotate';
  /** When rotating, lock to one world axis or spin freely. */
  rotateAxis: 'free' | 'x' | 'y' | 'z';
  /** When moving, lock to one world axis or slide freely. */
  moveAxis: 'xyz' | 'x' | 'y' | 'z';
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
  /** Commit a world-space move of parts (the same delta added to each offset). */
  onDragMove: (ids: string[], delta: { x: number; y: number; z: number }) => void;
  /** Commit a rotation of a part (delta degrees added to its rotation). */
  onDragRotate: (id: string, delta: { x: number; y: number; z: number }) => void;
}

const DEG = Math.PI / 180;
const EASE = 0.18;
const GHOST_COLOR = '#38bdf8';
/** Box around each part marked alongside the selected one, in the plain view. */
const MARKED_BOX_COLOR = 0x0ea5e9;
const PLAIN_BACKGROUND = 0xd5d8dc;
/** The 3D Builder view's palette. */
const BUILDER_PART = '#c3c7cd';
const BUILDER_PICKED = '#8fbcef';
const BUILDER_OUTLINE = '#1a6fe0';
const BUILDER_OUTLINE_HIDDEN = '#86b1ea';
/** The cut the Slice dialog is setting up. */
const SLICE_PLANE_COLOR = 0x0ea5e9;
const SLICE_EDGE_COLOR = 0x0284c7;
/** Light intensities per view: sky, key, fill, and the headlight on the camera. */
const PLAIN_LIGHTS = { hemi: 1.4, key: 1.8, fill: 0.55, head: 0 };
// A strong key from one side and a weak headlight, so the faces of a part
// come out in different greys instead of one flat, lit-from-the-front sheet.
const BUILDER_LIGHTS = { hemi: 1.0, key: 2.2, fill: 0.6, head: 0.6 };

function makeCheckerFloor(sizeMm = 1600): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#e8eaed';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#cfd3d8';
    ctx.fillRect(0, 0, 8, 8);
    ctx.fillRect(8, 8, 8, 8);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(sizeMm / 80, sizeMm / 80);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sizeMm, sizeMm),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.4;
  mesh.receiveShadow = true;
  return mesh;
}

/** A pale build plate ruled every 10 mm, the way 3D Builder draws its platform. */
function makeBuilderFloor(sizeMm = 1600): THREE.Group {
  const floor = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(sizeMm, sizeMm),
    // Pushed back in depth so the grid lines never flicker through it.
    new THREE.MeshBasicMaterial({
      color: 0xe4e9ef,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = -0.4;
  floor.add(plate);
  const fine = new THREE.GridHelper(sizeMm, sizeMm / 10, 0xcbd5e2, 0xcbd5e2);
  fine.position.y = -0.4;
  floor.add(fine);
  // Drawn after the fine lines at the same depth, so it wins where they cross.
  const coarse = new THREE.GridHelper(sizeMm, sizeMm / 50, 0x9db2cf, 0x9db2cf);
  coarse.position.y = -0.4;
  coarse.renderOrder = 1;
  floor.add(coarse);
  return floor;
}

/** Light at the top fading to cool grey at the bottom, behind the builder view. */
function makeBuilderBackground(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#fbfcfd');
    gradient.addColorStop(1, '#d6dce4');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Free the geometry and materials of everything under an object. */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}

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
  paintMarks: THREE.Group;
  /** The plain view's checker floor. */
  grid: THREE.Object3D;
  /** The builder view's build plate. */
  plate: THREE.Group;
  selection: THREE.BoxHelper;
  /** A box around each marked part, in the plain view. */
  markedBoxes: THREE.Group;
  /** The cut the Slice dialog is setting up, drawn across the part. */
  slicePlane: THREE.Group;
  lights: {
    hemi: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    head: THREE.DirectionalLight;
  };
  backgrounds: { plain: THREE.Color; builder: THREE.Texture };
  /** The plain view's room reflections; null on a slow machine. */
  environment: THREE.Texture | null;
  /** Draws the builder view with its outline; null on a slow machine. */
  composer: EffectComposer | null;
  outline: OutlinePass | null;
  builder: boolean;
  meshes: Map<string, THREE.Mesh>;
  targets: Map<string, THREE.Vector3>;
  raf: number;
}

/** A grab in progress: the part held, and any picked parts riding along with it. */
interface Grab {
  id: string;
  startClient: { x: number; y: number };
  startPoint: THREE.Vector3;
  startPos: THREE.Vector3;
  startRot: THREE.Euler;
  mode: 'move' | 'rotate';
  /** Axis lock: move mode's setting, or none for a drag in the builder view. */
  axis: 'xyz' | 'x' | 'y' | 'z';
  /** The other picked parts moving with it, by where each one started. */
  riders: Map<string, THREE.Vector3>;
  moved: boolean;
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
  pickedIds,
  onSelect,
  builder,
  slicePreview,
  wireframe,
  showGrid,
  xray,
  measuring,
  measurePoints,
  onMeasurePoint,
  painting,
  paintRadiusMm,
  paintPartId,
  paintLocal,
  onPaintAt,
  callouts,
  onCalloutSelect,
  onCalloutCycle,
  frameToken,
  dragEnabled,
  moveModeId,
  manipMode,
  rotateAxis,
  moveAxis,
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

  // A new array every render; the effects key on what is in it instead.
  const pickedKey = pickedIds.join('\n');
  const picked = useMemo(() => new Set(pickedKey ? pickedKey.split('\n') : []), [pickedKey]);
  // Likewise for the cut plane: its two numbers, not the object holding them.
  const sliceAxis = slicePreview?.axis ?? null;
  const slicePosition = slicePreview?.position ?? null;

  // Handlers change every render; a ref keeps the pointer listener stable.
  const handlers = useRef({
    onSelect,
    pickedIds,
    builder,
    onMeasurePoint,
    measuring,
    painting,
    paintRadiusMm,
    paintPartId,
    onPaintAt,
    dragEnabled,
    moveModeId,
    manipMode,
    rotateAxis,
    moveAxis,
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
    pickedIds,
    builder,
    onMeasurePoint,
    measuring,
    painting,
    paintRadiusMm,
    paintPartId,
    onPaintAt,
    dragEnabled,
    moveModeId,
    manipMode,
    rotateAxis,
    moveAxis,
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

    const slow = isSlowMachine();
    const renderer = new THREE.WebGLRenderer({
      antialias: !slow,
      alpha: true,
      powerPreference: slow ? 'low-power' : 'default',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, slow ? 1 : 1.5));
    renderer.setSize(host.clientWidth || 1, host.clientHeight || 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';

    const scene = new THREE.Scene();
    const plainBackground = new THREE.Color(PLAIN_BACKGROUND);
    const builderBackground = makeBuilderBackground();
    scene.background = plainBackground;
    const camera = new THREE.PerspectiveCamera(
      35,
      (host.clientWidth || 1) / (host.clientHeight || 1),
      1,
      20000
    );
    camera.position.set(40, 90, 480);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !slow;
    controls.dampingFactor = 0.08;
    controls.target.set(40, 20, 0);

    let envMap: THREE.Texture | null = null;
    if (!slow) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envMap;
      pmrem.dispose();
    }

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8bec9, PLAIN_LIGHTS.hemi);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, PLAIN_LIGHTS.key);
    key.position.set(1, 2, 1.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, PLAIN_LIGHTS.fill);
    fill.position.set(-1.4, 0.6, -1);
    scene.add(fill);
    // Shines from the camera in the builder view, so whatever you look at is
    // lit. It stays in the scene, dark, in the plain view: switching views then
    // never recompiles every material for a different number of lights.
    const head = new THREE.DirectionalLight(0xffffff, PLAIN_LIGHTS.head);
    scene.add(head, head.target);

    const grid = makeCheckerFloor();
    scene.add(grid);
    const plate = makeBuilderFloor();
    plate.visible = false;
    scene.add(plate);

    const meshRoot = new THREE.Group();
    scene.add(meshRoot);
    const overlay = new THREE.Group();
    scene.add(overlay);
    const paintMarks = new THREE.Group();
    scene.add(paintMarks);

    const selection = new THREE.BoxHelper(new THREE.Object3D(), 0xd97706);
    selection.visible = false;
    scene.add(selection);
    const markedBoxes = new THREE.Group();
    scene.add(markedBoxes);
    const slicePlane = new THREE.Group();
    slicePlane.visible = false;
    scene.add(slicePlane);

    // The builder view's outline is a post-processing pass. It draws into a
    // multisampled target so edges stay as smooth as on the canvas itself.
    let composer: EffectComposer | null = null;
    let outline: OutlinePass | null = null;
    if (!slow) {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      composer = new EffectComposer(
        renderer,
        new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 })
      );
      composer.setSize(width, height);
      composer.addPass(new RenderPass(scene, camera));
      outline = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
      outline.edgeStrength = 6;
      outline.edgeThickness = 1;
      outline.edgeGlow = 0;
      outline.visibleEdgeColor.set(BUILDER_OUTLINE);
      outline.hiddenEdgeColor.set(BUILDER_OUTLINE_HIDDEN);
      composer.addPass(outline);
      composer.addPass(new OutputPass());
    }

    const state: SceneRefs = {
      renderer,
      scene,
      camera,
      controls,
      meshRoot,
      overlay,
      paintMarks,
      grid,
      plate,
      selection,
      markedBoxes,
      slicePlane,
      lights: { hemi, key, fill, head },
      backgrounds: { plain: plainBackground, builder: builderBackground },
      environment: envMap,
      composer,
      outline,
      builder: false,
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

    let running = true;
    const tick = () => {
      if (!running) return;
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
      for (const box of state.markedBoxes.children) (box as THREE.BoxHelper).update();
      // The cut plane rides the part it belongs to while that part eases home.
      if (state.slicePlane.visible) {
        const part = state.meshes.get(state.slicePlane.userData.partId as string);
        if (part) {
          state.slicePlane.position.copy(part.position);
          state.slicePlane.quaternion.copy(part.quaternion);
          state.slicePlane.scale.copy(part.scale);
        }
      }
      state.controls.update();
      if (state.builder) {
        head.position.copy(camera.position);
        head.target.position.copy(controls.target);
      }
      if (state.builder && state.composer) state.composer.render();
      else state.renderer.render(state.scene, state.camera);
      layoutCallouts();
    };
    tick();

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(state.raf);
        return;
      }
      if (!running) {
        running = true;
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const observer = new ResizeObserver(() => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer?.setSize(width, height);
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
    // Set while a grab is in progress; null the rest of the time.
    let drag: Grab | null = null;
    let paintStroke = false;
    const localHit = new THREE.Vector3();

    const paintAtEvent = (event: PointerEvent) => {
      const h = handlers.current;
      if (!h.painting) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...state.meshes.values()], false);
      if (hits.length === 0) return;
      const mesh = hits[0].object as THREE.Mesh;
      const id = mesh.userData.partId as string | undefined;
      if (!id || (h.paintPartId && id !== h.paintPartId)) return;
      localHit.copy(hits[0].point);
      mesh.worldToLocal(localHit);
      h.onPaintAt(id, [localHit.x, localHit.y, localHit.z], event.shiftKey);
    };

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    /** Put every part riding along with a grab at the same offset as the part held. */
    const carryRiders = (grab: Grab, held: THREE.Mesh) => {
      for (const [riderId, start] of grab.riders) {
        state.meshes
          .get(riderId)
          ?.position.set(
            start.x + held.position.x - grab.startPos.x,
            start.y + held.position.y - grab.startPos.y,
            start.z + held.position.z - grab.startPos.z
          );
      }
    };

    /** Keep a part's ease target where the drag put it, so it does not spring back. */
    const holdTarget = (id: string, position: THREE.Vector3) => {
      const target = state.targets.get(id);
      if (target) target.copy(position);
      else state.targets.set(id, position.clone());
    };

    /** Whether the ray passes through the box of any of these parts — cheap next to a raycast. */
    const rayNears = (ids: readonly (string | null)[]) =>
      ids.some((id) => {
        const mesh = id ? state.meshes.get(id) : undefined;
        return mesh ? raycaster.ray.intersectsBox(worldBox.setFromObject(mesh)) : false;
      });

    const onPointerDown = (event: PointerEvent) => {
      downAt = { x: event.clientX, y: event.clientY };
      drag = null;
      const h = handlers.current;
      if (h.painting && event.isPrimary) {
        paintStroke = true;
        state.controls.enabled = false;
        renderer.domElement.style.cursor = 'crosshair';
        try {
          renderer.domElement.setPointerCapture(event.pointerId);
        } catch {
          /* capture is best-effort */
        }
        paintAtEvent(event);
        return;
      }
      // A grab moves or rotates the part in move mode, and in the builder view a
      // grab on any picked part moves every picked part. Everything else — a
      // merely selected part in the plain view, the right and middle buttons —
      // still works the camera.
      if (!h.dragEnabled || h.measuring || !event.isPrimary || event.button !== 0) return;
      const grabbable = h.builder ? [h.moveModeId, ...h.pickedIds] : [h.moveModeId];
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      if (!rayNears(grabbable)) return;
      const hits = raycaster.intersectObjects([...state.meshes.values()], false);
      if (hits.length === 0) return;
      const id = (hits[0].object as THREE.Mesh).userData.partId as string | undefined;
      const mesh = id ? state.meshes.get(id) : undefined;
      if (!id || !mesh || !grabbable.includes(id)) return;

      const armed = id === h.moveModeId;
      const mode = armed ? h.manipMode : 'move';
      const riders = new Map<string, THREE.Vector3>();
      if (mode === 'move' && h.pickedIds.includes(id)) {
        for (const other of h.pickedIds) {
          const rider = other === id ? undefined : state.meshes.get(other);
          if (rider) riders.set(other, rider.position.clone());
        }
      }

      // Move within the plane that faces the camera, through the grab point.
      camera.getWorldDirection(camDir);
      dragPlane.setFromNormalAndCoplanarPoint(camDir, hits[0].point);
      drag = {
        id,
        startClient: { x: event.clientX, y: event.clientY },
        startPoint: hits[0].point.clone(),
        startPos: mesh.position.clone(),
        startRot: mesh.rotation.clone(),
        mode,
        axis: armed ? h.moveAxis : 'xyz',
        riders,
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
      if (paintStroke) {
        paintAtEvent(event);
        return;
      }
      if (!drag) return;
      const grab = drag;
      const mesh = state.meshes.get(grab.id);
      if (!mesh) return;
      const h = handlers.current;
      if (grab.mode === 'rotate') {
        const yawPx = (event.clientX - grab.startClient.x) * ROT_PER_PX;
        const pitchPx = (event.clientY - grab.startClient.y) * ROT_PER_PX;
        const step = Math.max(0.1, h.rotateStep);
        const axis = h.rotateAxis;
        const next = grab.startRot.clone();
        if (axis === 'x' || axis === 'y' || axis === 'z') {
          // Dominant screen axis drives a single world axis — the CAD way to
          // get a rotation to land where you meant it.
          const raw = Math.abs(yawPx) >= Math.abs(pitchPx) ? yawPx : -pitchPx;
          const abs = grab.startRot[axis] / DEG + raw;
          next[axis] = snapAngle(abs, step) * DEG;
        } else if (event.shiftKey) {
          next.z = snapAngle(grab.startRot.z / DEG + yawPx, step) * DEG;
        } else {
          next.x = snapAngle(grab.startRot.x / DEG + pitchPx, step) * DEG;
          next.y = snapAngle(grab.startRot.y / DEG + yawPx, step) * DEG;
        }
        mesh.rotation.copy(next);
      } else {
        setPointer(event);
        raycaster.setFromCamera(pointer, camera);
        if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
        const lock = grab.axis;
        mesh.position.set(
          lock === 'y' || lock === 'z' ? grab.startPos.x : grab.startPos.x + (dragPoint.x - grab.startPoint.x),
          lock === 'x' || lock === 'z' ? grab.startPos.y : grab.startPos.y + (dragPoint.y - grab.startPoint.y),
          lock === 'x' || lock === 'y' ? grab.startPos.z : grab.startPos.z + (dragPoint.z - grab.startPoint.z)
        );
        carryRiders(grab, mesh);

        // Everything that moves snaps as one block against everything that does not.
        worldBox.setFromObject(mesh);
        for (const riderId of grab.riders.keys()) {
          const rider = state.meshes.get(riderId);
          if (rider) worldBox.expandByObject(rider);
        }
        if (!worldBox.isEmpty()) {
          const neighbors = h.snapNeighbors
            .filter((entry) => entry.id !== grab.id && !grab.riders.has(entry.id))
            .map((entry) => entry.box);
          const snap = snapTranslation(
            {
              min: [worldBox.min.x, worldBox.min.y, worldBox.min.z],
              max: [worldBox.max.x, worldBox.max.y, worldBox.max.z],
            },
            neighbors,
            {
              grid: h.moveStep,
              magnet: h.magnetMm,
              anchors: h.snapAnchors,
              axes: lock === 'xyz' ? undefined : [lock],
            }
          );
          mesh.position.x += snap.delta.x;
          mesh.position.y += snap.delta.y;
          mesh.position.z += snap.delta.z;
          carryRiders(grab, mesh);
          h.onSnapHint?.(snapHint(snap.hits));
        }

        holdTarget(grab.id, mesh.position);
        for (const riderId of grab.riders.keys()) {
          const rider = state.meshes.get(riderId);
          if (rider) holdTarget(riderId, rider.position);
        }
      }
      if (downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) grab.moved = true;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (paintStroke) {
        paintStroke = false;
        state.controls.enabled = true;
        renderer.domElement.style.cursor = handlers.current.painting ? 'crosshair' : '';
        try {
          renderer.domElement.releasePointerCapture(event.pointerId);
        } catch {
          /* nothing captured */
        }
        downAt = null;
        return;
      }

      const h = handlers.current;
      // A grab that turns out to be a tap already knows its part.
      let tappedId: string | undefined;
      if (drag) {
        const grab = drag;
        drag = null;
        state.controls.enabled = true;
        renderer.domElement.style.cursor = '';
        try {
          renderer.domElement.releasePointerCapture(event.pointerId);
        } catch {
          /* nothing captured */
        }
        h.onSnapHint?.(null);
        const mesh = state.meshes.get(grab.id);
        if (grab.moved && mesh) {
          if (grab.mode === 'rotate') {
            h.onDragRotate(grab.id, {
              x: (mesh.rotation.x - grab.startRot.x) / DEG,
              y: (mesh.rotation.y - grab.startRot.y) / DEG,
              z: (mesh.rotation.z - grab.startRot.z) / DEG,
            });
          } else {
            h.onDragMove([grab.id, ...grab.riders.keys()], {
              x: mesh.position.x - grab.startPos.x,
              y: mesh.position.y - grab.startPos.y,
              z: mesh.position.z - grab.startPos.z,
            });
          }
          downAt = null;
          return;
        }
        // A grab that never crossed the threshold is just a tap: undo any
        // sub-threshold drift, then treat it like any other tap.
        if (mesh) {
          mesh.position.copy(grab.startPos);
          mesh.rotation.copy(grab.startRot);
          state.targets.get(grab.id)?.copy(grab.startPos);
        }
        for (const [riderId, start] of grab.riders) {
          state.meshes.get(riderId)?.position.copy(start);
          state.targets.get(riderId)?.copy(start);
        }
        tappedId = grab.id;
      }

      // Ignore the pointer-up that ends an orbit drag.
      if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 4) {
        downAt = null;
        return;
      }
      downAt = null;

      const additive = event.ctrlKey || event.metaKey || event.shiftKey;
      let id = tappedId;
      if (!id) {
        setPointer(event);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects([...state.meshes.values()], false);
        if (hits.length === 0) {
          // Tapping empty space clears the selection (and exits move mode).
          if (!h.measuring) h.onSelect(null, additive);
          return;
        }
        const hit = hits[0];
        if (h.measuring) {
          h.onMeasurePoint([hit.point.x, hit.point.y, hit.point.z]);
          return;
        }
        id = (hit.object as THREE.Mesh).userData.partId as string | undefined;
        if (!id) return;
      }
      // Double-tap puts a part into move mode; a single tap just selects it.
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!additive && h.dragEnabled && lastTap.id === id && now - lastTap.t < 320) {
        lastTap = { id: '', t: 0 };
        h.onEnterMoveMode(id);
      } else {
        lastTap = { id, t: now };
        h.onSelect(id, additive);
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
      running = false;
      document.removeEventListener('visibilitychange', onVisibility);
      controls.dispose();
      envMap?.dispose();
      const floor = grid as THREE.Mesh;
      floor.geometry.dispose();
      const floorMat = floor.material as THREE.MeshStandardMaterial;
      floorMat.map?.dispose();
      floorMat.dispose();
      disposeTree(plate);
      disposeTree(markedBoxes);
      disposeTree(slicePlane);
      disposeTree(selection);
      builderBackground.dispose();
      if (composer) {
        for (const pass of composer.passes) pass.dispose();
        composer.dispose();
      }
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
    state.camera.position.copy(center).add(new THREE.Vector3(0.12, 0.18, 1).setLength(distance));
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
          new THREE.MeshStandardMaterial({ metalness: part.metalness, roughness: part.roughness })
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
        material.metalness = 0.1;
        material.roughness = 0.5;
        material.envMapIntensity = 0.2;
        material.transparent = true;
        material.opacity = 0.2;
        material.depthWrite = false;
      } else if (builder) {
        // One matte grey, so the shape reads rather than the finish; picked
        // parts take a blue tint under their outline.
        material.color.set(picked.has(part.id) ? BUILDER_PICKED : BUILDER_PART);
        material.metalness = 0;
        material.roughness = 0.65;
        material.transparent = part.dimmed;
        material.opacity = part.dimmed ? 0.22 : 1;
        material.depthWrite = !part.dimmed;
      } else {
        material.color.set(part.color);
        material.metalness = part.metalness;
        material.roughness = part.roughness;
        material.envMapIntensity = 1.2;
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
  }, [parts, wireframe, xray, selectedId, builder, picked]);

  // Boxes around the selected and marked parts in the plain view.
  useEffect(() => {
    const state = refs.current;
    if (!state) return;
    const stale = state.markedBoxes.children.slice();
    state.markedBoxes.clear();
    for (const box of stale) disposeTree(box);

    // The builder view outlines picked parts instead of boxing them.
    const mesh = selectedId && !builder ? state.meshes.get(selectedId) : undefined;
    state.selection.visible = Boolean(mesh);
    if (mesh) {
      state.selection.setFromObject(mesh);
      state.selection.update();
    }
    if (builder) return;
    for (const id of picked) {
      const marked = id === selectedId ? undefined : state.meshes.get(id);
      if (marked) state.markedBoxes.add(new THREE.BoxHelper(marked, MARKED_BOX_COLOR));
    }
  }, [selectedId, picked, builder, parts]);

  // The builder view's outline follows the picked parts.
  useEffect(() => {
    const state = refs.current;
    if (!state?.outline) return;
    state.outline.selectedObjects = builder
      ? [...picked].flatMap((id) => {
          const mesh = state.meshes.get(id);
          return mesh ? [mesh] : [];
        })
      : [];
  }, [builder, picked, parts]);

  // The cut the Slice dialog is setting up, drawn across the part it will cut.
  useEffect(() => {
    const state = refs.current;
    if (!state) return;
    const stale = state.slicePlane.children.slice();
    state.slicePlane.clear();
    for (const child of stale) disposeTree(child);
    state.slicePlane.visible = false;

    const mesh = sliceAxis && selectedId ? state.meshes.get(selectedId) : undefined;
    const bounds = mesh?.geometry.boundingBox;
    if (!sliceAxis || slicePosition === null || !mesh || !bounds) return;

    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    // A little larger than the part, so the plane reads as cutting through it.
    const width = (sliceAxis === 'x' ? size.z : size.x) * 1.2 + 6;
    const height = (sliceAxis === 'y' ? size.z : size.y) * 1.2 + 6;

    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      // Drawn over the part rather than buried inside it: the point of this
      // plane is to show where the cut lands, and most of it sits in material.
      new THREE.MeshBasicMaterial({
        color: SLICE_PLANE_COLOR,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      })
    );
    quad.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(quad.geometry),
        new THREE.LineBasicMaterial({ color: SLICE_EDGE_COLOR, depthTest: false })
      )
    );
    // A plane faces +Z; turn it to face the axis being cut.
    if (sliceAxis === 'x') quad.rotation.y = Math.PI / 2;
    if (sliceAxis === 'y') quad.rotation.x = -Math.PI / 2;
    quad.position.copy(centre);
    quad.position[sliceAxis] = slicePosition;
    quad.renderOrder = 6;

    state.slicePlane.add(quad);
    state.slicePlane.userData.partId = selectedId;
    state.slicePlane.position.copy(mesh.position);
    state.slicePlane.quaternion.copy(mesh.quaternion);
    state.slicePlane.scale.copy(mesh.scale);
    state.slicePlane.visible = true;
  }, [sliceAxis, slicePosition, selectedId, parts]);

  // Switch the look between the plain view and the builder view.
  useEffect(() => {
    const state = refs.current;
    if (!state) return;
    state.builder = builder;
    state.scene.background = builder ? state.backgrounds.builder : state.backgrounds.plain;
    // The room reflections are far brighter than the lights and wash a grey
    // part out to white, so the builder view is lit by its lights alone.
    state.scene.environment = builder ? null : state.environment;
    // A gentle tone curve in the builder view: its lights stay mostly under it,
    // and the additive outline keeps its blue instead of clipping to white. The
    // filmic curve of the plain view suits metal.
    state.renderer.toneMapping = builder ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = builder ? 1 : 1.05;
    const lights = builder ? BUILDER_LIGHTS : PLAIN_LIGHTS;
    state.lights.hemi.intensity = lights.hemi;
    state.lights.key.intensity = lights.key;
    state.lights.fill.intensity = lights.fill;
    state.lights.head.intensity = lights.head;
    state.grid.visible = showGrid && !builder;
    state.plate.visible = showGrid && builder;
  }, [builder, showGrid]);

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
    const state = refs.current;
    if (!state) return;
    const previous = state.paintMarks.children.slice();
    state.paintMarks.clear();
    for (const child of previous) {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    if (!paintPartId || paintLocal.length < 3) return;
    const mesh = state.meshes.get(paintPartId);
    if (!mesh) return;
    const dotGeometry = new THREE.SphereGeometry(1, 10, 8);
    const scale = Math.max(1.4, state.camera.position.length() / 160);
    const world = new THREE.Vector3();
    for (let i = 0; i + 2 < paintLocal.length; i += 3) {
      world.set(paintLocal[i], paintLocal[i + 1], paintLocal[i + 2]);
      mesh.localToWorld(world);
      const dot = new THREE.Mesh(
        dotGeometry.clone(),
        new THREE.MeshBasicMaterial({ color: 0x10b981, depthTest: false })
      );
      dot.position.copy(world);
      dot.scale.setScalar(scale);
      dot.renderOrder = 12;
      state.paintMarks.add(dot);
    }
    dotGeometry.dispose();
  }, [paintPartId, paintLocal]);

  useEffect(() => {
    if (frameToken === 0) return;
    // Wait a frame: on the first import the meshes have only just been added,
    // and the canvas may not have its final size yet.
    const handle = requestAnimationFrame(() => frameAll());
    return () => cancelAnimationFrame(handle);
  }, [frameToken, frameAll]);

  const cursor = useMemo(
    () => (painting || measuring ? 'crosshair' : 'grab'),
    [painting, measuring]
  );

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
