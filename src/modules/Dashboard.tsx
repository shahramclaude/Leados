import { Card, SectionHeader, StatTile, Badge, ProgressBar } from "../components/ui";
import { ethicsCases, drafts, boardChecks, ledgerClaims } from "../data/mockData";
import { useAppState } from "../context/AppStateContext";
import type { ModuleId } from "../types";

export function Dashboard({ onNavigate }: { onNavigate: (id: ModuleId) => void }) {
  const { crisisMode, attentionBudget, maxAttentionBudget } = useAppState();
  const openEthics = ethicsCases.filter((c) => c.stage !== "approved").length;
  const queuedDrafts = drafts.filter((d) => d.status === "queued").length;
  const boardDone = boardChecks.filter((c) => c.done).length;
  const verifiedClaims = ledgerClaims.filter((c) => c.status === "verified").length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={crisisMode ? "Crisis dashboard" : "Good morning"}
        subtitle={
          crisisMode
            ? "Focus is narrowed to decisions that cannot wait. Everything else is still there when you exit crisis mode."
            : "Here is what actually needs your judgment today — nothing has been decided for you."
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <button onClick={() => onNavigate("ethics")} className="text-left">
          <StatTile label="Open ethics cases" value={String(openEthics)} hint="Click to review" />
        </button>
        <button onClick={() => onNavigate("drafts")} className="text-left">
          <StatTile label="Drafts queued" value={String(queuedDrafts)} hint={`${attentionBudget}/${maxAttentionBudget} attention left today`} />
        </button>
        <button onClick={() => onNavigate("board")} className="text-left">
          <StatTile label="Board readiness" value={`${boardDone}/${boardChecks.length}`} hint="Checks complete" />
        </button>
        <button onClick={() => onNavigate("ledger")} className="text-left">
          <StatTile label="Evidence ledger" value={`${verifiedClaims}/${ledgerClaims.length}`} hint="Claims verified" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionHeader title="Decisions waiting on you" subtitle="Routed here because a gate needs a human, not because a model couldn't guess." />
          <ul className="space-y-3">
            {ethicsCases
              .filter((c) => c.stage !== "approved")
              .map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.title}</p>
                    <p className="text-xs text-slate-500">{c.flags.join(" · ") || "No flags"}</p>
                  </div>
                  <Badge tone={c.riskLevel === "high" ? "rose" : c.riskLevel === "medium" ? "amber" : "emerald"}>{c.riskLevel}</Badge>
                </li>
              ))}
          </ul>
        </Card>

        <Card>
          <SectionHeader title="Program posture" subtitle="This build, honestly." />
          <div className="space-y-3 text-sm">
            <div>
              <div className="mb-1 flex justify-between"><span>Evidence verified</span><span>{verifiedClaims}/{ledgerClaims.length}</span></div>
              <ProgressBar value={verifiedClaims} max={ledgerClaims.length} tone="emerald" />
            </div>
            <div>
              <div className="mb-1 flex justify-between"><span>Board checks complete</span><span>{boardDone}/{boardChecks.length}</span></div>
              <ProgressBar value={boardDone} max={boardChecks.length} tone="indigo" />
            </div>
            <p className="pt-2 text-xs text-slate-500">
              Full honest breakdown lives in <button className="underline" onClick={() => onNavigate("ledger")}>Evidence Ledger</button>.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
