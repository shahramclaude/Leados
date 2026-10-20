// public/sw.js — PWA service worker: offline app shell + cached read-models.
//
// Strategy:
//  - App shell (navigations) -> network-first, falling back to the cached
//    `/offline` page when there's no connectivity at all.
//  - Read-model GET API calls (/api/findings, /api/settings, /api/me) ->
//    stale-while-revalidate, so the dashboard renders instantly from cache
//    and refreshes in the background.
//  - Writes (POST/PATCH) are never intercepted here — they are queued
//    client-side by src/lib/offlineQueue.ts and replayed on reconnect, which
//    also lets us surface conflict responses (409) back to the UI.

const SHELL_CACHE = "leados-shell-v1";
const DATA_CACHE = "leados-data-v1";

const SHELL_URLS = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => ![SHELL_CACHE, DATA_CACHE].includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

const CACHEABLE_READ_MODELS = ["/api/findings", "/api/settings", "/api/me"];

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // writes are queued client-side, not here

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline").then((res) => res || Response.error())),
    );
    return;
  }

  if (CACHEABLE_READ_MODELS.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

// Web Push — displays a notification when the server sends one.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "LEADOS", body: "" };
  try {
    payload = event.data.json();
  } catch {
    payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "LEADOS", {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/dashboard"));
});
