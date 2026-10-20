import { useState } from 'preact/hooks';
import { today } from '../data/dates';
import { upsert, withoutCustomer, withPlan } from '../data/ledger';
import { currentPlan, findCustomer, newId, type Plan } from '../data/models';
import * as Fmt from '../fmt';
import { useApp } from './app';
import { ConfirmDialog, DateField, DecimalField, IconButton, ICONS, Page, planSummary, TextField } from './kit';

/**
 * New customer, or edit one. Changing litres or rate never rewrites the past: it adds a plan
 * from the chosen date, so earlier days keep the quantity and rate they were delivered at.
 */
export function CustomerEditScreen({ id }: { id: string | null }) {
  const { data, store, nav, lang, tr } = useApp();
  const existing = id === null ? undefined : findCustomer(data, id);
  const day = today();
  const current = existing && currentPlan(existing, day);

  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [morning, setMorning] = useState(current ? Fmt.litres(current.morningMl) : '1');
  const [evening, setEvening] = useState(current ? Fmt.litres(current.eveningMl) : '0');
  const [rate, setRate] = useState(String(current?.rate ?? data.business.defaultRate));
  const [from, setFrom] = useState(day);
  const [opening, setOpening] = useState(existing && existing.openingPaise !== 0 ? Fmt.plainRupees(existing.openingPaise) : '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const morningMl = Fmt.parseLitres(morning);
  const eveningMl = Fmt.parseLitres(evening);
  const rateN = /^\d+$/.test(rate) && Number(rate) > 0 ? Number(rate) : null;
  const openingPaise = opening.trim() === '' ? 0 : Fmt.parseRupees(opening, true);
  const valid = name.trim() !== '' && morningMl !== null && eveningMl !== null && rateN !== null && openingPaise !== null;
  const planChanged = !current || morningMl !== current.morningMl || eveningMl !== current.eveningMl || rateN !== current.rate;

  function save() {
    if (!valid) return;
    const plan: Plan = { from, morningMl: morningMl!, eveningMl: eveningMl!, rate: rateN! };
    const base = existing ?? { id: newId(), name, phone: '', address: '', openingPaise: 0, plans: [plan] };
    let c = { ...base, name: name.trim(), phone: phone.trim(), address: address.trim(), openingPaise: openingPaise! };
    if (planChanged) c = withPlan(c, plan);
    store.update((d) => upsert(d, c));
    if (existing) nav.back();
    else nav.replace({ name: 'customer', id: c.id });
  }

  const badLitres = tr('invalid_litres');
  return (
    <Page
      title={tr(existing ? 'edit_customer' : 'add_customer')}
      onBack={nav.back}
      actions={existing && <IconButton icon={ICONS.delete} label={tr('delete_customer')} onClick={() => setConfirmDelete(true)} />}
    >
      <TextField label={tr('customer_name')} value={name} onInput={setName} />
      <TextField label={tr('phone_whatsapp')} value={phone} onInput={setPhone} type="tel" inputMode="tel" />
      <TextField label={tr('address')} value={address} onInput={setAddress} />

      <hr />
      <h3>{tr('usual_milk')}</h3>
      <div class="row gap">
        <DecimalField label={tr('morning_litres')} value={morning} onInput={setMorning} error={morningMl === null ? badLitres : null} />
        <DecimalField label={tr('evening_litres')} value={evening} onInput={setEvening} error={eveningMl === null ? badLitres : null} />
      </div>
      <DecimalField label={tr('rate_per_litre')} value={rate} onInput={(v) => setRate(v.replace(/\D/g, ''))} />
      {planChanged && (
        <>
          <DateField label={tr(existing ? 'change_applies_from' : 'delivery_starts')} value={from} onChange={setFrom} />
          {existing && <p class="small">{tr('past_days_unchanged')}</p>}
        </>
      )}

      <hr />
      <DecimalField label={tr('opening_balance')} value={opening} onInput={setOpening} allowNegative />
      <p class="small">{tr('opening_balance_hint')}</p>

      <button type="button" class="btn primary wide" disabled={!valid} onClick={save}>{tr('save')}</button>

      {existing && existing.plans.length > 1 && (
        <>
          <hr />
          <h3>{tr('plan_history')}</h3>
          {[...existing.plans].reverse().map((p) => (
            <div class="row" key={p.from}>
              <span class="grow">{tr('plan_from', Fmt.date(lang, p.from), planSummary(lang, p))}</span>
              <IconButton
                icon={ICONS.delete}
                label={tr('delete')}
                onClick={() => store.update((d) => upsert(d, { ...existing, plans: existing.plans.filter((x) => x !== p) }))}
              />
            </div>
          ))}
        </>
      )}

      {confirmDelete && existing && (
        <ConfirmDialog
          title={tr('delete_customer')}
          text={tr('delete_customer_confirm', existing.name)}
          confirm={tr('delete')}
          onConfirm={() => {
            store.update((d) => withoutCustomer(d, existing.id));
            nav.tab({ name: 'customers' });
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </Page>
  );
}
