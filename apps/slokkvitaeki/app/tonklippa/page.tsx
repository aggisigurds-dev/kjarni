import type { Metadata, Viewport } from "next";
import TonklippaApp from "../kjarni/artcraft/tonklippa/TonklippaApp";

type Search = Promise<{ k?: string | string[] }>;

// Sjálfstætt app (án Kjarna-rammans) sem má setja á heimaskjá. Lykill
// skúffunnar í slóðinni fylgir með í manifest-tenglinum — sjá sync.ts.
export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const raw = (await searchParams).k;
  const k = typeof raw === "string" && /^[0-9a-f]{64}$/.test(raw) ? raw : "";
  return {
    title: "Tónklippa",
    description: "Klipptu saman tónlist fyrir dans- og skautarútínur: kaflar úr lögum, nákvæm lengd, hápunktar og MP3.",
    manifest: k ? `/tonklippa/manifest.webmanifest?k=${k}` : "/tonklippa/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Tónklippa", statusBarStyle: "black-translucent" },
    icons: {
      icon: [
        { url: "/tonklippa/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/tonklippa/icon.svg", type: "image/svg+xml" },
      ],
      apple: [{ url: "/tonklippa/apple-touch-icon.png", sizes: "180x180" }],
    },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    // Next gefur bara út nýja heitið; eldri iOS les það gamla.
    other: { "mobile-web-app-capable": "yes", "apple-mobile-web-app-capable": "yes" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0f0a1e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function TonklippaPage() {
  return (
    <>
      <style>{"html,body{background:#0f0a1e;overscroll-behavior:none}"}</style>
      <TonklippaApp />
    </>
  );
}
