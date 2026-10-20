"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/domain/types";
import { can } from "@/lib/domain/rbac";
import { useT } from "@/components/providers/LocaleProvider";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

interface NavItem {
  href: string;
  labelKey: string;
  icon: string;
  show: (role: Role) => boolean;
}

const ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "🏠", show: (role) => can(role, "findings:view") },
  { href: "/admin/settings", labelKey: "nav.settings", icon: "⚙️", show: (role) => can(role, "settings:view") },
  { href: "/admin/permissions", labelKey: "nav.permissions", icon: "🛡️", show: (role) => can(role, "permissions:view") },
];

export function Nav({ role, orgName }: { role: Role; orgName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const items = ITEMS.filter((item) => item.show(role));

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Skip link — keyboard users reach main content before the nav. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-white"
      >
        {t("nav.skipToContent")}
      </a>

      {/* Desktop/tablet top nav */}
      <header className="hidden border-b border-slate-200 bg-white px-4 py-3 sm:flex sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{orgName}</span>
          <nav className="flex items-center gap-1" aria-label={t("nav.dashboard")}>
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname === item.href
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                }`}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <button
            type="button"
            onClick={logout}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            {t("nav.logout")}
          </button>
        </div>
      </header>

      {/* Mobile bottom tab bar — touch targets >= 44px, no hover-only affordances */}
      <nav
        aria-label={t("nav.dashboard")}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white sm:hidden dark:border-slate-800 dark:bg-slate-950"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
              pathname === item.href ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            <span aria-hidden="true" className="text-lg">
              {item.icon}
            </span>
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>
    </>
  );
}
