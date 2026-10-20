"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, type TabItem } from "@/components/leados/ui/Tabs";

/** Keeps the active tab (and therefore the whole view) shareable via the URL. */
export function TabsRouter({ items, paramName = "tab" }: { items: TabItem[]; paramName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(paramName) ?? items[0]?.value ?? "";

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return <Tabs items={items} value={value} onChange={onChange} idPrefix={paramName} />;
}
