import { describe, expect, it } from 'vitest';
import { imageFileFromClipboard, squareCropRect, SQUARE_COVER_PX } from './square-cover';
import { screenshotCoverUrl } from './preview';

describe('square covers', () => {
  it('center-crops a landscape screenshot', () => {
    expect(squareCropRect(800, 400)).toEqual({ sx: 200, sy: 0, size: 400 });
  });

  it('center-crops a portrait screenshot', () => {
    expect(squareCropRect(400, 800)).toEqual({ sx: 0, sy: 200, size: 400 });
  });

  it('keeps an already-square image whole', () => {
    expect(squareCropRect(400, 400)).toEqual({ sx: 0, sy: 0, size: 400 });
  });

  it('requests a square first-screen screenshot', () => {
    const url = screenshotCoverUrl('https://example.com/app');
    expect(url).toContain('mshots');
    expect(url).toContain(`w=${SQUARE_COVER_PX}`);
    expect(url).toContain(`h=${SQUARE_COVER_PX}`);
  });

  it('ignores clipboard paste that is only text', () => {
    const data = {
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
    } as unknown as DataTransfer;
    expect(imageFileFromClipboard(data)).toBeNull();
  });
});
