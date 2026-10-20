import { list, t, type Lang } from '../i18n';
import { addDays, addMonths, minDate, monthEnd, monthStart, yearMonth, type LocalDate } from './dates';
import { balanceOn, byName, ml, usage, usualDayMl } from './ledger';
import { adjustment, currentPlan, origin, paymentsOf, startOf, type AppData } from './models';

/** Deliveries tab covers this many months back; the full history is always in the backup itself. */
const DELIVERY_MONTHS = 12;

type Cell = string | number;

/** Readable tabs written next to the full backup, rebuilt from scratch on every backup. Same as SheetTabs in the Android app. */
export function sheetTabs(l: Lang, d: AppData, today: LocalDate): Record<string, Cell[][]> {
  const litres = (m: number) => m / 1000;
  const rupees = (paise: number) => paise / 100;
  const names = [...d.customers].sort(byName);

  const customers: Cell[][] = [list(l, 'sheet_customer_headers')];
  for (const c of names) {
    const p = currentPlan(c, today);
    customers.push([c.name, c.phone, c.address, litres(p.morningMl), litres(p.eveningMl), p.rate, startOf(c), rupees(balanceOn(d, c, today))]);
  }

  const monthly: Cell[][] = [list(l, 'sheet_monthly_headers')];
  const thisMonth = yearMonth(today);
  for (const c of names) {
    const payments = paymentsOf(d, c.id);
    for (let m = yearMonth(origin(d, c)); m <= thisMonth; m = addMonths(m, 1)) {
      const u = usage(d, c, monthStart(m), minDate(monthEnd(m), today));
      const paid = payments.filter((p) => yearMonth(p.date) === m).reduce((s, p) => s + p.paise, 0);
      monthly.push([m, c.name, litres(u.ml), rupees(u.paise), rupees(paid)]);
    }
  }

  const deliveries: Cell[][] = [list(l, 'sheet_delivery_headers')];
  const skip = t(l, 'sheet_skip');
  const extra = t(l, 'sheet_extra');
  for (let day = monthStart(addMonths(thisMonth, -DELIVERY_MONTHS)); day <= today; day = addDays(day, 1)) {
    for (const c of names) {
      const m = ml(d, c, day, 'M');
      const e = ml(d, c, day, 'E');
      const usual = usualDayMl(c, day);
      if (m + e === 0 && usual === 0) continue;
      const changed = adjustment(d, c.id, day, 'M') !== undefined || adjustment(d, c.id, day, 'E') !== undefined;
      const note = !changed ? '' : m + e < usual ? skip : extra;
      deliveries.push([day, c.name, litres(m), litres(e), note]);
    }
  }

  const payments: Cell[][] = [list(l, 'sheet_payment_headers')];
  const nameOf = new Map(d.customers.map((c) => [c.id, c.name]));
  for (const p of [...d.payments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    payments.push([p.date, nameOf.get(p.customerId) ?? '', rupees(p.paise), p.note]);
  }

  // Tab names are fixed (not translated) so switching language does not leave stale tabs behind.
  return { Customers: customers, Monthly: monthly, Deliveries: deliveries, Payments: payments };
}
