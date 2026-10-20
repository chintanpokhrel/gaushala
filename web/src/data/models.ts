import type { LocalDate } from './dates';

/**
 * Same model as the Android app (Models.kt). Units, used everywhere:
 * - milk quantity: whole millilitres; inputs allow at most 2 decimals of a litre, so always a multiple of 10
 * - rate: whole rupees per litre
 * - money: paise, so ml × rate is exact and totals never drift by rounding
 */

/** Morning or evening run; the codes are the ones stored in the backup. */
export type Shift = 'M' | 'E';
export const SHIFTS: readonly Shift[] = ['M', 'E'];

/** What a customer normally gets, and at what rate, from [from] until the next plan. 0 ml in both shifts = stopped. */
export interface Plan {
  from: LocalDate;
  morningMl: number;
  eveningMl: number;
  rate: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  /** Never empty, sorted by from. The first plan's date is when delivery started. */
  plans: Plan[];
  /** Owed (positive) or paid ahead (negative) before the first delivery recorded here. */
  openingPaise: number;
}

/** A day that differs from the plan: ml = 0 is a skipped delivery, more than usual is an extra. */
export interface Adjustment {
  customerId: string;
  date: LocalDate;
  shift: Shift;
  ml: number;
}

export interface Payment {
  id: string;
  customerId: string;
  date: LocalDate;
  paise: number;
  note: string;
}

/** Shown on every bill. Names come in both bill languages because the bill can be sent in either. */
export interface Business {
  nameEn: string;
  nameNe: string;
  phone: string;
  upiId: string;
  upiName: string;
  /** Pre-filled for new customers; each customer keeps their own rate. */
  defaultRate: number;
  /** Added to 10-digit customer numbers when opening their WhatsApp chat. */
  countryCode: string;
  /** Sales before this app was used, added to turnover till date. 0 = count from the first delivery here. */
  openingTurnoverPaise: number;
}

/** Never changed in place: every change makes a new object, so the indexes below stay valid. */
export interface AppData {
  business: Business;
  customers: Customer[];
  adjustments: Adjustment[];
  payments: Payment[];
}

export const planMl = (p: Plan, shift: Shift): number => (shift === 'M' ? p.morningMl : p.eveningMl);
export const isStopped = (p: Plan): boolean => p.morningMl === 0 && p.eveningMl === 0;

export const startOf = (c: Customer): LocalDate => c.plans[0].from;

/** Plan in force on [date]; undefined before the customer started. */
export function planOn(c: Customer, date: LocalDate): Plan | undefined {
  for (let i = c.plans.length - 1; i >= 0; i--) if (c.plans[i].from <= date) return c.plans[i];
  return undefined;
}

/** Rate on [date]; an extra delivered before the start date is charged at the first rate. */
export const rateOn = (c: Customer, date: LocalDate): number => (planOn(c, date) ?? c.plans[0]).rate;

export function usualMl(c: Customer, date: LocalDate, shift: Shift): number {
  const p = planOn(c, date);
  return p ? planMl(p, shift) : 0;
}

export const currentPlan = (c: Customer, today: LocalDate): Plan => planOn(c, today) ?? c.plans[0];

interface Index {
  adjustments: Map<string, number>;
  /** Earliest adjustment per customer, so balances also count an extra given before the start date. */
  firstAdjustment: Map<string, LocalDate>;
  paymentsByCustomer: Map<string, Payment[]>;
}

const indexes = new WeakMap<AppData, Index>();
const adjustmentKey = (customerId: string, date: LocalDate, shift: Shift) => `${customerId}|${date}|${shift}`;

function index(d: AppData): Index {
  let ix = indexes.get(d);
  if (ix) return ix;
  const adjustments = new Map<string, number>();
  const firstAdjustment = new Map<string, LocalDate>();
  for (const a of d.adjustments) {
    adjustments.set(adjustmentKey(a.customerId, a.date, a.shift), a.ml);
    const first = firstAdjustment.get(a.customerId);
    if (first === undefined || a.date < first) firstAdjustment.set(a.customerId, a.date);
  }
  const paymentsByCustomer = new Map<string, Payment[]>();
  for (const p of d.payments) {
    const list = paymentsByCustomer.get(p.customerId);
    if (list) list.push(p);
    else paymentsByCustomer.set(p.customerId, [p]);
  }
  // Stable sort, like Kotlin's sortedBy: same-day payments keep the order they were added.
  for (const list of paymentsByCustomer.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  ix = { adjustments, firstAdjustment, paymentsByCustomer };
  indexes.set(d, ix);
  return ix;
}

export const findCustomer = (d: AppData, id: string): Customer | undefined => d.customers.find((c) => c.id === id);

export const adjustment = (d: AppData, customerId: string, date: LocalDate, shift: Shift): number | undefined =>
  index(d).adjustments.get(adjustmentKey(customerId, date, shift));

/** First day anything can be charged to [c]. */
export function origin(d: AppData, c: Customer): LocalDate {
  const first = index(d).firstAdjustment.get(c.id);
  return first !== undefined && first < startOf(c) ? first : startOf(c);
}

const NO_PAYMENTS: Payment[] = [];

/** Sorted by date. */
export const paymentsOf = (d: AppData, customerId: string): Payment[] =>
  index(d).paymentsByCustomer.get(customerId) ?? NO_PAYMENTS;

export const newId = (): string => crypto.randomUUID();
