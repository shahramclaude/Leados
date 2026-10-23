import { useState } from "react";
import { Card, SectionHeader, Badge } from "../components/ui";
import { legalDrafts as initial } from "../data/mockData";
import type { LegalDraft } from "../types";

export function LegalDrafts() {
  const [items, setItems] = useState<LegalDraft[]>(initial);

  const toggleConfirm = (id: string) =>
    setItems((prev) => prev.map((d) => (d.id === id ? { ...d, humanConfirmed: !d.humanConfirmed } : d)));

  return (
    <div className="space-y-4">
      <SectionHeader title="Legal Drafts" subtitle="AI-assisted drafting, human-gated finalization. 'Finalize' stays disabled until a human explicitly confirms." />
      <div className="space-y-3">
        {items.map((d) => (
          <Card key={d.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-slate-800">{d.title}</p>
                <p className="mt-1 text-sm text-slate-600">{d.summary}</p>
              </div>
              <Badge tone={d.humanConfirmed ? "emerald" : "amber"}>{d.humanConfirmed ? "Confirmed" : "Awaiting confirmation"}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={d.humanConfirmed} onChange={() => toggleConfirm(d.id)} className="h-4 w-4 rounded border-slate-300" />
                I have personally read this draft and take responsibility for it
              </label>
              <button
                disabled={!d.humanConfirmed}
                className="ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 enabled:bg-slate-900 enabled:hover:bg-slate-700"
              >
                Finalize
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
