import { useMemo, useState } from 'preact/hooks';
import { today, type YearMonth } from '../data/dates';
import { balanceOn, monthly, turnover, type MonthSummary } from '../data/ledger';
import * as Fmt from '../fmt';
import { useApp } from './app';
import { DecimalField, IconButton, ICONS, Modal, Page } from './kit';

/** Turnover till date, then month by month; tap a month to see each customer's share. */
export function SummaryScreen() {
  const { data, store, lang, tr } = useApp();
  const day = today();
  const months = useMemo(() => monthly(data, day), [data, day]);
  const toCollect = useMemo(() => data.customers.reduce((s, c) => s + Math.max(0, balanceOn(data, c, day)), 0), [data, day]);
  const [open, setOpen] = useState<YearMonth | null>(null);
  const [editingStart, setEditingStart] = useState(false);
  const start = data.business.openingTurnoverPaise;

  return (
    <Page title={tr('tab_summary')}>
      <div class="card hero list-row">
        <span class="grow">
          <small>{tr('turnover_till_date')}</small>
          <span class="big">{Fmt.money(lang, turnover(data, months))}</span>
          <small>{start !== 0 ? tr('includes_starting', Fmt.money(lang, start)) : tr('no_starting_amount')}</small>
        </span>
        <IconButton icon={ICONS.edit} label={tr('starting_amount')} onClick={() => setEditingStart(true)} />
      </div>
      <div class="row gap">
        <Stat label={tr('received_till_date')} value={Fmt.money(lang, months.reduce((s, m) => s + m.receivedPaise, 0))} />
        <Stat label={tr('still_to_collect')} value={Fmt.money(lang, toCollect)} />
      </div>
      <h3>{tr('by_month')}</h3>
      {months.length === 0 && <p class="muted">{tr('no_sales_yet')}</p>}
      {months.map((m) => <MonthCard key={m.month} m={m} expanded={open === m.month} onClick={() => setOpen(open === m.month ? null : m.month)} />)}

      {editingStart && (
        <StartDialog
          currentPaise={start}
          onSave={(p) => store.update((d) => ({ ...d, business: { ...d.business, openingTurnoverPaise: p } }))}
          onClose={() => setEditingStart(false)}
        />
      )}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div class="card stat grow">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function MonthCard({ m, expanded, onClick }: { m: MonthSummary; expanded: boolean; onClick: () => void }) {
  const { lang, tr } = useApp();
  const line = (ml: number, received: number) => tr('month_line', Fmt.litresUnit(lang, ml), Fmt.money(lang, received));
  return (
    <button type="button" class="card month" aria-expanded={expanded} onClick={onClick}>
      <span class="row">
        <span class="grow name">{Fmt.month(lang, m.month)}</span>
        <strong>{Fmt.money(lang, m.paise)}</strong>
      </span>
      <small class="muted">{line(m.ml, m.receivedPaise)}</small>
      {expanded && (
        <span class="month-detail">
          {m.customers.map((cm) => (
            <span class="row" key={cm.customer.id}>
              <span class="grow">
                <span>{cm.customer.name}</span>
                <small class="muted">{line(cm.ml, cm.receivedPaise)}</small>
              </span>
              <span>{Fmt.money(lang, cm.paise)}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/** Optional sales total from before the app; empty means start from zero. */
function StartDialog({ currentPaise, onSave, onClose }: { currentPaise: number; onSave: (p: number) => void; onClose: () => void }) {
  const { tr } = useApp();
  const [text, setText] = useState(currentPaise !== 0 ? Fmt.plainRupees(currentPaise) : '');
  const paise = text.trim() === '' ? 0 : Fmt.parseRupees(text);
  return (
    <Modal
      title={tr('starting_amount')}
      onClose={onClose}
      actions={
        <>
          <button type="button" class="btn text" onClick={onClose}>{tr('cancel')}</button>
          <button type="button" class="btn text" disabled={paise === null} onClick={() => { if (paise !== null) { onSave(paise); onClose(); } }}>{tr('save')}</button>
        </>
      }
    >
      <DecimalField label={tr('amount_rupees')} value={text} onInput={setText} />
      <p class="small">{tr('starting_amount_hint')}</p>
    </Modal>
  );
}
