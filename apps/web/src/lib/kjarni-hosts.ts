/**
 * Two Vercel projects ship from this monorepo. They are not two TurboPaint builds.
 *
 * - apps/slokkvitaeki → kjarni.vercel.app (alias slokkvitaeki.vercel.app)
 *   Stjórnstöð + TurboPaint. PDF import lives only here.
 * - apps/web → kjarni-3dwork.vercel.app
 *   Marks + 3dwork. /kjarni and /kjarni/turbopaint 404 unless redirected.
 */
export const TURBOPAINT_ORIGIN = 'https://kjarni.vercel.app';
export const TURBOPAINT_HUB = `${TURBOPAINT_ORIGIN}/kjarni`;
export const TURBOPAINT_APP = `${TURBOPAINT_ORIGIN}/kjarni/turbopaint`;
export const MARKS_3DWORK_ORIGIN = 'https://kjarni-3dwork.vercel.app';

const RETIRED_KJARNI_PREFIXES = [
  'https://slokkvitaeki.netlify.app/kjarni',
  'https://slokkvitaeki.vercel.app/kjarni',
  `${MARKS_3DWORK_ORIGIN}/kjarni`,
] as const;

/** Send leftover Netlify / alias / 3dwork-host Kjarni bookmarks to the live hub. */
export function rewriteRetiredKjarniUrl(url: string): string {
  for (const prefix of RETIRED_KJARNI_PREFIXES) {
    if (url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`) || url.startsWith(`${prefix}#`)) {
      return TURBOPAINT_HUB + url.slice(prefix.length);
    }
  }
  return url;
}
