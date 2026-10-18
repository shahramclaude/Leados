"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/lib/AppContext";
import CommandPalette from "@/components/leados/CommandPalette";
import {
  TodayIcon,
  IntelligenceIcon,
  SignalIcon,
  PeopleIcon,
  DecisionIcon,
  MetricsIcon,
  ScenarioIcon,
  MemoryIcon,
  PlaybookIcon,
  WorkQueueIcon,
  SettingsIcon,
  SearchIcon,
  BellIcon,
} from "@/components/leados/icons";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
  badge?: number;
}

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { intelligence, unreadCount, decisionHealth, lastUpdated } = useAppContext();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const overdueDecisions = decisionHealth.overdueCount;

  const primaryNav: NavItem[] = [{ href: "/leados", label: "Today", icon: TodayIcon }];

  const moduleNav: NavItem[] = [
    { href: "/leados/intelligence", label: "Intelligence", icon: IntelligenceIcon, badge: intelligence.criticalFindingsCount },
    { href: "/leados/signals", label: "Signal Board", icon: SignalIcon },
    { href: "/leados/people", label: "People", icon: PeopleIcon },
    { href: "/leados/decisions", label: "Decisions", icon: DecisionIcon, badge: overdueDecisions },
    { href: "/leados/metrics", label: "Metrics", icon: MetricsIcon },
    { href: "/leados/scenarios", label: "Scenarios", icon: ScenarioIcon },
    { href: "/leados/memory", label: "Memory & Insights", icon: MemoryIcon },
    { href: "/leados/playbooks", label: "Playbooks", icon: PlaybookIcon },
    { href: "/leados/queue", label: "Work Queue", icon: WorkQueueIcon, badge: unreadCount },
  ];

  const bottomNav: NavItem[] = [{ href: "/leados/settings", label: "Settings", icon: SettingsIcon }];

  const isActive = (href: string) => (href === "/leados" ? pathname === "/leados" : pathname.startsWith(href));

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
          active ? "bg-indigo-500/15 text-indigo-200" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <Icon className={active ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300"} />
          {item.label}
        </span>
        {!!item.badge && item.badge > 0 && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            active ? "bg-indigo-400/30 text-indigo-100" : "bg-slate-700 text-slate-200"
          }`}>
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0a0c10] text-slate-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-[#0d1016] px-3 py-4">
        <div className="mb-4 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-sm font-bold text-indigo-300">
            L
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">Leados</p>
            <p className="text-[11px] text-slate-500">Intelligence Shell</p>
          </div>
        </div>

        <button
          onClick={() => setPaletteOpen(true)}
          className="mb-4 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200"
        >
          <span className="flex items-center gap-2">
            <SearchIcon className="text-slate-500" />
            Search or run command
          </span>
          <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {primaryNav.map(renderItem)}
          <div className="my-2 border-t border-slate-800" />
          {moduleNav.map(renderItem)}
          <div className="my-2 border-t border-slate-800" />
          {bottomNav.map(renderItem)}
        </nav>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <BellIcon className="h-3.5 w-3.5" />
            Updated
          </span>
          <span>{formatRelative(lastUpdated)}</span>
        </div>
      </aside>

      <main className="relative flex-1 overflow-y-auto">{children}</main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export function formatRelative(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
