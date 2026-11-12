"use client";

import { useEffect, useState } from "react";

// Lætur TurboPaint virka án nets: (1) skráir þjónustuþráðinn (turbopaint-sw.js)
// svo app-skelin komi úr skyndiminni þegar net vantar, og (2) sýnir lágstemmdan
// vísi þegar tækið er án nettengingar — svo Agnar viti að vinna vistist í símann
// og samstillist þegar net kemur aftur (online-hlustarinn í persistence.ts ýtir
// þá sjálfkrafa). Fyrirmynd skráningar: TonklippaApp.tsx (/coach).

export function OfflineReady() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/turbopaint-sw.js", { scope: "/kjarni/turbopaint" })
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const uppfaera = () => setOffline(!navigator.onLine);
    uppfaera();
    window.addEventListener("online", uppfaera);
    window.addEventListener("offline", uppfaera);
    return () => {
      window.removeEventListener("online", uppfaera);
      window.removeEventListener("offline", uppfaera);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 bottom-[7.5rem] sm:bottom-4"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-400 px-3.5 py-1.5 text-[13px] font-semibold text-stone-900 shadow-lg ring-1 ring-black/10">
        <span aria-hidden="true">⚡</span>
        <span>Án nets — vista í símann, samstillist þegar net kemur</span>
      </div>
    </div>
  );
}
