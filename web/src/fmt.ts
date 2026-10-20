import { dayOfMonth, dayOfWeek, yearMonth, type LocalDate, type YearMonth } from './data/dates';
import { list, t, type Lang } from './i18n';

/**
 * The one place amounts, litres and dates become text (screens, bill image, sheet backup) and
 * typed text becomes amounts and litres. Same rules as the Android app's Fmt.kt. Digits stay Latin
 * with Indian grouping (1,00,000) in both languages, as on UPI apps.
 */

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const fraction = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1,250 or 1,250.50: paise shown only when there are some. */
export const rupees = (paise: number): string => (paise % 100 === 0 ? whole : fraction).format(paise / 100);

/** ₹ amount in the language's own form. */
export const money = (l: Lang, paise: number): string => t(l, 'money', rupees(paise));

/** [n] as a decimal with [places] implied decimals, trailing zeros removed: (150050, 2) → "1500.5". */
function decimal(n: number, places: number): string {
  const unit = 10 ** places;
  const a = Math.abs(n);
  const frac = String(a % unit).padStart(places, '0').replace(/0+$/, '');
  return (n < 0 ? '-' : '') + Math.floor(a / unit) + (frac ? '.' + frac : '');
}

/** Plain number for UPI links and typed fields: 1250.5 */
export const plainRupees = (paise: number): string => decimal(paise, 2);

/** 1500 ml → "1.5". */
export const litres = (ml: number): string => decimal(ml, 3);

/** "1.5 L" in the language's own form. */
export const litresUnit = (l: Lang, ml: number): string => t(l, 'litres', litres(ml));

/** Typed text with at most [places] decimals → whole units of 10^-places, or null. */
function parseDecimal(text: string, places: number, allowNegative: boolean): number | null {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;
  if (m[1] && !allowNegative) return null;
  const frac = m[3] ?? '';
  if (frac.length > places) return null;
  const v = Number(m[2] || '0') * 10 ** places + Number(frac.padEnd(places, '0'));
  if (!Number.isSafeInteger(v)) return null;
  return m[1] && v !== 0 ? -v : v;
}

/** Typed litres ("1.5", "2") → ml. Null if not a number or more than 2 decimals. */
export function parseLitres(text: string): number | null {
  const hundredths = parseDecimal(text.trim().replace(',', '.'), 2, false);
  return hundredths === null ? null : hundredths * 10;
}

/** Typed rupees ("1200", "1,200.50") → paise. Negative allowed only when [allowNegative]. */
export const parseRupees = (text: string, allowNegative = false): number | null =>
  parseDecimal(text.trim().replace(/,/g, ''), 2, allowNegative);

const year = (d: LocalDate) => d.slice(0, 4);
const monthIndex = (d: LocalDate) => Number(d.slice(5, 7)) - 1;

/** "20 Oct 2026" */
export const date = (l: Lang, d: LocalDate): string => `${dayMonth(l, d)} ${year(d)}`;

/** "20 Oct" */
export const dayMonth = (l: Lang, d: LocalDate): string => `${dayOfMonth(d)} ${list(l, 'month_short')[monthIndex(d)]}`;

/** "Tue, 20 Oct" */
export const weekdayDate = (l: Lang, d: LocalDate): string => `${list(l, 'weekday_short')[dayOfWeek(d)]}, ${dayMonth(l, d)}`;

/** "October 2026" */
export const month = (l: Lang, m: YearMonth): string => `${list(l, 'month_names')[monthIndex(`${m}-01`)]} ${m.slice(0, 4)}`;

/** One-letter weekday for calendar headings. */
export const weekdayShort = (l: Lang, d: LocalDate): string => list(l, 'weekday_narrow')[dayOfWeek(d)];

/** "1 – 31 Oct 2026", or the full dates when the range crosses months. */
export const range = (l: Lang, from: LocalDate, to: LocalDate): string =>
  yearMonth(from) === yearMonth(to) ? t(l, 'range', String(dayOfMonth(from)), date(l, to)) : t(l, 'range', date(l, from), date(l, to));

/** "5 minutes ago", "yesterday" for a past moment (epoch ms). */
export function ago(l: Lang, at: number, now = Date.now()): string {
  const f = new Intl.RelativeTimeFormat(l.intl, { numeric: 'auto' });
  const minutes = Math.round((at - now) / 60_000);
  if (minutes > -60) return f.format(Math.min(minutes, 0), 'minute');
  const hours = Math.round(minutes / 60);
  if (hours > -24) return f.format(hours, 'hour');
  return f.format(Math.round(hours / 24), 'day');
}
