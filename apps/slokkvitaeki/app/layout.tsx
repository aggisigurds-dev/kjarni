import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slökkvitæki ehf — Brunavarnir, skoðun og þjónusta",
  description:
    "Við skoðum, þjónustum og seljum slökkvitæki og brunavarnabúnað — með fullum rekjanleika, QR-merkingum og þjónustu á vettvangi um allt land.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="is">
      <body>{children}</body>
    </html>
  );
}
