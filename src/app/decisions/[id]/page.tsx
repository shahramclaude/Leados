import Link from "next/link";
import { getDecisionDetail, criteriaScore, expectedValueDistribution, preMortemPrompts } from "@/lib/decisionEngine";
import { getTree, probabilitySensitivity } from "@/lib/decisionTrees";
import { db } from "@/db";
import { decisionTreeNodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { num, money, round2 } from "@/lib/format";
import type { Reversibility } from "@/lib/decisionTypes";
import type { TreeNodeComputed, TreeNodeRow } from "@/lib/decisionTrees";

export const dynamic = "force-dynamic";

function TreeBranch({ node, depth }: { node: TreeNodeComputed; depth: number }) {
  return (
    <div style={{ marginLeft: depth * 18 }} className="border-l border-slate-200 pl-3 py-1">
      <div className="flex items-center gap-2 text-sm">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${node.nodeType === "decision" ? "bg-indigo-100 text-indigo-700" : node.nodeType === "chance" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          {node.nodeType}
        </span>
        <span className={node.recommended ? "font-semibold text-emerald-700" : "text-slate-800"}>{node.label}</span>
        {node.probability != null && <span className="text-xs text-slate-400">p={node.probability}</span>}
        <span className="text-xs font-mono text-slate-500">EV {money(node.ev)}</span>
        {node.recommended && <span className="text-xs font-semibold text-emerald-700">← recommended</span>}
      </div>
      {node.children.map((c) => (
        <TreeBranch key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export default async function DecisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decisionId = Number(id);
  const detail = await getDecisionDetail(decisionId);
  if (!detail) return <main className="p-8">Decision not found.</main>;

  const options = detail.options.map((o) => {
    const outcomes = detail.outcomesByOption.get(o.id) ?? [];
    const ev = outcomes.length
      ? expectedValueDistribution(outcomes.map((x) => ({ scenarioLabel: x.scenarioLabel, probability: num(x.probability), payoffLow: num(x.payoffLow), payoffBase: num(x.payoffBase), payoffHigh: num(x.payoffHigh) })))
      : null;
    return { option: o, score: criteriaScore(o.scores as Record<string, number>, detail.criteria.map((c) => ({ id: c.id, weight: num(c.weight) }))), ev, outcomes };
  });

  const treeRows = await db.select().from(decisionTreeNodes).where(eq(decisionTreeNodes.decisionId, decisionId));
  const hasTree = treeRows.length > 0;
  const tree = hasTree ? await getTree(decisionId) : [];
  const sensitivity = hasTree
    ? probabilitySensitivity(
        treeRows.map((r) => ({
          id: r.id,
          decisionId: r.decisionId,
          parentId: r.parentId,
          nodeType: r.nodeType as TreeNodeRow["nodeType"],
          label: r.label,
          probability: r.probability != null ? num(r.probability) : null,
          payoff: r.payoff != null ? num(r.payoff) : null,
        })),
      )
    : [];

  const prompts = preMortemPrompts(detail.decision.reversibility as Reversibility);

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Link href="/decisions" className="text-sm font-medium text-indigo-600 hover:underline">← Decision workspace</Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{detail.decision.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{detail.decision.context}</p>
          <p className="mt-2 text-xs text-slate-500">
            {detail.decision.reversibility} · status {detail.decision.status} · owner {detail.decision.ownerId}
            {detail.decision.reviewDate ? ` · review date ${detail.decision.reviewDate}` : ""}
          </p>
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-5xl space-y-6 px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Options — weighted criteria score &amp; EV distribution</h2>
          <p className="mt-1 text-xs text-slate-500">EV is a distribution from Monte Carlo (scenario-weighted draw, then triangular payoff) — p10 is shown so the downside can&apos;t be skipped.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="pb-2">Option</th>
                  <th className="pb-2">Weighted score</th>
                  <th className="pb-2">EV p10</th>
                  <th className="pb-2">EV p50</th>
                  <th className="pb-2">EV p90</th>
                </tr>
              </thead>
              <tbody>
                {options.map(({ option, score, ev }) => (
                  <tr key={option.id} className={`border-t border-slate-100 ${detail.decision.chosenOptionId === option.id ? "bg-emerald-50" : ""}`}>
                    <td className="py-2 font-medium text-slate-900">{option.label}{detail.decision.chosenOptionId === option.id ? " ✓ chosen" : ""}</td>
                    <td className="py-2">{round2(score)}/10</td>
                    <td className="py-2 font-mono text-rose-600">{ev ? money(ev.value.p10) : "n/a"}</td>
                    <td className="py-2 font-mono">{ev ? money(ev.value.p50) : "n/a"}</td>
                    <td className="py-2 font-mono text-emerald-600">{ev ? money(ev.value.p90) : "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {hasTree && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Decision tree — probability branches &amp; EV roll-up</h2>
            <div className="mt-4">{tree.map((root) => <TreeBranch key={root.id} node={root} depth={0} />)}</div>
            {sensitivity.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-700">Sensitivity: root EV swing if a chance node&apos;s probability shifts +10pp</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {sensitivity.map((s) => (
                    <li key={s.nodeId}>{s.label}: {money(s.baseRootEv)} → {money(s.shiftedRootEv)} ({s.swing >= 0 ? "+" : ""}{money(s.swing)})</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Pre-mortem prompts</h2>
          <ul className="mt-3 space-y-3">
            {prompts.map((p, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium text-slate-800">{p.prompt}</p>
                <p className="text-xs text-slate-500">{p.rationale}</p>
              </li>
            ))}
          </ul>
        </section>

        {detail.retro && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Retrospective</h2>
            <p className="mt-1 text-xs text-slate-500">Due {detail.retro.dueAt}{detail.retro.completedAt ? ` · completed ${new Date(detail.retro.completedAt).toISOString().slice(0, 10)}` : " · not yet completed"}</p>
            {detail.retro.calibrationErrorNotes && <p className="mt-2 text-sm text-slate-700">{detail.retro.calibrationErrorNotes}</p>}
            {detail.retro.lessons && <p className="mt-1 text-sm italic text-slate-600">Lesson: {detail.retro.lessons}</p>}
          </section>
        )}

        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Usability guardrail</p>
          <p className="mt-1">
            Calling <code>POST /api/decisions/{detail.decision.id}/decide</code> without <code>downsideAcknowledged: true</code> returns HTTP 422. This exists specifically to counter the trap an executive under time pressure falls into: anchoring on the headline EV p50/mean and never looking at the p10 tail before committing to a one-way door.
          </p>
        </section>
      </div>
    </main>
  );
}
