import type { Lang } from '../i18n';
import { decode, encode } from './codec';
import { today } from './dates';
import { newId, type AppData } from './models';
import { sheetTabs } from './sheetTabs';
import type { Store } from './store';

/**
 * Keeps a copy of everything in the owner's Google Sheet, through the Apps Script in /apps-script.
 * Same protocol and behaviour as SheetBackup in the Android app, so either app can restore the other's backup.
 *
 * - Every change is sent ~15 s after the last tap, and again when the app is hidden.
 * - The sheet holds the full data (for restore) plus readable tabs (for people).
 * - The sheet counts revisions. A phone may only overwrite the revision it last saw, so a new or
 *   reset phone cannot wipe a good backup by accident: it gets "conflict" and must restore or
 *   explicitly overwrite.
 * - Unlike Android, a web page cannot run in the background: iOS suspends it soon after it is hidden.
 *   Pending changes go out on the next open, or when the phone is back online.
 */
export type Reason = 'offline' | 'badLink' | 'wrongKey';

export type Status =
  | { kind: 'notSetUp' }
  | { kind: 'working' }
  /** lastOkAt: epoch ms of the last successful backup; pending: changes not yet in the sheet. */
  | { kind: 'idle'; lastOkAt: number | null; pending: boolean }
  | { kind: 'failed'; reason: Reason; lastOkAt: number | null }
  | { kind: 'conflict' };

/** data is null when the sheet has no backup yet. */
export interface Snapshot { data: AppData | null; rev: number }

type Reply = Record<string, unknown>;

const DEBOUNCE_MS = 15_000;
const STARTUP_DELAY_MS = 3_000;
const TIMEOUT_MS = 90_000;
/** Push ids kept while their answer is unknown; more than this many lost answers in a row is not realistic. */
const MAX_UNACKED = 10;

export class SheetBackup {
  status: Status;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** One request at a time, like the Android Mutex. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Data known to equal the sheet; its echo through the store is not a change. */
  private clean: AppData | null;

