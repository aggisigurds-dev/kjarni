/* Ragnarök-hringurinn úr Fenrir-hönnunarkerfinu (ApocalypseRing, Agnar 17.11.2026):
 * kyrr rammi + þrjú gegnsæ snúningslög sem snúast sjálfstætt í CSS —
 * ytra 80 s réttsælis, rúnir 115 s rangsælis, innra 55 s réttsælis.
 * Myndirnar eru í public/kjarni/apocalypse/. Stöðvast við prefers-reduced-motion.
 * `emblem` = merki í miðjunni (kyrrt) í stað textans `label`; label heldur áfram sem aðgengisheiti. */
export function ApocalypseRing({ label, sub, emblem }: { label?: string; sub?: string; emblem?: string }) {
  const src = "/kjarni/apocalypse";
  return (
    <div className="rg-apoc" role="img" aria-label={label ? `${label} — Ragnarök hringur` : "Ragnarök hringur"}>
      <img className="rg-apoc-l rg-apoc-base" src={`${src}/base.webp`} alt="" decoding="async" />
      <img className="rg-apoc-l rg-apoc-outer" src={`${src}/outer.webp`} alt="" decoding="async" />
      <img className="rg-apoc-l rg-apoc-runes" src={`${src}/runes.webp`} alt="" decoding="async" />
      <img className="rg-apoc-l rg-apoc-inner" src={`${src}/inner.webp`} alt="" decoding="async" />
      <div className="rg-apoc-light" aria-hidden="true" />
      {emblem ? (
        <img className="rg-apoc-emblem" src={emblem} alt="" decoding="async" />
      ) : label ? (
        <div className="rg-apoc-txt" aria-hidden="true">
          {label}
          {sub ? <small>{sub}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
