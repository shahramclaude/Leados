"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/app/routes";
import { cx } from "@/components/leados/ui/cx";

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex h-full w-60 shrink-0 flex-col gap-[var(--space-6)] overflow-y-auto border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] p-[var(--space-4)]">
      <Link href="/leados/now/cockpit" className="flex items-center gap-[var(--space-2)] px-[var(--space-2)] text-[var(--text-md)] font-semibold tracking-tight text-[var(--text-primary)]">
        <span aria-hidden className="text-[var(--accent-default)]">◆</span>
        LEADOS
      </Link>
      {ROUTES.map((group) => (
        <div key={group.tier} className="flex flex-col gap-[var(--space-1)]">
          <p className="px-[var(--space-2)] text-[var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{group.tier}</p>
          <ul className="flex flex-col gap-[2px]">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-2)] py-[var(--space-2)] text-[var(--text-sm)] transition-colors duration-[var(--duration-fast)]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                      active
                        ? "bg-[var(--accent-subtle)] font-medium text-[var(--accent-default)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
