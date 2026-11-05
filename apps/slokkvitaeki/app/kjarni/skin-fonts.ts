import { IBM_Plex_Mono, IBM_Plex_Sans, Playfair_Display, Poppins } from "next/font/google";

/* Letur þemanna fjögurra (15.10.2026) — sömu letur og hönnunarkerfin nota:
 * Miðakerfi/Brunastál = IBM Plex Sans + JetBrains Mono (--font-rg-mono) + Playfair í tölum,
 * Big Boss = Playfair Display + IBM Plex Mono, Brunahólf = Poppins. skins.css les breyturnar;
 * vafrinn sækir aðeins það letur sem valið þema notar. */
export const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  variable: "--font-plexmono",
  display: "swap",
});

export const playfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800"],
  variable: "--font-playfair",
  display: "swap",
});

export const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bh",
  display: "swap",
});
