import type { Metadata, Viewport } from "next";
import BioClient from "./BioClient";

export const metadata: Metadata = {
  title: "Bíó — þættir og myndir",
  description: "Plex-safnið heima: þættir sem fylgst er með, hvað vantar, nýir þættir og nýjar myndir.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0d0f14", width: "device-width", initialScale: 1 };

export default function BioPage() {
  return <BioClient />;
}
