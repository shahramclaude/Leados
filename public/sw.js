// LEADOS service worker.
//
// Strategy:
// - App shell (/, icons, manifest, core routes): cache-first with network
//   fallback, so the shell boots offline.
// - GET /api/*: stale-while-revalidate — serve the cached read-model
//   instantly, then refresh it in the background so the next load is fresh.
// - Writes (POST/PATCH/DELETE) are never intercepted here. They are handled
//   by the client-side queue (src/lib/offline/queue.ts) which talks to
//   IndexedDB directly; this keeps conflict resolution (409 version
//   mismatches) in the main thread where we can show UI, instead of silently
//   retried in the background. See AI-SESSION-LOG.md for why we did not use
//   the Background Sync API.
const SHELL_CACHE = "leados-shell-v1";
const API_CACHE = "leados-api-v1";

const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache or intercept writes

  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).catch(() => caches.match("/"))),
    );
  }
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached ?? (await networkFetch) ?? new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}
