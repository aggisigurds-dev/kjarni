"use client";

const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const LOADER_SRC = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/loaders/GLTFLoader.js";

type Three = {
  Scene: new () => { add: (o: unknown) => void; background: unknown };
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => {
    position: { set: (x: number, y: number, z: number) => void };
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
  DirectionalLight: new (hex: number, intensity: number) => { position: { set: (x: number, y: number, z: number) => void } };
  Box3: new () => {
    setFromObject: (o: unknown) => { getCenter: (v: unknown) => unknown; getSize: (v: unknown) => unknown };
  };
  Vector3: new () => { x: number; y: number; z: number };
  Group: new () => {
    add: (o: unknown) => void;
    rotation: { y: number };
    position: { set: (x: number, y: number, z: number) => void };
    scale: { setScalar: (n: number) => void };
  };
  GLTFLoader?: new () => { load: (url: string, ok: (g: { scene: unknown }) => void, _: unknown, err: (e: unknown) => void) => void };
};

type Host = Window & { THREE?: Three };

let threeWait: Promise<Three> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const found = [...document.querySelectorAll("script")].some((s) => s.src === src);
    if (found) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Náði ekki í 3D-vélina"));
    document.head.appendChild(el);
  });
}

export function loadThree(): Promise<Three> {
  const host = window as Host;
  if (host.THREE?.GLTFLoader) return Promise.resolve(host.THREE);
  if (threeWait) return threeWait;
  threeWait = (async () => {
    await loadScript(THREE_SRC);
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
