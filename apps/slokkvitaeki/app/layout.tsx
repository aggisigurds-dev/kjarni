import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { Tools } from "./Tools";
import "./globals.css";

const sans = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brunahólf Slökkvitæki ehf — Brunavarnir og þjónusta",
  description:
    "Við skoðum, þjónustum og seljum slökkvitæki og brunavarnabúnað — með fullum rekjanleika, QR-merkingum og þjónustu á vettvangi um allt land.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="is" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <Tools />
      </body>
    </html>
  );
}
