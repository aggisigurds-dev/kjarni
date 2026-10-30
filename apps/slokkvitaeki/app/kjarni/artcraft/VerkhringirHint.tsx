"use client";

/** Verkhringir — stuttar leiðbeiningar um hvað notandi ætti að gera NÆST
 * eftir að tiltekið tól hefur klárað, oftast gegnum „Senda í..." mynstrið.
 *
 * Birtist sem áberandi callout-blokkur nálægt Senda-í-takkanum í hverjum tóli.
 * Fyrir október 2026: v2 með skýrari hierarkíu, stærra letri og primary-litum
 * (áður of daufur: notendur sáu ekki hvar næsta skref var).
 */

type Verkhringur = { label: string; detail?: string };

const SUGGESTIONS: Record<string, Verkhringur[]> = {
  // Hraðbreyta er fasti low-res -> upscale er næstum alltaf næsta skref
  breyta: [
    { label: "Upplyfting", detail: "fyrir fullgæða útgáfu í prent/vef" },
    { label: "Endurljós", detail: "ef lýsingin þarf að breytast" },
  ],
  innblastur: [
    { label: "Upplyfting", detail: "fyrir hvert variation sem þú velur" },
    { label: "Breyta mynd", detail: "til að tweak-a tiltekið variation" },
  ],
  endurljos: [
    { label: "Upplyfting", detail: "fyrir prent-gæða útgáfu" },
    { label: "Innblástur", detail: "fyrir fleiri afbrigði í sömu lýsingu" },
  ],
  andlit: [
    { label: "Endurljós", detail: "til að stilla lýsinguna á andlits-locked myndinni" },
    { label: "Upplyfting", detail: "fyrir hámarks upplausn" },
  ],
  utvikka: [
    { label: "Upplyfting", detail: "svo nýju brúnirnar verði jafn skarpar og miðja" },
  ],
  upplyfting: [
    { label: "Breyta mynd", detail: "ef þú vilt frekari breytingar á fullgæða útgáfunni" },
  ],
  litun: [
    { label: "Upplyfting", detail: "fyrir skarpari lit-útgáfu" },
    { label: "Endurljós", detail: "fyrir nýja/stílíska lýsingu" },
  ],
  vidgerd: [
    { label: "Upplyfting", detail: "fyrir prent-gæða útgáfu" },
    { label: "Endurljós", detail: "ef lýsingin þarf líka að laga" },
  ],
  bakgrunnur: [
    { label: "Breyta mynd", detail: "til að setja nýjan bakgrunn með texta" },
    { label: "Útvíkka", detail: "til að stækka rammann í kringum efnið" },
  ],
  // Video-tólin — hjálpa notanda að byggja upp lengri senur
  skyjahreyfimynd: [
    { label: "Myndband-framhald", detail: "teygja í lengri klippu með því að taka last-frame" },
    { label: "Myndband-andlit", detail: "læsa persónu ef andlitið drift-aði í Wan 2.2" },
    { label: "Myndbanda-upplyfting", detail: "stækka 480p útkomuna í 4K" },
  ],
  "myndband-framhald": [
    { label: "Myndband-framhald", detail: "ítrað framhald af framhaldi fyrir lengri senu" },
    { label: "Myndbanda-saumur", detail: "sauma öll framhöld saman í eina klippu" },
  ],
  "myndband-saumur": [
    { label: "Myndbanda-upplyfting", detail: "stækka sameinuðu klippuna í 4K" },
    { label: "Myndband-andlit", detail: "læsa persónu á allri röðinni í einni keyrslu" },
  ],
  "myndband-andlit": [
    { label: "Myndbanda-upplyfting", detail: "stækka og skerpa face-locked video" },
    { label: "Myndband-framhald", detail: "teygja face-locked klippuna lengra" },
  ],
  "myndband-portret-andlit": [
    { label: "Myndbanda-upplyfting", detail: "stækka final composite í FHD/4K" },
    { label: "Myndbanda-saumur", detail: "setja portret-klippuna í lengri röð" },
  ],
  "video-upplyfting": [
    { label: "Myndbanda-saumur", detail: "sauma 4K klippur saman í röð" },
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
      className="ac-rec ac-verkhringir"
      role="note"
      aria-label="Næstu skref"
      style={{
        marginTop: 12,
        padding: "12px 14px",
        background: "rgba(74, 222, 128, 0.12)",
        border: "1px solid rgba(74, 222, 128, 0.45)",
        borderRadius: 8,
        fontSize: 13,
        color: "var(--m-text, #e5e7eb)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6, color: "#4ade80" }}>
        <span aria-hidden="true" style={{ fontSize: 15 }}>💡</span>
        Næsta skref — notaðu „Senda í… ▾"
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {suggestions.map((s, i) => (
          <li key={i} style={{ marginTop: i === 0 ? 0 : 4, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: "#4ade80" }}>→ {s.label}</span>
            {s.detail && <span style={{ opacity: 0.85 }}> — {s.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
