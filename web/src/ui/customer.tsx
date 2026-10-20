import { useEffect, useMemo, useState } from 'preact/hooks';
import { addDays, addMonths, monthEnd, monthStart, today, weekStart, yearMonth, dayOfMonth, type LocalDate } from '../data/dates';
import { balanceOn, dayMl, defaultBillPeriod, ml, usage, usualDayMl, withPayment, withoutPayment, withQty, withRange } from '../data/ledger';
import { currentPlan, findCustomer, paymentsOf, SHIFTS, usualMl, type Customer, type Shift } from '../data/models';
import * as Fmt from '../fmt';
import { useApp } from './app';
import { BalanceText, ConfirmDialog, DateField, IconButton, ICONS, Modal, Page, PaymentDialog, planSummary, QtyDialog } from './kit';

export function CustomerScreen({ id }: { id: string }) {
  const { data, store, nav, lang, tr } = useApp();
  const c = findCustomer(data, id);
  const day = today();
  const [month, setMonth] = useState(yearMonth(day));
  const [dayOpen, setDayOpen] = useState<LocalDate | null>(null);
  const [paying, setPaying] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [deletingPayment, setDeletingPayment] = useState<string | null>(null);
  const balance = useMemo(() => (c ? balanceOn(data, c, day) : 0), [data, c, day]);
  const u = useMemo(() => (c ? usage(data, c, monthStart(month), monthEnd(month)) : null), [data, c, month]);

  // Deleted (e.g. by a restore) while open.
  useEffect(() => {
    if (!c) nav.back();
  }, [c, nav]);
  if (!c || !u) return null;

  const payments = [...paymentsOf(data, c.id)].reverse();
  return (
    <Page title={c.name} onBack={nav.back} actions={<IconButton icon={ICONS.edit} label={tr('edit')} onClick={() => nav.go({ name: 'editCustomer', id: c.id })} />}>
      {(c.phone || c.address) && <p class="muted">{[c.phone, c.address].filter(Boolean).join(' · ')}</p>}
      <p>{planSummary(lang, currentPlan(c, day))}</p>
      <div class="card list-row">
        <span class="grow">{tr('balance_today')}</span>
        <BalanceText balance={balance} />
      </div>
      <button
        type="button"
        class="btn primary wide"
        onClick={() => {
          const [from, to] = defaultBillPeriod(day);
          nav.go({ name: 'bill', customerId: c.id, from, to });
        }}
      >
        {tr('make_bill')}
      </button>
      <div class="row gap">
        <button type="button" class="btn outline grow" onClick={() => setPaying(true)}>{tr('payment_received')}</button>
        <button type="button" class="btn outline grow" onClick={() => setSkipping(true)}>{tr('skip_days')}</button>
      </div>

      <hr />
      <div class="row">
        <IconButton icon={ICONS.left} label={tr('previous_month')} onClick={() => setMonth(addMonths(month, -1))} />
        <h3 class="grow center">{Fmt.month(lang, month)}</h3>
        <IconButton icon={ICONS.right} label={tr('next_month')} onClick={() => setMonth(addMonths(month, 1))} />
      </div>
      <MonthGrid c={c} month={month} onDay={setDayOpen} />
      <p>{tr('month_usage', Fmt.litresUnit(lang, u.ml), Fmt.money(lang, u.paise))}</p>

      <hr />
      <h3>{tr('payments')}</h3>
      {payments.length === 0 && <p class="muted">{tr('no_payments')}</p>}
      {payments.map((p) => (
        <div class="row" key={p.id}>
          <span class="grow">
            <strong>{Fmt.money(lang, p.paise)}</strong>
            <small>{[Fmt.date(lang, p.date), p.note].filter(Boolean).join(' · ')}</small>
          </span>
          <IconButton icon={ICONS.delete} label={tr('delete')} onClick={() => setDeletingPayment(p.id)} />
        </div>
      ))}

      {dayOpen && <DayDialog c={c} date={dayOpen} onClose={() => setDayOpen(null)} />}
      {paying && <PaymentDialog customerId={c.id} suggestedPaise={balance} onSave={(p) => store.update((d) => withPayment(d, p))} onClose={() => setPaying(false)} />}
      {skipping && <SkipDialog c={c} onClose={() => setSkipping(false)} />}
      {deletingPayment && (
        <ConfirmDialog
          title={tr('delete_payment')}
          text={tr('delete_payment_confirm')}
          confirm={tr('delete')}
          onConfirm={() => store.update((d) => withoutPayment(d, deletingPayment))}
          onClose={() => setDeletingPayment(null)}
        />
      )}
    </Page>
  );
}

