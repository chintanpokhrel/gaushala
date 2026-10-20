import { useEffect, useMemo, useState } from 'preact/hooks';
import { renderBill } from '../bill';
import { addMonths, maxDate, minDate, monthEnd, monthStart, today, yearMonth } from '../data/dates';
import { byName, statement, withPayment } from '../data/ledger';
import { findCustomer } from '../data/models';
import * as Fmt from '../fmt';
import { LANGS, t, type Tag } from '../i18n';
import { canShareFile, canvasToFile, download, shareFile, whatsAppChatLink, whatsAppNumber } from '../share';
import { useApp, type Screen } from './app';
import { Chip, DateField, IconButton, ICONS, Page, PaymentDialog } from './kit';

type BillScreenProps = { screen: Extract<Screen, { name: 'bill' }> };

/**
 * Bill for any period. What is previewed is the exact image that gets sent. "Next" moves to the
 * next customer with the same period, so month-end billing is: send, next, send, next.
 */
export function BillScreen({ screen: s }: BillScreenProps) {
  const { data, store, nav, lang, tr, toast } = useApp();
  const c = findCustomer(data, s.customerId);
  const day = today();
  const [billTag, setBillTag] = useState<Tag>(lang.tag);
  const [paying, setPaying] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const billLang = LANGS[billTag];

  const st = useMemo(() => (c ? statement(data, c, s.from, s.to, day) : null), [data, c, s.from, s.to, day]);
  // The PNG is made ahead of the tap: iOS only opens the share sheet straight from a tap.
  useEffect(() => {
    if (!st) return;
    let live = true;
    setFile(null);
    void canvasToFile(renderBill(billLang, data.business, st), `bill-${s.from}.png`).then((f) => live && setFile(f));
    return () => { live = false; };
  }, [st, billLang, data.business, s.from]);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!c) nav.back();
  }, [c, nav]);
  if (!c || !st) return null;

  const ordered = [...data.customers].sort(byName);
  const next = ordered[ordered.findIndex((x) => x.id === c.id) + 1];
  const period = (from: string, to: string) => nav.replace({ ...s, from, to });
  const thisMonth = yearMonth(day);
  const lastMonth = addMonths(thisMonth, -1);
  const caption = t(billLang, 'bill_caption', Fmt.range(billLang, s.from, s.to), Fmt.money(billLang, Math.max(0, st.duePaise)));

  function send() {
    if (!file) return;
    if (canShareFile(file)) {
      shareFile(file, caption).catch(() => toast(tr('file_failed')));
      return;
    }
    // No file sharing here (most desktop browsers): save the image and open the chat to attach it.
    download(file);
    toast(tr('bill_downloaded'));
    const number = whatsAppNumber(c!.phone, data.business.countryCode);
    if (number) window.open(whatsAppChatLink(number, caption), '_blank', 'noopener');
  }

  return (
    <Page
      title={c.name}
      onBack={nav.back}
      actions={next && <IconButton icon={ICONS.right} label={tr('next_customer')} onClick={() => nav.replace({ ...s, customerId: next.id })} />}
    >
      <div class="chips">
        <Chip selected={s.from === monthStart(thisMonth) && s.to === monthEnd(thisMonth)} onClick={() => period(monthStart(thisMonth), monthEnd(thisMonth))}>
          {tr('this_month')}
        </Chip>
        <Chip selected={s.from === monthStart(thisMonth) && s.to === day} onClick={() => period(monthStart(thisMonth), day)}>
          {tr('till_today')}
        </Chip>
        <Chip selected={s.from === monthStart(lastMonth) && s.to === monthEnd(lastMonth)} onClick={() => period(monthStart(lastMonth), monthEnd(lastMonth))}>
          {tr('last_month')}
        </Chip>
      </div>
      <DateField label={tr('from_date')} value={s.from} onChange={(d) => period(d, maxDate(d, s.to))} />
      <DateField label={tr('to_date')} value={s.to} onChange={(d) => period(minDate(s.from, d), d)} />
      <div class="chips">
        <span>{tr('bill_language')}</span>
        <Chip selected={billTag === 'en'} onClick={() => setBillTag('en')}>{tr('language_en')}</Chip>
        <Chip selected={billTag === 'ne'} onClick={() => setBillTag('ne')}>{tr('language_ne')}</Chip>
      </div>

      <div class="card bill-preview">{preview && <img src={preview} alt={caption} />}</div>

      <button type="button" class="btn primary wide" disabled={!file} onClick={send}>
        {tr(c.phone.trim() === '' ? 'share_bill' : 'send_whatsapp')}
      </button>
      <button type="button" class="btn outline wide" onClick={() => setPaying(true)}>{tr('payment_received')}</button>

      {paying && <PaymentDialog customerId={c.id} suggestedPaise={st.duePaise} onSave={(p) => store.update((d) => withPayment(d, p))} onClose={() => setPaying(false)} />}
    </Page>
  );
}
