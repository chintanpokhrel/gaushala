import { describe, expect, test } from 'vitest';
import { ymd } from './dates';
import {
  balanceOn, dayMl, defaultBillPeriod, monthly, runFor, statement, turnover, upsert, usage,
  withPayment, withPlan, withQty, withRange,
} from './ledger';
import { adjustment, findCustomer, type AppData, type Customer } from './models';

/** Same cases as LedgerTest.kt in the Android app, so both apps bill the same. */
const d = (day: number, month = 10) => ymd(2026, month, day);

/** 1 L morning, 0.5 L evening at ₹60 from 1 Oct. */
const ram: Customer = { id: 'r', name: 'Ram', phone: '', address: '', openingPaise: 0, plans: [{ from: d(1), morningMl: 1000, eveningMl: 500, rate: 60 }] };
const base: AppData = {
  business: { nameEn: 'G', nameNe: 'ग', phone: '', upiId: '', upiName: '', defaultRate: 60, countryCode: '91', openingTurnoverPaise: 0 },
  customers: [ram],
  adjustments: [],
  payments: [],
};
const customer = (id: string, name: string, morningMl: number, eveningMl: number, rate: number): Customer =>
  ({ id, name, phone: '', address: '', openingPaise: 0, plans: [{ from: d(1), morningMl, eveningMl, rate }] });
const pay = (id: string, date: string, paise: number) => ({ id, customerId: 'r', date, paise, note: '' });

describe('ledger', () => {
  test('full month on plan is litres times rate', () => {
    const u = usage(base, ram, d(1), d(31));
    expect(u.ml).toBe(31 * 1500);
    expect(u.paise).toBe(279_000); // 46.5 L × ₹60 = ₹2,790
  });

  test('skip and extra change only that delivery', () => {
    const data = withQty(withQty(base, ram, d(5), 'M', 0), ram, d(6), 'E', 1500);
    expect(dayMl(data, ram, d(5))).toBe(500);
    expect(dayMl(data, ram, d(6))).toBe(2500);
    expect(usage(data, ram, d(1), d(31)).paise).toBe((31 * 1500 - 1000 + 1000) * 6);
  });

  test('setting back to usual removes the adjustment', () => {
    const data = withQty(withQty(base, ram, d(5), 'M', 0), ram, d(5), 'M', 1000);
    expect(data.adjustments).toEqual([]);
    expect(adjustment(data, 'r', d(5), 'M')).toBeUndefined();
  });

  test('range skip covers only chosen shifts and can be undone', () => {
    const skipped = withRange(base, ram, d(10), d(12), ['E'], true);
    expect(skipped.adjustments).toHaveLength(3);
    expect(dayMl(skipped, ram, d(11))).toBe(1000);
    const undone = withRange(skipped, ram, d(10), d(12), ['E'], false);
    expect(dayMl(undone, ram, d(11))).toBe(1500);
  });

  test('rate change applies from its date only', () => {
    const raised = withPlan(ram, { from: d(16), morningMl: 1000, eveningMl: 500, rate: 70 });
    const data = upsert(base, raised);
    const u = usage(data, raised, d(1), d(31));
    expect(u.lines.map((l) => l.rate)).toEqual([60, 70]);
    expect(u.lines[0].ml).toBe(15 * 1500);
    expect(u.lines[1].ml).toBe(16 * 1500);
    expect(u.paise).toBe(15 * 1500 * 6 + 16 * 1500 * 7);
  });

  test('nothing is charged before start unless an extra was given', () => {
    expect(usage(base, ram, d(1, 9), d(30, 9)).ml).toBe(0);
    const early = withQty(base, ram, d(28, 9), 'M', 1000);
    expect(usage(early, ram, d(1, 9), d(30, 9)).ml).toBe(1000);
    expect(balanceOn(early, ram, d(30, 9))).toBe(60_00);
  });

  test('quarter litres at odd rate stay exact', () => {
    const c = customer('q', 'Q', 250, 0, 65);
    expect(usage(upsert(base, c), c, d(1), d(31)).paise).toBe(31 * 1625); // ₹16.25 a day
  });

  test('statement carries balance and counts payments up to bill day', () => {
    const data = withPayment(withPayment(upsert(base, { ...ram, openingPaise: 500_00 }), pay('p1', d(31, 10), 2000_00)), pay('p2', d(3, 11), 1000_00));
    const c = findCustomer(data, 'r')!;
    const nov = statement(data, c, d(1, 11), d(30, 11), d(4, 11));
    // Opening ₹500 + October ₹2,790 − ₹2,000 paid on 31 Oct.
    expect(nov.openingPaise).toBe(1290_00);
    expect(nov.payments.map((p) => p.id)).toEqual(['p2']);
    expect(nov.duePaise).toBe(1290_00 + 30 * 90_00 - 1000_00);

    // October's bill made on 4 Nov also shows the 3 Nov payment.
    const oct = statement(data, c, d(1), d(31), d(4, 11));
    expect(oct.openingPaise).toBe(500_00);
    expect(oct.payments.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  test('advance shows as negative due', () => {
    const data = withPayment(base, pay('p', d(1), 3000_00));
    expect(statement(data, ram, d(1), d(31), d(31)).duePaise).toBe(279_000 - 300_000);
  });

  test('run lists planned and adjusted customers only', () => {
    const sita = customer('s', 'Sita', 0, 1000, 60);
    const data = upsert(base, sita);
    expect(runFor(data, d(5), 'M').map((c) => c.name)).toEqual(['Ram']);
    const extra = withQty(data, sita, d(5), 'M', 500);
    expect(runFor(extra, d(5), 'M').map((c) => c.name)).toEqual(['Ram', 'Sita']);
  });

  test('monthly counts only up to today and splits by customer', () => {
    const sita = customer('s', 'Sita', 0, 1000, 60);
    const data = withPayment(withPayment(upsert(base, sita), pay('p', d(2), 500_00)), pay('future', d(20), 100_00));
    const months = monthly(data, d(10));
    expect(months.map((m) => m.month)).toEqual(['2026-10']);
    const oct = months[0];
    expect(oct.ml).toBe(10 * 1500 + 10 * 1000);
    expect(oct.paise).toBe(10 * 90_00 + 10 * 60_00);
    expect(oct.receivedPaise).toBe(500_00);
    expect(oct.customers.map((c) => c.customer.name)).toEqual(['Ram', 'Sita']);
    expect(turnover(data, months)).toBe(oct.paise);
    const withStart = { ...data, business: { ...data.business, openingTurnoverPaise: 10_000_00 } };
    expect(turnover(withStart, months)).toBe(oct.paise + 10_000_00);
  });

  test('default period is last month early in month else this month', () => {
    expect(defaultBillPeriod(d(3))).toEqual([d(1, 9), d(30, 9)]);
    expect(defaultBillPeriod(d(20))).toEqual([d(1), d(31)]);
    expect(defaultBillPeriod(ymd(2026, 1, 2))).toEqual([ymd(2025, 12, 1), ymd(2025, 12, 31)]);
  });
});
