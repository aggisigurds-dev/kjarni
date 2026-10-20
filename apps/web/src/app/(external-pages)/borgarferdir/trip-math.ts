export type DestCode = 'MAN' | 'GLA';
export type AirlineId = 'ez' | 'ic';

export type Airline = {
  id: AirlineId;
  name: string;
  note: string;
  /** Per-person return fare found in comparison-site snapshots (GBP). */
  baseFare: number;
  /** Checked bag fee, per bag, each way (GBP). */
  bagFee: number;
  /** Weekdays (0 = Sun) the airline was seen flying; undefined when unknown or daily. */
  days?: number[];
};

export type Hotel = {
  name: string;
  stars: string;
  area: string;
  /** Rough "from" price per night in GBP, or null when none was found. */
  rate: number | null;
  why: string;
};

export type PackageOffer = { name: string; blurb: string; href: string };

export type Destination = {
  code: DestCode;
  city: string;
  /** Lower-case code used in Skyscanner paths. */
  skyscanner: string;
  flightTime?: string;
  airlines: Airline[];
  hotelDefault: number;
  hotels: Hotel[];
  airlineLinks: { name: string; blurb: string; href: string }[];
  packages: PackageOffer[];
  /** Icelandair's package price per person (ISK, 2 adults basis) when one was found. */
  packageFromIsk?: number;
};

const AGENCIES: PackageOffer[] = [
  { name: 'Heimsferðir', blurb: 'Icelandic travel agency, search city trips', href: 'https://www.heimsferdir.is' },
  { name: 'Vita', blurb: 'Icelandic travel agency, search city trips', href: 'https://www.vita.is' },
  { name: 'Úrval Útsýn', blurb: 'Icelandic travel agency, search city trips', href: 'https://www.uu.is' },
];

export const DESTINATIONS: Record<DestCode, Destination> = {
  MAN: {
    code: 'MAN',
    city: 'Manchester',
    skyscanner: 'man',
    flightTime: 'about 2h45',
    airlines: [
      { id: 'ez', name: 'easyJet', note: 'Direct, about Thu and Sun. Bag fee is per bag, each way, booked online.', baseFare: 66, bagFee: 15, days: [4, 0] },
      { id: 'ic', name: 'Icelandair', note: 'Direct, about daily. Economy Light, bag fee per bag, each way.', baseFare: 161, bagFee: 47 },
    ],
    hotelDefault: 150,
    hotels: [
      { name: 'The Midland', stars: '4 star', area: '0.6 km from the centre', rate: 120, why: 'Listed with family rooms. The most upmarket pick here.' },
      { name: 'INNSiDE by Meliá Manchester', stars: '4 star', area: 'City centre', rate: 80, why: 'Family rooms listed, and the lowest-priced 4 star I found.' },
      { name: 'Crowne Plaza Manchester City Centre', stars: '4 star', area: 'Near the Arndale', rate: null, why: 'Recommended by parents for rooms with two large double beds. Ask for one when booking.' },
      { name: 'DoubleTree by Hilton Manchester Piccadilly', stars: '4 star', area: 'Piccadilly', rate: null, why: 'Indoor pool, which helps with a 10-year-old.' },
      { name: 'Holiday Inn Manchester City Centre', stars: '3 to 4 star', area: 'City centre', rate: null, why: 'Often named as a family favourite. Family rooms usually sleep four.' },
      { name: 'Manchester Portland by Sunday', stars: '3.5 star', area: 'City centre', rate: 60, why: 'Reviewers call it good value and well located. The budget option.' },
      { name: 'Staycity Aparthotels Manchester', stars: 'Aparthotel', area: 'City centre', rate: null, why: 'Apartments with separate sleeping space often suit three adults and a child better than one room.' },
    ],
    airlineLinks: [
      { name: 'Icelandair', blurb: 'Book direct, check Light vs Standard', href: 'https://www.icelandair.com/en-gb/flights/flights-from-manchester-to-reykjavik' },
      { name: 'easyJet', blurb: 'Book direct, add bags online', href: 'https://www.easyjet.com/en/' },
    ],
    packages: [
      { name: 'Icelandair pakkaferðir', blurb: 'Flights both ways, hotel with breakfast, hand luggage and a checked bag', href: 'https://www.icelandair.com/is/pakkaferdir/manchester-borgarferdir/' },
      ...AGENCIES,
    ],
    packageFromIsk: 72900,
  },
  GLA: {
    code: 'GLA',
    city: 'Glasgow',
    skyscanner: 'gla',
    airlines: [
      { id: 'ic', name: 'Icelandair', note: 'Direct. The only airline named for this route. Economy Light, bag fee per bag, each way.', baseFare: 222, bagFee: 47 },
    ],
    hotelDefault: 100,
    hotels: [
      { name: 'DoubleTree by Hilton Glasgow Central', stars: '4 star', area: 'City centre', rate: 65, why: 'Indoor pool and hot tub, free cribs. The pool suits a 10-year-old.' },
      { name: 'voco Grand Central Glasgow', stars: '4 star', area: 'City centre', rate: 65, why: 'Breakfast option and a restaurant on site. Lowest-priced 4 star I found.' },
      { name: 'Hilton Glasgow', stars: '4 star', area: 'City centre', rate: 85, why: 'Indoor pool. Pricier, but a safe family choice.' },
      { name: 'Apex City of Glasgow Hotel', stars: '4 star', area: 'Bath Street', rate: 85, why: 'Generous family room options and amenities for children.' },
      { name: 'Novotel Glasgow Centre', stars: '4 star', area: 'Pitt Street', rate: null, why: 'Described as family-friendly, with a sauna and fitness centre.' },
    ],
    airlineLinks: [
      { name: 'Icelandair', blurb: 'Book direct, check Light vs Standard', href: 'https://www.icelandair.com/en-gb/' },
    ],
    packages: [
      { name: 'Icelandair pakkaferðir', blurb: 'Icelandair package section. I did not find a Glasgow page, so check for Glasgow here', href: 'https://www.icelandair.com/is/pakkaferdir/' },
      ...AGENCIES,
    ],
  },
};

