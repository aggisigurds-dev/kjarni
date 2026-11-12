import type { Metadata, Viewport } from "next";
import TurboPaintClient from "./TurboPaintClient";

export const metadata: Metadata = {
  title: "TurboPaint — Kjarni",
  description:
    "TurboPaint — sjálfstætt hvítu borð á Kjarni. Flyttu inn PDF og TIF, merktu gólfplön og flyttu út í háum gæðum.",
  // Installanlegt sem app (Bæta við heimaskjá) og virkar án nets — turbopaint-sw.js
  // + OfflineReady.tsx sjá um skrána og skyndiminnið.
  manifest: "/turbopaint/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TurboPaint", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/turbopaint/icon.svg",
    apple: "/turbopaint/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FE653F",
};

export default function TurboPaintPage() {
  return <TurboPaintClient />;
}
