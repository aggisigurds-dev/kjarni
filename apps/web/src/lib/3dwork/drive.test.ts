import { describe, expect, it } from 'vitest';
import { DEFAULT_GOOGLE_CLIENT_ID, formatDriveBytes, isMeshName, parseDriveId } from './drive';

describe('parseDriveId', () => {
  it('reads a nested mobile folder URL and keeps the last folder', () => {
    expect(
      parseDriveId(
        'https://drive.google.com/drive/u/0/mobile/folders/1aFtf4-xPSe5jRWMaxRMlSHCh_XsOVCUa/1YHJOTN4jn9-evgkCDsXwoHnNy_VvY9lJ?pli=1&sort=13&direction=a'
      )
    ).toBe('1YHJOTN4jn9-evgkCDsXwoHnNy_VvY9lJ');
  });

  it('reads a normal folder URL', () => {
    expect(parseDriveId('https://drive.google.com/drive/folders/1YHJOTN4jn9-evgkCDsXwoHnNy_VvY9lJ')).toBe(
      '1YHJOTN4jn9-evgkCDsXwoHnNy_VvY9lJ'
    );
  });

  it('reads a file URL', () => {
    expect(
      parseDriveId('https://drive.google.com/file/d/1l5Y9R_J0ofH1nIjH_H6sbVv9Q28Bz1dI/view?usp=drivesdk')
    ).toBe('1l5Y9R_J0ofH1nIjH_H6sbVv9Q28Bz1dI');
  });

  it('accepts a bare id', () => {
    expect(parseDriveId('1YHJOTN4jn9-evgkCDsXwoHnNy_VvY9lJ')).toBe('1YHJOTN4jn9-evgkCDsXwoHnNy_VvY9lJ');
  });

  it('rejects junk', () => {
    expect(parseDriveId('not a link')).toBeNull();
    expect(parseDriveId('')).toBeNull();
  });
});

describe('isMeshName', () => {
  it('accepts stl and 3mf', () => {
    expect(isMeshName('grip.STL')).toBe(true);
    expect(isMeshName('body.3mf')).toBe(true);
    expect(isMeshName('notes.pdf')).toBe(false);
  });
});

describe('DEFAULT_GOOGLE_CLIENT_ID', () => {
  it('is the company Web OAuth client', () => {
    expect(DEFAULT_GOOGLE_CLIENT_ID).toMatch(/\.apps\.googleusercontent\.com$/);
    expect(DEFAULT_GOOGLE_CLIENT_ID.startsWith('708215000553-')).toBe(true);
  });
});

describe('formatDriveBytes', () => {
  it('uses KB and MB', () => {
    expect(formatDriveBytes(99076)).toBe('97 KB');
    expect(formatDriveBytes(6_061_778)).toBe('5.8 MB');
    expect(formatDriveBytes(96_101_135)).toBe('92 MB');
  });
});
