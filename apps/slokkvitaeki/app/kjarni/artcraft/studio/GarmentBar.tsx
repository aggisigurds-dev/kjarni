"use client";

import {
  addsForSlot,
  garmentContinuePrompt,
  garmentRemovePrompt,
  slotOfRegion,
  type GarmentAdd,
} from "./garments";
import type { StudioRegion } from "./analyzeImage";

type Props = {
  region: StudioRegion | undefined;
  busy: boolean;
  onFill: (prompt: string, maskId: string) => void;
  onAdd: (add: GarmentAdd) => void;
};

export default function GarmentBar({ region, busy, onFill, onAdd }: Props) {
  const slot = slotOfRegion(region?.id || "", region?.kind);
  if (!slot || !region) return null;
  const adds = addsForSlot(slot);

  return (
    <div className="ac-garment">
      <p className="ac-hint">
        Eyða fyllir það sem var undir (fætur, hendur) — ekki gat. Áframhald
        teiknar meira af líkamanum ef vantar. Svo bætirðu stuttbuxum ofan á.
      </p>
      <div className="ac-row">
        <button
          type="button"
          className="ac-btn"
          disabled={busy}
          onClick={() => onFill(garmentRemovePrompt(slot), region.id)}
        >
          Eyða
        </button>
        <button
          type="button"
          className="ac-btn ghost"
          disabled={busy}
          onClick={() => onFill(garmentContinuePrompt(slot), region.id)}
        >
          Áframhald
        </button>
      </div>
      {adds.length > 0 && (
        <>
          <p className="ac-hint">Bæta við ofan á fyllta líkamann</p>
          <div className="ac-row ac-chips">
            {adds.map((add) => (
              <button
                key={add.id}
                type="button"
                className="ac-btn ghost"
                disabled={busy}
                onClick={() => onAdd(add)}
              >
                {add.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
