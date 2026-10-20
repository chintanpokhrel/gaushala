import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Status } from '../data/backup';
import { addDays, today, type LocalDate } from '../data/dates';
import { isStopped, newId, type Payment, type Plan } from '../data/models';
import * as Fmt from '../fmt';
import { t, type Lang } from '../i18n';
import { useApp } from './app';

/** Material icon paths (Apache 2.0), drawn inline so the app needs no icon font. */
export const ICONS = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  left: 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  right: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  calendar: 'M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z',
};

export function Icon({ d }: { d: string }) {
  return (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function IconButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" class="icon-btn" aria-label={label} title={label} onClick={onClick}>
      <Icon d={icon} />
    </button>
  );
}

/** A full screen: top bar (with a back arrow when [onBack] is given) and scrolling content. */
export function Page(props: { title: string; onBack?: () => void; actions?: ComponentChildren; children: ComponentChildren }) {
  const { tr } = useApp();
  return (
    <div class="page">
      <header class="top-bar">
        {props.onBack && <IconButton icon={ICONS.back} label={tr('back')} onClick={props.onBack} />}
        <h1>{props.title}</h1>
        <div class="actions">{props.actions}</div>
      </header>
      <main class="content">{props.children}</main>
    </div>
  );
}

export function Modal(props: { title: string; onClose: () => void; children: ComponentChildren; actions: ComponentChildren }) {
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label={props.title}>
        <h2>{props.title}</h2>
        <div class="dialog-body">{props.children}</div>
        <div class="dialog-actions">{props.actions}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog(props: { title: string; text: string; confirm: string; onConfirm: () => void; onClose: () => void }) {
  const { tr } = useApp();
  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      actions={
        <>
          <button type="button" class="btn text" onClick={props.onClose}>{tr('cancel')}</button>
          <button type="button" class="btn text" onClick={() => { props.onConfirm(); props.onClose(); }}>{props.confirm}</button>
        </>
      }
    >
      <p>{props.text}</p>
    </Modal>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onInput: (v: string) => void;
  type?: string;
  inputMode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'email' | 'url' | 'search';
  placeholder?: string;
  error?: string | null;
  hint?: string;
  autoComplete?: string;
}) {
  return (
    <label class={'field' + (props.error ? ' invalid' : '')}>
      <span>{props.label}</span>
      <input
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete ?? 'off'}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
      {(props.error || props.hint) && <small>{props.error ?? props.hint}</small>}
    </label>
  );
}

/** Decimal field (litres or rupees); the caller keeps the raw text so a half-typed value is not lost. */
export function DecimalField(props: { label: string; value: string; onInput: (v: string) => void; error?: string | null; hint?: string; allowNegative?: boolean }) {
  return (
    <TextField
      label={props.label}
      value={props.value}
      error={props.error}
      hint={props.hint}
      // iPhone's number pad has no minus key, so signed fields get the full keyboard.
      inputMode={props.allowNegative ? 'text' : 'decimal'}
      onInput={(v) => {
        const kept = v.replace(/[^\d.]/g, '');
        props.onInput(props.allowNegative && v.trim().startsWith('-') ? '-' + kept : kept);
      }}
    />
  );
}

/**
 * A native date input laid over [children], so tapping it opens the phone's own date picker.
 * Clearing the date in the picker is ignored: these dates are never empty.
 */
function DateOverlay(props: { value: LocalDate; onChange: (d: LocalDate) => void; label: string; children: ComponentChildren }) {
  return (
    <span class="date-overlay">
      {props.children}
      <input type="date" aria-label={props.label} value={props.value} onChange={(e) => e.currentTarget.value && props.onChange(e.currentTarget.value)} />
    </span>
  );
}

/** A labelled row showing a date; tapping it opens the date picker. */
export function DateField(props: { label: string; value: LocalDate; onChange: (d: LocalDate) => void }) {
  const { lang } = useApp();
  return (
    <div class="row date-field">
      <span class="grow">{props.label}</span>
      <DateOverlay value={props.value} onChange={props.onChange} label={props.label}>
        <span class="btn text">{Fmt.date(lang, props.value)}</span>
      </DateOverlay>
    </div>
  );
}

/** ◀ date ▶ with the date itself opening a picker. */
export function DateStepper(props: { value: LocalDate; onChange: (d: LocalDate) => void }) {
  const { lang, tr } = useApp();
  const label = props.value === today() ? tr('today_date', Fmt.weekdayDate(lang, props.value)) : Fmt.weekdayDate(lang, props.value);
  return (
    <div class="row stepper">
      <IconButton icon={ICONS.left} label={tr('previous_day')} onClick={() => props.onChange(addDays(props.value, -1))} />
      <DateOverlay value={props.value} onChange={props.onChange} label={label}>
        <span class="stepper-label">{label}</span>
      </DateOverlay>
      <IconButton icon={ICONS.right} label={tr('next_day')} onClick={() => props.onChange(addDays(props.value, 1))} />
    </div>
  );
}

