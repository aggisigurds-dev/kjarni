/**
 * Gallery previews.
 *
 * Renders a part once, off-screen, into a data URL. One renderer is kept for
 * the life of the tab — WebGL contexts are a limited resource and creating one
 * per part would exhaust them on a big project.
 */

import * as THREE from 'three';
import { PLASTIC_LOOK } from '@/lib/3dwork/finish';

const SIZE = 160;

let renderer: THREE.WebGLRenderer | null = null;

function getRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  if (typeof document === 'undefined') return null;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(1);
    return renderer;
  } catch {
    return null;
  }
}

export function renderThumbnail(
  soup: Float32Array,
  color: string,
  look: { metalness: number; roughness: number } = PLASTIC_LOOK
): string | undefined {
  const gl = getRenderer();
  if (!gl || soup.length === 0) return undefined;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(soup, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: look.metalness,
    roughness: look.roughness,
  });
  const mesh = new THREE.Mesh(geometry, material);

  const scene = new THREE.Scene();
  scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x33405a, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, 1.5, 1);
  scene.add(key);

  const sphere = geometry.boundingSphere;
  const radius = sphere && sphere.radius > 0 ? sphere.radius : 1;
  if (sphere) mesh.position.set(-sphere.center.x, -sphere.center.y, -sphere.center.z);

  const camera = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100);
  camera.position.set(0.9, 0.7, 1).setLength((radius / Math.sin((40 * Math.PI) / 360)) * 1.15);
  camera.lookAt(0, 0, 0);

  let url: string | undefined;
  try {
    gl.render(scene, camera);
    url = gl.domElement.toDataURL('image/png');
  } catch {
    url = undefined;
  }

  geometry.dispose();
  material.dispose();
  return url;
}
