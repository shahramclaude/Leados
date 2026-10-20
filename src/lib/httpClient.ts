"use client";

/**
 * Browser-only fetch wrapper. Deliberately has zero server-only imports
 * (no `@/db`, no `node:crypto`) so it is safe to bundle into client
 * components. Centralizes the CSRF dance so every mutating call in the UI
 * automatically attaches the double-submit token.
 */
const CSRF_COOKIE = "leados_csrf";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  const res = await fetch("/api/csrf", { credentials: "same-origin" });
  const data = (await res.json()) as { csrfToken: string };
  return data.csrfToken;
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiFetch(url: string, options: ApiFetchOptions = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (method !== "GET" && method !== "HEAD") {
    const token = await ensureCsrfToken();
    headers.set("x-csrf-token", token);
  }

  const res = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: "same-origin",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? (data as { error: { message: string } }).error.message
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return data;
}
