// Thin client-side fetch helpers for the Ecosystem Intelligence surfaces.
// Keeping them in one place makes the "never truncate response text, always
// surface errors" behaviour consistent across tabs.

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body as { error?: string })?.error ?? `Request to ${url} failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export async function postJson<T>(url: string, payload?: unknown): Promise<T> {
  return getJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}

export async function patchJson<T>(url: string, payload?: unknown): Promise<T> {
  return getJson<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
}
