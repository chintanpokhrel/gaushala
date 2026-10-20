// Makes the app open without internet, and picks up new versions by itself.
// - The page (index.html) is served from the cache at once and refreshed in the background, so a
//   new version shows on the next open.
// - A new page goes into the cache only after every file it needs is cached, so the app can never
//   be left with a page whose script is missing. Files no page needs any more are then removed.
// - Script and style file names change with their content, so a cached one is never out of date.
const CACHE = 'gaushala';
const SCOPE = self.registration.scope;
const ASSET = /(?:src|href)="\.?\/?(assets\/[^"]+)"/g;
const STATIC = ['manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(refresh().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(SCOPE);
        if (cached) {
          e.waitUntil(refresh().catch(() => {}));
          return cached;
        }
        return fetch(req);
      }),
    );
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }),
  );
});

/** Fetches the newest page and everything it needs, then swaps it in and drops unused files. */
async function refresh() {
  const res = await fetch(SCOPE, { cache: 'no-cache' });
  if (!res.ok) return;
  const html = await res.clone().text();
  const needed = [...new Set([...html.matchAll(ASSET)].map((m) => new URL(m[1], SCOPE).href))];
  const cache = await caches.open(CACHE);
  for (const url of needed) {
    if (!(await cache.match(url))) {
      const asset = await fetch(url);
      if (!asset.ok) return; // keep the old page; try again next time
      await cache.put(url, asset);
    }
  }
  await Promise.all(STATIC.map(async (p) => {
    const url = new URL(p, SCOPE).href;
    const r = await fetch(url, { cache: 'no-cache' });
    if (r.ok) await cache.put(url, r);
  }));
  await cache.put(SCOPE, res);
  const keep = new Set([SCOPE, ...needed, ...STATIC.map((p) => new URL(p, SCOPE).href)]);
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
}
