import { decode, encode } from './codec';
import type { AppData } from './models';

/**
 * All data lives in one JSON text in IndexedDB, in the shared backup format. The screen updates at
 * once; the write runs after, and bursts of taps collapse into one write of the latest data.
 * IndexedDB transactions are atomic, so a crash mid-write keeps the previous copy.
 */
export class Store {
  private listeners = new Set<() => void>();
  private pending: string | null = null;
  private writing = false;

  private constructor(private db: IDBDatabase, public data: AppData, private json: string) {}

  /** Loads the saved data, or saves and returns [seed()] on first start. Throws if saved data is unreadable. */
  static async open(seed: () => AppData): Promise<Store> {
    const db = await openDb();
    const text = await request<string | undefined>(db.transaction(STORE).objectStore(STORE).get(KEY));
    // Ask the browser not to clear this site's data under storage pressure. Safari may say no;
    // the Google Sheet backup is the real safety net.
    void navigator.storage?.persist?.();
    if (text !== undefined) return new Store(db, decode(text), text);
    const data = seed();
    const store = new Store(db, data, encode(data));
    await store.write(store.json);
    return store;
  }

  update(transform: (d: AppData) => AppData): void {
    const next = transform(this.data);
    const json = encode(next);
    if (json === this.json) return;
    this.data = next;
    this.json = json;
    this.listeners.forEach((f) => f());
    this.pending = json;
    if (!this.writing) void this.drain();
  }

  replace(d: AppData): void {
    this.update(() => d);
  }

  /** Called after every change; returns the unsubscribe function. */
  subscribe(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private async drain(): Promise<void> {
    this.writing = true;
    while (this.pending !== null) {
      const json = this.pending;
      this.pending = null;
      try {
        await this.write(json);
      } catch (e) {
        // Kept for the next change to retry; the Sheet backup still gets the data meanwhile.
        this.pending ??= json;
        console.error('Saving on this phone failed', e);
        break;
      }
    }
    this.writing = false;
  }

  private write(json: string): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(json, KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
}

const DB = 'gaushala';
const STORE = 'kv';
const KEY = 'data';

function openDb(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  return request(req);
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
