/** Dagatalsreikningur fyrir þjálfaraappið: dagar sem ÁÁÁÁ-MM-DD strengir (í
 *  tíma tækisins), mánaðargrind sem byrjar á mánudegi og íslensk heiti.
 *  Hreint — prófað í node. */

import type { CoachEvent } from "./library";

export const MONTHS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
export const MONTHS_SHORT = ["jan.", "feb.", "mars", "apr.", "maí", "júní", "júlí", "ág.", "sept.", "okt.", "nóv.", "des."];
/** Mánudagur fyrst. */
export const WEEKDAYS = ["mánudagur", "þriðjudagur", "miðvikudagur", "fimmtudagur", "föstudagur", "laugardagur", "sunnudagur"];
export const WEEKDAYS_SHORT = ["mán", "þri", "mið", "fim", "fös", "lau", "sun"];

const two = (n: number) => String(n).padStart(2, "0");

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** "2026-11-10" → dagsetning á hádegi (svo sumartími færi daginn aldrei til). */
export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function addDays(s: string, days: number): string {
  const d = fromYmd(s);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

/** 0 = mánudagur … 6 = sunnudagur. */
export function weekdayIndex(s: string): number {
  return (fromYmd(s).getDay() + 6) % 7;
}

export type GridDay = { date: string; day: number; inMonth: boolean };

/** Vikur mánaðarins (mánudagur fyrst), fylltar með dögum úr mánuðunum í kring. */
export function monthGrid(year: number, month: number): GridDay[][] {
  const first = `${year}-${two(month + 1)}-01`;
  let cur = addDays(first, -weekdayIndex(first));
  const weeks: GridDay[][] = [];
  for (;;) {
    const week: GridDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = fromYmd(cur);
      week.push({ date: cur, day: d.getDate(), inMonth: d.getMonth() === month && d.getFullYear() === year });
      cur = addDays(cur, 1);
    }
    weeks.push(week);
    const next = fromYmd(cur);
    if (next.getFullYear() > year || (next.getFullYear() === year && next.getMonth() > month)) break;
  }
  return weeks;
}

/** "þriðjudagur 10. nóvember" */
export function longDate(s: string): string {
  const d = fromYmd(s);
  return `${WEEKDAYS[weekdayIndex(s)]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** "í dag", "á morgun", "fim 12. nóv." */
export function shortDate(s: string, today: string): string {
  if (s === today) return "í dag";
  if (s === addDays(today, 1)) return "á morgun";
  const d = fromYmd(s);
  return `${WEEKDAYS_SHORT[weekdayIndex(s)]} ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`;
}

export function eventsOn(events: CoachEvent[], date: string): CoachEvent[] {
  return events.filter((e) => e.date === date);
}

/** Næstu viðburðir eftir `today` (mest `max`), í tímaröð. */
export function upcoming(events: CoachEvent[], today: string, max = 3): CoachEvent[] {
  return events.filter((e) => e.date > today).slice(0, max);
}

/** "16:00–17:00" eða "16:00" eða "allan daginn". */
export function timeRange(e: Pick<CoachEvent, "time" | "minutes">): string {
  if (!e.time) return "allan daginn";
  if (!e.minutes) return e.time;
  const [h, m] = e.time.split(":").map(Number);
  const end = h * 60 + m + e.minutes;
  return `${e.time}–${two(Math.floor(end / 60) % 24)}:${two(end % 60)}`;
}

/** Kveðja eftir tíma dags. */
export function greeting(hour: number): string {
  if (hour < 5) return "Góða nótt";
  if (hour < 12) return "Góðan daginn";
  if (hour < 18) return "Góðan dag";
  return "Gott kvöld";
}
