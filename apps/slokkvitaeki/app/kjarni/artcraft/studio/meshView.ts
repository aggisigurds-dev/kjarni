"use client";

import { figureFor, hairOfId, skinOfId, type BodyLook, type StudioBase } from "./bases";

const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const LOADER_SRC = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/loaders/GLTFLoader.js";

type Vec = { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number };
type MeshObj = {
  position: Vec;
  rotation: { x: number; y: number; z: number };
  scale: { set: (x: number, y: number, z: number) => void; setScalar: (n: number) => void };
};
type Three = {
  Scene: new () => { add: (o: unknown) => void; background: unknown };
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => {
    position: Vec;
    lookAt: (x: number, y: number, z: number) => void;
    aspect: number;
    updateProjectionMatrix: () => void;
  };
  WebGLRenderer: new (opts: { canvas: HTMLCanvasElement; antialias: boolean; alpha: boolean; preserveDrawingBuffer: boolean }) => {
    setSize: (w: number, h: number, update: boolean) => void;
    setPixelRatio: (n: number) => void;
    render: (scene: unknown, camera: unknown) => void;
    dispose: () => void;
    domElement: HTMLCanvasElement;
  };
  Color: new (hex: number) => unknown;
  AmbientLight: new (hex: number, intensity: number) => unknown;
  DirectionalLight: new (hex: number, intensity: number) => { position: Vec };
  Box3: new () => {
    setFromObject: (o: unknown) => { getCenter: (v: unknown) => unknown; getSize: (v: unknown) => unknown };
  };
  Vector3: new () => Vec;
  Group: new () => MeshObj & { add: (o: unknown) => void };
  Mesh: new (geo: unknown, mat: unknown) => MeshObj;
  SphereGeometry: new (r: number, w: number, h: number) => unknown;
  CylinderGeometry: new (rt: number, rb: number, h: number, seg: number) => unknown;
  MeshStandardMaterial: new (opts: { color: number; roughness?: number; metalness?: number }) => unknown;
  GLTFLoader?: new () => { load: (url: string, ok: (g: { scene: unknown }) => void, _: unknown, err: (e: unknown) => void) => void };
};

type Host = Window & { THREE?: Three };

let threeWait: Promise<Three> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const host = window as Host;
    const found = [...document.querySelectorAll("script")].find((s) => s.src.split("?")[0] === src.split("?")[0]);
    if (host.THREE) {
      resolve();
      return;
    }
    if (found) {
      found.addEventListener("load", () => resolve(), { once: true });
      found.addEventListener("error", () => reject(new Error("Náði ekki í 3D-vélina")), { once: true });
      queueMicrotask(() => {
        if (host.THREE) resolve();
      });
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Náði ekki í 3D-vélina"));
    document.head.appendChild(el);
  });
}

export async function loadEngine(): Promise<Three> {
  const host = window as Host;
  if (host.THREE) return host.THREE;
  await loadScript(THREE_SRC);
  if (!host.THREE) throw new Error("Náði ekki í 3D-vélina");
  return host.THREE;
}

export function loadThree(): Promise<Three> {
  const host = window as Host;
  if (host.THREE?.GLTFLoader) return Promise.resolve(host.THREE);
  if (threeWait) return threeWait;
  threeWait = (async () => {
    await loadEngine();
    await loadScript(LOADER_SRC);
    const THREE = host.THREE;
    if (!THREE?.GLTFLoader) throw new Error("GLTF-lesari fannst ekki");
    return THREE;
  })().catch((err) => {
    threeWait = null;
    throw err;
  });
  return threeWait;
}

function hexNum(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}

function limb(THREE: Three, mat: unknown, r1: number, r2: number, len: number): MeshObj {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 14), mat);
  return mesh;
}

