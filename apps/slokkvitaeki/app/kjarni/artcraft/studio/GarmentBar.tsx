"use client";

import { addsForSlot, garmentRemovePrompt, slotOfRegion, type GarmentAdd } from "./garments";
import type { StudioRegion } from "./analyzeImage";

type Props = {
  region: StudioRegion | undefined;
  busy: boolean;
  onRemove: (prompt: string, maskId: string) => void;
  onAdd: (add: GarmentAdd) => void;
};

export default function GarmentBar({ region, busy, onRemove, onAdd }: Props) {
  const slot = slotOfRegion(region?.id || "", region?.kind);
  if (!slot || !region) return null;
  const adds = addsForSlot(slot);

  return (
    <div className="ac-garment">
      <p className="ac-hint">
        Eyða tekur þetta af. Bæta við setur nýtt ofan á tóma svæðið — ekki reyna
        að breyta fötunum á staðnum.
      </p>
      <div className="ac-row">
        <button
          type="button"
          className="ac-btn"
          disabled={busy}
          onClick={() => onRemove(garmentRemovePrompt(slot), region.id)}
        >
          Eyða
        </button>
      </div>
      {adds.length > 0 && (
        <>
          <p className="ac-hint">Bæta við</p>
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
