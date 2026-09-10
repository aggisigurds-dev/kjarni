import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLIENT_ID_OVERRIDE_KEY,
  DEFAULT_GOOGLE_CLIENT_ID,
  LEGACY_CLIENT_ID_KEY,
  TOKEN_KEY,
  activeGoogleClientId,
  describeDriveFailure,
  describeSignInError,
  formatDriveBytes,
  isGoogleClientId,
  isMeshName,
  parseDriveId,
  parseStoredToken,
  readStoredToken,
  storeClientIdOverride,
  storeToken,
  tokenExpiry,
} from './drive';

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
    expect(DEFAULT_GOOGLE_CLIENT_ID).toContain('7sc6vb83g2manolct21l7gh45tk442es');
  });
});

describe('formatDriveBytes', () => {
  it('uses KB and MB', () => {
    expect(formatDriveBytes(99076)).toBe('97 KB');
    expect(formatDriveBytes(6_061_778)).toBe('5.8 MB');
    expect(formatDriveBytes(96_101_135)).toBe('92 MB');
  });
});

describe('activeGoogleClientId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the company client when nothing is stored', () => {
    expect(activeGoogleClientId()).toBe(DEFAULT_GOOGLE_CLIENT_ID);
  });

  it('ignores and wipes the old free-text key, even when it holds a mistyped id', () => {
    // One swapped 1/l — Google answers invalid_client for this one.
    localStorage.setItem(LEGACY_CLIENT_ID_KEY, '708215000553-7sc6vb83g2manolct2l17gh45tk442es.apps.googleusercontent.com');
    expect(activeGoogleClientId()).toBe(DEFAULT_GOOGLE_CLIENT_ID);
    expect(localStorage.getItem(LEGACY_CLIENT_ID_KEY)).toBeNull();
  });

  it('honours a well-formed explicit override and drops a broken one', () => {
    storeClientIdOverride('123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com');
    expect(activeGoogleClientId()).toBe('123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com');

    localStorage.setItem(CLIENT_ID_OVERRIDE_KEY, 'not a client id');
    expect(activeGoogleClientId()).toBe(DEFAULT_GOOGLE_CLIENT_ID);
    expect(localStorage.getItem(CLIENT_ID_OVERRIDE_KEY)).toBeNull();
  });

  it('treats the deleted legacy client and the baked id as "no override"', () => {
    expect(isGoogleClientId('708215000553-77htigi4tkqdr00bfak0j2e539h9bc2d.apps.googleusercontent.com')).toBe(false);
    storeClientIdOverride(DEFAULT_GOOGLE_CLIENT_ID);
    expect(localStorage.getItem(CLIENT_ID_OVERRIDE_KEY)).toBeNull();
  });
});

describe('stored Drive token', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps a token until a minute before Google expires it', () => {
    const now = 1_000_000;
    expect(tokenExpiry(3599, now)).toBe(now + (3599 - 60) * 1000);
    expect(tokenExpiry(undefined, now)).toBe(now + 3540 * 1000);
    expect(tokenExpiry(5, now)).toBe(now + 3540 * 1000);
  });

  it('survives a reload and dies on time', () => {
    storeToken('ya29.abc', 3600);
    expect(readStoredToken()).toBe('ya29.abc');
    expect(readStoredToken(Date.now() + 3600 * 1000)).toBe('');
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('rejects the old bare-string format and junk', () => {
    expect(parseStoredToken('ya29.old-format', 0)).toBe('');
    expect(parseStoredToken('{"token":"","expiresAt":9}', 0)).toBe('');
    expect(parseStoredToken(null)).toBe('');
  });
});

describe('sign-in and Drive error messages', () => {
  it('tells the person what to do about a blocked pop-up or a refused account', () => {
    expect(describeSignInError('popup_failed_to_open')).toMatch(/pop-ups/i);
    expect(describeSignInError('popup_closed')).toMatch(/closed/i);
    expect(describeSignInError('access_denied')).toMatch(/test-user/i);
    expect(describeSignInError('invalid_client')).toMatch(/client id/i);
    expect(describeSignInError(undefined, 'Something odd')).toBe('Something odd');
  });

  it('names the folder when this account cannot see it', () => {
    expect(describeDriveFailure(404, '', 'Top model 3')).toContain('Top model 3');
    expect(describeDriveFailure(403, '')).toMatch(/Disconnect/);
    expect(describeDriveFailure(500, '{"error":{"message":"Backend Error"}}')).toBe('Backend Error');
  });
});
