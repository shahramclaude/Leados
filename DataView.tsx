import { useRef, useState } from "react";
import type { Store } from "../types";
import type { Projected } from "../lib/engine";
import { RULES, DOMAINS } from "../data/catalog";
import { Badge, Button, Card, SectionTitle } from "../components/primitives";
import { AuditIntelligence, CalendarHeatmap, EventBrowser, MuteManager } from "../components/DataWidgets";
import { navigate, buildExplainLink } from "../lib/router";
import * as store from "../lib/store";

const TABS = [
  { id: "events", label: "Events" },
  { id: "audit", label: "Audit" },
  { id: "quarantine", label: "Quarantine" },
  { id: "mutes", label: "Mutes & Rules" },
  { id: "export", label: "Export / Import" },
];

export function DataView({ P, storeState, query, refresh }: { P: Projected; storeState: Store; query: URLSearchParams; refresh: () => void }) {
  const tab = query.get("tab") || "events";
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [purgeArmed, setPurgeArmed] = useState(false);

  return (
    <div>
      <SectionTitle sub="Audit intelligence, raw event browsing, global mutes, and import/export — all local to this browser.">Data</SectionTitle>
      <div className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`#/data?tab=${t.id}`)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.id ? "bg-violet-100 text-violet-800" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "events" && <EventBrowser storeState={storeState} />}

      {tab === "audit" && (
        <div className="space-y-6">
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Event timeline (rolling year)</div>
            <CalendarHeatmap storeState={storeState} today={P.today} />
          </Card>
          <Card className="p-4">
            <AuditIntelligence storeState={storeState} today={P.today} />
          </Card>
        </div>
      )}

      {tab === "quarantine" && (
        <Card className="p-4">
          <p className="mb-2 text-sm text-slate-600">
            <strong>Labeled:</strong> the real repo's events.js registry (verified this session) enforces a strict
            event-type whitelist, but no "quarantine" concept or UI surface was found anywhere in the real source.
            This tab is fabricated to satisfy the brief's <code>#/data?tab=quarantine</code> route; it simulates what a
            quarantine list would look like by flagging any event in this demo's log whose <code>type</code> is not in
            the event-type vocabulary used by seed.ts.
          </p>
          <QuarantineList storeState={storeState} />
        </Card>
      )}

      {tab === "mutes" && (
        <div className="space-y-6">
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Globally muted rules</div>
            <MuteManager storeState={storeState} onChange={refresh} />
          </Card>
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Full rule catalog ({RULES.length})</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {RULES.map((r) => (
                <button key={r.id} onClick={() => navigate(buildExplainLink(r.id))} className="flex items-center justify-between rounded-lg px-2 py-1 text-left text-xs hover:bg-slate-50">
                  <span><span className="font-mono text-slate-700">{r.id}</span> <span className="text-slate-500">{r.tag}</span></span>
                  {!r.wired && <Badge tone="slate">catalog-only</Badge>}
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "export" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Full export</div>
            <Button
              variant="primary"
              onClick={() => {
                const json = store.exportStore({ findings: P.findings });
                downloadBlob(json, "leados-export.json");
              }}
            >
              Export full JSON store
            </Button>
          </Card>
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Filtered export</div>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => (
                <Button key={d} variant="ghost" onClick={() => downloadBlob(store.exportFiltered(d), `leados-export-${d}.json`)}>
                  #{d}
                </Button>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Import</div>
            <input ref={fileRef} type="file" accept="application/json" className="mb-2 text-sm" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              try {
                const res = store.importInto(text);
                setImportMsg(`Imported ${res.addedEvents} new event(s). ${res.before} → ${res.after} total.`);
                refresh();
              } catch (err: any) {
                setImportMsg(err.message || "Import failed.");
              }
            }} />
            {importMsg && <div className="text-xs text-slate-500">{importMsg}</div>}
          </Card>
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Purge (2-click confirmation)</div>
            {!purgeArmed ? (
              <Button variant="danger" onClick={() => setPurgeArmed(true)}>Purge all local data…</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="danger" onClick={() => { store.resetAndReseed(); setPurgeArmed(false); refresh(); }}>Confirm purge & reseed</Button>
                <Button variant="ghost" onClick={() => setPurgeArmed(false)}>Cancel</Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function QuarantineList({ storeState }: { storeState: Store }) {
  const KNOWN = new Set([
    "fin.pl.logged", "fin.cash.logged", "fin.budget.set", "oneonone.logged", "skiplevel.logged", "feedback.given",
    "ops.review.logged", "decision.opened", "decision.closed", "okr.checkin.logged", "compliance.check.logged",
    "rd.experiment.logged", "rd.milestone.logged", "quality.incident.logged", "quality.resolved", "note.added",
    "playbook.completed", "influence.map.logged",
  ]);
  const flagged = storeState.events.filter((e) => !KNOWN.has(e.type));
  if (flagged.length === 0) return <div className="text-sm text-slate-500">No quarantined events — every event type in the log is recognized.</div>;
  return (
    <ul className="space-y-1 text-sm">
      {flagged.map((e) => (
        <li key={e.id} className="flex justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1">
          <span className="font-mono text-amber-800">{e.type}</span>
          <span className="text-xs text-amber-600">{e.id}</span>
        </li>
      ))}
    </ul>
  );
}

function downloadBlob(text: string, filename: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
