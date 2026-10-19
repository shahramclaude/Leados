"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAppContext } from "@/lib/AppContext";
import { NAV_ITEMS } from "@/lib/nav";
import CommandPalette from "./CommandPalette";
import NotificationTray from "./NotificationTray";

function isActiveRoute(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Shell must render cleanly even before the first orchestrator fetch
  // resolves — `result` starts out null and every read below is guarded.
  const { result, lastUpdated, sseConnected, isRunning, triggerRun } = useAppContext();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const unreadCount = result ? result.notifications.filter((n) => !n.read).length : 0;

  return (
    <div className="flex min-h-screen bg-[#0a0c10] text-slate-100">
      <nav className="sticky top-0 flex h-screen w-16 flex-col items-center justify-between border-r border-slate-800 bg-[#0d1016] py-4">
        <div className="flex flex-col items-center gap-3">
          {NAV_ITEMS.map((item) => {
            const active = isActiveRoute(pathname, item.href);
            const badge = result?.domainHealth[item.domain]?.criticalFindings ?? 0;
            return (
              <div key={item.href} className="group relative flex flex-col items-center">
                <Link
                  href={item.href}
                  className={`relative flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-colors ${
                    active ? "bg-indigo-500/10 text-indigo-400" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {badge > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                      {badge}
                    </span>
                  )}
                  <span className="sr-only">{item.label}</span>
                </Link>
                <span className={`mt-1 h-1.5 w-1.5 rounded-full ${active ? "bg-indigo-400" : "bg-transparent"}`} />
                <span className="pointer-events-none absolute left-14 z-20 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void triggerRun()}
            disabled={isRunning}
            title="Trigger autonomous run"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
          >
            <span aria-hidden>{isRunning ? "\u2026" : "\u26A1"}</span>
            <span className="sr-only">Trigger autonomous run</span>
          </button>
          <Link
            href="/about"
            title="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-slate-400 hover:text-slate-200"
          >
            <span aria-hidden>{"\u2699"}</span>
            <span className="sr-only">Settings</span>
          </Link>
        </div>
      </nav>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-800 bg-[#0d1016] px-6 py-3">
          <span className="text-xs text-slate-500">
            {sseConnected ? "\u25CF live" : "\u25CB offline"}
            {lastUpdated ? ` \u00b7 updated ${lastUpdated.toLocaleTimeString()}` : " \u00b7 loading\u2026"}
          </span>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-slate-500"
          >
            {"\u2318K search"}
          </button>
          <button
            type="button"
            onClick={() => setTrayOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-lg text-slate-300 hover:bg-slate-800"
            aria-label="Notifications"
          >
            <span aria-hidden>{"\uD83D\uDD14"}</span>
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </header>
        <main className="flex-1 bg-[#10131a] p-6">{children}</main>
      </div>

      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} onNavigate={(href) => router.push(href)} />
      )}
      <NotificationTray open={trayOpen} onClose={() => setTrayOpen(false)} />
    </div>
  );
}
