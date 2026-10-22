"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/AppProviders";
import { t } from "@/lib/i18n";
import { NAV_ITEMS } from "@/lib/nav";
import { SyncDrawer } from "@/components/SyncDrawer";
import { DevTenantSwitcher } from "@/components/DevTenantSwitcher";

type DemoUser = { orgSlug: string; orgName: string; orgId: string; role: string; userId: string };

export function AppShell({
  orgName,
  logoEmoji,
  isAdmin,
  currentUserId,
  demoUsers,
  children,
}: {
  orgName: string;
  logoEmoji: string;
  isAdmin: boolean;
  currentUserId: string;
  demoUsers: DemoUser[];
  children: React.ReactNode;
}) {
  const { locale, term } = useApp();
  const pathname = usePathname();

  const navLabel = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.domain === "people") return term("people", t(locale, item.key));
    if (item.domain === "finance") return term("finance", t(locale, item.key));
    if (item.domain === "strategy") return term("strategy", t(locale, item.key));
    return t(locale, item.key);
  };

  const primaryItems = NAV_ITEMS.filter((item) => item.section === "primary");
  const secondaryItems = NAV_ITEMS.filter((item) => item.section === "secondary" && (!item.minRoleHint || isAdmin));

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <a href="#main-content" className="lx-skip-link">
        {t(locale, "a11y.skipToContent")}
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span aria-hidden="true">{logoEmoji}</span>
            <span>{orgName}</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {[...primaryItems, ...secondaryItems].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`lx-tap-target inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname === item.href ? "bg-[color:var(--accent)] text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                {navLabel(item)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <DevTenantSwitcher options={demoUsers} currentUserId={currentUserId} />
            <SyncDrawer />
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:pb-10">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
        aria-label="Primary"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {primaryItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`lx-tap-target flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
              pathname === item.href ? "text-[color:var(--accent)]" : "text-slate-600"
            }`}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <span className="text-xl" aria-hidden="true">
              {item.icon}
            </span>
            {navLabel(item)}
          </Link>
        ))}
        <Link
          href="/settings"
          className={`lx-tap-target flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
            pathname === "/settings" ? "text-[color:var(--accent)]" : "text-slate-600"
          }`}
        >
          <span className="text-xl" aria-hidden="true">
            ⚙️
          </span>
          {t(locale, "nav.settings")}
        </Link>
      </nav>
    </div>
  );
}
