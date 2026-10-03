"use client";

// 3D-sýn hússins (Agnar 03.10.2026): greindir veggir lyftast upp með sinni þykkt, teikningin er gólfið og tækin
// (slökkvitæki, brunaslöngur, …) standa á sínum stað — allar hæðir hver ofan á annarri, eða ein í einu.
// three.js kemur af cdnjs eins og í teikningaglugga Slökkvitækis (383) — engin ný háð í pakkanum.

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAssetBlob } from "../../lib/board/assets";
import { husUrBordi, type Haed3D } from "../../lib/board/hus3d";
import type { BoardObject } from "../../lib/board/types";

const THREE_SLOD = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

// three.js UMD-útgáfan hefur engar tegundir hér; þær fáu klasar sem eru notaðir eru meðhöndlaðir sem óþekktir hlutir.
// oxlint-disable-next-line no-explicit-any
type Three = any;

let threeBid: Promise<Three> | null = null;
function saekjaThree(): Promise<Three> {
  const w = window as unknown as { THREE?: Three };
  if (w.THREE) return Promise.resolve(w.THREE);
  if (threeBid) return threeBid;
  threeBid = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = THREE_SLOD;
    s.onload = () => res(w.THREE);
    s.onerror = () => {
      threeBid = null;
      rej(new Error("Náði ekki í three.js"));
    };
    document.head.appendChild(s);
  });
  return threeBid;
}

