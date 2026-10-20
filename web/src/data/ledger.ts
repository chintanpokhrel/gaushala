import {
  addDays, addMonths, daysBetween, maxDate, minDate, monthEnd, monthStart, yearMonth,
  type LocalDate, type YearMonth,
} from './dates';
import {
  adjustment, origin, paymentsOf, rateOn, SHIFTS, usualMl,
  type Adjustment, type AppData, type Customer, type Payment, type Plan, type Shift,
} from './models';

/** Same rules as the Android app (Ledger.kt); the tests in ledger.test.ts mirror LedgerTest.kt. */

/** Milk actually delivered: the day's adjustment if there is one, else the plan. */
export const ml = (d: AppData, c: Customer, date: LocalDate, shift: Shift): number =>
  adjustment(d, c.id, date, shift) ?? usualMl(c, date, shift);

export const dayMl = (d: AppData, c: Customer, date: LocalDate): number => ml(d, c, date, 'M') + ml(d, c, date, 'E');

export const usualDayMl = (c: Customer, date: LocalDate): number => usualMl(c, date, 'M') + usualMl(c, date, 'E');

/** Litres sold at one rate within a period. */
export interface RateLine { rate: number; ml: number; paise: number }

export interface Usage { ml: number; paise: number; lines: RateLine[] }

/** ml × ₹/L ÷ 1000 × 100 paise. Exact because quantities are multiples of 10 ml. */
export const milkPaise = (ml: number, rate: number): number => Math.trunc((ml * rate) / 10);

const sum = <T>(items: readonly T[], f: (t: T) => number): number => items.reduce((s, t) => s + f(t), 0);

/** Milk delivered to [c] on [from]..[to] (inclusive), grouped by rate in the order rates first appear. */
export function usage(d: AppData, c: Customer, from: LocalDate, to: LocalDate): Usage {
  const byRate = new Map<number, number>();
  for (let day = maxDate(from, origin(d, c)); day <= to; day = addDays(day, 1)) {
    const m = dayMl(d, c, day);
    if (m > 0) {
      const rate = rateOn(c, day);
      byRate.set(rate, (byRate.get(rate) ?? 0) + m);
    }
  }
  const lines = [...byRate].map(([rate, m]) => ({ rate, ml: m, paise: milkPaise(m, rate) }));
  return { ml: sum(lines, (l) => l.ml), paise: sum(lines, (l) => l.paise), lines };
}

/** Owed (positive) or paid ahead (negative) after everything delivered and paid up to and including [date]. */
export const balanceOn = (d: AppData, c: Customer, date: LocalDate): number =>
  c.openingPaise + usage(d, c, origin(d, c), date).paise -
  sum(paymentsOf(d, c.id).filter((p) => p.date <= date), (p) => p.paise);

export interface DayQty { date: LocalDate; ml: number; usualMl: number }

/** Everything a bill shows. The bill screen, the bill image and the tests all read this one definition. */
export interface Statement {
  customer: Customer;
  from: LocalDate;
  to: LocalDate;
  days: DayQty[];
  usage: Usage;
  /** Carried in from before from: positive = previous due, negative = advance. */
  openingPaise: number;
  /** Received from [from] up to the later of [to] and the day the bill is made. */
  payments: Payment[];
  duePaise: number;
}

export function statement(d: AppData, c: Customer, from: LocalDate, to: LocalDate, today: LocalDate): Statement {
  const paidUntil = maxDate(to, today);
  const u = usage(d, c, from, to);
  const openingPaise = balanceOn(d, c, addDays(from, -1));
  const payments = paymentsOf(d, c.id).filter((p) => p.date >= from && p.date <= paidUntil);
  return {
    customer: c,
    from,
    to,
    days: daysBetween(from, to).map((date) => ({ date, ml: dayMl(d, c, date), usualMl: usualDayMl(c, date) })),
    usage: u,
    openingPaise,
    payments,
    duePaise: openingPaise + u.paise - sum(payments, (p) => p.paise),
  };
}

export interface CustomerMonth { customer: Customer; ml: number; paise: number; receivedPaise: number }

export interface MonthSummary { month: YearMonth; ml: number; paise: number; receivedPaise: number; customers: CustomerMonth[] }

/**
 * Milk sold and money received per month, newest first, counting only up to [today]
 * (planned deliveries later this month are not sales yet). Uses the same usage() as bills.
 */
