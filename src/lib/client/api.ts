"use client";

// Thin fetch wrapper for client components: fetches a fresh CSRF token
// before any mutating request and attaches it as the `x-csrf-token` header,
// matching the double-submit mechanism in src/lib/csrf.ts.
let cachedToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await fetch("/api/csrf", { credentials: "include" });
  const data = await res.json();
  cachedToken = data.csrfToken as string;
  return cachedToken;
}

export function invalidateCsrfToken() {
  cachedToken = null;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  const isMutating = !["GET", "HEAD", "OPTIONS"].includes(method);

  if (isMutating) {
    headers.set("x-csrf-token", await getCsrfToken());
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  }

  const response = await fetch(path, { ...init, headers, credentials: "include" });
  if (response.status === 403) {
    // Token may have rotated/expired — refresh once and let the caller retry.
    invalidateCsrfToken();
  }
  return response;
}
