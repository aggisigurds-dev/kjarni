export type AirlineId = 'ez' | 'ic';

export type TripState = {
  out: string;
  nights: number;
  bags: number;
  hotel: number;
  rooms: number;
  fare: Record<AirlineId, number>;
  bagFee: Record<AirlineId, number>;
};

/** Per-person return fares found in price-comparison snapshots (GBP). */
export const BASE_FARE: Record<AirlineId, number> = { ez: 66, ic: 161 };

export const DEFAULT_STATE: TripState = {
  out: '2026-11-12',
  nights: 3,
  bags: 2,
  hotel: 150,
  rooms: 1,
  fare: { ...BASE_FARE },
  bagFee: { ez: 15, ic: 47 },
};

/** 3 adults + 1 child; both airlines charge the child the full fare. */
export const TRAVELLERS = 4;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function prettyDate(date: string): string {
  const d = parse(date);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function weekday(date: string): number {
  return parse(date).getUTCDay();
}

/** Skyscanner date format: yymmdd. */
export function compactDate(date: string): string {
  return date.slice(2, 4) + date.slice(5, 7) + date.slice(8, 10);
}

export type Totals = {
  flights: number;
  bags: number;
  travel: number;
  hotel: number;
  all: number;
};

export function totals(state: TripState, airline: AirlineId): Totals {
  const flights = state.fare[airline] * TRAVELLERS;
  const bags = state.bags * state.bagFee[airline] * 2;
  const hotel = state.hotel * state.rooms * state.nights;
  return { flights, bags, travel: flights + bags, hotel, all: flights + bags + hotel };
}

export type Verdict = { tone: 'good' | 'mid' | 'bad'; text: string };

export function verdict(state: TripState, airline: AirlineId): Verdict {
  const ratio = state.fare[airline] / BASE_FARE[airline];
  if (ratio <= 1.02) return { tone: 'good', text: 'At or below the fare I found' };
  const pct = Math.round((ratio - 1) * 100);
  if (ratio <= 1.3) return { tone: 'mid', text: `About ${pct}% above the fare I found` };
  return { tone: 'bad', text: `Well above the fare I found (${pct}% more)` };
}

/** easyJet flew Thursday and Sunday in the snapshot; both legs should land on those days. */
export function easyJetFits(out: string, nights: number): boolean {
  const ok = (day: number) => day === 4 || day === 0;
  return ok(weekday(out)) && ok(weekday(addDays(out, nights)));
}

export type Hotel = {
  name: string;
  stars: string;
  area: string;
  /** Rough "from" price per night in GBP, or null when none was found. */
  rate: number | null;
  why: string;
};

export const HOTELS: Hotel[] = [
  { name: 'The Midland', stars: '4 star', area: '0.6 km from the centre', rate: 120, why: 'Listed with family rooms. The most upmarket pick here.' },
  { name: 'INNSiDE by Meliá Manchester', stars: '4 star', area: 'City centre', rate: 80, why: 'Family rooms listed, and the lowest-priced 4 star I found.' },
  { name: 'Crowne Plaza Manchester City Centre', stars: '4 star', area: 'Near the Arndale', rate: null, why: 'Recommended by parents for rooms with two large double beds. Ask for one when booking.' },
  { name: 'DoubleTree by Hilton Manchester Piccadilly', stars: '4 star', area: 'Piccadilly', rate: null, why: 'Indoor pool, which helps with a 10-year-old.' },
  { name: 'Holiday Inn Manchester City Centre', stars: '3 to 4 star', area: 'City centre', rate: null, why: 'Often named as a family favourite. Family rooms usually sleep four.' },
  { name: 'Manchester Portland by Sunday', stars: '3.5 star', area: 'City centre', rate: 60, why: 'Reviewers call it good value and well located. The budget option.' },
  { name: 'Staycity Aparthotels Manchester', stars: 'Aparthotel', area: 'City centre', rate: null, why: 'Apartments with separate sleeping space often suit three adults and a child better than one room.' },
];

export function bookingUrl(query: string, state: TripState): string {
  const ret = addDays(state.out, state.nights);
  return (
    'https://www.booking.com/searchresults.html' +
    `?ss=${encodeURIComponent(query)}&checkin=${state.out}&checkout=${ret}` +
    `&group_adults=3&group_children=1&age=10&no_rooms=${state.rooms}`
  );
}

export type SearchLink = { name: string; blurb: string; href: string };

export function searchLinks(state: TripState): SearchLink[] {
  const out = state.out;
  const ret = addDays(out, state.nights);
  return [
    {
      name: 'Google Flights',
      blurb: 'Compares all airlines',
      href: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from KEF to MAN on ${out} through ${ret} for 3 adults 1 child nonstop`)}`,
    },
    {
      name: 'Skyscanner',
      blurb: 'Cheapest-first, direct',
      href: `https://www.skyscanner.net/transport/flights/kef/man/${compactDate(out)}/${compactDate(ret)}/?adultsv2=3&childrenv2=10&cabinclass=economy&preferdirects=true`,
    },
    {
      name: 'Kayak',
      blurb: 'Sorted by price',
      href: `https://www.kayak.co.uk/flights/KEF-MAN/${out}/${ret}/3adults/children-10?sort=price_a&fs=stops=0`,
    },
    {
      name: 'Icelandair',
      blurb: 'Book direct, check Light vs Standard',
      href: 'https://www.icelandair.com/en-gb/flights/flights-from-manchester-to-reykjavik',
    },
    { name: 'easyJet', blurb: 'Book direct, add bags online', href: 'https://www.easyjet.com/en/' },
    { name: 'Booking.com', blurb: 'Hotels, family rooms', href: bookingUrl('Manchester', state) },
    {
      name: 'Google Hotels',
      blurb: 'Prices across sites',
      href: `https://www.google.com/travel/search?q=${encodeURIComponent(`hotels in Manchester ${out} to ${ret} 3 adults 1 child`)}`,
    },
  ];
}
