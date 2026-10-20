"use client";

// Generic URL-state hook (rule A.2: filters/sort/selection/tabs live in the
// query string, never in React state or context). Not domain-named —
// FindingsClient.tsx is the only caller that knows what "status" or "sort"
// mean.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type UrlStateValue = string | number | undefined;

export function useUrlState<T extends Record<string, UrlStateValue>>(defaults: T) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const raw = searchParams.get(key);
      if (raw === null) continue;
      const defaultValue = defaults[key as keyof T];
      (result as Record<string, UrlStateValue>)[key] = typeof defaultValue === "number" ? Number(raw) : raw;
    }
    return result;
  }, [searchParams, defaults]);

  const setState = useCallback(
    (patch: Partial<T>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        const isDefault = value === defaults[key as keyof T] || value === undefined || value === "";
        if (isDefault) params.delete(key);
        else params.set(key, String(value));
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, defaults],
  );

  return [state, setState] as const;
}