  constructor(private store: Store, private lang: () => Lang) {
    this.clean = store.data;
    this.status = this.idleStatus();
    store.subscribe(() => {
      if (store.data === this.clean) return;
      this.clean = null;
      this.dirty = true;
      if (this.status.kind === 'idle') this.setStatus(this.idleStatus());
      this.schedule(DEBOUNCE_MS);
    });
    if (this.dirty) this.schedule(STARTUP_DELAY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
      else if (this.dirty) this.schedule(STARTUP_DELAY_MS);
    });
    window.addEventListener('online', () => {
      if (this.dirty) this.schedule(0);
    });
  }

  get url(): string { return pref('url') ?? ''; }
  get key(): string { return pref('key') ?? ''; }
  private get configured(): boolean { return this.url.trim() !== '' && this.key.trim() !== ''; }
  private get rev(): number { return Number(pref('rev') ?? 0); }
  private set rev(v: number) { setPref('rev', String(v)); }
  private get dirty(): boolean { return pref('dirty') === '1'; }
  private set dirty(v: boolean) { setPref('dirty', v ? '1' : '0'); }
  private get lastOkAt(): number | null { return Number(pref('lastOk') ?? 0) || null; }
  /** Pushes sent whose answer never arrived (the page was suspended or the network dropped). */
  private get unacked(): string[] { return (pref('unacked') ?? '').split(',').filter(Boolean); }
  private set unacked(ids: string[]) { setPref('unacked', ids.slice(-MAX_UNACKED).join(',')); }

  subscribe(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  setLink(url: string, key: string): void {
    setPref('url', url.trim());
    setPref('key', key.trim());
    this.setStatus(this.idleStatus());
  }

  /** Sends pending changes now (app hidden, or the user asked). */
  flush(force = false): void {
    if (force || this.dirty) this.schedule(0);
  }

  /** Replaces the sheet with this phone's data even if another phone saved since. Asked for explicitly. */
  overwrite(): void {
    clearTimeout(this.timer);
    this.enqueue(() => this.push(true));
  }

  /** Reads the backup; the caller confirms with the user, then calls apply(). Null when it failed; status says why. */
  pull(): Promise<Snapshot | null> {
    return this.enqueue(async () => {
      this.setStatus({ kind: 'working' });
      const res = await this.call({ action: 'pull' });
      if (!res) return null;
      let snapshot: Snapshot | null = null;
      try {
        const json = typeof res.json === 'string' ? res.json : '';
        if (typeof res.rev === 'number') snapshot = { data: json === '' ? null : decode(json), rev: res.rev };
      } catch {
        snapshot = null;
      }
      this.setStatus(snapshot ? this.idleStatus() : { kind: 'failed', reason: 'badLink', lastOkAt: this.lastOkAt });
      return snapshot;
    });
  }

  apply(s: Snapshot): void {
    if (!s.data) return;
    clearTimeout(this.timer);
    this.clean = s.data;
    this.rev = s.rev;
    this.unacked = [];
    this.dirty = false;
    this.store.replace(s.data);
    this.setStatus(this.idleStatus());
  }

  /** Only the wait is cancellable. A push already sent must finish and record the new revision. */
  private schedule(delayMs: number): void {
    if (!this.configured || this.status.kind === 'conflict') return;
    clearTimeout(this.timer);
    // No timer for "now": a hidden page may be suspended before a timer fires.
    if (delayMs === 0) this.enqueue(() => this.push(false));
    else this.timer = setTimeout(() => this.enqueue(() => this.push(false)), delayMs);
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async push(force: boolean, retried = false): Promise<void> {
    if (!this.configured) return;
    const d = this.store.data;
    this.setStatus({ kind: 'working' });
    const pushId = newId();
    this.unacked = [...this.unacked, pushId];
    const res = await this.call({
      action: 'push',
      baseRev: this.rev,
      force,
      pushId,
      json: encode(d),
      tabs: sheetTabs(this.lang(), d, today()),
    });
    if (!res) return;
    if (res.ok === true && typeof res.rev === 'number') {
      this.rev = res.rev;
      this.unacked = [];
      setPref('lastOk', String(Date.now()));
      if (this.store.data === d) {
        this.clean = d;
        this.dirty = false;
      }
      this.setStatus(this.idleStatus());
    } else if (res.conflict === true) {
      // If the newest revision is one of our own pushes whose answer was lost, the sheet holds this
      // phone's data: continue from that revision instead of reporting another phone.
      const lastPush = typeof res.lastPush === 'string' ? res.lastPush : '';
      if (!retried && lastPush !== '' && this.unacked.includes(lastPush) && typeof res.rev === 'number') {
        this.rev = res.rev;
        this.unacked = [];
        return this.push(force, true);
      }
      this.setStatus({ kind: 'conflict' });
    } else {
      this.setStatus({ kind: 'failed', reason: 'badLink', lastOkAt: this.lastOkAt });
    }
  }

  /** Null when it failed; status then says why. */
  private async call(body: Reply): Promise<Reply | null> {
    const fail = (reason: Reason) => {
      this.setStatus({ kind: 'failed', reason, lastOkAt: this.lastOkAt });
      return null;
    };
    let text: string;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      // text/plain keeps this a "simple" request: no CORS preflight, which Apps Script cannot answer.
      // Apps Script answers with a redirect to the result; fetch follows it.
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...body, key: this.key }),
        signal: abort.signal,
      });
      // Reached Google but the link is wrong (404 etc.): a link problem, not a network one.
      if (!res.ok) return fail('badLink');
      text = await res.text();
    } catch {
      // fetch gives no reason. A wrong link fails the same way as no internet (Google's error page
      // has no CORS header, so the browser blocks it). A no-cors request that does not need to read
      // the answer tells them apart: it gets through only when the internet works.
      return fail((await reachable(this.url)) ? 'badLink' : 'offline');
    } finally {
      clearTimeout(timer);
    }
    let res: Reply;
    try {
      res = JSON.parse(text) as Reply;
    } catch {
      // Google answers a wrong or undeployed script link with an HTML page.
      return fail('badLink');
    }
    if (res.error === 'key') return fail('wrongKey');
    return res;
  }

  private idleStatus(): Status {
    return this.configured ? { kind: 'idle', lastOkAt: this.lastOkAt, pending: this.dirty } : { kind: 'notSetUp' };
  }

  private setStatus(s: Status): void {
    this.status = s;
    this.listeners.forEach((f) => f());
  }
}

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

function pref(k: string): string | null {
  try {
    return localStorage.getItem('sheet.' + k);
  } catch {
    return null;
  }
}

function setPref(k: string, v: string): void {
  try {
    localStorage.setItem('sheet.' + k, v);
  } catch {
    // Storage blocked: the setting lasts only until the app closes.
  }
}
