"use client";

import { useEffect, useRef, useState } from "react";
import {
  MESH_ACCEPT,
  STANDIN_NAME,
  isMeshFile,
  meshGuides,
  meshHint,
  type CaptureYaws,
  type MeshGuide,
} from "./mesh";
import { captureYaws, mountMesh, mountStandIn, type MeshStage } from "./meshView";
import { studioBase, type BodyLook } from "./bases";

type Props = {
  look: BodyLook;
  baseId: string;
  onStill: (src: string) => void;
  onSpin: (capture: (deg: number) => Promise<string>) => void;
  onCapture?: (capture: CaptureYaws | null) => void;
  busy: boolean;
};

export default function MeshPanel({ look, baseId, onStill, onSpin, onCapture, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<MeshStage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const custom = name !== "" && name !== STANDIN_NAME;

  function publish(stage: MeshStage | null) {
    if (!stage) {
      onCaptureRef.current?.(null);
      return;
    }
    const capture: CaptureYaws = (yaws) => captureYaws(stage, yaws);
    onCaptureRef.current?.(capture);
  }

  useEffect(() => {
    return () => {
      publish(null);
      stageRef.current?.dispose();
      stageRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (custom || !canvasRef.current) return;
    let gone = false;
    void (async () => {
      try {
        stageRef.current?.dispose();
        const stage = await mountStandIn(canvasRef.current!, look, studioBase(baseId));
        if (gone) {
          stage.dispose();
          return;
        }
        stageRef.current = stage;
        publish(stage);
        setError("");
        setName(STANDIN_NAME);
      } catch (err) {
        if (!gone) setError(err instanceof Error ? err.message : "Gat ekki teiknað 3D-grunn");
      }
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, baseId, custom]);

  async function takeFile(file: File | undefined) {
    if (!isMeshFile(file) || !file || !canvasRef.current) {
      setError("Veldu GLB eða GLTF.");
      return;
    }
    setError("");
    try {
      stageRef.current?.dispose();
      const stage = await mountMesh(canvasRef.current, file);
      stageRef.current = stage;
      publish(stage);
      setName(file.name);
    } catch (err) {
      stageRef.current = null;
      publish(null);
      setName("");
      setError(err instanceof Error ? err.message : "Gat ekki lesið möskvann");
    }
  }

  return (
    <div className="ac-mesh">
      <h2 id="ac-mesh-guide">3D möskvi — mynd og videó</h2>
      <p className="ac-hint">{meshHint(Boolean(name), name)}</p>
      <canvas ref={canvasRef} className="ac-mesh-canvas" width={360} height={480} />
      {error && <p className="ac-error">{error}</p>}
      <div className="ac-row">
        <button type="button" className="ac-btn ghost" onClick={() => fileRef.current?.click()}>
          Setja inn GLB
        </button>
        {custom && (
          <button
            type="button"
            className="ac-btn ghost"
            onClick={() => {
              setName("");
              setError("");
            }}
          >
            Nota innbyggðan líkama
          </button>
        )}
        <button
          type="button"
          className="ac-btn"
          disabled={busy || !name}
          onClick={() => {
            const src = stageRef.current?.capture();
            if (src) onStill(src);
          }}
        >
          Taka 3D-mynd
        </button>
        <button
          type="button"
          className="ac-btn"
          disabled={busy || !name}
          onClick={() =>
            onSpin(async (deg) => {
              const stage = stageRef.current;
              if (!stage) throw new Error("3D-grunnur er ekki tilbúinn.");
              stage.setYaw(deg);
              await new Promise((r) => requestAnimationFrame(() => r(undefined)));
              return stage.capture();
            })
          }
        >
          {busy ? "Sný…" : "Snúa í videó"}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={MESH_ACCEPT}
        hidden
        onChange={(e) => {
          void takeFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <MeshGuideList />
    </div>
  );
}

function GuideCard({ guide }: { guide: MeshGuide }) {
  return (
    <article className="ac-mesh-card">
      <h4>
        {guide.href ? (
          <a href={guide.href} target="_blank" rel="noopener noreferrer">
            {guide.label}
          </a>
        ) : (
          guide.label
        )}
      </h4>
      <p className="ac-hint">{guide.why}</p>
      {guide.steps.length > 0 && (
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </article>
  );
}

function MeshGuideList() {
  const later = meshGuides("later");
  return (
    <div className="ac-mesh-guide">
      <h3>Hvernig á að fá 3D-líkama</h3>
      <p className="ac-hint">
        Byrjaðu á fyrsta spjaldinu. Ef þú vilt raunverulegri líkama, opnaðu hlekk, fylgdu
        skrefunum, og settu GLB-skrána inn hér. GLB er 3D-skráin sem stúdíóið les.
      </p>
      {meshGuides("studio").map((guide) => (
        <GuideCard key={guide.id} guide={guide} />
      ))}
      {meshGuides("web").map((guide) => (
        <GuideCard key={guide.id} guide={guide} />
      ))}
      {meshGuides("download").map((guide) => (
        <GuideCard key={guide.id} guide={guide} />
      ))}
      {meshGuides("desktop").map((guide) => (
        <GuideCard key={guide.id} guide={guide} />
      ))}
      {later.length > 0 && (
        <details className="ac-mesh-later">
          <summary>Ekki byrja hér — rannsóknarforrit</summary>
          {later.map((guide) => (
            <GuideCard key={guide.id} guide={guide} />
          ))}
        </details>
      )}
    </div>
  );
}
