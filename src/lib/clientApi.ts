"use client";
// Client-side fetch helper that fetches/reuses a CSRF token and attaches it
// to every mutating request, per src/lib/csrf.ts's double-submit scheme.

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie("leados_csrf");
  if (existing) return existing;
  const res = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  const data = (await res.json()) as { csrfToken: string };
  return data.csrfToken;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = await ensureCsrfToken();
    headers.set("x-csrf-token", token);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
