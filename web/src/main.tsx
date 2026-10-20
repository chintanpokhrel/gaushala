import { render } from 'preact';
import { SheetBackup } from './data/backup';
import { Store } from './data/store';
import { LANGS, savedTag, t } from './i18n';
import { App } from './ui/app';
import './styles.css';

/** Seed for a new phone. */
const DEFAULT_RATE = 60;

async function start() {
  const root = document.getElementById('app')!;
  const tag = savedTag();
  let store: Store;
  try {
    store = await Store.open(() => ({
      // Both names come from fixed strings, not the app language, so the seed is the same on every phone.
      business: {
        nameEn: t(LANGS.en, 'default_business_name'),
        nameNe: t(LANGS.ne, 'default_business_name'),
        phone: '',
        upiId: '',
        upiName: '',
        defaultRate: DEFAULT_RATE,
        countryCode: '91',
        openingTurnoverPaise: 0,
      },
      customers: [],
      adjustments: [],
      payments: [],
    }));
  } catch (e) {
    // Never seed over data that exists but cannot be read; show the problem instead.
    root.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'fatal';
    p.textContent = `${t(LANGS[tag], 'load_failed')} (${String(e)})`;
    root.append(p);
    return;
  }
  const backup = new SheetBackup(store, () => LANGS[savedTag()]);
  render(<App store={store} backup={backup} initialTag={tag} />, root);
}

void start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('./sw.js');
}
