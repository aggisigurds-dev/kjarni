"use client";

import { useEffect, useRef, useState } from "react";
import { MESH_ACCEPT, isMeshFile, meshHint } from "./mesh";
import { mountMesh, type MeshStage } from "./meshView";

type Props = {
  onStill: (src: string) => void;
  onSpin: (capture: (deg: number) => Promise<string>) => void;
  busy: boolean;
};

export default function MeshPanel({ onStill, onSpin, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<MeshStage | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      stageRef.current?.dispose();
      stageRef.current = null;
    };
  }, []);

  async function takeFile(file: File | undefined) {
    if (!isMeshFile(file) || !file || !canvasRef.current) {
      setError("Veldu GLB eða GLTF.");
      return;
    }
    setError("");
    try {
      stageRef.current?.dispose();
      stageRef.current = await mountMesh(canvasRef.current, file);
      setName(file.name);
    } catch (err) {
      setName("");
      setError(err instanceof Error ? err.message : "Gat ekki lesið möskvann");
    }
  }

  return (
    <div className="ac-mesh">
      <h2>3D möskvi — mynd og videó</h2>
      <p className="ac-hint">{meshHint(Boolean(name), name)}</p>
      <canvas ref={canvasRef} className="ac-mesh-canvas" width={360} height={480} />
      {error && <p className="ac-error">{error}</p>}
      <div className="ac-row">
        <button type="button" className="ac-btn ghost" onClick={() => fileRef.current?.click()}>
          Setja inn GLB
        </button>
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
              if (!stage) throw new Error("Settu inn GLB fyrst.");
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
    </div>
  );
}
