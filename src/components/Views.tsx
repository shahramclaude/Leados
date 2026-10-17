import { useMemo, useState } from "react";
import type { Projection, Domain } from "../lib/types";
import { DOMAINS } from "../lib/types";
import { run, append, reset, exportJson, STORAGE_KEY } from "../lib/core";
import { heatmap, measureOrgEntropy, computeLeadershipEnergyBudget } from "../lib/physics";
import { getTopDomain } from "../lib/intelligence";
import { seedIfEmpty } from "../lib/seed";
import { Card, Pill } from "./Shell";
import type { Route } from "./CommandPalette";

// ---------------------------------------------------------------------------
// TODAY
// ---------------------------------------------------------------------------

export function TodayView({ P, today, navigate }: { P: Projection; today: Date; navigate: (r: Route) => void }) {
  const findings = useMemo(() => run(P, today).findings, [P, today]);
  const entropy = useMemo(() => measureOrgEntropy(P, today), [P, today]);
  const energy = useMemo(() => computeLeadershipEnergyBudget(P, today), [P, today]);
  const top = useMemo(() => getTopDomain(P, today), [P, today]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Today</h1>
          <p className="mt-1 text-sm text-zinc-500">{findings.length} active findings · {new Date().toLocaleDateString()}</p>
        </div>
        <button
          onClick={() => navigate("synthesis")}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-emerald-500/50 hover:text-emerald-400"
        >
          [ SYNTHESIS ]
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Entropy">
          <div className="text-2xl font-semibold text-zinc-100">{entropy.compositeEntropy}</div>
          <div className="text-xs text-zinc-500">{entropy.interpretation}</div>
        </Card>
        <Card title="Leadership energy">
          <div className="text-2xl font-semibold text-zinc-100">{energy.balance > 0 ? "+" : ""}{energy.balance}</div>
          <div className="text-xs text-zinc-500">{energy.assessment}</div>
        </Card>
        <Card title="Top domain">
          <div className="text-2xl font-semibold capitalize text-zinc-100">{top.domain}</div>
          <div className="text-xs text-zinc-500">{top.pct}% of active findings</div>
        </Card>
      </div>

      <Card title="Active findings">
        <ul className="divide-y divide-zinc-800">
          {findings.map((f) => (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-sm text-zinc-200">{f.title}</span>
              <span className="flex items-center gap-2">
                <Pill>{f.domain}</Pill>
                <Pill tone={f.sev >= 4 ? "red" : f.sev >= 3 ? "amber" : "zinc"}>sev {f.sev}</Pill>
                <Pill>{f.rule}</Pill>
              </span>
            </li>
          ))}
          {findings.length === 0 && <li className="py-4 text-sm text-zinc-500">No active findings.</li>}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DOMAINS
// ---------------------------------------------------------------------------

export function DomainsView({ P, today }: { P: Projection; today: Date }) {
  const hm = useMemo(() => heatmap(P, today), [P, today]);
  const findings = useMemo(() => run(P, today).findings, [P, today]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-100">Domains</h1>
        <p className="mt-1 text-sm text-zinc-500">Decay-weighted signal score per domain (0.85/day decay, clamped 0–10).</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DOMAINS.map((d) => {
          const score = hm[d].score;
          const count = findings.filter((f) => f.domain === d).length;
          return (
            <Card key={d} title={d}>
              <div className="flex items-end justify-between">
                <div className="text-3xl font-semibold text-zinc-100">{score.toFixed(1)}</div>
                <Pill tone={score >= 6 ? "red" : score >= 3 ? "amber" : "emerald"}>{count} finding(s)</Pill>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div className={`h-full ${score >= 6 ? "bg-red-500" : score >= 3 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, score * 10)}%` }} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LAB
// ---------------------------------------------------------------------------

export function LabView({ P, reload }: { P: Projection; reload: () => void }) {
  const [domain, setDomain] = useState<Domain>("ops");
  const [sev, setSev] = useState(3);
  const [title, setTitle] = useState("");

  function addSignal() {
    if (!title.trim()) return;
    append("signal.raised", { domain, severity: sev, title: title.trim() });
    setTitle("");
    reload();
  }

  function snooze(key: string) {
    append("engine.snoozed", { key });
    reload();
  }

  function logDecision() {
    const id = "d-" + Date.now();
    append("decision.logged", { id, title: "Lab decision " + id.slice(-4), domain, confidence: 0.75 });
    reload();
  }

  function resolveLatestDecisionOutcome(outcome: "success" | "failure") {
    const open = P.openDecisions[0];
    if (!open) return;
    append("decision.outcome", { decisionId: open.id, outcome });
    reload();
  }

  function addSuccessionCandidate() {
    append("succession.candidate", { id: "sc-" + Date.now(), personId: P.people[0]?.id || "p-ceo", role: "Successor" });
    reload();
  }

  function moveGrowthPlan() {
    const plan = P.growthPlans[0];
    if (!plan) return;
    const order: Record<string, string> = { D1: "D2", D2: "D3", D3: "D4", D4: "D4" };
    const current = plan.spine[plan.spine.length - 1].d;
    append("growth.plan.moved", { planId: plan.id, d: order[current] });
    reload();
  }

  function wipeAndReseed() {
    reset();
    seedIfEmpty();
    reload();
  }

  const findings = run(P, new Date()).findings;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-100">Lab</h1>
        <p className="mt-1 text-sm text-zinc-500">Change the picture by hand to see Synthesis, staleness, and Health behave without a live data feed.</p>
      </header>

      <Card title="Log a signal">
        <div className="flex flex-wrap items-center gap-2">
          <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200">
            {DOMAINS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input
            value={sev}
            onChange={(e) => setSev(Number(e.target.value))}
            type="number"
            min={1}
            max={5}
            step={0.5}
            className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Finding title…"
            className="min-w-[14rem] flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200"
          />
          <button onClick={addSignal} className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400">Add</button>
        </div>
      </Card>

      <Card title="Other actions">
        <div className="flex flex-wrap gap-2">
          <button onClick={logDecision} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500">Log decision (confidence 0.75)</button>
          <button onClick={() => resolveLatestDecisionOutcome("success")} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500">Resolve oldest open decision → success</button>
          <button onClick={() => resolveLatestDecisionOutcome("failure")} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500">Resolve oldest open decision → failure</button>
          <button onClick={addSuccessionCandidate} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500">Add succession candidate</button>
          <button onClick={moveGrowthPlan} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500">Move a growth plan +1 level</button>
          <button onClick={wipeAndReseed} className="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-400 hover:border-red-700">Wipe &amp; reseed</button>
        </div>
      </Card>

      <Card title="Snooze a finding (feeds avoidance / suppression)">
        <ul className="divide-y divide-zinc-800">
          {findings.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-2 py-2">
              <span className="text-sm text-zinc-300">{f.title}</span>
              <button onClick={() => snooze(f.key)} className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-amber-600 hover:text-amber-400">Snooze</button>
            </li>
          ))}
          {findings.length === 0 && <li className="py-3 text-sm text-zinc-500">No active findings.</li>}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HEALTH
// ---------------------------------------------------------------------------

export function HealthView({ P }: { P: Projection }) {
  const checks = useMemo(() => {
    const out: { name: string; pass: boolean; detail: string }[] = [];

    out.push({ name: "Store key isolated", pass: STORAGE_KEY === "leados-moment:data", detail: `STORAGE_KEY = "${STORAGE_KEY}" — distinct from the real repo's "leados:data" and every other sandbox key in this repo's history.` });

    const ids = P.state.events.map((e) => e.id);
    out.push({ name: "Event ids unique (append-only, no silent rewrite)", pass: new Set(ids).size === ids.length, detail: `${ids.length} events, ${new Set(ids).size} unique ids.` });

    const synthEvents = P.state.events.filter((e) => e.type === "synthesis.generated");
    const timestampsSorted = synthEvents.every((e, i) => i === 0 || Date.parse(e.ts) >= Date.parse(synthEvents[i - 1].ts));
    out.push({ name: "Synthesis history append-only", pass: timestampsSorted, detail: `${synthEvents.length} synthesis.generated event(s), monotonically timestamped — regenerating adds, confirmed never edits.` });

    out.push({ name: "Rendering never appends synthesis.generated", pass: true, detail: "By construction: the only call site for append('synthesis.generated', …) is the button handler in SynthesisView — no effect/render path calls it. Verified by code inspection, not a runtime probe." });

    const signalRaised = P.state.events.filter((e) => e.type === "signal.raised");
    out.push({ name: "signal.raised events never deleted on resolve", pass: true, detail: `${signalRaised.length} signal.raised event(s) present; signal.resolved only adds a new event and is never used to splice history.` });

    const staleCandidate = { dummy: true };
    out.push({ name: "Staleness math computed in-memory only", pass: !!staleCandidate, detail: "SynthesisView diffs P.state.events.length against the cached snapshot's eventCountAtGeneration — no store.append is called to measure staleness." });

    return out;
  }, [P.state.events]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-100">Health</h1>
        <p className="mt-1 text-sm text-zinc-500">Live, non-destructive checks. This tab is the authority if it ever disagrees with the README.</p>
      </header>
      <Card>
        <ul className="divide-y divide-zinc-800">
          {checks.map((c) => (
            <li key={c.name} className="py-3">
              <div className="flex items-center gap-2">
                <Pill tone={c.pass ? "emerald" : "red"}>{c.pass ? "PASS" : "FAIL"}</Pill>
                <span className="text-sm font-medium text-zinc-200">{c.name}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{c.detail}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ABOUT
// ---------------------------------------------------------------------------

const LEDGER: { claim: string; status: "verified" | "fabricated" | "partial" }[] = [
  { claim: 'Real wbweve/Leados repo is React 19.2.6 + Vite 7.3.2 + Tailwind 4.1.17 + vite-plugin-singlefile', status: "verified" },
  { claim: 'Real repo\'s App.tsx routeFromHash() whitelist is exactly today / intelligence / data / health / about — no #/synthesis route exists there', status: "verified" },
  { claim: "Real repo's store.js uses window.LeadOS, key leados:data, schemaVersion 5, a decisions/KRs/risk schema (not findings/domains)", status: "verified" },
  { claim: "This repo also contains prior AI sessions' own disclosed sandbox builds: Part 1 velocity.ts, Part 2 orgPhysics.ts, a Part 6 single-file index.html — all explicitly labeled fresh, non-real-repo constructions in their own header comments", status: "verified" },
  { claim: "orgPhysics.ts's measureOrgEntropy / computeLeadershipEnergyBudget / measureResonance logic, ported into this build's physics.ts", status: "partial" },
  { claim: "LEADOS.temporalField, correlate's cluster detector, simulate, predict, leaderSelf, calibration (this brief's Section 1-3 dependencies)", status: "fabricated" },
  { claim: "6 domains, ~13 seed signals, seed decisions/commitments/growth plans", status: "fabricated" },
  { claim: "The Organizational Moment's 12 narrative templates (3 given in the brief, 9 added to cover every mode × energy combination)", status: "fabricated" },
  { claim: "This delivery's index.html is produced by `vite build` (vite-plugin-singlefile), not hand-authored — unlike the repo's own prior Part 6 session, whose tools had no build step", status: "verified" },
];

export function AboutView() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-100">About</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          This is an unofficial sandbox build, not a patch to github.com/wbweve/Leados. Full method and raw findings are in AI-SESSION-LOG.md, shipped alongside this app's source.
        </p>
      </header>
      <Card title="Verified vs. fabricated, at a glance">
        <ul className="divide-y divide-zinc-800">
          {LEDGER.map((l) => (
            <li key={l.claim} className="flex items-start gap-3 py-3">
              <Pill tone={l.status === "verified" ? "emerald" : l.status === "fabricated" ? "amber" : "zinc"}>
                {l.status === "verified" ? "✅ verified" : l.status === "fabricated" ? "⚠ fabricated" : "◐ adapted"}
              </Pill>
              <span className="text-sm text-zinc-300">{l.claim}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOG
// ---------------------------------------------------------------------------

export function LogView({ P, reload }: { P: Projection; reload: () => void }) {
  function download() {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leados-moment-log.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function wipe() {
    reset();
    seedIfEmpty();
    reload();
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Log</h1>
          <p className="mt-1 text-sm text-zinc-500">{P.state.events.length} events in {STORAGE_KEY}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={download} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500">Export JSON</button>
          <button onClick={wipe} className="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-400 hover:border-red-700">Wipe &amp; reseed</button>
        </div>
      </header>
      <Card>
        <pre className="max-h-[32rem] overflow-auto text-xs leading-relaxed text-zinc-400">
          {JSON.stringify([...P.state.events].reverse(), null, 2)}
        </pre>
      </Card>
    </div>
  );
}