export function monthly(d: AppData, today: LocalDate): MonthSummary[] {
  const cells = new Map<YearMonth, CustomerMonth[]>();
  const thisMonth = yearMonth(today);
  for (const c of d.customers) {
    const received = new Map<YearMonth, number>();
    for (const p of paymentsOf(d, c.id)) {
      if (p.date <= today) received.set(yearMonth(p.date), (received.get(yearMonth(p.date)) ?? 0) + p.paise);
    }
    let m = yearMonth(origin(d, c));
    for (const k of received.keys()) if (k < m) m = k;
    for (; m <= thisMonth; m = addMonths(m, 1)) {
      const u = usage(d, c, monthStart(m), minDate(monthEnd(m), today));
      const r = received.get(m) ?? 0;
      if (u.ml > 0 || r !== 0) {
        const list = cells.get(m) ?? [];
        list.push({ customer: c, ml: u.ml, paise: u.paise, receivedPaise: r });
        cells.set(m, list);
      }
    }
  }
  return [...cells]
    .map(([month, list]) => ({
      month,
      ml: sum(list, (x) => x.ml),
      paise: sum(list, (x) => x.paise),
      receivedPaise: sum(list, (x) => x.receivedPaise),
      customers: [...list].sort((a, b) => b.paise - a.paise),
    }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));
}

/** Starting amount plus all milk sold up to today. */
export const turnover = (d: AppData, months: MonthSummary[]): number =>
  d.business.openingTurnoverPaise + sum(months, (m) => m.paise);

const LAST_MONTH_BILLING_DAYS = 5;

/** Early in a month the bill is usually for last month; otherwise for this month up to its end. */
export function defaultBillPeriod(today: LocalDate): [LocalDate, LocalDate] {
  const thisMonth = yearMonth(today);
  const month = Number(today.slice(8, 10)) <= LAST_MONTH_BILLING_DAYS ? addMonths(thisMonth, -1) : thisMonth;
  return [monthStart(month), monthEnd(month)];
}

export const byName = (a: Customer, b: Customer): number => {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

/** Customers expected or adjusted on [date] in [shift], i.e. the delivery list for that run. */
export const runFor = (d: AppData, date: LocalDate, shift: Shift): Customer[] =>
  d.customers.filter((c) => usualMl(c, date, shift) > 0 || adjustment(d, c.id, date, shift) !== undefined).sort(byName);

// ---- Changes. Each returns new data; Store.update applies it. ----

/** Sets the quantity for one delivery; going back to the usual quantity removes the adjustment. */
export function withQty(d: AppData, c: Customer, date: LocalDate, shift: Shift, mlValue: number): AppData {
  const rest = d.adjustments.filter((a) => !(a.customerId === c.id && a.date === date && a.shift === shift));
  const changed = mlValue === usualMl(c, date, shift)
    ? rest
    : [...rest, { customerId: c.id, date, shift, ml: Math.max(0, mlValue) }];
  return { ...d, adjustments: changed };
}

/** Skips (or, with skip = false, returns to usual) every delivery in the range for the given shifts. */
export function withRange(d: AppData, c: Customer, from: LocalDate, to: LocalDate, shifts: Shift[], skip: boolean): AppData {
  const inRange = (a: Adjustment) => a.customerId === c.id && shifts.includes(a.shift) && a.date >= from && a.date <= to;
  const rest = d.adjustments.filter((a) => !inRange(a));
  if (!skip) return { ...d, adjustments: rest };
  const skips: Adjustment[] = [];
  for (const day of daysBetween(from, to)) {
    for (const s of SHIFTS) {
      if (shifts.includes(s) && usualMl(c, day, s) > 0) skips.push({ customerId: c.id, date: day, shift: s, ml: 0 });
    }
  }
  return { ...d, adjustments: [...rest, ...skips] };
}

const byFrom = (a: Plan, b: Plan) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0);

/** Adds a plan or replaces the one starting the same day, keeping the list sorted. */
export const withPlan = (c: Customer, plan: Plan): Customer => ({
  ...c,
  plans: [...c.plans.filter((p) => p.from !== plan.from), plan].sort(byFrom),
});

export const upsert = (d: AppData, c: Customer): AppData => ({
  ...d,
  customers: d.customers.some((x) => x.id === c.id) ? d.customers.map((x) => (x.id === c.id ? c : x)) : [...d.customers, c],
});

export const withoutCustomer = (d: AppData, id: string): AppData => ({
  ...d,
  customers: d.customers.filter((c) => c.id !== id),
  adjustments: d.adjustments.filter((a) => a.customerId !== id),
  payments: d.payments.filter((p) => p.customerId !== id),
});

export const withPayment = (d: AppData, p: Payment): AppData => ({ ...d, payments: [...d.payments.filter((x) => x.id !== p.id), p] });

export const withoutPayment = (d: AppData, id: string): AppData => ({ ...d, payments: d.payments.filter((p) => p.id !== id) });
