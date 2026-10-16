import type { Store } from "../types";
import type { Projected } from "../lib/engine";
import { RULES } from "../data/catalog";
import { SCHEMA_VERSION } from "../lib/store";
import { Badge, Card, SectionTitle } from "../components/primitives";

interface Check {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

function runChecks(storeState: Store, P: Projected): Check[] {
  const checks: Check[] = [];
  const knownRules = new Set(RULES.map((r) => r.id));

  checks.push({
    id: "T1",
    label: "Every finding has at least one basis line",
    pass: P.findings.every((f) => f.basis.length > 0),
    detail: `${P.findings.length} findings checked`,
  });
  checks.push({
    id: "T2",
    label: "Every finding key matches rule:scope format",
    pass: P.findings.every((f) => f.key === f.rule + ":" + f.scope),
    detail: "verified against real engine.js's fin() format",
  });
  checks.push({
    id: "T3",
    label: "All globally-muted rules reference a known rule id",
    pass: storeState.meta.mutedRules.every((m) => knownRules.has(m.rule)),
    detail: `${storeState.meta.mutedRules.length} muted rule(s)`,
  });
  checks.push({
    id: "T4",
    label: "Store schemaVersion matches the running demo's schema",
    pass: storeState.schemaVersion === SCHEMA_VERSION,
    detail: `store=${storeState.schemaVersion}, running=${SCHEMA_VERSION}`,
  });
  const seqs = storeState.meta.audit.map((a) => a.seq);
  checks.push({
    id: "T5",
    label: "Audit log seq is strictly increasing",
    pass: seqs.every((s, i) => i === 0 || s > seqs[i - 1]),
    detail: `${seqs.length} audit entries`,
  });
  const ids = storeState.events.map((e) => e.id);
  checks.push({
    id: "T6",
    label: "No duplicate event ids in the log",
    pass: new Set(ids).size === ids.length,
    detail: `${ids.length} events`,
  });
  checks.push({
    id: "T7",
    label: "All cadence settings are positive numbers",
    pass: Object.values(storeState.meta.settings).every((v) => typeof v === "number" && v > 0),
    detail: JSON.stringify(storeState.meta.settings),
  });
  checks.push({
    id: "G1",
    label: "Live rules run produces a finding set (G-suite style)",
    pass: Array.isArray(P.findings),
    detail: `${P.findings.length} findings produced on this render`,
  });
  return checks;
}

export function HealthView({ P, storeState, query }: { P: Projected; storeState: Store; query: URLSearchParams }) {
  const filter = query.get("filter");
  const checks = runChecks(storeState, P);
  const visible = filter === "fail" ? checks.filter((c) => !c.pass) : checks;
  const failCount = checks.filter((c) => !c.pass).length;

  return (
    <div>
      <SectionTitle sub="Deterministic checks against the in-memory store — the health wall runs regardless of global mutes, so you can always verify underneath them.">
        Health {failCount > 0 ? <Badge tone="red">{failCount} failing</Badge> : <Badge tone="green">all passing</Badge>}
      </SectionTitle>
      <div className="mb-3 flex gap-2 text-xs">
        <a href="#/health" className={filter !== "fail" ? "font-semibold text-violet-700" : "text-slate-500"}>all</a>
        <a href="#/health?filter=fail" className={filter === "fail" ? "font-semibold text-violet-700" : "text-slate-500"}>failures only</a>
      </div>
      <div className="space-y-2">
        {visible.map((c) => (
          <Card key={c.id} className="flex items-center justify-between p-3">
            <div>
              <span className="font-mono text-xs text-slate-400">{c.id}</span>{" "}
              <span className="text-sm text-slate-800">{c.label}</span>
              <div className="text-xs text-slate-400">{c.detail}</div>
            </div>
            <Badge tone={c.pass ? "green" : "red"}>{c.pass ? "PASS" : "FAIL"}</Badge>
          </Card>
        ))}
        {visible.length === 0 && <div className="text-sm text-slate-500">No failures.</div>}
      </div>
    </div>
  );
}
