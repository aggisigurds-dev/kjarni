import type { ReactNode } from 'react';
import { rgFont } from './ragnarok/fonts';

/**
 * Makes --font-rg available everywhere under /3dwork (the dashboard header,
 * the Workbench ribbon and toolbar), not just wherever a component happens
 * to add rgFont.variable itself. .bench-chrome (ragnarok/theme.css) reads
 * --font-rg; without it being set here, any .bench-chrome outside the
 * dashboard falls back to the inherited font instead of Chakra Petch.
 */
export default function ThreeDWorkLayout({ children }: { children: ReactNode }) {
  return <div className={rgFont.variable}>{children}</div>;
}
