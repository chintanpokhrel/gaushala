import { useMemo, useState } from 'preact/hooks';
import { today } from '../data/dates';
import { byName, ml, runFor, withQty } from '../data/ledger';
import { SHIFTS, usualMl, type Customer, type Shift } from '../data/models';
import * as Fmt from '../fmt';
import { useApp } from './app';
import { BackupBanner, DateStepper, Modal, Page, QtyDialog, Segmented } from './kit';

/** One tap of − / + changes a delivery by this much. Exact amounts: tap the quantity. */
const STEP_ML = 500;

/** Afternoon onwards the app opens on the evening run. */
const EVENING_FROM_HOUR = 14;

/** Opened from the home screen icon (not inside Safari, where iOS may clear the data). */
const installed = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * The daily screen: who gets milk on this run, and how much. Usual quantities come from each
 * customer's plan, so on a normal day nothing needs to be touched; only skips and extras are marked.
 */
export function DeliveriesScreen() {
  const { data, store, backup, nav, lang, tr } = useApp();
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState<Shift>(new Date().getHours() < EVENING_FROM_HOUR ? 'M' : 'E');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [pickingOther, setPickingOther] = useState(false);

  const run = useMemo(() => runFor(data, date, shift), [data, date, shift]);
  const totals = useMemo(
    () => Object.fromEntries(SHIFTS.map((s) => [s, runFor(data, date, s).reduce((sum, c) => sum + ml(data, c, date, s), 0)])) as Record<Shift, number>,
    [data, date],
  );

  const set = (c: Customer, value: number) => store.update((d) => withQty(d, c, date, shift, value));
  const shiftLabel = (s: Shift) => tr(s === 'M' ? 'morning' : 'evening');

  return (
    <Page title={tr('app_name')}>
      {!installed() && <p class="banner info">{tr('install_hint')}</p>}
      <BackupBanner status={backup.status} onClick={() => nav.tab({ name: 'settings' })} />
      <DateStepper value={date} onChange={setDate} />
      <Segmented
        options={SHIFTS.map((s) => ({ value: s, label: tr('shift_total', shiftLabel(s), Fmt.litresUnit(lang, totals[s])) }))}
        value={shift}
        onChange={setShift}
      />
      {run.length === 0 && <p class="empty">{tr(data.customers.length === 0 ? 'no_customers_yet' : 'nobody_on_run')}</p>}
      {run.map((c) => (
        <DeliveryRow
          key={c.id}
          name={c.name}
          ml={ml(data, c, date, shift)}
          usualMl={usualMl(c, date, shift)}
          onMinus={() => set(c, Math.max(0, ml(data, c, date, shift) - STEP_ML))}
          onPlus={() => set(c, ml(data, c, date, shift) + STEP_ML)}
          onEdit={() => setEditing(c)}
          onOpen={() => nav.go({ name: 'customer', id: c.id })}
        />
      ))}
      {data.customers.length > run.length && (
        <button type="button" class="btn outline wide" onClick={() => setPickingOther(true)}>{tr('extra_for_other')}</button>
      )}

      {editing && (
        <QtyDialog
          title={editing.name}
          ml={ml(data, editing, date, shift)}
          usualMl={usualMl(editing, date, shift)}
          onSet={(v) => set(editing, v)}
          onClose={() => setEditing(null)}
        />
      )}
      {pickingOther && (
        <Modal
          title={tr('extra_for_other')}
          onClose={() => setPickingOther(false)}
          actions={<button type="button" class="btn text" onClick={() => setPickingOther(false)}>{tr('cancel')}</button>}
        >
          <div class="pick-list">
            {data.customers.filter((c) => !run.some((r) => r.id === c.id)).sort(byName).map((c) => (
              <button type="button" key={c.id} onClick={() => { setPickingOther(false); setEditing(c); }}>{c.name}</button>
            ))}
          </div>
        </Modal>
      )}
    </Page>
  );
}

function DeliveryRow(props: {
  name: string;
  ml: number;
  usualMl: number;
  onMinus: () => void;
  onPlus: () => void;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const { lang, tr } = useApp();
  const litres = (v: number) => Fmt.litresUnit(lang, v);
  const [kind, note] =
    props.ml === 0 ? ['skip', tr('skipped')]
    : props.ml > props.usualMl ? ['extra', tr('extra_of_usual', litres(props.usualMl))]
    : props.ml < props.usualMl ? ['less', tr('less_than_usual', litres(props.usualMl))]
    : ['', null];
  return (
    <div class={'card delivery ' + kind}>
      <button type="button" class="who" onClick={props.onOpen}>
        <span class="name">{props.name}</span>
        {note && <small>{note}</small>}
      </button>
      <button type="button" class="round" disabled={props.ml === 0} onClick={props.onMinus}>−</button>
      <button type="button" class="qty" onClick={props.onEdit}>{props.ml === 0 ? tr('skip_short') : litres(props.ml)}</button>
      <button type="button" class="round" onClick={props.onPlus}>+</button>
    </div>
  );
}
