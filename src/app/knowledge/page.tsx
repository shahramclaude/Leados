import { db } from "@/db";
import { entities, relations } from "@/db/schema";
import { computeGenome } from "@/lib/genome";
import GraphExplorer from "./GraphExplorer";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const [entityRows, relationRows, genome] = await Promise.all([
    db.select().from(entities),
    db.select().from(relations),
    computeGenome(),
  ]);
  const entityById = new Map(entityRows.map((e) => [e.id, e]));

  return (
    <main className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold text-slate-950">Knowledge Graph</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Entities (people, projects, decisions, hypotheses, metrics, risks, playbooks) connected by typed relations
          (caused, blocked, informs, supersedes, owns) — extracted explicitly from structured events, never from
          private content.
        </p>
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-950">Graph queries</h2>
        <p className="mt-1 text-sm text-slate-600">Neighbors at depth N, shortest influence path, blast radius of a change, and orphan detection.</p>
        <div className="mt-4">
          <GraphExplorer entityOptions={entityRows.map((e) => ({ key: e.key, name: e.name, type: e.type }))} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
          <h2 className="text-lg font-semibold text-slate-950">Entities ({entityRows.length})</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {entityRows.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="font-medium text-slate-900">{e.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">{e.type}</span>
              </li>
            ))}
            {entityRows.length === 0 && <li className="text-slate-500">No entities yet — POST /api/seed to seed demo data.</li>}
          </ul>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
          <h2 className="text-lg font-semibold text-slate-950">Relations ({relationRows.length})</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {relationRows.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <span className="font-medium text-slate-900">{entityById.get(r.fromEntityId)?.name ?? r.fromEntityId}</span>{" "}
                <span className="text-slate-500">—{r.type}→</span>{" "}
                <span className="font-medium text-slate-900">{entityById.get(r.toEntityId)?.name ?? r.toEntityId}</span>
                <span className="ml-2 text-xs text-slate-400">weight {r.weight}</span>
              </li>
            ))}
            {relationRows.length === 0 && <li className="text-slate-500">No relations yet.</li>}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-950">Organizational genome</h2>
        <p className="mt-1 text-sm text-slate-600">Recurring traits computed live from the graph + institutional memory.</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          {genome.relationMix.map((m) => (
            <div key={m.type} className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase text-slate-500">{m.type}</div>
              <div className="text-xl font-semibold text-slate-950">{(m.share * 100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
