import { Card, SectionHeader, Badge } from "../components/ui";
import { useAppState } from "../context/AppStateContext";

export function CrisisMode() {
  const { crisisMode, setCrisisMode } = useAppState();

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Crisis Mode"
        subtitle="One switch, whole-product effect: navigation narrows, color language shifts, and only decision-critical modules stay reachable."
      />

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-800">Crisis mode is {crisisMode ? "ON" : "OFF"}</p>
          <p className="text-sm text-slate-500">Toggling this changes the Sidebar, TopBar, and Dashboard immediately — try it.</p>
        </div>
        <button
          onClick={() => setCrisisMode(!crisisMode)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${crisisMode ? "bg-slate-700 hover:bg-slate-600" : "bg-rose-600 hover:bg-rose-700"}`}
        >
          {crisisMode ? "Exit crisis mode" : "Activate crisis mode"}
        </button>
      </Card>

      <Card>
        <SectionHeader title="What changes, concretely" />
        <ul className="space-y-2 text-sm text-slate-600">
          <li>• Sidebar hides every module not marked <Badge tone="indigo">essential</Badge> (Dashboard, Conversation, Crisis Mode, Ethics Flags, Board Readiness, Evidence Ledger stay).</li>
          <li>• Color language shifts to a consistent red system across Sidebar and TopBar — no module is skipped.</li>
          <li>• Dashboard copy changes tone from "here's what's worth your attention" to "here's what cannot wait."</li>
          <li>• Nothing is deleted or hidden silently: exiting restores full navigation instantly.</li>
        </ul>
      </Card>

      <Card className="border-amber-200 bg-amber-50 text-sm text-amber-800">
        Honesty note: this demo coordinates UI state only. A production crisis mode would also need to coordinate
        notification suppression, SLA overrides, and audit logging server-side — not implemented here. See Evidence Ledger.
      </Card>
    </div>
  );
}
