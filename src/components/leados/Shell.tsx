"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { navItems } from "./nav";
import ProactiveRail from "./ProactiveRail";
import Badge from "./ui/Badge";
import ProgressRing from "./ui/ProgressRing";
import Tooltip from "./ui/Tooltip";
import CommandPalette, { type CommandItem } from "./ui/CommandPalette";
import ToastStack, { type ToastItem } from "./ui/ToastStack";
import { domainColor, domainLabel, type DomainKey } from "./ui/tokens";
import { IconBell, IconMenu, IconSearch, IconLeadosMark } from "./icons";
import { findings, people, metrics, decisions, playbooks, compositeHealth } from "@/lib/leados/data";

function domainStatus(domain: DomainKey) {
  const domainMetrics = metrics.filter((m) => m.domain === domain);
  if (domainMetrics.some((m) => m.status === "red")) return "red" as const;
  if (domainMetrics.some((m) => m.status === "yellow")) return "yellow" as const;
  return "green" as const;
}

const statusDotColor: Record<"green" | "yellow" | "red", string> = {
  green: "var(--status-green)",
  yellow: "var(--status-yellow)",
  red: "var(--status-red)",
};

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [lastSync, setLastSync] = useState<string>("—");

  const { composite, byDomain } = useMemo(() => {
    const result = compositeHealth();
    return { composite: result.composite, byDomain: result.byDomain };
  }, []);

  const cognitiveLoad = useMemo(() => {
    const openCount = findings.filter((f) => f.status !== "resolved").length;
    const criticalCount = findings.filter((f) => f.severity === "sev5" && f.status !== "resolved").length;
    const score = Math.min(100, openCount * 10 + criticalCount * 15);
    return { score, level: score >= 60 ? "high" : score >= 30 ? "moderate" : "low" } as const;
  }, []);

  const unread = findings.filter((f) => f.status === "open").length;

  useEffect(() => {
    setLastSync(
      new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date())
    );
    const id = setTimeout(() => {
      setToasts((prev) => [
        ...prev,
        { id: "sync-1", title: "Workspace synced", message: "All domains refreshed just now.", variant: "success" },
      ]);
    }, 600);
    return () => clearTimeout(id);
  }, []);

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const commandItems: CommandItem[] = useMemo(() => {
    const navCommands: CommandItem[] = navItems.map((item) => ({
      id: `nav-${item.id}`,
      title: item.label,
      section: "Navigation",
      subtitle: item.description,
      keywords: `${item.label} ${item.description}`,
      icon: item.icon({}),
      onRun: () => router.push(item.href),
    }));
    const peopleCommands: CommandItem[] = people.map((p) => ({
      id: `person-${p.id}`,
      title: p.name,
      section: "People",
      subtitle: p.role,
      keywords: `${p.name} ${p.role}`,
      onRun: () => router.push("/leados/signals"),
    }));
    const metricCommands: CommandItem[] = metrics.map((m) => ({
      id: `metric-${m.id}`,
      title: m.label,
      section: "Metrics",
      subtitle: `${m.value}${m.unit}`,
      keywords: m.label,
      onRun: () => router.push("/leados/thermodynamics"),
    }));
    const decisionCommands: CommandItem[] = decisions.map((d) => ({
      id: `decision-${d.id}`,
      title: d.title,
      section: "Decisions",
      subtitle: d.owner,
      keywords: d.title,
      onRun: () => router.push("/leados/now"),
    }));
    const playbookCommands: CommandItem[] = playbooks.map((p) => ({
      id: `playbook-${p.id}`,
      title: p.name,
      section: "Playbooks",
      subtitle: p.description,
      keywords: p.name,
      onRun: () => router.push("/leados/cas"),
    }));
    return [...navCommands, ...peopleCommands, ...metricCommands, ...decisionCommands, ...playbookCommands];
  }, [router]);

  function renderNav(showLabels: boolean) {
    return (
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <button
              key={item.id}
              onClick={() => {
                router.push(item.href);
                setMobileNavOpen(false);
              }}
              className="group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:outline-none"
              style={{
                backgroundColor: active ? "var(--bg-elevated)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute -left-2 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r"
                  style={{ backgroundColor: "var(--accent-blue)" }}
                />
              )}
              <span className="shrink-0">{item.icon({ className: "h-[18px] w-[18px]" })}</span>
              {showLabels && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate" style={{ fontSize: "var(--fs-sm)" }}>
                    {item.label}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  function HealthWidget({ showLabels }: { showLabels: boolean }) {
    return (
      <div
        className="flex items-center gap-3 border-t px-3 py-3"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <ProgressRing value={composite} size="sm" color="var(--accent-blue)" />
        {showLabels && (
          <div className="min-w-0 flex-1">
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>Composite Health</p>
            <div className="mt-1 flex items-center gap-1.5">
              {byDomain.slice(0, 3).map((d) => (
                <Tooltip key={d.domain} content={`${domainLabel[d.domain]} · ${domainStatus(d.domain)}`}>
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: statusDotColor[domainStatus(d.domain)] }}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Desktop / tablet sidebar */}
      <aside
        className="hidden shrink-0 flex-col border-r md:flex md:w-14 lg:w-56"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2.5 border-b px-3 py-4" style={{ borderColor: "var(--border-subtle)" }}>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: "color-mix(in srgb, var(--accent-blue) 18%, transparent)", color: "var(--accent-blue)" }}
          >
            <IconLeadosMark width={18} height={18} />
          </span>
          <span className="hidden min-w-0 lg:block">
            <span className="font-data block truncate font-bold tracking-tight" style={{ color: "var(--text-primary)", fontSize: "var(--fs-base)" }}>
              LEADOS
            </span>
            <span className="block truncate" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>
              Intelligence Workspace
            </span>
          </span>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto py-3">
          <div className="hidden lg:block">{renderNav(true)}</div>
          <div className="lg:hidden">{renderNav(false)}</div>
        </div>

        <div className="hidden lg:block">
          <HealthWidget showLabels />
        </div>
        <div className="lg:hidden">
          <HealthWidget showLabels={false} />
        </div>
      </aside>

      {/* Mobile overlay sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(4, 6, 12, 0.65)" }}
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            className="relative flex h-full w-60 flex-col border-r animate-slide-in-right"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2.5 border-b px-3 py-4" style={{ borderColor: "var(--border-subtle)" }}>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: "color-mix(in srgb, var(--accent-blue) 18%, transparent)", color: "var(--accent-blue)" }}
              >
                <IconLeadosMark width={18} height={18} />
              </span>
              <span className="font-data font-bold tracking-tight" style={{ color: "var(--text-primary)", fontSize: "var(--fs-base)" }}>
                LEADOS
              </span>
            </div>
            <div className="flex-1 overflow-y-auto py-3">{renderNav(true)}</div>
            <HealthWidget showLabels />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header
          className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4"
          style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="flex h-7 w-7 items-center justify-center rounded-md border md:hidden focus-visible:outline-none"
              style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
            >
              <IconMenu width={15} height={15} />
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors focus-visible:outline-none"
              style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)" }}
            >
              <IconSearch width={13} height={13} />
              <span style={{ fontSize: "var(--fs-xs)" }}>Search…</span>
              <kbd
                className="font-data ml-2 rounded border px-1"
                style={{ borderColor: "var(--border-default)", fontSize: 10 }}
              >
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Tooltip content={`Cognitive load: ${cognitiveLoad.level}`}>
              <Badge
                variant={cognitiveLoad.level === "high" ? "sev4" : cognitiveLoad.level === "moderate" ? "sev3" : "sev2"}
                label={`Load · ${cognitiveLoad.score}`}
                size="sm"
              />
            </Tooltip>

            <button
              aria-label={`${unread} unread findings`}
              className="relative flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none"
              style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
            >
              <IconBell width={14} height={14} />
              {unread > 0 && (
                <span
                  className="font-data absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5"
                  style={{ backgroundColor: "var(--sev5)", color: "#fff", fontSize: 9 }}
                >
                  {unread}
                </span>
              )}
            </button>

            <span className="font-data hidden sm:inline" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>
              Synced {lastSync}
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
          <ProactiveRail findings={findings} collapsed={railCollapsed} onToggle={() => setRailCollapsed((v) => !v)} />
        </div>
      </div>

      <CommandPalette items={commandItems} open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
