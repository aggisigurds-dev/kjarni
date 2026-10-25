"use client";

import {
  addsForSlot,
  garmentRemovePrompt,
  slotOfRegion,
  type GarmentAdd,
  type GarmentSlot,
} from "./garments";
import type { StudioRegion } from "./analyzeImage";

type Props = {
  region: StudioRegion | undefined;
  canRebuild: boolean;
  busy: boolean;
  onRebuild: () => void;
  onContinue: () => void;
  onFill: (prompt: string, maskId: string) => void;
  onAdd: (add: GarmentAdd) => void;
};

export default function GarmentBar({
  region,
  canRebuild,
  busy,
  onRebuild,
  onContinue,
  onFill,
  onAdd,
}: Props) {
  if (!canRebuild) return null;
  const slot: GarmentSlot = slotOfRegion(region?.id || "", region?.kind) || "pants";
  const selectedSlot = slotOfRegion(region?.id || "", region?.kind);
  const adds = addsForSlot(slot);

  return (
    <div className="ac-garment">
      <p className="ac-hint">
        Endurbyggja strokar fötin út fyrst og fyllir húð, ekki suði og ekki
        mynstur. Andlitið helst. Áframhald lengir fætur eða hendur út fyrir
        rammann. Svo bætirðu nýjum fötum ofan á.
      </p>
      <div className="ac-row">
        <button type="button" className="ac-btn" disabled={busy} onClick={onRebuild}>
          Endurbyggja líkama
        </button>
        <button type="button" className="ac-btn ghost" disabled={busy} onClick={onContinue}>
          Áframhald
        </button>
        {selectedSlot && region && (
          <button
            type="button"
            className="ac-btn ghost"
            disabled={busy}
            onClick={() => onFill(garmentRemovePrompt(selectedSlot), region.id)}
          >
            Aðeins þetta
          </button>
        )}
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
