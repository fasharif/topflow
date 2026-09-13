export const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Interprets a YYYY-MM-DD date as midnight in the UAE (UTC+4, no daylight saving). */
export function uaeDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+04:00`);
}
