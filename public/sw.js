/**
 * LEADOS service worker (Section D).
 *
 * Strategy:
 *  - App shell (`/`, `/now`, `/offline`, manifest, icons) is cache-first so
 *    the app boots instantly offline.
 *  - `GET /api/*` read-model requests use stale-while-revalidate: the UI
 *    renders the last-known-good cached response immediately and swaps in
 *    fresh data when the network responds, so Subjects/Briefings/etc. are
 *    readable offline, not blank.
 *  - Mutating requests (`POST`/`PATCH`/`DELETE`) are **not** intercepted by
 *    the service worker. They are queued client-side in IndexedDB by
 *    `src/lib/offlineQueue.ts` *before* the fetch is attempted, and flushed
 *    through `/api/sync` on the `online` event. We deliberately did not use
 *    the Background Sync API for this: it is unsupported in Safari/iOS
 *    (a meaningful share of a Nordic mobile workforce), so relying on it
 *    would silently fail universality for exactly the devices this section
 *    is about. The documented tradeoff: sync requires the tab to be
 *    reopened/foregrounded while online, rather than firing in the
 *    background. This is recorded here and in AI-SESSION-LOG.md rather than
 *    silently assumed.
 */
const SHELL_CACHE = "leados-shell-v1";
const API_CACHE = "leados-api-v1";

const SHELL_ASSETS = ["/", "/now", "/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, API_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isReadModelRequest(request) {
  return request.method === "GET" && new URL(request.url).pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept writes — see note above

  const url = new URL(request.url);

  if (isReadModelRequest(request)) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => undefined);
        return cached ?? (await network) ?? new Response(JSON.stringify({ offline: true }), {
          headers: { "Content-Type": "application/json" },
          status: 503,
        });
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(request)) ?? (await cache.match("/offline"));
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).catch(() => caches.match("/offline"))),
  );
});

// --- Push notifications (behind the Part 12 channel layer scaffold) -------
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "LEADOS", body: event.data.text() };
  }
  const title = payload.title || "LEADOS";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/now" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/now";
  event.waitUntil(self.clients.openWindow(url));
});
