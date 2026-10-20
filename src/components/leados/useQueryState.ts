"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Keeps a single piece of UI state (filter, sort, selection, tab) mirrored
 * into the URL query string so every view is shareable via its link, per
 * the IA contract. */
export function useQueryState(key: string, defaultValue: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultValue || next === "") {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, defaultValue, searchParams, router, pathname],
  );

  return [value, setValue] as const;
}
