"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseFetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// Minimal fetch + reducer-free polling hook (no external data library).
export function useFetchResource<T>(
  url: string | null,
  options?: { pollMs?: number }
): UseFetchState<T> & { refetch: () => void; setData: (updater: (prev: T | null) => T | null) => void } {
  const [state, setState] = useState<UseFetchState<T>>({ data: null, error: null, loading: url !== null });
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!url) return;
    setState((prev) => ({ ...prev, loading: prev.data === null, error: null }));
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json: unknown = await res.json();
      if (mountedRef.current) setState({ data: json as T, error: null, loading: false });
    } catch (err) {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : "Unknown error", loading: false }));
      }
    }
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    let interval: ReturnType<typeof setInterval> | null = null;
    if (options?.pollMs) {
      interval = setInterval(() => void load(), options.pollMs);
    }
    return () => {
      mountedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [load, options?.pollMs]);

  const setData = useCallback((updater: (prev: T | null) => T | null) => {
    setState((prev) => ({ ...prev, data: updater(prev.data) }));
  }, []);

  return { ...state, refetch: load, setData };
}

export async function postJson<TResponse>(url: string, body: unknown, method = "POST"): Promise<TResponse> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload: unknown = await res.json().catch(() => ({}));
    const message =
      typeof payload === "object" && payload !== null && "error" in payload && typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return (await res.json()) as TResponse;
}