function standInBody(THREE: Three, look: BodyLook, base: StudioBase): MeshObj & { add: (o: unknown) => void } {
  const fig = figureFor(base, look);
  const skin = skinOfId(look.skin);
  const mat = new THREE.MeshStandardMaterial({ color: hexNum(skin.mid), roughness: 0.55, metalness: 0.04 });
  const hairMat = new THREE.MeshStandardMaterial({
    color: hexNum(look.hairLength === "bald" ? skin.mid : hairOfId(look.hair).hex),
    roughness: 0.7,
  });
  const g = new THREE.Group();
  const s = 0.0042;
  const H = look.heightCm / 100;
  const headR = 0.11 * H;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 18, 14), mat);
  head.scale.set(0.92, 1.12, 0.88);
  head.position.set(0, H * 0.92, 0);
  g.add(head);
  const neck = limb(THREE, mat, 0.04 * H, 0.045 * H, 0.06 * H);
  neck.position.set(0, H * 0.82, 0);
  g.add(neck);
  const torso = limb(THREE, mat, fig.waist * s * 0.5, fig.chest * s * 0.5, 0.34 * H);
  torso.position.set(0, H * 0.62, 0);
  g.add(torso);
  const hips = new THREE.Mesh(new THREE.SphereGeometry(fig.hip * s * 0.38, 16, 12), mat);
  hips.scale.set(1, 0.55, 0.7);
  hips.position.set(0, H * 0.44, 0);
  g.add(hips);
  const shoulderY = H * 0.76;
  const armLen = 0.28 * H;
  for (const side of [-1, 1]) {
    const upper = limb(THREE, mat, fig.arm * s, fig.arm * s * 0.85, armLen);
    upper.rotation.z = side * 0.55;
    upper.position.set(side * fig.shoulder * s * 0.55, shoulderY - 0.08 * H, 0);
    g.add(upper);
    const lower = limb(THREE, mat, fig.arm * s * 0.8, fig.arm * s * 0.62, armLen * 0.92);
    lower.rotation.z = side * 0.35;
    lower.position.set(side * (fig.shoulder * s * 0.75 + 0.08), shoulderY - 0.28 * H, 0.02);
    g.add(lower);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.035 * H, 10, 8), mat);
    hand.position.set(side * (fig.shoulder * s * 0.95 + 0.1), shoulderY - 0.44 * H, 0.04);
    g.add(hand);
  }
  const thighLen = 0.26 * H;
  const calfLen = 0.25 * H;
  for (const side of [-1, 1]) {
    const thigh = limb(THREE, mat, fig.thigh * s * 0.5, fig.thigh * s * 0.4, thighLen);
    thigh.position.set(side * fig.hip * s * 0.28, H * 0.28, 0);
    g.add(thigh);
    const calf = limb(THREE, mat, fig.calf * s * 0.5, fig.calf * s * 0.35, calfLen);
    calf.position.set(side * fig.hip * s * 0.26, H * 0.08, 0);
    g.add(calf);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.04 * H, 10, 8), mat);
    foot.scale.set(0.7, 0.45, 1.4);
    foot.position.set(side * fig.hip * s * 0.26, 0.02, 0.03);
    g.add(foot);
  }
  if (look.hairLength !== "bald") {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.02, 16, 12), hairMat);
    hair.scale.set(
      1.05,
      look.hairLength === "long" ? 1.38 : look.hairLength === "medium" ? 1.14 : 0.72,
      0.82,
    );
    hair.position.set(0, H * 0.95 + (look.hairLength === "short" ? 0.02 : 0), -headR * 0.32);
    g.add(hair);
  }
  return g;
}

function stageFromRoot(THREE: Three, canvas: HTMLCanvasElement, root: MeshObj & { add?: (o: unknown) => void }): MeshStage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141414);
  const camera = new THREE.PerspectiveCamera(32, canvas.clientWidth / canvas.clientHeight || 0.75, 0.1, 50);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(canvas.clientWidth || 360, canvas.clientHeight || 480, false);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xfff4e6, 0.9);
  key.position.set(2.2, 3.4, 2.8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
  fill.position.set(-2.4, 1.2, -1.6);
  scene.add(fill);
  scene.add(root);
  camera.position.set(0, 0.9, 3.6);
  camera.lookAt(0, 0.85, 0);
  const draw = () => renderer.render(scene, camera);
  draw();
  return {
    setYaw(deg: number) {
      root.rotation.y = (deg * Math.PI) / 180;
      draw();
    },
    capture() {
      draw();
      return renderer.domElement.toDataURL("image/png");
    },
    dispose() {
      renderer.dispose();
    },
  };
}

export async function mountStandIn(canvas: HTMLCanvasElement, look: BodyLook, base: StudioBase): Promise<MeshStage> {
  const THREE = await loadEngine();
  return stageFromRoot(THREE, canvas, standInBody(THREE, look, base));
}

export async function captureYaws(
  stage: MeshStage,
  yaws: number[],
): Promise<Partial<Record<number, string>>> {
  const out: Partial<Record<number, string>> = {};
  for (const deg of yaws) {
    stage.setYaw(deg);
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    out[deg] = stage.capture();
  }
  stage.setYaw(0);
  return out;
}

export async function captureStandInYaws(
  look: BodyLook,
  base: StudioBase,
  yaws: number[],
): Promise<Partial<Record<number, string>>> {
  const canvas = document.createElement("canvas");
  canvas.width = 360;
  canvas.height = 480;
  const stage = await mountStandIn(canvas, look, base);
  try {
    return await captureYaws(stage, yaws);
  } finally {
    stage.dispose();
  }
}

export type MeshStage = {
  setYaw: (deg: number) => void;
  capture: () => string;
  dispose: () => void;
};

export async function mountMesh(canvas: HTMLCanvasElement, file: File): Promise<MeshStage> {
  const THREE = await loadThree();
  const url = URL.createObjectURL(file);
  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x141414);
    const camera = new THREE.PerspectiveCamera(32, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 50);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(canvas.clientWidth || 360, canvas.clientHeight || 480, false);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xfff4e6, 0.9);
    key.position.set(2.2, 3.4, 2.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
    fill.position.set(-2.4, 1.2, -1.6);
    scene.add(fill);
    const root = new THREE.Group();
    scene.add(root);
    const gltf = await new Promise<{ scene: unknown }>((resolve, reject) => {
      const loader = new THREE.GLTFLoader!();
      loader.load(url, resolve, undefined, reject);
    });
    root.add(gltf.scene);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3()) as { x: number; y: number; z: number };
    const center = box.getCenter(new THREE.Vector3()) as { x: number; y: number; z: number };
    const tall = Math.max(size.x, size.y, size.z, 0.001);
    root.position.set(-center.x, -center.y, -center.z);
    root.scale.setScalar(1.8 / tall);
    camera.position.set(0, 0.15, 4.2);
    camera.lookAt(0, 0, 0);

    function draw() {
      renderer.render(scene, camera);
    }
    draw();

    return {
      setYaw(deg: number) {
        root.rotation.y = (deg * Math.PI) / 180;
        draw();
      },
      capture() {
        draw();
        return renderer.domElement.toDataURL("image/png");
      },
      dispose() {
        renderer.dispose();
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