/** Calendar of one month: litres per day, red = skipped, green = extra. Tap a day to change it. */
function MonthGrid({ c, month, onDay }: { c: Customer; month: string; onDay: (d: LocalDate) => void }) {
  const { data, lang } = useApp();
  const first = weekStart(monthStart(month));
  const last = monthEnd(month);
  const day = today();
  const weeks: LocalDate[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(w);
  return (
    <div class="month-grid">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <span class="weekday">{Fmt.weekdayShort(lang, addDays(first, i))}</span>)}
      {weeks.flatMap((w) => [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const d = addDays(w, i);
        if (yearMonth(d) !== month) return <span />;
        const v = dayMl(data, c, d);
        const usual = usualDayMl(c, d);
        const kind = v === 0 && usual > 0 ? 'skip' : v > usual ? 'extra' : v < usual ? 'less' : '';
        return (
          <button type="button" class={'day ' + kind + (d === day ? ' today' : '')} onClick={() => onDay(d)}>
            <small>{dayOfMonth(d)}</small>
            <strong>{v === 0 ? '–' : Fmt.litres(v)}</strong>
          </button>
        );
      }))}
    </div>
  );
}

/** Both shifts of one day. */
function DayDialog({ c, date, onClose }: { c: Customer; date: LocalDate; onClose: () => void }) {
  const { data, store, lang, tr } = useApp();
  const [editing, setEditing] = useState<Shift | null>(null);
  const shiftLabel = (s: Shift) => tr(s === 'M' ? 'morning' : 'evening');
  return (
    <>
      <Modal title={Fmt.weekdayDate(lang, date)} onClose={onClose} actions={<button type="button" class="btn text" onClick={onClose}>{tr('ok')}</button>}>
        <div class="pick-list">
          {SHIFTS.map((s) => {
            const v = ml(data, c, date, s);
            return (
              <button type="button" class="row" onClick={() => setEditing(s)}>
                <span class="grow">{shiftLabel(s)}</span>
                <strong>{v === 0 ? tr('skip_short') : Fmt.litresUnit(lang, v)}</strong>
              </button>
            );
          })}
        </div>
      </Modal>
      {editing && (
        <QtyDialog
          title={shiftLabel(editing)}
          ml={ml(data, c, date, editing)}
          usualMl={usualMl(c, date, editing)}
          onSet={(v) => store.update((d) => withQty(d, c, date, editing, v))}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** Skip a run of days (customer away), or put them back to usual. */
function SkipDialog({ c, onClose }: { c: Customer; onClose: () => void }) {
  const { store, tr } = useApp();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [morning, setMorning] = useState(true);
  const [evening, setEvening] = useState(true);
  const shifts: Shift[] = [...(morning ? ['M' as const] : []), ...(evening ? ['E' as const] : [])];
  const valid = shifts.length > 0 && to >= from;
  const apply = (skip: boolean) => {
    store.update((d) => withRange(d, c, from, to, shifts, skip));
    onClose();
  };
  return (
    <Modal
      title={tr('skip_days')}
      onClose={onClose}
      actions={
        <>
          <button type="button" class="btn text" onClick={onClose}>{tr('cancel')}</button>
          <button type="button" class="btn text" disabled={!valid} onClick={() => apply(false)}>{tr('back_to_usual')}</button>
          <button type="button" class="btn text" disabled={!valid} onClick={() => apply(true)}>{tr('skip')}</button>
        </>
      }
    >
      <DateField label={tr('from_date')} value={from} onChange={(d) => { setFrom(d); if (to < d) setTo(d); }} />
      <DateField label={tr('to_date')} value={to} onChange={setTo} />
      <div class="row gap">
        <label class="check"><input type="checkbox" checked={morning} onChange={(e) => setMorning(e.currentTarget.checked)} />{tr('morning')}</label>
        <label class="check"><input type="checkbox" checked={evening} onChange={(e) => setEvening(e.currentTarget.checked)} />{tr('evening')}</label>
      </div>
    </Modal>
  );
}
