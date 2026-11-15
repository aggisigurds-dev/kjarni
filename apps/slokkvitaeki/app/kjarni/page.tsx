import type { Metadata } from "next";
import MasterClient from "./MasterClient";

// Heimaskjás-tákn (Agnar 15.11.2026: „shortcut logo fyrir home screen … kjarni.vercel.app/kjarni"). Án tákna bjó Chrome til
// grátt „V" (fyrsti stafur vercel.app). Manifestið er `display: browser` — flýtileið, ekki uppsett app — svo það gleypir ekki
// TurboPaint/Apex (sem eru uppsetjanleg öpp undir /kjarni/…) og opnast í venjulegum Chrome-flipa eins og áður.
export const metadata: Metadata = {
  title: "Kjarni — Stjórnstöð",
  description: "Master-bakendi kjarni-platformsins — allir vefir og kerfi á einum stað.",
  manifest: "/stjornstod/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/stjornstod/icon.svg", type: "image/svg+xml" },
      { url: "/stjornstod/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/stjornstod/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/stjornstod/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function KjarniPage() {
  return <MasterClient />;
}
