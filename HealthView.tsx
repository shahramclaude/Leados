import { useMemo } from "react";
import type { LeadosEvent } from "../lib/types";
import { runHealthSuite } from "../lib/health";
import { Card, SectionTitle, Badge } from "./ui";

export function HealthView({ events, today }: { events: LeadosEvent[]; today: Date }) {
  const checks = useMemo(() => runHealthSuite(events, today), [events, today]);
  const passCount = checks.filter((c) => c.pass).length;

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Live, non-destructive"
        title="Health suite"
        desc="Runs in the browser on every load against the current event log (plus two throwaway localStorage keys for store-mechanics checks). This is the authority if it ever disagrees with the README."
      />
      <Card>
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${passCount === checks.length ? "text-emerald-600" : "text-rose-600"}`}>
            {passCount}/{checks.length}
          </span>
          <span className="text-sm text-slate-500">checks passing</span>
        </div>
      </Card>
      <div className="space-y-2">
        {checks.map((c) => (
          <Card key={c.id} className={c.pass ? "" : "border-rose-300"}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-slate-400">{c.id}</div>
                <div className="text-sm font-medium text-slate-800">{c.title}</div>
                <div className="text-xs text-slate-500">{c.detail}</div>
              </div>
              <Badge color={c.pass ? "green" : "red"}>{c.pass ? "PASS" : "FAIL"}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
