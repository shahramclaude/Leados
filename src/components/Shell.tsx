"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useApp } from "@/lib/AppContext";
import { useNowTick } from "@/lib/useNowTick";
import { APP_ROUTES } from "@/lib/routes";
import { healthColor } from "@/lib/domains";
import type { Domain } from "@/lib/types";
import CommandPalette from "@/components/CommandPalette";
import NotificationDrawer from "@/components/NotificationDrawer";
import SidePanel from "@/components/SidePanel";

function minutesAgo(date: Date | null, now: number): number {
  if (!date) return 0;
  return Math.max(0, Math.floor((now - date.getTime()) / 60000));
}

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const now = useNowTick();
  const {
    orchestratorResult,
    agentStatus,
    lastUpdated,
    sseConnected,
    isRunning,
    criticalCount,
    urgentCount,
    triggerRun,
    setCommandPaletteOpen,
    setNotificationDrawerOpen,
  } = useApp();

  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("leados-rail-collapsed");
    if (stored === "1") setRailCollapsed(true);
  }, []);

  function toggleRail() {
    setRailCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("leados-rail-collapsed", next ? "1" : "0");
      return next;
    });
  }

  const domainAlerts = useMemo(() => {
    const map = new Map<Domain, { sev5: boolean; sev4: boolean; count: number }>();
    if (!orchestratorResult) return map;
    for (const f of orchestratorResult.findings) {
      if (f.dismissed || f.severity < 4) continue;
      const entry = map.get(f.domain) ?? { sev5: false, sev4: false, count: 0 };
      entry.count += 1;
      if (f.severity >= 5) entry.sev5 = true;
      else entry.sev4 = true;
      map.set(f.domain, entry);
    }
    return map;
  }, [orchestratorResult]);

  const orgHealthScore = orchestratorResult?.orgHealthScore ?? 0;
  const cascadeRiskPct = Math.round((orchestratorResult?.cascadeRisk ?? 0) * 100);
  const cascadeColor = cascadeRiskPct > 50 ? "var(--sev-5)" : cascadeRiskPct > 30 ? "var(--sev-4)" : "var(--good)";
  const agentColor =
    agentStatus?.status === "running" ? "var(--good)" : agentStatus?.status === "degraded" ? "var(--sev-5)" : "var(--text-dim)";
  const totalAlerts = criticalCount + urgentCount;
  const mins = minutesAgo(lastUpdated, now);

  const mobileRoutes = APP_ROUTES.filter((r) => r.mobilePrimary);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* HEADER BAR ----------------------------------------------------- */}
      <header className="z-50 flex h-10 shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3">
        <span className="font-mono text-sm font-bold tracking-[0.25em] text-indigo-400">LEADOS</span>

        <div className="hidden items-center gap-1 sm:flex">
          <span
            className="font-mono text-xl font-bold leading-none"
            style={{ color: healthColor(orgHealthScore) }}
          >
            {orgHealthScore}
          </span>
          <span className="font-mono text-[9px] tracking-widest text-slate-500">HEALTH</span>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          <span className="font-mono text-xs font-bold" style={{ color: cascadeColor }}>
            CASCADE {cascadeRiskPct}%
          </span>
        </div>

        <div className="hidden items-center gap-1.5 lg:flex">
          <span
            className={`h-1.5 w-1.5 rounded-full ${sseConnected ? "leados-pulse-dot" : ""}`}
            style={{ backgroundColor: sseConnected ? "var(--good)" : "var(--sev-5)" }}
          />
          <span className="font-mono text-[10px] tracking-wider text-slate-400">
            UPDATED {mins}M AGO
          </span>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => triggerRun()}
          disabled={isRunning}
          className="flex h-7 min-w-11 items-center gap-1.5 rounded bg-indigo-700 px-2.5 font-mono text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
        >
          {isRunning ? <span className="leados-spin inline-block h-3 w-3 rounded-full border-2 border-white border-t-transparent" /> : "⚡"}
          <span className="hidden sm:inline">RUN</span>
        </button>

        <button
          onClick={() => setNotificationDrawerOpen(true)}
          className="relative flex h-9 w-9 items-center justify-center rounded text-slate-300 hover:bg-slate-800"
          aria-label="Notifications"
        >
          <span aria-hidden>🔔</span>
          {totalAlerts > 0 && (
            <span
              className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold text-black"
              style={{ backgroundColor: criticalCount > 0 ? "var(--sev-5)" : "var(--sev-4)" }}
            >
              {totalAlerts}
            </span>
          )}
        </button>

        <div className="hidden items-center gap-1.5 md:flex">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: agentColor }} />
          <span className="font-mono text-[10px] tracking-wider text-slate-400">
            AGENT {(agentStatus?.status ?? "idle").toUpperCase()}
          </span>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* NAV RAIL (desktop) ------------------------------------------ */}
        <nav
          className={`z-40 hidden shrink-0 flex-col items-center overflow-hidden border-r border-[var(--border-subtle)] bg-[#0d1016] py-3 transition-[width] duration-150 md:flex ${
            railCollapsed ? "w-0 border-r-0" : "w-14"
          }`}
        >
          <div className="flex flex-1 flex-col items-center gap-3">
            {APP_ROUTES.map((route) => {
              const active = pathname === route.path;
              const alert = route.domain ? domainAlerts.get(route.domain) : undefined;
              return (
                <Link
                  key={route.path}
                  href={route.path}
                  className={`relative flex h-11 w-11 items-center justify-center text-xl ${
                    active ? "border-l-2 border-indigo-500 text-indigo-400" : "border-l-2 border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                  title={route.label}
                >
                  <span aria-hidden>{route.icon}</span>
                  {alert && (
                    <span
                      className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 font-mono text-[8px] font-bold text-black"
                      style={{ backgroundColor: alert.sev5 ? "var(--sev-5)" : "var(--sev-4)" }}
                    >
                      {alert.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="flex flex-col items-center gap-2 border-t border-[var(--border-subtle)] pt-2">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="flex h-11 w-11 items-center justify-center text-lg text-slate-400 hover:text-slate-200"
              title="Command palette (⌘K)"
            >
              ⌘
            </button>
            <Link
              href="/about"
              className="flex h-11 w-11 items-center justify-center text-lg text-slate-400 hover:text-slate-200"
              title="Settings"
            >
              ⚙
            </Link>
            <button
              onClick={toggleRail}
              className="flex h-11 w-11 items-center justify-center text-lg text-slate-400 hover:text-slate-200"
              title="Collapse rail"
            >
              ⁻
            </button>
          </div>
        </nav>

        {railCollapsed && (
          <button
            onClick={toggleRail}
            className="fixed left-0 top-1/2 z-40 hidden h-11 w-4 -translate-y-1/2 items-center justify-center rounded-r bg-[#0d1016] text-slate-400 hover:text-slate-200 md:flex"
            title="Expand rail"
          >
            +
          </button>
        )}

        {/* MAIN CONTENT --------------------------------------------------- */}
        <main className="min-h-0 flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
      </div>

      {/* MOBILE BOTTOM TAB BAR ------------------------------------------ */}
      <nav className="z-40 flex h-[52px] shrink-0 border-t border-[var(--border-subtle)] bg-[#0d1016] md:hidden">
        {mobileRoutes.map((route) => {
          const active = pathname === route.path;
          const alert = route.domain ? domainAlerts.get(route.domain) : undefined;
          return (
            <Link
              key={route.path}
              href={route.path}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-lg ${
                active ? "text-indigo-400" : "text-slate-400"
              }`}
            >
              <span aria-hidden>{route.icon}</span>
              <span className="font-mono text-[8px] tracking-wide">{route.label.toUpperCase()}</span>
              {alert && (
                <span
                  className="absolute right-3 top-1 h-2 w-2 rounded-full"
                  style={{ backgroundColor: alert.sev5 ? "var(--sev-5)" : "var(--sev-4)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <CommandPalette />
      <NotificationDrawer />
      <SidePanel />
    </div>
  );
}
