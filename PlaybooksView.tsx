import { useState } from "react";
import type { Store } from "../types";
import type { Projected } from "../lib/engine";
import { PLAYBOOKS } from "../data/catalog";
import { Badge, Button, Card, SectionTitle } from "../components/primitives";
import { navigate, buildPlaybookLink } from "../lib/router";
import * as store from "../lib/store";

export function PlaybooksView({ P, storeState, playId, personId }: { P: Projected; storeState: Store; playId?: string; personId?: string }) {
  if (playId) return <PlaybookDetail P={P} storeState={storeState} playId={playId} personId={personId} />;

  return (
    <div>
      <SectionTitle sub="Pre-built response bundles, each wired to one or more rules.">Playbooks</SectionTitle>
      <div className="cq-grid cq-grid-2 grid gap-3">
        {PLAYBOOKS.map((pb) => {
          const liveCount = P.findings.filter((f) => pb.forRules.includes(f.rule)).length;
          return (
            <Card key={pb.id} className="cursor-pointer p-4 hover:border-violet-300" onClick={() => navigate(buildPlaybookLink(pb.id))}>
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900">{pb.title}</div>
                {liveCount > 0 && <Badge tone="amber">{liveCount} live</Badge>}
              </div>
              <div className="mt-1 text-xs text-slate-500">{pb.forWhat}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {pb.forRules.map((r) => (
                  <Badge key={r} tone="slate">{r}</Badge>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PlaybookDetail({ P, storeState, playId, personId }: { P: Projected; storeState: Store; playId: string; personId?: string }) {
  const pb = PLAYBOOKS.find((p) => p.id === playId);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const related = pb ? P.findings.filter((f) => pb.forRules.includes(f.rule)) : [];
  const person = personId ? storeState.people.find((p) => p.id === personId) : undefined;

  if (!pb) return <div className="text-sm text-slate-500">Unknown playbook "{playId}".</div>;

  function complete() {
    store.logPlaybookCompleted(pb!.id, related[0]?.key);
    store.appendEvent({ type: "playbook.completed", domain: pb!.domain, data: { playbookId: pb!.id, note }, personId });
    setDone(true);
  }

  return (
    <div>
      <button onClick={() => navigate("#/playbooks")} className="mb-3 text-xs text-violet-600 hover:underline">← all playbooks</button>
      <SectionTitle sub={pb.forWhat}>{pb.title} {person && <Badge tone="violet">for {person.name}</Badge>}</SectionTitle>

      <Card className="mb-4 p-4">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Prefill facts (prefill(ctx, P) contract — demo shape)</div>
        {related.length === 0 ? (
          <div className="text-sm text-slate-500">No live findings currently resolve via this playbook — facts list is empty, ok:true, missing:[] (demo shape).</div>
        ) : (
          <ul className="space-y-1 text-sm text-slate-700">
            {related.map((f) => (
              <li key={f.key}>· {f.title} <span className="text-xs text-slate-400">({f.rule})</span></li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Notes</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="mb-3 w-full rounded-lg border border-slate-300 p-2 text-sm" placeholder="What did you decide / do?" />
        {done ? (
          <Badge tone="green">Logged playbook.completed — event appended, finding history updated.</Badge>
        ) : (
          <Button variant="primary" onClick={complete}>Mark complete</Button>
        )}
      </Card>
    </div>
  );
}
