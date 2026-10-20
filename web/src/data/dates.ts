/**
 * Calendar dates, with no time and no time zone, in the backup's own text form:
 * - LocalDate: "2026-10-31"
 * - YearMonth: "2026-10"
 * Both sort as text in date order, so < and > compare them directly.
 * Arithmetic runs on UTC midnights, so daylight saving can never shift a day.
 */
export type LocalDate = string;
export type YearMonth = string;

const DAY_MS = 86_400_000;
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const ymd = (y: number, m: number, d: number): LocalDate => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

function parts(d: LocalDate): [number, number, number] {
  return [Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10))];
}

/** UTC midnight of [d], for Intl formatting with timeZone "UTC". */
export function utc(d: LocalDate): Date {
  const [y, m, day] = parts(d);
  return new Date(Date.UTC(y, m - 1, day));
}

/** The phone's own calendar date (not UTC: after 18:30 in India, UTC is still yesterday). */
export function today(): LocalDate {
  const n = new Date();
  return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

export function isDate(s: unknown): s is LocalDate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parts(s);
  const u = new Date(Date.UTC(y, m - 1, d));
  return u.getUTCFullYear() === y && u.getUTCMonth() === m - 1 && u.getUTCDate() === d;
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const u = new Date(utc(d).getTime() + n * DAY_MS);
  return ymd(u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate());
}

export const dayOfMonth = (d: LocalDate): number => Number(d.slice(8, 10));

/** 0 = Sunday. */
export const dayOfWeek = (d: LocalDate): number => utc(d).getUTCDay();

/** Sunday that starts the calendar row containing [d]. */
export const weekStart = (d: LocalDate): LocalDate => addDays(d, -dayOfWeek(d));

export const yearMonth = (d: LocalDate): YearMonth => d.slice(0, 7);
export const monthStart = (m: YearMonth): LocalDate => `${m}-01`;

export function monthEnd(m: YearMonth): LocalDate {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return ymd(y, mo, new Date(Date.UTC(y, mo, 0)).getUTCDate());
}

export function addMonths(m: YearMonth, n: number): YearMonth {
  const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n;
  return `${pad(Math.floor(t / 12), 4)}-${pad((t % 12) + 1)}`;
}

export const maxDate = (a: LocalDate, b: LocalDate): LocalDate => (a > b ? a : b);
export const minDate = (a: LocalDate, b: LocalDate): LocalDate => (a < b ? a : b);

/** Every date from [from] to [to], both included. */
export function daysBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