/** Pick one of a few options, e.g. morning / evening. */
export function Segmented<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="radiogroup">
      {props.options.map((o) => (
        <button type="button" role="radio" aria-checked={o.value === props.value} class={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip(props: { selected: boolean; onClick: () => void; children: ComponentChildren }) {
  return (
    <button type="button" class={'chip' + (props.selected ? ' on' : '')} aria-pressed={props.selected} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

export function planSummary(l: Lang, plan: Plan): string {
  return isStopped(plan)
    ? t(l, 'stopped')
    : t(l, 'plan_summary', Fmt.litresUnit(l, plan.morningMl), Fmt.litresUnit(l, plan.eveningMl), Fmt.money(l, plan.rate * 100));
}

export function BalanceText({ balance }: { balance: number }) {
  const { lang, tr } = useApp();
  if (balance > 0) return <strong class="due">{tr('due_amount', Fmt.money(lang, balance))}</strong>;
  if (balance < 0) return <strong class="advance">{tr('advance_amount', Fmt.money(lang, -balance))}</strong>;
  return <span class="muted">{tr('settled')}</span>;
}

/** Type an exact quantity for one delivery, or go back to the usual one. */
export function QtyDialog(props: { title: string; ml: number; usualMl: number; onSet: (ml: number) => void; onClose: () => void }) {
  const { lang, tr } = useApp();
  const [text, setText] = useState(Fmt.litres(props.ml));
  const parsed = Fmt.parseLitres(text);
  const set = (ml: number) => { props.onSet(ml); props.onClose(); };
  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      actions={
        <>
          <button type="button" class="btn text" onClick={() => set(0)}>{tr('skip')}</button>
          <button type="button" class="btn text" onClick={() => set(props.usualMl)}>{tr('usual')}</button>
          <button type="button" class="btn text" disabled={parsed === null} onClick={() => parsed !== null && set(parsed)}>{tr('save')}</button>
        </>
      }
    >
      <DecimalField
        label={tr('litres_label')}
        value={text}
        onInput={setText}
        error={parsed === null && text !== '' ? tr('invalid_litres') : null}
        hint={tr('usual_qty', Fmt.litresUnit(lang, props.usualMl))}
      />
    </Modal>
  );
}

/** Record money received. [suggestedPaise] pre-fills the amount (e.g. the bill total). */
export function PaymentDialog(props: { customerId: string; suggestedPaise: number; onSave: (p: Payment) => void; onClose: () => void }) {
  const { tr } = useApp();
  const [amount, setAmount] = useState(props.suggestedPaise > 0 ? Fmt.plainRupees(props.suggestedPaise) : '');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const parsed = Fmt.parseRupees(amount);
  const paise = parsed !== null && parsed > 0 ? parsed : null;
  return (
    <Modal
      title={tr('payment_received')}
      onClose={props.onClose}
      actions={
        <>
          <button type="button" class="btn text" onClick={props.onClose}>{tr('cancel')}</button>
          <button
            type="button"
            class="btn text"
            disabled={paise === null}
            onClick={() => {
              if (paise === null) return;
              props.onSave({ id: newId(), customerId: props.customerId, date, paise, note: note.trim() });
              props.onClose();
            }}
          >
            {tr('save')}
          </button>
        </>
      }
    >
      <DecimalField label={tr('amount_rupees')} value={amount} onInput={setAmount} />
      <DateField label={tr('received_on')} value={date} onChange={setDate} />
      <TextField label={tr('payment_note')} value={note} onInput={setNote} />
      <p class="small">{tr('advance_hint')}</p>
    </Modal>
  );
}

/** A failed backup is only worth interrupting for once the last good one is this old. */
const STALE_MS = 24 * 60 * 60 * 1000;

/** Shown on the main screen while the sheet backup needs attention. */
export function BackupBanner({ status, onClick }: { status: Status; onClick: () => void }) {
  const { tr } = useApp();
  let text: string;
  switch (status.kind) {
    case 'notSetUp': text = tr('banner_not_set_up'); break;
    case 'conflict': text = tr('banner_conflict'); break;
    case 'failed':
      if (status.lastOkAt !== null && Date.now() - status.lastOkAt <= STALE_MS) return null;
      text = tr('banner_failed');
      break;
    default: return null;
  }
  return <button type="button" class="banner" onClick={onClick}>{text}</button>;
}
