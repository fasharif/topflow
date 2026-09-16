export const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

const UAE_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Interprets a YYYY-MM-DD date as midnight in the UAE (UTC+4, no daylight saving). */
export function uaeDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+04:00`);
}

/** Today's calendar date in the UAE, as YYYY-MM-DD. */
export function todayInUae(now: Date = new Date()): string {
  return new Date(now.getTime() + UAE_OFFSET_MS).toISOString().slice(0, 10);
}
