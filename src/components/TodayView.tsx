import { useMemo } from "react";
import type { Projection } from "../lib/types";
import { infoTheory } from "../lib/infoTheory";
import { engine } from "../lib/engine";
import { Card, Label } from "./ui";

export function TodayView({
  P,
  today,
  onQuickLog,
}: {
  P: Projection;
  today: Date;
  onQuickLog: (type: string, data: Record<string, any>) => void;
}) {
  const entropy = useMemo(() => infoTheory.shannonEntropy(P.state.events), [P]);
  const findings = useMemo(() => engine.run(P, today).findings, [P, today]);
  const topFindings = findings.slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Today</h1>
        <p className="mt-1 text-sm text-slate-400">
          {today.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ·{" "}
          {P.state.events.length} events logged
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Event-type entropy" subtitle="Shannon H, normalized">
          <div className="text-3xl font-mono text-white">{(entropy.normalized * 100).toFixed(0)}%</div>
          <Label>See Intelligence → Thermodynamics for the full breakdown.</Label>
        </Card>
        <Card title="Active findings" subtitle="from LEADOS.engine">
          <div className="text-3xl font-mono text-white">{findings.length}</div>
          <Label>Six disclosed-fabricated rules; see Intelligence tab.</Label>
        </Card>
        <Card title="Roster" subtitle="direct + skip-level">
          <div className="text-3xl font-mono text-white">{P.directs.length + P.skips.length}</div>
          <Label>{P.directs.length} direct reports, {P.skips.length} skip-level.</Label>
        </Card>
      </div>

      <Card title="Top findings">
        {topFindings.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing urgent right now.</p>
        ) : (
          <ul className="space-y-2">
            {topFindings.map((f) => (
              <li key={f.key} className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2 text-sm">
                <span className="text-slate-200">{f.title}</span>
                <span className="text-xs text-slate-500">{f.rule}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Quick log" subtitle="Add an event to the log — changes entropy / findings immediately">
        <div className="flex flex-wrap gap-2">
          <QuickButton
            label="Log 1:1 (random direct)"
            onClick={() => {
              const p = P.directs[Math.floor(Math.random() * P.directs.length)];
              if (p) onQuickLog("oneOnOne.held", { personId: p.id, domain: "people" });
            }}
          />
          <QuickButton
            label="Raise a signal"
            onClick={() => onQuickLog("signal.raised", { title: "Ad-hoc signal logged from Today view", domain: "ops", severity: 2 })}
          />
          <QuickButton
            label="Log a decision"
            onClick={() =>
              onQuickLog("decision.logged", { decisionId: `dec_u_${Date.now()}`, title: "Ad-hoc decision", domain: "ops" })
            }
          />
          <QuickButton
            label="Log collaboration edge"
            onClick={() => {
              const a = P.directs[Math.floor(Math.random() * P.directs.length)];
              const b = P.skips[Math.floor(Math.random() * P.skips.length)];
              if (a && b) onQuickLog("org.network.edge", { fromId: a.id, toId: b.id });
            }}
          />
        </div>
      </Card>
    </div>
  );
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 transition hover:border-orange-500/40 hover:bg-slate-800"
    >
      {label}
    </button>
  );
}
