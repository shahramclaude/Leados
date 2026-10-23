import { useState } from "react";
import { Card, SectionHeader, Badge, ProgressBar } from "../components/ui";
import { drafts as initialDrafts } from "../data/mockData";
import { useAppState } from "../context/AppStateContext";
import type { Draft } from "../types";

export function ProactiveDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const { attentionBudget, maxAttentionBudget, spendAttention } = useAppState();

  const act = (id: string, status: Draft["status"]) => {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    if (status === "sent") {
      const ok = spendAttention(draft.cost);
      if (!ok) {
        alert("Attention budget exhausted for today. This draft stays queued — it will not send itself.");
        return;
      }
    }
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Proactive Drafts"
        subtitle="The system writes drafts it thinks you'd want to send. It never sends them. Each costs attention budget to action."
      />

      <Card>
        <div className="mb-2 flex justify-between text-sm"><span>Attention budget remaining today</span><span>{attentionBudget}/{maxAttentionBudget}</span></div>
        <ProgressBar value={attentionBudget} max={maxAttentionBudget} tone={attentionBudget < 2 ? "rose" : "indigo"} />
      </Card>

      <div className="space-y-3">
        {drafts.map((d) => (
          <Card key={d.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-800">{d.title}</p>
              <p className="text-xs text-slate-500">To: {d.audience} · Cost: {d.cost} attention unit{d.cost > 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              {d.status === "queued" ? (
                <>
                  <button onClick={() => act(d.id, "dismissed")} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                    Dismiss
                  </button>
                  <button onClick={() => act(d.id, "sent")} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                    Review & send
                  </button>
                </>
              ) : (
                <Badge tone={d.status === "sent" ? "emerald" : "slate"}>{d.status}</Badge>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