export type TripState = {
  dest: DestCode;
  out: string;
  nights: number;
  bags: number;
  hotel: number;
  rooms: number;
  /** Keyed by `${dest}:${airline}`. */
  fare: Record<string, number>;
  bagFee: Record<string, number>;
};

export const fareKey = (dest: DestCode, airline: AirlineId) => `${dest}:${airline}`;

function baseMaps() {
  const fare: Record<string, number> = {};
  const bagFee: Record<string, number> = {};
  for (const d of Object.values(DESTINATIONS)) {
    for (const a of d.airlines) {
      fare[fareKey(d.code, a.id)] = a.baseFare;
      bagFee[fareKey(d.code, a.id)] = a.bagFee;
    }
  }
  return { fare, bagFee };
}

export const DEFAULT_STATE: TripState = {
  dest: 'MAN',
  out: '2026-11-12',
  nights: 3,
  bags: 2,
  hotel: DESTINATIONS.MAN.hotelDefault,
  rooms: 1,
  ...baseMaps(),
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
  const key = fareKey(state.dest, airline);
  const flights = (state.fare[key] ?? 0) * TRAVELLERS;
  const bags = state.bags * (state.bagFee[key] ?? 0) * 2;
  const hotel = state.hotel * state.rooms * state.nights;
  return { flights, bags, travel: flights + bags, hotel, all: flights + bags + hotel };
}

export type Verdict = { tone: 'good' | 'mid' | 'bad'; text: string };

export function verdict(state: TripState, airline: Airline): Verdict {
  const ratio = (state.fare[fareKey(state.dest, airline.id)] ?? 0) / airline.baseFare;
  if (ratio <= 1.02) return { tone: 'good', text: 'At or below the fare I found' };
  const pct = Math.round((ratio - 1) * 100);
  if (ratio <= 1.3) return { tone: 'mid', text: `About ${pct}% above the fare I found` };
  return { tone: 'bad', text: `Well above the fare I found (${pct}% more)` };
}

/** False when the airline only flew certain weekdays and either leg falls outside them. */
export function airlineFits(airline: Airline, out: string, nights: number): boolean {
  if (!airline.days) return true;
  const ok = (day: number) => airline.days!.includes(day);
  return ok(weekday(out)) && ok(weekday(addDays(out, nights)));
}

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
  const dest = DESTINATIONS[state.dest];
  const out = state.out;
  const ret = addDays(out, state.nights);
  return [
    {
      name: 'Google Flights',
      blurb: 'Compares all airlines',
      href: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from KEF to ${dest.code} on ${out} through ${ret} for 3 adults 1 child nonstop`)}`,
    },
    {
      name: 'Skyscanner',
      blurb: 'Cheapest-first, direct',
      href: `https://www.skyscanner.net/transport/flights/kef/${dest.skyscanner}/${compactDate(out)}/${compactDate(ret)}/?adultsv2=3&childrenv2=10&cabinclass=economy&preferdirects=true`,
    },
    {
      name: 'Kayak',
      blurb: 'Sorted by price',
      href: `https://www.kayak.co.uk/flights/KEF-${dest.code}/${out}/${ret}/3adults/children-10?sort=price_a&fs=stops=0`,
    },
    ...dest.airlineLinks,
    { name: 'Booking.com', blurb: 'Hotels, family rooms', href: bookingUrl(dest.city, state) },
    {
      name: 'Google Hotels',
      blurb: 'Prices across sites',
      href: `https://www.google.com/travel/search?q=${encodeURIComponent(`hotels in ${dest.city} ${out} to ${ret} 3 adults 1 child`)}`,
    },
  ];
}
