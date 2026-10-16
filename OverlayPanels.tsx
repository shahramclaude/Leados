import type { Store } from "../types";
import type { Projected } from "../lib/engine";
import { RULES } from "../data/catalog";
import { navigate } from "../lib/router";
import { Badge, Button, Mono } from "./primitives";
import { fmtDateTime } from "../lib/utils";
import { findingHistory } from "../lib/audit";

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/50 p-4 pt-[6vh] backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-mono text-sm font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EventTracerPanel({ eventId, P, storeState, onClose }: { eventId: string; P: Projected; storeState: Store; onClose: () => void }) {
  const event = storeState.events.find((e) => e.id === eventId);
  if (!event) {
    return (
      <PanelShell title={`>trace ${eventId}`} onClose={onClose}>
        <p className="text-sm text-slate-500">No event found with id "{eventId}". It may have been undone, or never existed in this demo log.</p>
      </PanelShell>
    );
  }
  const produces = P.findings.filter((f) => f.eventIds.includes(event.id));
  const auditEntry = storeState.meta.audit.find((a) => (a.detail as any)?.eventId === event.id);

  return (
    <PanelShell title={`>trace ${event.id}`} onClose={onClose}>
      <Mono>
{`EVENT RECORD
┌────────────────────────────────────────────────────────────────┐
│ id:      ${event.id}
│ type:    ${event.type}
│ domain:  ${event.domain}
│ ts:      ${event.ts}
│ data:    ${JSON.stringify(event.data)}
├────────────────────────────────────────────────────────────────┤
│ PRODUCES THESE FINDINGS (at render time today):
${produces.length ? produces.map((f) => `│   ${f.key} (sev ${f.sev}, smart rank #${f.smartRank})`).join("\n") : "│   (none at this time)"}
├────────────────────────────────────────────────────────────────┤
│ IMPORTED? ${event.imported ? "yes — merged via importInto()" : "no — appended live"}
│ AUDIT ENTRY: ${auditEntry ? `seq #${auditEntry.seq}, action: ${auditEntry.action}` : "not found in retained audit window"}
└────────────────────────────────────────────────────────────────┘`}
      </Mono>
      <div className="mt-4 flex flex-wrap gap-2">
        {produces.map((f) => (
          <Button key={f.key} variant="ghost" onClick={() => navigate(`#/explain/${f.rule}`)}>
            Explain {f.rule} →
          </Button>
        ))}
      </div>
    </PanelShell>
  );
}

export function RuleExplainerPanel({ ruleId, P, storeState, onClose }: { ruleId: string; P: Projected; storeState: Store; onClose: () => void }) {
  const rule = RULES.find((r) => r.id === ruleId);
  const live = P.findings.filter((f) => f.rule === ruleId);
  const muted = storeState.meta.mutedRules.find((m) => m.rule === ruleId);

  if (!rule) {
    return (
      <PanelShell title={`>explain ${ruleId}`} onClose={onClose}>
        <p className="text-sm text-slate-500">Unknown rule id "{ruleId}".</p>
      </PanelShell>
    );
  }

  const history = live.length ? findingHistory(storeState, live[0].key) : [];

  return (
    <PanelShell title={`>explain ${rule.id}`} onClose={onClose}>
      <div className="mb-3 flex items-center gap-2">
        <h4 className="text-base font-semibold text-slate-900">{rule.id} — {rule.tag}</h4>
        <Badge tone="slate">{rule.domain}</Badge>
        {!rule.wired && <Badge tone="amber">catalog-only (demo)</Badge>}
        {muted && <Badge tone="red">globally muted</Badge>}
      </div>
      <Mono>
{`FIRES WHEN:
  ${rule.firesWhen}

SEVERITY: ${rule.severityRule}

CONFIDENCE: ${rule.confidence}

PLAYBOOK: ${rule.playbook || "none"}

RESOLVES WHEN:
  ${rule.resolvesWhen}

${rule.dismissible ? "CAN BE DISMISSED — dismissal silences it until the underlying data changes." : "DOES NOT RESOLVE BY DISMISSAL — if dismissed, the underlying issue still needs addressing."}

CURRENT STATE (today):
${live.length ? live.map((f) => `  ACTIVE · sev ${f.sev} · smart rank #${f.smartRank} · scope ${f.scope}`).join("\n") : "  not currently firing"}

SETTINGS THAT AFFECT THIS RULE:
${rule.settingsKeys.length ? rule.settingsKeys.map((k) => `  ${k}: ${(storeState.meta.settings as any)[k]}`).join("\n") : "  (none)"}`}
      </Mono>
      {history.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold uppercase text-slate-400">History</div>
          <div className="flex flex-wrap gap-2">
            {history.map((h, i) => (
              <Badge key={i} tone={h.action === "dismissed" ? "red" : h.action === "played" ? "green" : "amber"}>
                {h.action} · {fmtDateTime(h.ts)}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {live.length > 0 && (
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={() => navigate(`#/playbooks/${rule.playbook}`)} disabled={!rule.playbook}>
            Open playbook
          </Button>
        </div>
      )}
    </PanelShell>
  );
}
