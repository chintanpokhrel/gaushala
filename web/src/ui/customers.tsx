import { useMemo, useState } from 'preact/hooks';
import { today } from '../data/dates';
import { balanceOn, byName } from '../data/ledger';
import { currentPlan, isStopped } from '../data/models';
import * as Fmt from '../fmt';
import { useApp } from './app';
import { BalanceText, Icon, ICONS, Page, planSummary } from './kit';

export function CustomersScreen() {
  const { data, nav, lang, tr } = useApp();
  const [query, setQuery] = useState('');
  const day = today();
  // One pass over all deliveries per data change, not per row per render.
  const balances = useMemo(() => new Map(data.customers.map((c) => [c.id, balanceOn(data, c, day)])), [data, day]);
  const q = query.trim().toLowerCase();
  const shown = data.customers
    .filter((c) => q === '' || c.name.toLowerCase().includes(q) || c.phone.includes(q))
    .sort((a, b) => Number(isStopped(currentPlan(a, day))) - Number(isStopped(currentPlan(b, day))) || byName(a, b));
  const totalDue = [...balances.values()].filter((b) => b > 0).reduce((s, b) => s + b, 0);

  return (
    <Page title={tr('tab_customers')}>
      <label class="search">
        <Icon d={ICONS.search} />
        <input type="search" value={query} placeholder={tr('search')} onInput={(e) => setQuery(e.currentTarget.value)} />
      </label>
      {totalDue > 0 && <p class="subtitle">{tr('total_to_collect', Fmt.money(lang, totalDue))}</p>}
      {shown.map((c) => {
        const plan = currentPlan(c, day);
        return (
          <button type="button" key={c.id} class={'card list-row' + (isStopped(plan) ? ' dim' : '')} onClick={() => nav.go({ name: 'customer', id: c.id })}>
            <span class="grow">
              <span class="name">{c.name}</span>
              <small class="muted">{planSummary(lang, plan)}</small>
            </span>
            <BalanceText balance={balances.get(c.id) ?? 0} />
          </button>
        );
      })}
      <button type="button" class="fab" onClick={() => nav.go({ name: 'editCustomer', id: null })}>
        <Icon d={ICONS.add} />
        {tr('add_customer')}
      </button>
    </Page>
  );
}