async function golfAferd(T: Three, hd: Haed3D) {
  const blob = getAssetBlob(hd.plan.assetId);
  if (!blob) return null;
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const t = new T.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

interface Props {
  objects: BoardObject[];
  pixelsPerMeter: number | null;
  onClose: () => void;
}

export default function Hus3D({ objects, pixelsPerMeter, onClose }: Props) {
  const gamur = useRef<HTMLDivElement>(null);
  const haedir = useMemo(() => husUrBordi(objects), [objects]);
  const [syna, setSyna] = useState<number | "allar">("allar");
  const [golf, setGolf] = useState(true);
  const [villa, setVilla] = useState<string | null>(null);
  const [hledst, setHledst] = useState(true);

  useEffect(() => {
    const el = gamur.current;
    if (!el || !haedir.length) return;
    let lifir = true;
    let loka = () => {};
    void (async () => {
      try {
        const T = await saekjaThree();
        if (!lifir) return;
        const valdar = syna === "allar" ? haedir : [haedir[syna]].filter(Boolean);
        const staerst = Math.max(...valdar.map((h) => Math.max(h.breidd, h.haed)), 1);
        // Lofthæð 2,8 m þegar borðið er kvarðað, annars hlutfall af stærð teikningar.
        const veggH = pixelsPerMeter ? pixelsPerMeter * 2.8 : staerst * 0.03;
        const bil = syna === "allar" ? veggH * 3.2 : 0;

        const b = el.clientWidth || 800, h = el.clientHeight || 500;
        const teiknari = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        teiknari.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        teiknari.setSize(b, h);
        teiknari.setClearColor(0x14120f);
        const canvas: HTMLCanvasElement = teiknari.domElement;
        canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";
        el.appendChild(canvas);
        const svid = new T.Scene();
        svid.add(new T.AmbientLight(0xffffff, 0.62));
        const sol = new T.DirectionalLight(0xffffff, 0.8);
        sol.position.set(0.5, 1.4, 0.8);
        svid.add(sol);
        const losa: { dispose: () => void }[] = [];

        for (let nr = 0; nr < valdar.length; nr++) {
          const hd = valdar[nr];
          const hopur = new T.Group();
          hopur.position.y = nr * bil;
          svid.add(hopur);

          // gólf: teikningin sem áferð (efri hæðir hálfgagnsæjar svo neðri sjáist), annars grá plata
          const aferd = golf ? await golfAferd(T, hd) : null;
          if (!lifir) return;
          const gG = new T.PlaneGeometry(hd.breidd, hd.haed);
          const gE = new T.MeshBasicMaterial({
            map: aferd,
            color: aferd ? 0xffffff : 0x2a2622,
            side: T.DoubleSide,
            transparent: nr > 0,
            opacity: nr > 0 ? 0.45 : 1,
            depthWrite: nr === 0,
          });
          const g = new T.Mesh(gG, gE);
          g.rotation.x = -Math.PI / 2;
          hopur.add(g);
          losa.push(gG, gE);
          if (aferd) losa.push(aferd);

          // veggir: eitt InstancedMesh á hæð, litur á hvern bút (eldveggir í sínum lit)
          if (hd.veggir.length) {
            const kG = new T.BoxGeometry(1, 1, 1);
            const kE = new T.MeshLambertMaterial({ color: 0xffffff });
            const mesh = new T.InstancedMesh(kG, kE, hd.veggir.length);
            const m = new T.Matrix4(), q = new T.Quaternion(), upp = new T.Vector3(0, 1, 0), lit = new T.Color();
            hd.veggir.forEach((v, i) => {
              const dx = v.bx - v.ax, dy = v.by - v.ay, len = Math.hypot(dx, dy);
              q.setFromAxisAngle(upp, -Math.atan2(dy, dx));
              // + þykkt svo horn og mót lokist
              m.compose(new T.Vector3((v.ax + v.bx) / 2, veggH / 2, (v.ay + v.by) / 2), q, new T.Vector3(len + v.thykkt, veggH, v.thykkt));
              mesh.setMatrixAt(i, m);
              mesh.setColorAt(i, lit.set(v.litur));
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            hopur.add(mesh);
            losa.push(kG, kE);
          }

          // tæki: stöng + kúla í lit táknsins + miði með stuttheiti (SLT, BRSL …)
          const rad = staerst * 0.007;
          for (const t of hd.taeki) {
            const litur = new T.Color(t.litur);
            const sG = new T.CylinderGeometry(rad * 0.2, rad * 0.2, veggH * 1.3, 8);
            const sE = new T.MeshLambertMaterial({ color: 0xf1ede4 });
            const stong = new T.Mesh(sG, sE);
            stong.position.set(t.x, veggH * 0.65, t.y);
            hopur.add(stong);
            const kG2 = new T.SphereGeometry(rad, 20, 14);
            const kE2 = new T.MeshLambertMaterial({ color: litur, emissive: litur, emissiveIntensity: 0.35 });
            const kula = new T.Mesh(kG2, kE2);
            kula.position.set(t.x, veggH * 1.3 + rad, t.y);
            hopur.add(kula);
            const ms = document.createElement("canvas");
            ms.width = 256;
            ms.height = 64;
            const mc = ms.getContext("2d");
            if (mc) {
              mc.fillStyle = "rgba(20,18,15,.88)";
              mc.fillRect(0, 0, 256, 64);
              mc.fillStyle = "#fff";
              mc.font = "600 32px system-ui,sans-serif";
              mc.textAlign = "center";
              mc.textBaseline = "middle";
              mc.fillText(t.stutt.slice(0, 10), 128, 34);
            }
            const mA = new T.CanvasTexture(ms);
            const mE = new T.SpriteMaterial({ map: mA, depthTest: false });
            const midi = new T.Sprite(mE);
            midi.scale.set(rad * 6, rad * 1.5, 1);
            midi.position.set(t.x, veggH * 1.3 + rad * 3.3, t.y);
            hopur.add(midi);
            losa.push(sG, sE, kG2, kE2, mA, mE);
          }
        }

        // myndavél á braut: draga = snúa · hjól/klípa = aðdráttur · hægri/shift-draga = færa
        const vel = new T.PerspectiveCamera(42, b / h, staerst * 0.002, staerst * 20);
        const mid = new T.Vector3(0, ((valdar.length - 1) * bil) / 2, 0);
        let theta = -0.6, phi = 0.95, fjarl = staerst * (valdar.length > 1 ? 1.5 : 1.15);
        const stillaVel = () => {
          phi = Math.min(1.5, Math.max(0.05, phi));
          fjarl = Math.min(staerst * 6, Math.max(staerst * 0.05, fjarl));
          vel.position.set(
            mid.x + fjarl * Math.sin(phi) * Math.sin(theta),
            mid.y + fjarl * Math.cos(phi),
            mid.z + fjarl * Math.sin(phi) * Math.cos(theta)
          );
          vel.lookAt(mid);
        };
        const bendlar = new Map<number, { x: number; y: number; faera: boolean }>();
        let klipa = 0;
        const faera = (dx: number, dy: number) => {
          const haegri = new T.Vector3().setFromMatrixColumn(vel.matrix, 0);
          const fram = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), haegri);
          const kv = (fjarl / (canvas.clientHeight || 500)) * 1.1;
          mid.addScaledVector(haegri, -dx * kv).addScaledVector(fram, -dy * kv);
        };
        const nidur = (e: PointerEvent) => {
          canvas.setPointerCapture(e.pointerId);
          bendlar.set(e.pointerId, { x: e.clientX, y: e.clientY, faera: e.button === 2 || e.shiftKey });
          canvas.style.cursor = "grabbing";
        };
        const hreyfa = (e: PointerEvent) => {
          const p = bendlar.get(e.pointerId);
          if (!p) return;
          const dx = e.clientX - p.x, dy = e.clientY - p.y;
          p.x = e.clientX;
          p.y = e.clientY;
          if (bendlar.size >= 2) {
            const [a, c] = [...bendlar.values()];
            const nuna = Math.hypot(a.x - c.x, a.y - c.y);
            if (klipa) fjarl *= klipa / Math.max(1, nuna);
            klipa = nuna;
            faera(dx / 2, dy / 2);
          } else if (p.faera) faera(dx, dy);
          else {
            theta -= dx * 0.006;
            phi -= dy * 0.006;
          }
          stillaVel();
        };
        const upp = (e: PointerEvent) => {
          bendlar.delete(e.pointerId);
          klipa = 0;
          canvas.style.cursor = "grab";
        };
        const hjol = (e: WheelEvent) => {
          e.preventDefault();
          fjarl *= e.deltaY > 0 ? 1.12 : 0.89;
          stillaVel();
        };
        const samhengi = (e: Event) => e.preventDefault();
        canvas.addEventListener("pointerdown", nidur);
        canvas.addEventListener("pointermove", hreyfa);
        canvas.addEventListener("pointerup", upp);
        canvas.addEventListener("pointercancel", upp);
        canvas.addEventListener("wheel", hjol, { passive: false });
        canvas.addEventListener("contextmenu", samhengi);
        const staerd = () => {
          const w2 = el.clientWidth || 800, h2 = el.clientHeight || 500;
          teiknari.setSize(w2, h2);
          vel.aspect = w2 / h2;
          vel.updateProjectionMatrix();
        };
        window.addEventListener("resize", staerd);
        stillaVel();
        let raf = 0;
        const lykkja = () => {
          if (!lifir) return;
          teiknari.render(svid, vel);
          raf = requestAnimationFrame(lykkja);
        };
        lykkja();
        setHledst(false);
        loka = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", staerd);
          for (const x of losa) {
            try {
              x.dispose();
            } catch {
              /* þegar losað */
            }
          }
          teiknari.dispose();
          teiknari.forceContextLoss?.();
          canvas.remove();
        };
      } catch (err) {
        setVilla(err instanceof Error ? err.message : "3D mistókst");
      }
    })();
    return () => {
      lifir = false;
      loka();
    };
  }, [haedir, syna, golf, pixelsPerMeter]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const veggjaFjoldi = haedir.reduce((s, h) => s + h.veggir.length, 0);
  const taekjaFjoldi = haedir.reduce((s, h) => s + h.taeki.length, 0);
  const takki = "rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#14120f]" role="dialog" aria-label="Hús í þrívídd">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-stone-100">
        <span className="mr-2 text-[13px] font-bold">Hús í 3D</span>
        <button
          type="button"
          className={`${takki} ${syna === "allar" ? "bg-[#FE653F] text-white" : "bg-white/10 hover:bg-white/20"}`}
          onClick={() => setSyna("allar")}
        >
          Allar hæðir
        </button>
        {haedir.map((h, i) => (
          <button
            key={h.plan.id}
            type="button"
            title={h.nafn}
            className={`${takki} ${syna === i ? "bg-[#FE653F] text-white" : "bg-white/10 hover:bg-white/20"}`}
            onClick={() => setSyna(i)}
          >
            {i + 1}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={golf} onChange={(e) => setGolf(e.target.checked)} />
          Teikning á gólfi
        </label>
        <span className="ml-auto text-[11.5px] text-stone-400">
          {veggjaFjoldi} veggbútar · {taekjaFjoldi} tæki · draga = snúa · hægri-draga = færa · hjól = nær/fjær
        </span>
        <button
          type="button"
          aria-label="Loka 3D"
          className="rounded-md p-1.5 text-stone-300 hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>
      <div ref={gamur} className="relative min-h-0 flex-1">
        {!haedir.length ? (
          <p className="p-6 text-sm text-stone-300">Engin teikning á borðinu — flyttu inn teikningu og greindu veggina fyrst.</p>
        ) : null}
        {haedir.length && !veggjaFjoldi ? (
          <p className="pointer-events-none absolute left-3 top-3 z-10 rounded bg-black/60 px-2 py-1 text-[12px] text-stone-200">
            Engir veggir enn — ýttu á „Veggir“ til að greina þá úr teikningunni
          </p>
        ) : null}
        {hledst && haedir.length && !villa ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-stone-400">Byggi húsið…</p>
        ) : null}
        {villa ? <p className="p-6 text-sm text-red-300">{villa}</p> : null}
      </div>
    </div>
  );
}
