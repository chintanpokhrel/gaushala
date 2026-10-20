import { isDate } from './dates';
import type { Adjustment, AppData, Customer, Payment, Plan, Shift } from './models';

/**
 * The backup format shared with the Android app (JsonCodec.kt): the on-device copy, the backup file
 * and the Google Sheet backup all use it. fixtures/ holds one sample written by each app, and both
 * apps' tests read both samples.
 */
const VERSION = 1;

export function encode(d: AppData): string {
  const b = d.business;
  return JSON.stringify({
    version: VERSION,
    business: {
      nameEn: b.nameEn,
      nameNe: b.nameNe,
      phone: b.phone,
      upiId: b.upiId,
      upiName: b.upiName,
      defaultRate: b.defaultRate,
      countryCode: b.countryCode,
      openingTurnoverPaise: b.openingTurnoverPaise,
    },
    customers: d.customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      openingPaise: c.openingPaise,
      plans: c.plans.map((p) => ({ from: p.from, m: p.morningMl, e: p.eveningMl, rate: p.rate })),
    })),
    // Short keys: this list grows by a few entries a day for years.
    adjustments: d.adjustments.map((a) => ({ c: a.customerId, d: a.date, s: a.shift, ml: a.ml })),
    payments: d.payments.map((p) => ({ id: p.id, c: p.customerId, d: p.date, paise: p.paise, note: p.note })),
  });
}

class FormatError extends Error {}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new FormatError('Expected an object');
  return v as Obj;
}

function arr(o: Obj, k: string): Obj[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new FormatError(`${k}: expected a list`);
  return v.map(obj);
}

function str(o: Obj, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new FormatError(`${k}: expected text`);
  return v;
}

function int(o: Obj, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new FormatError(`${k}: expected a whole number`);
  return v;
}

function date(o: Obj, k: string): string {
  const v = str(o, k);
  if (!isDate(v)) throw new FormatError(`${k}: expected a date`);
  return v;
}

function shift(o: Obj, k: string): Shift {
  const v = str(o, k);
  if (v !== 'M' && v !== 'E') throw new FormatError(`Unknown shift ${v}`);
  return v;
}

/** Throws on malformed input, so a bad restore never replaces good data. */
export function decode(text: string): AppData {
  const o = obj(JSON.parse(text));
  if (int(o, 'version') > VERSION) throw new FormatError('Backup is from a newer app version');
  const b = obj(o.business);
  const customers: Customer[] = arr(o, 'customers').map((c) => {
    const plans: Plan[] = arr(c, 'plans')
      .map((p) => ({ from: date(p, 'from'), morningMl: int(p, 'm'), eveningMl: int(p, 'e'), rate: int(p, 'rate') }))
      .sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
    if (plans.length === 0) throw new FormatError('Customer without a plan');
    return {
      id: str(c, 'id'),
      name: str(c, 'name'),
      phone: str(c, 'phone'),
      address: str(c, 'address'),
      openingPaise: int(c, 'openingPaise'),
      plans,
    };
  });
  const adjustments: Adjustment[] = arr(o, 'adjustments').map((a) => ({
    customerId: str(a, 'c'), date: date(a, 'd'), shift: shift(a, 's'), ml: int(a, 'ml'),
  }));
  const payments: Payment[] = arr(o, 'payments').map((p) => ({
    id: str(p, 'id'), customerId: str(p, 'c'), date: date(p, 'd'), paise: int(p, 'paise'), note: str(p, 'note'),
  }));
  const ids = new Set(customers.map((c) => c.id));
  if (!adjustments.every((a) => ids.has(a.customerId)) || !payments.every((p) => ids.has(p.customerId))) {
    throw new FormatError('Orphan entries');
  }
  return {
    business: {
      nameEn: str(b, 'nameEn'),
      nameNe: str(b, 'nameNe'),
      phone: str(b, 'phone'),
      upiId: str(b, 'upiId'),
      upiName: str(b, 'upiName'),
      defaultRate: int(b, 'defaultRate'),
      countryCode: str(b, 'countryCode'),
      // Optional: backups made before this field existed start from zero.
      openingTurnoverPaise: b.openingTurnoverPaise === undefined ? 0 : int(b, 'openingTurnoverPaise'),
    },
    customers,
    adjustments,
    payments,
  };
}
