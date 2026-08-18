'use client';

/**
 * Revive — reverse-engineer an old, over-manufactured STL into editable
 * parametric OpenSCAD. Renders the selected part from four angles, hands those
 * views plus the measured dimensions to Claude (browser-direct, the user's own
 * key, nothing server-side), and gets back a plain-language description and a
 * clean, parameterised model you can simplify and re-cut.
 */

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { describePart } from '@/lib/3dwork/measure';
import { type Unit } from '@/lib/3dwork/format';
import { PANEL, LABEL, FIELD, ACTION_PRIMARY, ACTION_GHOST } from './ui';

const VIEW_SIZE = 420;
// normalised camera directions: iso, front, side, top
const ANGLES: [number, number, number][] = [
  [0.9, 0.7, 1],
  [0, 0, 1],
  [1, 0, 0.001],
  [0, 1, 0.001],
];

let viewRenderer: THREE.WebGLRenderer | null = null;
function getRenderer(): THREE.WebGLRenderer | null {
  if (viewRenderer) return viewRenderer;
  if (typeof document === 'undefined') return null;
  try {
    viewRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    viewRenderer.setSize(VIEW_SIZE, VIEW_SIZE);
    viewRenderer.setPixelRatio(1);
    return viewRenderer;
  } catch {
    return null;
  }
}

/** Render the soup from each canonical angle → jpeg data URLs. */
function renderViews(soup: Float32Array): string[] {
  const gl = getRenderer();
  if (!gl || soup.length === 0) return [];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(soup, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.1, roughness: 0.55 });
  const mesh = new THREE.Mesh(geometry, material);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3b0, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
  keyLight.position.set(1, 1.5, 1);
  scene.add(keyLight);
  const sphere = geometry.boundingSphere;
  const radius = sphere && sphere.radius > 0 ? sphere.radius : 1;
  if (sphere) mesh.position.set(-sphere.center.x, -sphere.center.y, -sphere.center.z);
  const camera = new THREE.PerspectiveCamera(38, 1, radius / 100, radius * 100);
  const dist = (radius / Math.sin((38 * Math.PI) / 360)) * 1.18;
  const urls: string[] = [];
  for (const dir of ANGLES) {
    camera.position.set(dir[0], dir[1], dir[2]).setLength(dist);
    camera.up.set(0, dir[1] > 0.5 ? 0 : 1, dir[1] > 0.5 ? 1 : 0);
    camera.lookAt(0, 0, 0);
    try {
      gl.render(scene, camera);
      urls.push(gl.domElement.toDataURL('image/jpeg', 0.82));
    } catch {
      /* skip a failed angle */
    }
  }
  geometry.dispose();
  material.dispose();
  return urls;
}

function extractCode(text: string): { desc: string; code: string } {
  const m = text.match(/```(?:openscad|scad)?\s*([\s\S]*?)```/i);
  if (!m) return { desc: text.trim(), code: '' };
  const code = m[1].trim();
  const desc = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  return { desc, code };
}

type Props = { soup: Float32Array | null; name: string; unit: Unit; onClose: () => void };

