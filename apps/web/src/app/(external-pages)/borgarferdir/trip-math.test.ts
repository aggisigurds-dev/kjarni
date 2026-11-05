import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  DESTINATIONS,
  addDays,
  airlineFits,
  compactDate,
  fareKey,
  prettyDate,
  searchLinks,
  totals,
  verdict,
} from './trip-math';

const ez = DESTINATIONS.MAN.airlines[0];

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

  it('prices Glasgow from its own fares', () => {
    const t = totals({ ...DEFAULT_STATE, dest: 'GLA' }, 'ic');
    expect(t.flights).toBe(888);
    expect(t.bags).toBe(188);
  });

  it('rates a fare against the snapshot', () => {
    expect(verdict(DEFAULT_STATE, ez).tone).toBe('good');
    const mid = { ...DEFAULT_STATE, fare: { ...DEFAULT_STATE.fare, [fareKey('MAN', 'ez')]: 80 } };
    expect(verdict(mid, ez).tone).toBe('mid');
    const bad = { ...DEFAULT_STATE, fare: { ...DEFAULT_STATE.fare, [fareKey('MAN', 'ez')]: 120 } };
    expect(verdict(bad, ez).tone).toBe('bad');
  });

  it('only fits easyJet on Thursday/Sunday legs', () => {
    expect(airlineFits(ez, '2026-11-12', 3)).toBe(true);
    expect(airlineFits(ez, '2026-11-13', 3)).toBe(false);
    expect(airlineFits(DESTINATIONS.MAN.airlines[1], '2026-11-13', 3)).toBe(true);
  });

  it('puts destination and dates into search links', () => {
    const links = searchLinks(DEFAULT_STATE);
    expect(links.find((l) => l.name === 'Skyscanner')?.href).toContain('/kef/man/261112/261115/');
    expect(links.find((l) => l.name === 'Booking.com')?.href).toContain('checkout=2026-11-15');
    const gla = searchLinks({ ...DEFAULT_STATE, dest: 'GLA' });
    expect(gla.find((l) => l.name === 'Skyscanner')?.href).toContain('/kef/gla/');
    expect(gla.find((l) => l.name === 'Kayak')?.href).toContain('KEF-GLA');
    expect(gla.some((l) => l.name === 'easyJet')).toBe(false);
  });
});
