import type { Metadata } from "next";
import MasterClient from "./MasterClient";

// Heimaskjás-tákn (Agnar 15.11.2026: „shortcut logo fyrir home screen … kjarni.vercel.app/kjarni"; hann valdi
// „Reaktor" — HUD-skífa Ragnarök-skinnsins með glóandi kjarna og K; ?v=reaktor svo síminn sæki nýja táknið). Án tákna bjó Chrome til
// grátt „V" (fyrsti stafur vercel.app). Manifestið er `display: browser` — flýtileið, ekki uppsett app — svo það gleypir ekki
// TurboPaint/Apex (sem eru uppsetjanleg öpp undir /kjarni/…) og opnast í venjulegum Chrome-flipa eins og áður.
export const metadata: Metadata = {
  title: "Kjarni — Stjórnstöð",
  description: "Master-bakendi kjarni-platformsins — allir vefir og kerfi á einum stað.",
  manifest: "/stjornstod/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/stjornstod/icon.svg?v=reaktor", type: "image/svg+xml" },
      { url: "/stjornstod/icon-192.png?v=reaktor", sizes: "192x192", type: "image/png" },
      { url: "/stjornstod/icon-512.png?v=reaktor", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/stjornstod/apple-touch-icon.png?v=reaktor", sizes: "180x180" }],
  },
};

export default function KjarniPage() {
  return <MasterClient />;
}
