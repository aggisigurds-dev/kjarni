import { Chakra_Petch } from 'next/font/google';

/**
 * Ragnarök chrome font (Chakra Petch) — copied from the same pattern as
 * apps/slokkvitaeki/app/kjarni/ragnarok/fonts.ts. Loaded only here, for the
 * dark gold .bench-chrome bars in 3dwork — never for the light work area,
 * which keeps the app's normal readable type.
 */
export const rgFont = Chakra_Petch({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
  variable: '--font-rg',
  display: 'swap',
});
