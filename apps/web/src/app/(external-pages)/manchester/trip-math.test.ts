import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  addDays,
  compactDate,
  easyJetFits,
  prettyDate,
  searchLinks,
  totals,
  verdict,
} from './trip-math';

describe('trip-math', () => {
  it('adds nights across a month boundary', () => {
    expect(addDays('2026-11-28', 3)).toBe('2026-12-01');
  });

  it('formats dates', () => {
    expect(prettyDate('2026-11-12')).toBe('Thu 12 Nov');
    expect(compactDate('2026-11-12')).toBe('261112');
  });

  it('totals flights, bags both ways and hotel', () => {
    const t = totals(DEFAULT_STATE, 'ez');
    expect(t.flights).toBe(264);
    expect(t.bags).toBe(60);
    expect(t.hotel).toBe(450);
    expect(t.all).toBe(774);
  });

  it('multiplies hotel by rooms', () => {
    expect(totals({ ...DEFAULT_STATE, rooms: 2 }, 'ic').hotel).toBe(900);
  });

  it('rates a fare against the snapshot', () => {
    expect(verdict(DEFAULT_STATE, 'ez').tone).toBe('good');
    expect(verdict({ ...DEFAULT_STATE, fare: { ez: 80, ic: 161 } }, 'ez').tone).toBe('mid');
    expect(verdict({ ...DEFAULT_STATE, fare: { ez: 120, ic: 161 } }, 'ez').tone).toBe('bad');
  });

  it('only fits easyJet on Thursday/Sunday legs', () => {
    expect(easyJetFits('2026-11-12', 3)).toBe(true);
    expect(easyJetFits('2026-11-13', 3)).toBe(false);
  });

  it('puts the dates into search links', () => {
    const links = searchLinks(DEFAULT_STATE);
    expect(links.find((l) => l.name === 'Skyscanner')?.href).toContain('/261112/261115/');
    expect(links.find((l) => l.name === 'Booking.com')?.href).toContain('checkout=2026-11-15');
  });
});
