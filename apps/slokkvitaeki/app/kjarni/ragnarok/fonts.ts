import { Chakra_Petch, JetBrains_Mono } from "next/font/google";

/* Ragnarök-letrin (Chakra Petch + JetBrains Mono). Aðeins hlaðin þar sem
 * Kjarni-stöðin er — ekki á opinbera vefnum. ragnarok.css les breyturnar. */
export const rgFont = Chakra_Petch({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rg",
  display: "swap",
});

export const rgMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-rg-mono",
  display: "swap",
});
