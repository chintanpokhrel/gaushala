import { useState } from 'preact/hooks';
import type { SheetBackup, Snapshot, Status } from '../data/backup';
import { decode, encode } from '../data/codec';
import { today } from '../data/dates';
import type { AppData, Business } from '../data/models';
import * as Fmt from '../fmt';
import type { Tag } from '../i18n';
import { canShareFile, download, shareFile } from '../share';
import { useApp } from './app';
import { Chip, ConfirmDialog, DecimalField, Page, TextField } from './kit';

export function SettingsScreen() {
  const { data, store, backup, lang, setLang, tr, toast } = useApp();
  const [pendingSheet, setPendingSheet] = useState<Snapshot | null>(null);
  const [pendingFile, setPendingFile] = useState<AppData | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  async function restoreFromSheet() {
    const snap = await backup.pull();
    if (!snap) return;
    if (!snap.data) toast(tr('sheet_empty'));
    else setPendingSheet(snap);
  }

  function saveFile() {
    const file = new File([encode(data)], tr('backup_file_name', today()), { type: 'application/json' });
    // On iPhone the share sheet offers "Save to Files" (and Google Drive, if installed).
    if (canShareFile(file)) {
      shareFile(file).then((done) => done && toast(tr('file_saved')), () => toast(tr('file_failed')));
    } else {
      download(file);
      toast(tr('file_saved'));
    }
  }

  async function openFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      setPendingFile(decode(await file.text()));
    } catch {
      toast(tr('restore_bad_file'));
    }
  }

  const langs: [Tag, string][] = [['en', tr('language_en')], ['ne', tr('language_ne')]];
  return (
    <Page title={tr('tab_settings')}>
      <h3>{tr('language')}</h3>
      <div class="chips">
        {langs.map(([tag, label]) => <Chip selected={lang.tag === tag} onClick={() => setLang(tag)}>{label}</Chip>)}
      </div>

      <hr />
      <SheetSection status={backup.status} backup={backup} onRestore={restoreFromSheet} onOverwrite={() => setConfirmOverwrite(true)} />

      <hr />
      <BusinessSection key={JSON.stringify(data.business)} business={data.business} onSave={(b) => store.update((d) => ({ ...d, business: b }))} />

      <hr />
      <h3>{tr('file_backup')}</h3>
      <p class="small">{tr('file_backup_hint')}</p>
      <button type="button" class="btn outline wide" onClick={saveFile}>{tr('save_file')}</button>
      <label class="btn outline wide">
        {tr('restore_file')}
        {/* Any file type: Drive and Files often label JSON as something else; decode() checks it. */}
        <input type="file" class="hidden" onChange={(e) => void openFile(e.currentTarget)} />
      </label>

      {pendingSheet?.data && (
        <ConfirmDialog
          title={tr('restore_sheet')}
          text={tr('restore_confirm', pendingSheet.data.customers.length, pendingSheet.data.payments.length)}
          confirm={tr('restore')}
          onConfirm={() => { backup.apply(pendingSheet); toast(tr('restore_done')); }}
          onClose={() => setPendingSheet(null)}
        />
      )}
      {pendingFile && (
        <ConfirmDialog
          title={tr('restore_file')}
          text={tr('restore_confirm', pendingFile.customers.length, pendingFile.payments.length)}
          confirm={tr('restore')}
          onConfirm={() => { store.replace(pendingFile); toast(tr('restore_done')); }}
          onClose={() => setPendingFile(null)}
        />
      )}
      {confirmOverwrite && (
        <ConfirmDialog
          title={tr('overwrite_sheet')}
          text={tr('overwrite_confirm', data.customers.length)}
          confirm={tr('overwrite_sheet')}
          onConfirm={() => backup.overwrite()}
          onClose={() => setConfirmOverwrite(false)}
        />
      )}
    </Page>
  );
}

