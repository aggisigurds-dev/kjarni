import { describe, expect, it } from 'vitest';
import {
  MARKS_3DWORK_ORIGIN,
  rewriteRetiredKjarniUrl,
  TURBOPAINT_APP,
  TURBOPAINT_HUB,
  TURBOPAINT_ORIGIN,
} from './kjarni-hosts';

describe('kjarni hosts', () => {
  it('keeps TurboPaint on the slokkvitaeki project, not the 3dwork host', () => {
    expect(TURBOPAINT_ORIGIN).toBe('https://kjarni.vercel.app');
    expect(TURBOPAINT_HUB).toBe('https://kjarni.vercel.app/kjarni');
    expect(TURBOPAINT_APP).toBe('https://kjarni.vercel.app/kjarni/turbopaint');
    expect(MARKS_3DWORK_ORIGIN).toBe('https://kjarni-3dwork.vercel.app');
    expect(TURBOPAINT_APP.startsWith(MARKS_3DWORK_ORIGIN)).toBe(false);
  });

  it('rewrites the three leftover Kjarni prefixes to the live hub', () => {
    expect(rewriteRetiredKjarniUrl('https://slokkvitaeki.netlify.app/kjarni/turbopaint')).toBe(
      TURBOPAINT_APP
    );
    expect(rewriteRetiredKjarniUrl('https://slokkvitaeki.vercel.app/kjarni')).toBe(TURBOPAINT_HUB);
    expect(rewriteRetiredKjarniUrl(`${MARKS_3DWORK_ORIGIN}/kjarni/turbopaint`)).toBe(TURBOPAINT_APP);
    expect(rewriteRetiredKjarniUrl('https://brunaholf.netlify.app')).toBe(
      'https://brunaholf.netlify.app'
    );
  });
});
