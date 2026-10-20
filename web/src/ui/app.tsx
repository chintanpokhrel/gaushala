import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { SheetBackup } from '../data/backup';
import type { LocalDate } from '../data/dates';
import type { AppData } from '../data/models';
import type { Store } from '../data/store';
import { LANGS, saveTag, t, type Lang, type Tag, type TextKey } from '../i18n';
import { BillScreen } from './bill';
import { CustomerEditScreen } from './customerEdit';
import { CustomerScreen } from './customer';
import { CustomersScreen } from './customers';
import { DeliveriesScreen } from './deliveries';
import { Icon, ICONS } from './kit';
import { SettingsScreen } from './settings';
import { SummaryScreen } from './summary';

export type Screen =
  | { name: 'deliveries' }
  | { name: 'customers' }
  | { name: 'summary' }
  | { name: 'settings' }
  | { name: 'customer'; id: string }
  | { name: 'editCustomer'; id: string | null }
  | { name: 'bill'; customerId: string; from: LocalDate; to: LocalDate };

export interface Nav {
  go(s: Screen): void;
  back(): void;
  replace(s: Screen): void;
  tab(s: Screen): void;
}

interface Ctx {
  store: Store;
  data: AppData;
  backup: SheetBackup;
  lang: Lang;
  setLang(tag: Tag): void;
  tr(key: TextKey, ...args: (string | number)[]): string;
  nav: Nav;
  toast(text: string): void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp outside App');
  return ctx;
}

const TABS: { screen: Screen; label: TextKey; icon: string }[] = [
  { screen: { name: 'deliveries' }, label: 'tab_deliveries', icon: ICONS.calendar },
  { screen: { name: 'customers' }, label: 'tab_customers', icon: ICONS.person },
  { screen: { name: 'summary' }, label: 'tab_summary', icon: ICONS.list },
  { screen: { name: 'settings' }, label: 'tab_settings', icon: ICONS.settings },
];

/**
 * Screens form a stack, like the Android app's. Each screen opened on top also adds a browser
 * history entry, so the phone's own back gesture works; history.state.depth says how deep it was.
 */
function useNav(): [Screen[], Nav] {
  const [stack, setStack] = useState<Screen[]>([{ name: 'deliveries' }]);
  const depth = useRef(1);
  depth.current = stack.length;

  useEffect(() => {
    history.replaceState({ depth: 1 }, '');
    const onPop = (e: PopStateEvent) => {
      const d = Math.max(1, Number((e.state as { depth?: number } | null)?.depth ?? 1));
      setStack((s) => s.slice(0, d));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const nav = useMemo<Nav>(() => ({
    go(s) {
      history.pushState({ depth: depth.current + 1 }, '');
      setStack((st) => [...st, s]);
    },
    back() {
      if (depth.current > 1) history.back();
    },
    replace(s) {
      setStack((st) => [...st.slice(0, -1), s]);
    },
    tab(s) {
      const extra = depth.current - 1;
      setStack([s]);
      if (extra > 0) history.go(-extra);
    },
  }), []);
  return [stack, nav];
}

export function App({ store, backup, initialTag }: { store: Store; backup: SheetBackup; initialTag: Tag }) {
  const [, bump] = useState(0);
  const [tag, setTag] = useState(initialTag);
  const [toastText, setToastText] = useState<string | null>(null);
  const [stack, nav] = useNav();

  useEffect(() => store.subscribe(() => bump((n) => n + 1)), [store]);
  useEffect(() => backup.subscribe(() => bump((n) => n + 1)), [backup]);
  useEffect(() => {
    if (toastText === null) return;
    const timer = setTimeout(() => setToastText(null), 3500);
    return () => clearTimeout(timer);
  }, [toastText]);

  const lang = LANGS[tag];
  useEffect(() => {
    document.documentElement.lang = tag;
    document.title = t(lang, 'app_name');
  }, [lang, tag]);

  const ctx: Ctx = {
    store,
    data: store.data,
    backup,
    lang,
    setLang(next) {
      saveTag(next);
      setTag(next);
    },
    tr: (key, ...args) => t(lang, key, ...args),
    nav,
    toast: setToastText,
  };

  const top = stack[stack.length - 1];
  const root = stack[0];
  return (
    <AppCtx.Provider value={ctx}>
      <div class={'shell' + (stack.length === 1 ? ' with-tabs' : '')}>
        <CurrentScreen screen={top} />
        {stack.length === 1 && (
          <nav class="tab-bar">
            {TABS.map((tab) => (
              <button
                type="button"
                class={root.name === tab.screen.name ? 'on' : ''}
                aria-current={root.name === tab.screen.name ? 'page' : undefined}
                onClick={() => nav.tab(tab.screen)}
              >
                <Icon d={tab.icon} />
                <span>{t(lang, tab.label)}</span>
              </button>
            ))}
          </nav>
        )}
        {toastText && <div class="toast" role="status">{toastText}</div>}
      </div>
    </AppCtx.Provider>
  );
}

function CurrentScreen({ screen }: { screen: Screen }) {
  // Keyed so a screen's own state (search text, open dialogs) starts fresh when it changes.
  switch (screen.name) {
    case 'deliveries': return <DeliveriesScreen key="deliveries" />;
    case 'customers': return <CustomersScreen key="customers" />;
    case 'summary': return <SummaryScreen key="summary" />;
    case 'settings': return <SettingsScreen key="settings" />;
    case 'customer': return <CustomerScreen key={'c' + screen.id} id={screen.id} />;
    case 'editCustomer': return <CustomerEditScreen key={'e' + screen.id} id={screen.id} />;
    case 'bill': return <BillScreen screen={screen} />;
  }
}