function SheetSection(props: { status: Status; backup: SheetBackup; onRestore: () => void; onOverwrite: () => void }) {
  const { tr } = useApp();
  const { status, backup } = props;
  const [url, setUrl] = useState(backup.url);
  const [key, setKey] = useState(backup.key);
  const ready = url.trim() !== '' && key.trim() !== '' && status.kind !== 'working';
  const problem = status.kind === 'failed' || status.kind === 'conflict';
  return (
    <>
      <h3>{tr('sheet_backup')}</h3>
      <p class={problem ? 'error' : ''}>{useStatusText(status)}</p>
      {status.kind === 'conflict' && <p class="small">{tr('conflict_help')}</p>}
      <TextField label={tr('sheet_link')} value={url} onInput={setUrl} type="url" inputMode="url" />
      <TextField label={tr('sheet_key')} value={key} onInput={setKey} type="password" />
      <button type="button" class="btn primary wide" disabled={!ready} onClick={() => { backup.setLink(url, key); backup.flush(true); }}>
        {tr('backup_now')}
      </button>
      <button type="button" class="btn outline wide" disabled={!ready} onClick={() => { backup.setLink(url, key); props.onRestore(); }}>
        {tr('restore_sheet')}
      </button>
      {status.kind === 'conflict' && <button type="button" class="btn outline wide" onClick={props.onOverwrite}>{tr('overwrite_sheet')}</button>}
    </>
  );
}

function useStatusText(status: Status): string {
  const { lang, tr } = useApp();
  switch (status.kind) {
    case 'notSetUp': return tr('sheet_not_set_up');
    case 'working': return tr('sheet_working');
    case 'conflict': return tr('sheet_conflict');
    case 'idle':
      if (status.lastOkAt === null) return tr('sheet_never');
      return tr(status.pending ? 'sheet_pending' : 'sheet_ok', Fmt.ago(lang, status.lastOkAt));
    case 'failed':
      return tr(status.reason === 'offline' ? 'sheet_offline' : status.reason === 'wrongKey' ? 'sheet_wrong_key' : 'sheet_bad_link');
  }
}

/** name@bank, as every UPI app shows it. */
const UPI_ID = /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}$/;

/** Keyed by the saved values, so it starts again from them after a save or a restore. */
function BusinessSection({ business: b, onSave }: { business: Business; onSave: (b: Business) => void }) {
  const { tr } = useApp();
  const [nameEn, setNameEn] = useState(b.nameEn);
  const [nameNe, setNameNe] = useState(b.nameNe);
  const [phone, setPhone] = useState(b.phone);
  const [upiId, setUpiId] = useState(b.upiId);
  const [upiName, setUpiName] = useState(b.upiName);
  const [rate, setRate] = useState(String(b.defaultRate));
  const [cc, setCc] = useState(b.countryCode);
  const rateN = /^\d+$/.test(rate) && Number(rate) > 0 ? Number(rate) : null;
  const upiValid = upiId.trim() === '' || UPI_ID.test(upiId.trim());
  const next: Business = {
    ...b,
    nameEn: nameEn.trim(),
    nameNe: nameNe.trim(),
    phone: phone.trim(),
    upiId: upiId.trim(),
    upiName: upiName.trim(),
    defaultRate: rateN ?? b.defaultRate,
    countryCode: cc.replace(/\D/g, ''),
  };
  const changed = (Object.keys(next) as (keyof Business)[]).some((k) => next[k] !== b[k]);
  return (
    <>
      <h3>{tr('on_the_bill')}</h3>
      <TextField label={tr('business_name_en')} value={nameEn} onInput={setNameEn} />
      <TextField label={tr('business_name_ne')} value={nameNe} onInput={setNameNe} />
      <TextField label={tr('business_phone')} value={phone} onInput={setPhone} type="tel" inputMode="tel" />
      <TextField
        label={tr('upi_id')}
        value={upiId}
        onInput={setUpiId}
        type="email"
        inputMode="email"
        error={upiValid ? null : tr('upi_id_invalid')}
        hint={tr('upi_id_hint')}
      />
      <TextField label={tr('upi_name')} value={upiName} onInput={setUpiName} />
      <div class="row gap">
        <DecimalField label={tr('default_rate')} value={rate} onInput={(v) => setRate(v.replace(/\D/g, ''))} />
        <DecimalField label={tr('country_code')} value={cc} onInput={(v) => setCc(v.replace(/\D/g, ''))} />
      </div>
      <button type="button" class="btn primary wide" disabled={rateN === null || !upiValid || nameEn.trim() === '' || !changed} onClick={() => onSave(next)}>
        {tr('save')}
      </button>
    </>
  );
}
