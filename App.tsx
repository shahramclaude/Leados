import { useState } from "react";
import { useLeadosStore } from "./automation/store";
import { TodayView } from "./views/TodayView";
import { BundlesView } from "./views/BundlesView";
import { MaintenanceView } from "./views/MaintenanceView";
import { ProvenanceView } from "./views/ProvenanceView";
import { ContractView } from "./views/ContractView";
import { UndoToast } from "./components/UndoToast";
import { cn } from "./utils/cn";
import { Button } from "./components/shared";

const TABS = [
  { id: "today", label: "Today" },
  { id: "bundles", label: "Bundles" },
  { id: "maintenance", label: "Maintenance & Data" },
  { id: "contract", label: "Automation Contract" },
  { id: "provenance", label: "Provenance" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [tab, setTab] = useState<TabId>("today");
  const api = useLeadosStore();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
                ⚙
              </div>
              <h1 className="text-xl font-semibold tracking-tight">LeadOS pt-D — Universal Automation Engine</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              An operating system anticipates. Every automation below is labeled, reversible, and auditable — built only from this demo's own event log.
            </p>
          </div>
          <Button variant="secondary" onClick={api.resetDemo}>
            Reset demo data
          </Button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                tab === t.id ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {tab === "today" && <TodayView store={api.store} onLogBundle={api.logBundle} />}
        {tab === "bundles" && <BundlesView store={api.store} onLogBundle={api.logBundle} />}
        {tab === "maintenance" && (
          <MaintenanceView
            store={api.store}
            onRunMaintenance={api.runMaintenanceOnce}
            onClearStaleSuppressions={api.clearStaleSuppressions}
            onRecordExport={api.recordExport}
            onSimulateImport={() =>
              api.simulateImport(
                [{ id: "p-new1", name: "Imported: Lia Park", role: "New Hire" }],
                [
                  { type: "oneonone.logged", payload: { personId: "p-new1", notes: "Onboarding 1:1." } },
                  { type: "unknown.customfield.logged", payload: { note: "from a foreign export" } },
                ]
              )
            }
          />
        )}
        {tab === "contract" && <ContractView />}
        {tab === "provenance" && <ProvenanceView />}
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-slate-400">
        Demo data is fabricated for this delivery. See README.md and AI-SESSION-LOG.md for exactly what was verified against github.com/wbweve/Leados
        versus invented for this build.
      </footer>

      <UndoToast toast={api.toast} onUndo={api.undoLast} onDismiss={api.dismissToast} />
    </div>
  );
}
