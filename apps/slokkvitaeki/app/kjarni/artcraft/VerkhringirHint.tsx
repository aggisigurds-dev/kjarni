"use client";

/** Verkhringir — stuttar leiðbeiningar um hvað notandi ætti að gera NÆST
 * eftir að tiltekið tól hefur klárað, oftast gegnum „Senda í..." mynstrið.
 *
 * Birtist sem lítill hjálp-blokkur nálægt Senda-í-takkanum í hverjum tóli.
 */

type Verkhringur = { label: string; detail?: string };

const SUGGESTIONS: Record<string, Verkhringur[]> = {
  // Hraðbreyta er fasti low-res -> upscale er næstum alltaf næsta skref
  breyta: [
    { label: "→ Upplyfting", detail: "fyrir fullgæða útgáfu í prent/vef" },
    { label: "→ Endurljós", detail: "ef lýsingin þarf að breytast" },
  ],
  innblastur: [
    { label: "→ Upplyfting", detail: "fyrir hvert variation sem þú velur" },
    { label: "→ Breyta mynd", detail: "til að tweak-a tiltekið variation" },
  ],
  endurljos: [
    { label: "→ Upplyfting", detail: "fyrir prent-gæða útgáfu" },
    { label: "→ Innblástur", detail: "fyrir fleiri afbrigði í sömu lýsingu" },
  ],
  andlit: [
    { label: "→ Endurljós", detail: "til að stilla lýsinguna á andlits-locked myndinni" },
    { label: "→ Upplyfting", detail: "fyrir hámarks upplausn" },
  ],
  utvikka: [
    { label: "→ Upplyfting", detail: "svo nýju brúnirnar verði jafn skarpar og miðja" },
  ],
  upplyfting: [
    { label: "→ Breyta mynd", detail: "ef þú vilt frekari breytingar á fullgæða útgáfunni" },
  ],
  litun: [
    { label: "→ Upplyfting", detail: "fyrir skarpari lit-útgáfu" },
    { label: "→ Endurljós", detail: "fyrir nýja/stílíska lýsingu" },
  ],
  vidgerd: [
    { label: "→ Upplyfting", detail: "fyrir prent-gæða útgáfu" },
  ],
  bakgrunnur: [
    { label: "→ Breyta mynd", detail: "til að setja nýjan bakgrunn með texta" },
    { label: "→ Útvíkka", detail: "til að stækka rammann í kringum efnið" },
  ],
};

export type VerkhringirHintProps = {
  /** sourceTool — hvaða tól er að gefa útkomuna */
  tool: string;
};

export default function VerkhringirHint({ tool }: VerkhringirHintProps) {
  const suggestions = SUGGESTIONS[tool];
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div
      className="ac-rec"
      style={{
        marginTop: 8,
        padding: "8px 10px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        fontSize: 11,
        opacity: 0.85,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>💡 Verkhringir</div>
      {suggestions.map((s, i) => (
        <div key={i} style={{ marginTop: i === 0 ? 0 : 2 }}>
          <strong>{s.label}</strong>
          {s.detail && <span style={{ opacity: 0.7 }}> — {s.detail}</span>}
        </div>
      ))}
    </div>
  );
}
