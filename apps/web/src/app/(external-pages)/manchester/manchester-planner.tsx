'use client';

/**
 * KEF → MAN trip planner: 3 adults + 1 child, flights + checked bags + hotel.
 * Prices are snapshots from comparison sites, not quotes — the user types in
 * live fares and the totals follow. State is kept in localStorage only.
 */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  DEFAULT_STATE,
  HOTELS,
  addDays,
  bookingUrl,
  easyJetFits,
  prettyDate,
  searchLinks,
  totals,
  verdict,
  type AirlineId,
  type TripState,
} from './trip-math';

const STORAGE_KEY = 'mcr-deals';
const THURSDAYS = ['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26'];

const AIRLINES: { id: AirlineId; name: string; note: string }[] = [
  { id: 'ez', name: 'easyJet', note: 'Direct, about Thu and Sun. Bag fee is per bag, each way, booked online.' },
  { id: 'ic', name: 'Icelandair', note: 'Direct, about daily. Economy Light, bag fee per bag, each way.' },
];

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const num = (value: string, min = 0) => Math.max(min, Number(value) || 0);

const toneClass = {
  good: 'text-primary',
  mid: 'text-amber-600 dark:text-amber-400',
  bad: 'text-destructive',
} as const;

export function ManchesterPlanner() {
  const [state, setState] = useState<TripState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState((s) => ({ ...s, ...JSON.parse(saved) }));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state, loaded]);

  const patch = (p: Partial<TripState>) => setState((s) => ({ ...s, ...p }));
  const ret = addDays(state.out, state.nights);
  const fits = easyJetFits(state.out, state.nights);

  const all = AIRLINES.map((a) => ({ ...a, t: totals(state, a.id), v: verdict(state, a.id) }));
  const best = all[0].t.travel <= all[1].t.travel ? all[0] : all[1];

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Card>
        <CardContent className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-5xl font-extrabold tracking-tight">
              KEF <span className="h-0.5 w-12 bg-primary" aria-hidden /> MAN
            </div>
            <p className="text-sm text-muted-foreground">Keflavík to Manchester, direct, about 2h45</p>
            <p className="text-sm tabular-nums">
              3 adults, 1 child (10) · {prettyDate(state.out)} to {prettyDate(ret)}
            </p>
          </div>
          <div className="rounded-md bg-muted p-4 sm:min-w-44">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Best estimate</div>
            <div className="text-3xl font-extrabold tabular-nums">{gbp(best.t.all)}</div>
            <div className="text-xs text-muted-foreground">{best.name}, flights, bags and hotel</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dates</CardTitle>
          <p className="text-sm text-muted-foreground">November 2026 Thursdays, 3 nights by default</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {THURSDAYS.map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={state.out === d && state.nights === 3 ? 'default' : 'outline'}
                onClick={() => patch({ out: d, nights: 3 })}
              >
                {prettyDate(d)} to {prettyDate(addDays(d, 3))}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="out">Fly out</Label>
              <Input id="out" type="date" min="2026-11-01" max="2026-11-30" value={state.out}
                onChange={(e) => e.target.value && patch({ out: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nights">Nights</Label>
              <Input id="nights" type="number" min={1} max={14} value={state.nights}
                onChange={(e) => patch({ nights: Math.min(14, Math.round(num(e.target.value, 1))) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret">Fly back</Label>
              <Input id="ret" type="date" value={ret} readOnly />
            </div>
          </div>
          <p className={cn('rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground', !fits && 'text-amber-700 dark:text-amber-400')}>
            {fits
              ? 'Thursday and Sunday suit easyJet, which flew those days in the snapshot. Icelandair flies most days.'
              : `easyJet only showed Thursday and Sunday flights, so ${prettyDate(state.out)} to ${prettyDate(ret)} may have no easyJet flight. Icelandair flies most days.`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Total cost</CardTitle>
          <p className="text-sm text-muted-foreground">Flights for 4 people, checked bags and hotel. All prices in GBP.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bags">Checked bags (group)</Label>
              <Input id="bags" type="number" min={0} max={8} value={state.bags}
                onChange={(e) => patch({ bags: num(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hotel">Hotel per room, per night (£)</Label>
              <Input id="hotel" type="number" min={0} step={5} value={state.hotel}
                onChange={(e) => patch({ hotel: num(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rooms">Rooms</Label>
              <Input id="rooms" type="number" min={1} max={3} value={state.rooms}
                onChange={(e) => patch({ rooms: num(e.target.value, 1) })} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {all.map((a) => (
              <div key={a.id} className={cn('space-y-3 rounded-lg border p-4', a.id === best.id && 'border-2 border-amber-600 bg-amber-50 dark:bg-amber-950/30')}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold">{a.name}</span>
                  {a.id === best.id && <Badge variant="outline">Cheapest</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{a.note}</p>
                <div className="space-y-1.5">
                  <Label htmlFor={`fare-${a.id}`}>Fare per person, return (£)</Label>
                  <Input id={`fare-${a.id}`} type="number" min={0} value={state.fare[a.id]}
                    onChange={(e) => patch({ fare: { ...state.fare, [a.id]: num(e.target.value) } })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`bag-${a.id}`}>Bag fee, each way (£)</Label>
                  <Input id={`bag-${a.id}`} type="number" min={0} value={state.bagFee[a.id]}
                    onChange={(e) => patch({ bagFee: { ...state.bagFee, [a.id]: num(e.target.value) } })} />
                </div>
                <p className={cn('text-sm font-semibold', toneClass[a.v.tone])}>{a.v.text}</p>
                <dl className="space-y-1 text-sm tabular-nums">
                  <Row label="Flights, 4 people" value={gbp(a.t.flights)} />
                  <Row label={`Checked bags, ${state.bags} x 2 ways`} value={gbp(a.t.bags)} />
                  <Row label="Flights and bags" value={gbp(a.t.travel)} />
                  <Row label={`Hotel, ${state.nights} nights${state.rooms > 1 ? `, ${state.rooms} rooms` : ''}`} value={gbp(a.t.hotel)} />
                </dl>
                <div className="flex items-baseline justify-between border-t pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Whole trip</span>
                  <strong className="text-3xl font-extrabold tabular-nums">{gbp(a.t.all)}</strong>
                </div>
              </div>
            ))}
          </div>
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Fares and bag fees are snapshots from price-comparison sites, not quotes. When you find a live price, type it
            into the fare box and the totals update. The child pays the full fare on both airlines.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hotels</CardTitle>
          <p className="text-sm text-muted-foreground">Central Manchester, picked for families</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {HOTELS.map((h) => (
              <div key={h.name} className={cn('flex flex-col gap-2 rounded-lg border p-4', h.rate !== null && h.rate === state.hotel && 'border-2 border-primary')}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-extrabold">{h.name}</span>
                  <span className="whitespace-nowrap text-xs font-semibold text-amber-700 dark:text-amber-400">{h.stars}</span>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h.area}</span>
                <span className="text-lg font-extrabold tabular-nums">
                  {h.rate !== null ? (
                    <>from about {gbp(h.rate)} <small className="text-xs font-normal text-muted-foreground">per night</small></>
                  ) : (
                    <small className="text-xs font-normal text-muted-foreground">Price not found, check live</small>
                  )}
                </span>
                <p className="text-sm">{h.why}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm">
                    <a href={bookingUrl(`${h.name} Manchester`, state)} target="_blank" rel="noopener noreferrer">
                      Check {prettyDate(state.out).split(' ').slice(1).join(' ')} to {prettyDate(ret).split(' ').slice(1).join(' ')}
                    </a>
                  </Button>
                  {h.rate !== null && (
                    <Button type="button" size="sm" variant="outline" onClick={() => patch({ hotel: h.rate as number })}>
                      Use this rate
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Rates are &quot;from&quot; prices seen on other dates and in other currencies, converted roughly to pounds. Real November
            prices will differ. None of these were confirmed to take three adults in one room, so check the room type or
            book two rooms.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check live prices</CardTitle>
          <p className="text-sm text-muted-foreground">Links use your dates and travellers</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {searchLinks(state).map((l) => (
              <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer"
                className="flex flex-col gap-0.5 rounded-lg border p-4 transition-colors hover:border-primary">
                <b className="font-semibold">{l.name}</b>
                <span className="text-sm text-muted-foreground">{l.blurb}</span>
                <i className="mt-1 text-sm font-semibold not-italic text-primary">
                  Open for {prettyDate(state.out)} to {prettyDate(ret)} 2026
                </i>
              </a>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Ask for a room sleeping four, or book two rooms. Many hotels cap rooms at two adults. Check the Manchester match
            calendar, since prices rise on Old Trafford and Etihad weekends.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
