"use client";

// Thin client fetch helper: generates idempotency keys and a stable client id
// used to attribute "You" vs other actors in the demo realtime stream.

export function newIdempotencyKey() {
  return `idem_${crypto.randomUUID()}`;
}

export function getClientActorId() {
  if (typeof window === "undefined") return "server";
  const key = "leados.actorId";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `actor_${crypto.randomUUID().slice(0, 8)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

export async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!response.ok) throw response;
  return response.json() as Promise<T>;
}