export function RevivePanel({ soup, name, onClose }: Props) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState('claude-opus-4-8');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [desc, setDesc] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      setKey(localStorage.getItem('kjarni3d_aikey') || '');
      setModel(localStorage.getItem('kjarni3d_aimodel') || 'claude-opus-4-8');
    } catch {
      /* ignore */
    }
  }, []);

  async function revive() {
    setError('');
    setDesc('');
    setCode('');
    const k = key.trim();
    if (!k) {
      setError('Paste a Claude API key (sk-ant-…) above first.');
      return;
    }
    if (!soup || soup.length === 0) {
      setError('Select a part with geometry first.');
      return;
    }
    try {
      localStorage.setItem('kjarni3d_aikey', k);
      localStorage.setItem('kjarni3d_aimodel', model.trim() || 'claude-opus-4-8');
    } catch {
      /* ignore */
    }
    setBusy(true);
    try {
      const views = renderViews(soup);
      if (!views.length) {
        setError('Could not render the part (WebGL).');
        setBusy(false);
        return;
      }
      const m = describePart(soup);
      const [sx, sy, sz] = m.bounds.size;
      const dims =
        `Bounding box: ${sx.toFixed(1)} × ${sy.toFixed(1)} × ${sz.toFixed(1)} mm. ` +
        `Volume ≈ ${(m.volume / 1000).toFixed(1)} cm³. Triangles: ${m.triangles}. ` +
        `Watertight: ${m.watertight ? 'yes' : 'no'}.`;
      const prompt =
        `This is an old, over-manufactured STL model the user wants to REVIVE as editable ` +
        `parametric CAD. Below are four rendered views (iso, front, side, top) and the measured ` +
        `dimensions.\n\n${dims}\n\nDo two things:\n` +
        `1) In 2–3 sentences: what this part is and its key proportions.\n` +
        `2) Write CLEAN, PARAMETRIC OpenSCAD that recreates the ESSENTIAL FORM (not every ` +
        `triangle) — simplify the over-manufactured mesh down to correct primitives, with a ` +
        `clearly named parameters block at the top for the dimensions above so it can be edited ` +
        `and slimmed down. The goal is an editable, lightweight model, not a triangle-perfect copy.\n` +
        `Return the description first, then the code in a SINGLE \`\`\`openscad block.` +
        (name ? `\n\nPart name: ${name}` : '');
      const content: unknown[] = views.map((u) => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: u.split(',')[1] },
      }));
      content.push({ type: 'text', text: prompt });
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': k,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: model.trim() || 'claude-opus-4-8', max_tokens: 4096, messages: [{ role: 'user', content }] }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError((j?.error?.message as string) || `Claude error (${res.status})`);
        setBusy(false);
        return;
      }
      const text: string = j?.content?.[0]?.text || '';
      const out = extractCode(text);
      setDesc(out.desc);
      setCode(out.code);
      if (!out.desc && !out.code) setError('Empty response from Claude.');
    } catch (e) {
      setError('Error: ' + ((e as Error)?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`${PANEL} flex max-h-[90vh] w-full max-w-2xl flex-col p-4`}>
        <h2 className="mb-1 text-sm font-bold text-slate-900">🤖 Revive model → parametric OpenSCAD</h2>
        <p className="mb-3 text-[0.7rem] text-slate-500">
          Takes the selected part, renders it from four angles and asks Claude to write editable
          OpenSCAD from the shape and measured dimensions. Your key stays in the browser and goes
          straight to Anthropic. Best for mechanical / geometric parts; organic shapes fare worse.
        </p>

        <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
          <label className="block">
            <span className={`${LABEL} mb-1 block`}>Claude API key</span>
            <input type="password" className={FIELD} value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} />
          </label>
          <label className="block">
            <span className={`${LABEL} mb-1 block`}>Model</span>
            <input className={`${FIELD} w-44`} value={model} onChange={(e) => setModel(e.target.value)} />
          </label>
        </div>

        <div className="mb-3 flex gap-2">
          <button type="button" className={ACTION_PRIMARY} onClick={revive} disabled={busy}>
            {busy ? 'Reviving…' : '↩︎ Revive'}
          </button>
          <button type="button" className={ACTION_GHOST} onClick={onClose}>
            Close
          </button>
        </div>

        {error && <p className="mb-2 text-[0.75rem] font-semibold text-red-600">⚠️ {error}</p>}

        {(desc || code) && (
          <div className="min-h-0 flex-1 overflow-auto">
            {desc && <p className="mb-3 whitespace-pre-wrap text-[0.8rem] text-slate-800">{desc}</p>}
            {code && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className={LABEL}>OpenSCAD</span>
                  <button type="button" className={`${ACTION_GHOST} px-2 py-1`} onClick={copyCode}>
                    {copied ? '✓ Copied' : '⧉ Copy'}
                  </button>
                </div>
                <pre className="overflow-auto rounded border border-slate-300 bg-slate-900 p-3 text-[0.72rem] leading-relaxed text-slate-100">
                  <code>{code}</code>
                </pre>
                <p className="mt-2 text-[0.68rem] text-slate-500">
                  Paste into openscad.org or the OpenSCAD app, tweak the parameters at the top, and
                  export a fresh STL to load back in here.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
