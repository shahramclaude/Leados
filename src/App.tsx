import { useState } from "react";
import { AppStateProvider } from "./context/AppStateContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Dashboard } from "./modules/Dashboard";
import { ConversationalAssistant } from "./modules/ConversationalAssistant";
import { Coaching } from "./modules/Coaching";
import { CollectiveIntelligence } from "./modules/CollectiveIntelligence";
import { TimeAnalytics } from "./modules/TimeAnalytics";
import { EthicsFlags } from "./modules/EthicsFlags";
import { CrisisMode } from "./modules/CrisisMode";
import { ProactiveDrafts } from "./modules/ProactiveDrafts";
import { SpatialView } from "./modules/SpatialView";
import { IndustryBenchmarks } from "./modules/IndustryBenchmarks";
import { Recommender } from "./modules/Recommender";
import { LeaderState } from "./modules/LeaderState";
import { LegalDrafts } from "./modules/LegalDrafts";
import { ReorgSimulator } from "./modules/ReorgSimulator";
import { BoardReadiness } from "./modules/BoardReadiness";
import { AlgorithmRegistry } from "./modules/AlgorithmRegistry";
import { EvidenceLedgerView } from "./modules/EvidenceLedgerView";
import type { ModuleId } from "./types";

function ModuleRouter({ active, onNavigate }: { active: ModuleId; onNavigate: (id: ModuleId) => void }) {
  switch (active) {
    case "dashboard":
      return <Dashboard onNavigate={onNavigate} />;
    case "assistant":
      return <ConversationalAssistant />;
    case "coaching":
      return <Coaching />;
    case "collective":
      return <CollectiveIntelligence />;
    case "time":
      return <TimeAnalytics />;
    case "ethics":
      return <EthicsFlags />;
    case "crisis":
      return <CrisisMode />;
    case "drafts":
      return <ProactiveDrafts />;
    case "spatial":
      return <SpatialView />;
    case "benchmarks":
      return <IndustryBenchmarks />;
    case "recommender":
      return <Recommender />;
    case "leaderstate":
      return <LeaderState />;
    case "legal":
      return <LegalDrafts />;
    case "reorg":
      return <ReorgSimulator />;
    case "board":
      return <BoardReadiness />;
    case "registry":
      return <AlgorithmRegistry />;
    case "ledger":
      return <EvidenceLedgerView />;
    default:
      return <Dashboard onNavigate={onNavigate} />;
  }
}

function Shell() {
  const [active, setActive] = useState<ModuleId>("dashboard");

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <Sidebar active={active} onSelect={setActive} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar active={active} />
        <main className="flex-1 overflow-y-auto p-6">
          <ModuleRouter active={active} onNavigate={setActive} />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <Shell />
      </AppStateProvider>
    </ErrorBoundary>
  );
}
