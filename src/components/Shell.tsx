import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DomainKey, OrgDataset } from "../lib/types";
import {
  computeCascadeRisk,
  detectCascades,
} from "../lib/causalInference";
import {
  computeEnergy,
  computeResonance,
  fastestDomain,
  healthiestDomain,
  measureOrgEntropy,
} from "../lib/orgPhysics";
import { computeOrgHealthScore } from "../lib/brain";
import { cascadeBand, entropyBand, healthBand, minutesAgo, timeAgo, timeUntil, domainColorVar, domainName } from "../lib/shared";
import { cn } from "../utils/cn";
import { Dot, GlyphSpin, LiveDot, Meter, SectionLabel, Tooltip } from "./primitives";
import { PhysicsMeter, PhysicsTextRow } from "./PhysicsMeter";
import { CommandPalette } from "./CommandPalette";
import { BOTTOM_TAB_ROUTES, PALETTE_ROUTES, ROUTES, type RouteKey } from "./routes";

// ─────────────────────────────────────────────────────────────
// Shell — fixed three-region viewport: header, nav rail, intel
// rail, wrapping a scrollable workspace. Rebuilt from scratch
// per "The Living Dark Interface" spec.
// ─────────────────────────────────────────────────────────────

export function Shell({
  dataset,
  route,
  onNavigate,
  isRunning,
  onRunAnalysis,
  children,
}: {
  dataset: OrgDataset;
  route: RouteKey;
  onNavigate: (r: RouteKey) => void;
  isRunning: boolean;
  onRunAnalysis: () => void;
  children: ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [physicsModalOpen, setPhysicsModalOpen] = useState(false);
  const [mobileIntelOpen, setMobileIntelOpen] = useState(false);
  const [, setClockTick] = useState(0);

  // Live timestamp ticker: forces "Xm ago" readouts to advance without
  // requiring a data refresh. This is the "always visibly running" clock.
  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { domains, findings, causalLinks, lastRunAt } = dataset;

  const orgHealthScore = useMemo(() => computeOrgHealthScore(domains), [domains]);
  const { riskPct: cascadeRiskPct, topLinks } = useMemo(
    () => computeCascadeRisk(causalLinks, findings),
    [causalLinks, findings]
  );
  const entropy = useMemo(() => measureOrgEntropy(domains, findings), [domains, findings]);
  const energy = useMemo(() => computeEnergy(findings), [findings]);
  const resonance = useMemo(() => computeResonance(domains), [domains]);
  const fastest = useMemo(() => fastestDomain(domains), [domains]);
  const healthiest = useMemo(() => healthiestDomain(domains), [domains]);

  const health = healthBand(orgHealthScore);
  const stale = minutesAgo(lastRunAt) > 60;

  const sev5 = findings.filter((f) => f.sev === 5).sort((a, b) => b.sev - a.sev)[0];
  const next48h = useMemo<{ id: string; label: string; text: string; domain: DomainKey }[]>(() => {
    const now = Date.now();
    const horizon = now + 48 * 3_600_000;
    const sevItems = findings
      .filter((f) => f.sev >= 4)
      .map((f) => ({ id: f.id, label: `SEV ${f.sev}`, text: f.title, domain: f.domain }));
    const decisionItems = dataset.decisions
      .filter((d) => new Date(d.deadline).getTime() < horizon)
      .map((d) => ({ id: d.id, label: timeUntil(d.deadline), text: d.title, domain: d.domain }));
    return [...sevItems, ...decisionItems].slice(0, 4);
  }, [findings, dataset.decisions]);

  const hypOpen = dataset.hypotheses.filter((h) => h.status === "open").length;
  const hypConfirmedThisMonth = dataset.hypotheses.filter((h) => {
    if (h.status !== "confirmed" || !h.resolvedAt) return false;
    return Date.now() - new Date(h.resolvedAt).getTime() < 30 * 86400_000;
  }).length;
  const hypConfirmed = dataset.hypotheses.filter((h) => h.status === "confirmed").length;
  const hypRefuted = dataset.hypotheses.filter((h) => h.status === "refuted").length;
  const confirmationRate = hypConfirmed + hypRefuted > 0 ? Math.round((hypConfirmed / (hypConfirmed + hypRefuted)) * 100) : 0;

  // alert counts per domain, sev>=4, used for nav rail badges
  const alertsByDomain = useMemo(() => {
    const map = new Map<string, { count: number; sev: 4 | 5 }>();
    for (const f of findings) {
      if (f.sev < 4) continue;
      const existing = map.get(f.domain);
      if (!existing || f.sev > existing.sev) {
        map.set(f.domain, { count: (existing?.count ?? 0) + 1, sev: f.sev as 4 | 5 });
      } else {
        map.set(f.domain, { count: existing.count + 1, sev: existing.sev });
      }
    }
    return map;
  }, [findings]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#080a0e] text-[color:var(--text-primary)]">
      <Header
        orgHealthScore={orgHealthScore}
        health={health}
        cascadeRiskPct={cascadeRiskPct}
        entropy={entropy.compositeEntropy}
        healthiestColorVar={healthiest ? domainColorVar(healthiest.key) : "--text-accent"}
        lastRunAt={lastRunAt}
        stale={stale}
        isRunning={isRunning}
        onRunAnalysis={onRunAnalysis}
        onOpenPhysics={() => setPhysicsModalOpen(true)}
        onToggleMobileIntel={() => setMobileIntelOpen((v) => !v)}
      />

      <div className="flex min-h-0 flex-1">
        <NavRail route={route} onNavigate={onNavigate} alertsByDomain={alertsByDomain} onOpenPalette={() => setPaletteOpen(true)} />

        <main className="min-w-0 flex-1 overflow-y-auto pb-14 md:pb-0">{children}</main>

        <IntelRail
          sev5={sev5}
          entropy={entropy}
          energy={energy}
          fastest={fastest}
          resonance={resonance}
          next48h={next48h}
          hypOpen={hypOpen}
          hypConfirmedThisMonth={hypConfirmedThisMonth}
          confirmationRate={confirmationRate}
          cascadeRiskPct={cascadeRiskPct}
          topLinks={topLinks}
          mobileOpen={mobileIntelOpen}
          onClose={() => setMobileIntelOpen(false)}
        />
      </div>

      <BottomTabs route={route} onNavigate={onNavigate} alertsByDomain={alertsByDomain} />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={onNavigate} />

      {physicsModalOpen && (
        <PhysicsModal
          onClose={() => setPhysicsModalOpen(false)}
          entropy={entropy}
          energy={energy}
          resonance={resonance}
          fastest={fastest}
        />
      )}
    </div>
  );
}

// ───────────────────────────── HEADER ─────────────────────────────
function Header({
  orgHealthScore,
  health,
  cascadeRiskPct,
  entropy,
  healthiestColorVar,
  lastRunAt,
  stale,
  isRunning,
  onRunAnalysis,
  onOpenPhysics,
  onToggleMobileIntel,
}: {
  orgHealthScore: number;
  health: { color: string; label: string };
  cascadeRiskPct: number;
  entropy: number;
  healthiestColorVar: string;
  lastRunAt: string;
  stale: boolean;
  isRunning: boolean;
  onRunAnalysis: () => void;
  onOpenPhysics: () => void;
  onToggleMobileIntel: () => void;
}) {
  return (
    <header className="z-50 flex h-11 shrink-0 items-center justify-between border-b border-[color:var(--border-subtle)] bg-[#080a0e]/95 px-4 backdrop-blur">
      {/* LEFT: wordmark */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg text-[color:var(--text-accent)]">⬡</span>
        <span className="font-mono text-sm font-semibold tracking-[0.2em] text-[color:var(--text-primary)]">
          LEADOS
        </span>
        <span className="hidden text-[color:var(--text-muted)] sm:inline">|</span>
      </div>

      {/* CENTER: physics readouts — hidden on mobile to keep header minimal */}
      <div className="hidden items-center gap-6 md:flex">
        <Metric label="ORG HEALTH" value={orgHealthScore} color={health.color} />
        <Tooltip label="Probability of multi-domain failure cascade">
          <Metric label="CASCADE RISK" value={`${cascadeRiskPct}%`} color={cascadeBand(cascadeRiskPct)} />
        </Tooltip>
        <Tooltip label="Composite organizational entropy (disorder)">
          <Metric label="ENTROPY" value={entropy} color={entropyBand(entropy)} />
        </Tooltip>
        <button onClick={onOpenPhysics} className="flex flex-col items-center" title="Physics detail">
          <span className="text-[8px] font-mono tracking-widest text-[color:var(--text-muted)]">PHYSICS</span>
          <GlyphSpin color={`var(${healthiestColorVar})`} size={16} />
        </button>
      </div>

      {/* Mobile: health score only */}
      <div className="flex items-center gap-2 md:hidden">
        <Metric label="HEALTH" value={orgHealthScore} color={health.color} />
      </div>

      {/* RIGHT: run status + action */}
      <div className="flex items-center gap-3">
        <button onClick={onToggleMobileIntel} className="xl:hidden text-[color:var(--text-secondary)]" aria-label="Toggle intel rail">
          ☰
        </button>
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="font-mono text-[9px] text-[color:var(--text-muted)]">
            UPDATED {minutesAgoLabel(lastRunAt)}
          </span>
          <LiveDot ok={!stale} />
        </div>
        <button
          onClick={onRunAnalysis}
          disabled={isRunning}
          className="flex items-center gap-1.5 rounded border border-[color:var(--text-accent)]/30 bg-[color:var(--text-accent)]/10 px-3 py-1 font-mono text-xs text-[color:var(--text-accent)] hover:bg-[color:var(--text-accent)]/20 disabled:opacity-60"
        >
          {isRunning ? (
            <>
              <span className="physics-spin inline-block" style={{ animationDuration: "1s" }}>
                ⚛
              </span>
              RUNNING
            </>
          ) : (
            <>⚡ RUN</>
          )}
        </button>
      </div>
    </header>
  );
}

function minutesAgoLabel(iso: string) {
  const mins = minutesAgo(iso);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  return `${Math.floor(mins / 60)}H AGO`;
}

function Metric({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="font-mono text-[8px] tracking-widest text-[color:var(--text-muted)]">{label}</span>
      <span className="mt-0.5 font-mono text-base font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

// ───────────────────────────── NAV RAIL ─────────────────────────────
function NavRail({
  route,
  onNavigate,
  alertsByDomain,
  onOpenPalette,
}: {
  route: RouteKey;
  onNavigate: (r: RouteKey) => void;
  alertsByDomain: Map<string, { count: number; sev: 4 | 5 }>;
  onOpenPalette: () => void;
}) {
  return (
    <nav className="hidden w-14 shrink-0 flex-col border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] md:flex">
      <div className="flex flex-1 flex-col">
        {ROUTES.map((r) => {
          const active = route === r.key;
          const alert = r.domain ? alertsByDomain.get(r.domain) : undefined;
          return (
            <div key={r.key} className="group relative flex h-14 items-center justify-center">
              <button
                onClick={() => onNavigate(r.key)}
                className={cn(
                  "relative flex h-full w-full items-center justify-center font-mono text-lg transition-colors",
                  active
                    ? "border-l-2 border-[color:var(--text-accent)] bg-[color:var(--text-accent)]/5 text-[color:var(--text-accent)]"
                    : "border-l-2 border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]"
                )}
                aria-label={r.hint}
              >
                {r.glyph}
                {alert && (
                  <span
                    className={cn(
                      "absolute right-2.5 top-2.5 flex h-3.5 w-3.5 items-center justify-center rounded-full font-mono text-[8px] font-bold",
                      alert.sev === 5 ? "bg-[color:var(--sev-5)] text-white" : "bg-[color:var(--sev-4)] text-black"
                    )}
                  >
                    {alert.count}
                  </span>
                )}
              </button>
              {/* Hover tooltip: pure CSS, right of rail */}
              <div className="pointer-events-none absolute left-full top-1/2 z-[70] ml-2 -translate-y-1/2 whitespace-nowrap rounded border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] px-2 py-1 font-mono text-[10px] text-[color:var(--text-secondary)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                {r.hint}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col border-t border-[color:var(--border-subtle)]">
        <button
          onClick={onOpenPalette}
          className="flex h-12 items-center justify-center font-mono text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text-accent)]"
          aria-label="Command palette"
        >
          ⌘
        </button>
        <button
          onClick={() => onNavigate("settings")}
          className={cn(
            "flex h-12 items-center justify-center font-mono text-sm",
            route === "settings" ? "text-[color:var(--text-accent)]" : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]"
          )}
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>
    </nav>
  );
}

// ───────────────────────────── BOTTOM TABS (mobile) ─────────────────────────────
function BottomTabs({
  route,
  onNavigate,
  alertsByDomain,
}: {
  route: RouteKey;
  onNavigate: (r: RouteKey) => void;
  alertsByDomain: Map<string, { count: number; sev: 4 | 5 }>;
}) {
  const tabs = PALETTE_ROUTES.filter((r) => BOTTOM_TAB_ROUTES.includes(r.key));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-12 border-t border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] md:hidden">
      {tabs.map((r) => {
        const active = route === r.key;
        const alert = r.domain ? alertsByDomain.get(r.domain) : undefined;
        return (
          <button
            key={r.key}
            onClick={() => onNavigate(r.key)}
            className={cn(
              "relative flex min-w-[44px] flex-1 items-center justify-center font-mono text-lg",
              active ? "text-[color:var(--text-accent)]" : "text-[color:var(--text-muted)]"
            )}
          >
            {r.glyph}
            {alert && (
              <span
                className={cn(
                  "absolute right-3 top-1 flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold",
                  alert.sev === 5 ? "bg-[color:var(--sev-5)] text-white" : "bg-[color:var(--sev-4)] text-black"
                )}
              >
                {alert.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ───────────────────────────── INTEL RAIL ─────────────────────────────
function IntelRail(props: {
  sev5?: OrgDataset["findings"][number];
  entropy: ReturnType<typeof measureOrgEntropy>;
  energy: ReturnType<typeof computeEnergy>;
  fastest: ReturnType<typeof fastestDomain>;
  resonance: ReturnType<typeof computeResonance>;
  next48h: { id: string; label: string; text: string; domain: DomainKey }[];
  hypOpen: number;
  hypConfirmedThisMonth: number;
  confirmationRate: number;
  cascadeRiskPct: number;
  topLinks: ReturnType<typeof detectCascades>;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const {
    sev5,
    entropy,
    energy,
    fastest,
    resonance,
    next48h,
    hypOpen,
    hypConfirmedThisMonth,
    confirmationRate,
    cascadeRiskPct,
    topLinks,
    mobileOpen,
    onClose,
  } = props;

  const content = (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {sev5 && (
        <div className="sev5-pulse rounded-lg border border-[color:var(--sev-5-border)] bg-[color:var(--sev-5-bg)] p-3">
          <div className="font-mono text-[9px] font-bold tracking-widest text-[color:var(--sev-5)]">⚠ CRITICAL</div>
          <div className="mt-1 line-clamp-2 text-xs font-medium text-[color:var(--text-primary)]">{sev5.title}</div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 font-mono text-[9px] text-[color:var(--text-muted)]">
              <Dot colorVar={domainColorVar(sev5.domain)} size={6} />
              {domainName(sev5.domain)} · {timeAgo(sev5.timestamp)}
            </span>
          </div>
          <a href="#intelligence" className="mt-1.5 inline-block font-mono text-[10px] font-semibold text-[color:var(--sev-5)]">
            ACT NOW →
          </a>
        </div>
      )}

      <section className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
        <SectionLabel className="mb-2">Physics Dashboard</SectionLabel>
        <div className="space-y-2.5">
          <PhysicsMeter glyph="⚛" label="Entropy" value={entropy.compositeEntropy} color={entropyBand(entropy.compositeEntropy)} />
          <PhysicsMeter glyph="◉" label="Energy" value={energy.level} display={`${energy.totalEnergy}`} color="var(--text-code)" />
          <PhysicsTextRow glyph="⟶" label="Velocity" color="var(--text-accent)">
            {fastest ? (
              <>
                {domainName(fastest.key)} {fastest.velocity >= 0 ? "↑" : "↓"} {Math.abs(fastest.velocity).toFixed(1)}/wk
              </>
            ) : (
              "no movement"
            )}
          </PhysicsTextRow>
          <PhysicsTextRow glyph="∿" label="Resonance" color="var(--text-code)">
            {resonance.pairs.length ? (
              <>
                {domainName(resonance.pairs[0].a.key)} ∿ {domainName(resonance.pairs[0].b.key)} ({Math.round(resonance.pairs[0].strength * 100)}%)
              </>
            ) : (
              "none detected"
            )}
          </PhysicsTextRow>
        </div>
      </section>

      <section className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
        <SectionLabel className="mb-2">Next 48h</SectionLabel>
        <div className="space-y-2">
          {next48h.length === 0 && <div className="text-xs text-[color:var(--text-muted)]">Nothing time-critical.</div>}
          {next48h.map((item) => (
            <label key={item.id} className="flex items-start gap-2 text-xs">
              <input type="checkbox" readOnly className="mt-0.5 accent-[color:var(--text-accent)]" />
              <span className="flex-1">
                <span className="mr-1 font-mono text-[9px] font-bold text-[color:var(--text-accent)]">{item.label}</span>
                <span className="text-[color:var(--text-secondary)]">{item.text}</span>
              </span>
              <Dot colorVar={domainColorVar(item.domain)} size={6} className="mt-1" />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
        <SectionLabel className="mb-2">Hypotheses</SectionLabel>
        <div className="flex items-baseline justify-between font-mono">
          <span className="text-lg font-bold text-[color:var(--text-primary)]">{hypOpen}</span>
          <span className="text-[9px] text-[color:var(--text-muted)]">OPEN</span>
        </div>
        <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-[color:var(--text-secondary)]">
          <span>{hypConfirmedThisMonth} confirmed this month</span>
          <span className="text-[color:var(--text-code)]">{confirmationRate}% confirm rate</span>
        </div>
        <a href="#knowledge" className="mt-2 inline-block font-mono text-[10px] text-[color:var(--text-accent)] hover:underline">
          → Hypothesis Tracker
        </a>
      </section>

      <section className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
        <SectionLabel className="mb-2">Cascade Risk Monitor</SectionLabel>
        <div className="font-mono text-2xl font-bold" style={{ color: cascadeBand(cascadeRiskPct) }}>
          {cascadeRiskPct}%
        </div>
        {cascadeRiskPct === 0 ? (
          <div className="mt-1 font-mono text-[10px] text-[color:var(--health-green)]">✓ NO CASCADE DETECTED</div>
        ) : (
          <div className="mt-2 space-y-2">
            {topLinks.slice(0, 3).map((l) => (
              <div key={`${l.fromRuleId}-${l.toRuleId}`}>
                <div className="font-mono text-[10px] text-[color:var(--text-secondary)]">
                  {l.fromRuleId} → {l.toRuleId}
                </div>
                <Meter value={l.strength * 100} color="var(--health-amber)" />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[280px] shrink-0 border-l border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] xl:block">
        {content}
      </aside>
      {/* Mobile/tablet drawer */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-[80] w-[280px] border-l border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] xl:hidden",
          mobileOpen ? "drawer-enter" : "drawer-exit"
        )}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] p-2">
          <SectionLabel>Intel Rail</SectionLabel>
          <button onClick={onClose} className="px-2 font-mono text-[color:var(--text-muted)]">
            ✕
          </button>
        </div>
        {content}
      </div>
      {mobileOpen && <div className="fixed inset-0 z-[75] bg-black/50 xl:hidden" onClick={onClose} />}
    </>
  );
}

// ───────────────────────────── PHYSICS MODAL ─────────────────────────────
function PhysicsModal({
  onClose,
  entropy,
  energy,
  resonance,
  fastest,
}: {
  onClose: () => void;
  entropy: ReturnType<typeof measureOrgEntropy>;
  energy: ReturnType<typeof computeEnergy>;
  resonance: ReturnType<typeof computeResonance>;
  fastest: ReturnType<typeof fastestDomain>;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-[color:var(--border-default)] bg-[color:var(--bg-panel)] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-sm font-semibold text-[color:var(--text-accent)]">
            <GlyphSpin /> ORG PHYSICS STATUS
          </div>
          <button onClick={onClose} className="font-mono text-[color:var(--text-muted)]">
            ✕
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <PhysicsMeter glyph="⚛" label="Entropy" value={entropy.compositeEntropy} color={entropyBand(entropy.compositeEntropy)} />
          <PhysicsMeter glyph="◉" label="Energy" value={energy.level} display={`${energy.totalEnergy}`} color="var(--text-code)" />
        </div>
        <div className="mt-3 font-mono text-[11px] text-[color:var(--text-secondary)]">
          Fastest moving domain:{" "}
          <span style={{ color: fastest ? `var(${fastest.colorVar})` : undefined }}>
            {fastest ? domainName(fastest.key) : "—"}
          </span>
        </div>
        <div className="mt-3">
          <SectionLabel className="mb-1">Resonant pairs</SectionLabel>
          {resonance.pairs.length === 0 && <div className="text-xs text-[color:var(--text-muted)]">none detected</div>}
          {resonance.pairs.slice(0, 4).map((p) => (
            <div key={`${p.a.key}-${p.b.key}`} className="flex items-center justify-between py-0.5 font-mono text-[11px] text-[color:var(--text-secondary)]">
              <span>
                {domainName(p.a.key)} ∿ {domainName(p.b.key)}
              </span>
              <span className="text-[color:var(--text-code)]">{Math.round(p.strength * 100)}%</span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-[color:var(--border-subtle)] pt-2 font-mono text-[9px] uppercase tracking-wide text-[color:var(--text-muted)]">
          All physics outputs are heuristic (low confidence) — directional signals, not calibrated measurements.
        </div>
      </div>
    </div>
  );
}
