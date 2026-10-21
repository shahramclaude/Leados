"use client";

// ---------------------------------------------------------------------------
// URL-is-state helpers. Filters, sort, selected entity, and scenario id all
// serialize to the query string so every view is shareable and restorable
// (reload, or paste the link to a teammate, reproduces the exact view).
// ---------------------------------------------------------------------------

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type QueryValue = string | number | boolean | undefined | null;

/** Reads/writes a typed slice of the current URL query string. */
export function useUrlState<T extends Record<string, QueryValue>>(defaults: T) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => {
    const result = { ...defaults } as T;
    for (const key of Object.keys(defaults)) {
      const raw = searchParams.get(key);
      if (raw === null) continue;
      const defaultValue = defaults[key as keyof T];
      if (typeof defaultValue === "number") {
        (result as Record<string, QueryValue>)[key] = Number(raw);
      } else if (typeof defaultValue === "boolean") {
        (result as Record<string, QueryValue>)[key] = raw === "true";
      } else {
        (result as Record<string, QueryValue>)[key] = raw;
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, JSON.stringify(defaults)]);

  const setState = useCallback(
    (patch: Partial<T>, options?: { replace?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        const isDefault = JSON.stringify(value) === JSON.stringify(defaults[key as keyof T]);
        if (value === undefined || value === null || value === "" || isDefault) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      const query = params.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (options?.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, router, searchParams, JSON.stringify(defaults)],
  );

  return [state, setState] as const;
}

/** Builds a shareable absolute-path link preserving the current query string. */
export function buildShareableLink(pathname: string, params: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
