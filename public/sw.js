// Minimal crisis-mode service worker (Part 15 seam — a full PWA/offline
// implementation is tracked there; this is a deliberately small slice scoped
// to "the status page must still render something when the network is bad").
//
// Strategy: cache-first for the public status page shell and its API
// response, so that if the network / backend dependency is degraded, the
// last known status is still shown instead of a blank error page.

const CACHE_NAME = "leados-crisis-status-v1";
const SHELL_URLS = ["/status", "/api/status"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isShell = url.pathname === "/status" || url.pathname === "/api/status";
  if (!isShell) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
