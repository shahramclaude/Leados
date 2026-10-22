import { useState } from "react";
import { Overview } from "./Overview";
import { ScenarioStudio } from "./ScenarioStudio";
import { WarRoom } from "./WarRoom";
import { WindTunnel } from "./WindTunnel";
import { HorizonRadar } from "./HorizonRadar";
import { ForesightLedger } from "./ForesightLedger";

const TABS = [
  { id: "overview", label: "Readiness Overview", render: Overview },
  { id: "studio", label: "Scenario Studio", render: ScenarioStudio },
  { id: "warroom", label: "War-Room", render: WarRoom },
  { id: "windtunnel", label: "Strategy Wind Tunnel", render: WindTunnel },
  { id: "radar", label: "Horizon Radar", render: HorizonRadar },
  { id: "ledger", label: "Foresight Ledger", render: ForesightLedger },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Shell() {
  const [active, setActive] = useState<TabId>("overview");
  const ActiveComponent = TABS.find((t) => t.id === active)?.render ?? Overview;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-lg text-white shadow">
              🧭
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">LEADOS Strategic Foresight Engine</h1>
              <p className="text-xs text-slate-500">Part 24 — Scenario Studio · War-Room · Wind Tunnel · Horizon Radar · Foresight Ledger</p>
            </div>
          </div>
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6">
          <div className="flex gap-1 border-t border-slate-100 pt-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium transition ${
                  active === tab.id ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <ActiveComponent />
      </main>

      <footer className="mx-auto mt-10 max-w-6xl px-4 text-xs text-slate-400 sm:px-6">
        All scenarios, war-game plays, wind-tunnel rankings, and horizon-radar placements on this page are modeled possibilities for
        planning purposes — never predictions of what will happen. Foresight claims are scored for calibration over time, not
        rewritten after the fact.
      </footer>
    </div>
  );
}
