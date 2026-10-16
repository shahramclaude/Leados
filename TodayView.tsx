import { useMemo, useState } from "react";
import type { Store } from "../automation/types";
import { collectCadenceFindings, dayDate, suggestSchedule, weekLabel } from "../automation/schedule";
import { backupStatus } from "../automation/backup";
import { smartPrefill } from "../automation/prefill";
import { Button, Card, ConfBadge, Pill, SectionTitle, SevBadge } from "../components/shared";
import { BundleModal } from "../components/BundleModal";
import { TEMPLATES } from "../automation/templates";
import type { EventSpec } from "../automation/templates";

export function TodayView({
  store,
  onLogBundle,
}: {
  store: Store;
  onLogBundle: (specs: EventSpec[], source: string, summary: string) => void;
}) {
  const today = Date.now();
  const findings = useMemo(() => collectCadenceFindings(store, today), [store]);
  const schedule = useMemo(() => suggestSchedule(store, today), [store]);
  const backupFinding = useMemo(() => backupStatus(store, today), [store]);

  const [prefillPersonId, setPrefillPersonId] = useState(store.people.find((p) => !p.archived)?.id ?? "");
  const [prefillPlay, setPrefillPlay] = useState("oneonone");
  const result = useMemo(() => smartPrefill(prefillPlay, { playId: prefillPlay, personId: prefillPersonId }, store, today), [prefillPlay, prefillPersonId, store]);

  const [bundleOpen, setBundleOpen] = useState<{ templateId: string; defaults?: Record<string, string> } | null>(null);
  const template = bundleOpen ? TEMPLATES.find((t) => t.id === bundleOpen.templateId) : undefined;

  const handleLogThis = (item: (typeof schedule)[number]) => {
    if (item.playId === "SPRINT_CLOSE_BUNDLE") {
      setBundleOpen({ templateId: "SPRINT_CLOSE_BUNDLE" });
      return;
    }
    if (item.personId) {
      setBundleOpen({ templateId: "WEEKLY_1ON1_BUNDLE", defaults: { personId: item.personId } });
      return;
    }
    // generic ritual with no direct bundle — fall back to the 1:1 bundle as a quick-capture placeholder.
    setBundleOpen({ templateId: "WEEKLY_1ON1_BUNDLE" });
  };

  return (
    <div className="space-y-6">
      {backupFinding && (
        <Card className="border-slate-300 bg-slate-50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{backupFinding.title}</p>
              <p className="mt-1 text-xs text-slate-500">{backupFinding.basis}</p>
            </div>
            <Pill tone="slate">not a leadership finding</Pill>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle sub={`Suggested, not scheduled — approve items to log them. (${weekLabel(today)})`}>
          Suggested this week — from overdue cadences
        </SectionTitle>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <tbody>
              {schedule.map((item, i) => (
                <tr key={item.findingKey + i} className="border-b border-slate-100 last:border-0">
                  <td className="w-20 bg-slate-50 px-3 py-2 font-medium text-slate-500">
                    {item.day}
                    <div className="text-[11px] font-normal text-slate-400">{new Date(dayDate(today, item.day)).toISOString().slice(5, 10)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{item.label}</div>
                    <div className="text-xs text-slate-500">{item.detail}</div>
                  </td>
                  <td className="w-32 px-3 py-2 text-right">
                    <Button variant="secondary" onClick={() => handleLogThis(item)}>
                      Log this
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle sub="Cadence + skip-level findings derived from your own event log (no external signals).">Open findings</SectionTitle>
        {findings.length === 0 ? (
          <p className="text-sm text-slate-500">No overdue cadence findings right now.</p>
        ) : (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.key} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <SevBadge sev={f.sev} />
                    <ConfBadge conf={f.conf} />
                    <span className="font-mono text-[11px] text-slate-400">{f.key}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{f.title}</p>
                  <p className="text-xs text-slate-500">{f.basis}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle sub="smartPrefill(playId, ctx, P, today) — extends the base prefill(ctx, P) contract (verified shape) with people/temporal/financial/pattern enrichment.">
          Smart Prefill demo
        </SectionTitle>
        <div className="mb-4 flex flex-wrap gap-3">
          <select className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" value={prefillPlay} onChange={(e) => setPrefillPlay(e.target.value)}>
            <option value="oneonone">oneonone</option>
            <option value="fin-forecast">fin-forecast</option>
            <option value="board-prep">board-prep</option>
          </select>
          <select className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" value={prefillPersonId} onChange={(e) => setPrefillPersonId(e.target.value)}>
            {store.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Facts pulled from the log</h4>
            <ul className="space-y-1 text-sm text-slate-700">
              {result.facts.length === 0 && <li className="text-slate-400">No facts available for this combination.</li>}
              {result.facts.map((f, i) => (
                <li key={i} className="rounded-md bg-slate-50 px-2 py-1">
                  {f}
                </li>
              ))}
            </ul>
            {result.warnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {result.warnings.map((w, i) => (
                  <p key={i} className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    ⚠ {w}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested field values</h4>
            <ul className="space-y-1 text-sm">
              {Object.entries(result.suggest).map(([k, v]) => (
                <li key={k} className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1">
                  <span className="font-mono text-xs text-violet-700">{k}</span> = <span className="font-medium">{String(v.value)}</span>
                  <div className="text-[11px] text-violet-500">recommended · {v.source}</div>
                </li>
              ))}
            </ul>
            {result.missing.length > 0 && (
              <>
                <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Left blank for you (missing)</h4>
                <ul className="space-y-1 text-xs text-slate-500">
                  {result.missing.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </Card>

      {template && (
        <BundleModal
          template={template}
          people={store.people}
          defaultValues={bundleOpen?.defaults}
          onClose={() => setBundleOpen(null)}
          onSubmit={(values) => {
            const specs = template.build(values);
            onLogBundle(specs, `Today → ${template.label}`, specs[specs.length - 1]?.type ?? "");
            setBundleOpen(null);
          }}
        />
      )}
    </div>
  );
}
