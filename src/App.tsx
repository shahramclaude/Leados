import { useState } from "react";
import { ExecutiveCockpit } from "./components/cockpit/ExecutiveCockpit";
import { BoardPackStudio } from "./components/boardpack/BoardPackStudio";
import { MobileCockpitDemo } from "./components/mobile/MobileCockpitDemo";
import { JourneyPanel } from "./components/journey/JourneyPanel";
import { SelfReviewPanel } from "./components/SelfReviewPanel";
import { cn } from "./utils/cn";

type Tab = "cockpit" | "boardpack" | "mobile" | "journey" | "review";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "cockpit", label: "Executive Cockpit", icon: "🏠" },
  { id: "boardpack", label: "Board Pack Studio", icon: "📑" },
  { id: "mobile", label: "Mobile Cockpit", icon: "📱" },
  { id: "journey", label: "Journey Tests", icon: "⏱️" },
  { id: "review", label: "Self-Review", icon: "🔍" },
];

const SOURCE_VIEW_LABEL: Record<string, string> = {
  finance: "Finance dashboard",
  strategy: "Strategy / OKR view",
  people: "People dashboard",
  risk: "Risk register",
  operations: "Execution / delivery view",
  market: "Market intelligence",
  inbox: "Approvals inbox",
  decisions: "Decision log",
  audit: "Audit / What-changed log",
};

export default function App() {
  const [tab, setTab] = useState<Tab>("cockpit");
  const [toast, setToast] = useState<string | null>(null);

  function handleNavigate(sourceView: string) {
    setToast(`→ Jumped to source view: ${SOURCE_VIEW_LABEL[sourceView] ?? sourceView}`);
    window.setTimeout(() => setToast(null), 2200);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          <div className="mr-3 flex shrink-0 items-center gap-2 text-sm font-bold text-slate-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white">◆</span>
            LEADOS
          </div>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                tab === t.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main>
        {tab === "cockpit" && <ExecutiveCockpit onNavigate={handleNavigate} />}
        {tab === "boardpack" && <BoardPackStudio onNavigate={handleNavigate} />}
        {tab === "mobile" && <MobileCockpitDemo />}
        {tab === "journey" && <JourneyPanel />}
        {tab === "review" && <SelfReviewPanel />}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
