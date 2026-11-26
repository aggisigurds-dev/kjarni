import type { Metadata, Viewport } from "next";
import StarfsmadurClient from "./StarfsmadurClient";
import "./starfsmadur.css";

export const metadata: Metadata = {
  title: "Apex Ajour — starfsmenn",
  description: "Starfsmannahamur á síma, eins og Ajour-appið: verk, teikningar, punktar, myndir, gátlisti og staða.",
  // „Bæta á heimaskjá": opnast sem app beint í starfsmannahaminn
  manifest: "/apex/starfsmadur.webmanifest",
  appleWebApp: { capable: true, title: "Apex", statusBarStyle: "default" },
  icons: { icon: [{ url: "/apex/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/apex/apple-touch-icon.png", sizes: "180x180" }] },
};

/* Teikningin hefur eigin klípu-stækkun; síðan sjálf stækkar ekki (sama og á gatakortinu, Agnar 12.11.2026). */
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", themeColor: "#ffffff" };

export default function StarfsmadurPage() {
  return <StarfsmadurClient />;
}
