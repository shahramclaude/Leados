// LEADOS service worker.
// Responsibilities (deliberately minimal — see PART-03-REPORT.md Phase 5
// "what we did not do" for the full-offline-app-shell caching that is NOT
// implemented yet):
//   1. Cache the app shell (static assets) for faster repeat loads.
//   2. Listen for the Background Sync event and ask open tabs to drain the
//      mutation queue (the queue itself lives in IndexedDB + main-thread
//      logic in src/lib/platform/integration, not duplicated here).

const SHELL_CACHE = "leados-shell-v1";
const SHELL_ASSETS = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!SHELL_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "leados-mutation-replay") return;
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      for (const client of clients) client.postMessage({ type: "leados:replay" });
    }),
  );
});
