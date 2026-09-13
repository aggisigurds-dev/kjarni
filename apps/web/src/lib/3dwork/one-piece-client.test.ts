import { describe, expect, it } from 'vitest';
import { explainKernelError } from './one-piece-client';

describe('explainKernelError', () => {
  it('says what a kernel that ran out of memory means', () => {
    expect(explainKernelError('memory access out of bounds')).toMatch(/ran out of memory/);
    expect(explainKernelError('Aborted(OOM)')).toMatch(/smaller seam setting/);
  });

  it('passes every other message through as it is', () => {
    expect(explainKernelError('Nothing solid was left after the cut.')).toBe(
      'Nothing solid was left after the cut.'
    );
  });
});
