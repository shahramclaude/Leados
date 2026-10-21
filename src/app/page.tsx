import { getSessionContext } from "@/lib/demo-auth";
import { can } from "@/lib/permissions";
import { listFindings } from "@/services/findings";
import { ExplainPanel } from "@/components/ExplainPanel";
import { NewFindingForm } from "@/components/NewFindingForm";
import { ProposalDemo } from "@/components/ProposalDemo";
import type { Explain } from "@/lib/explain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSessionContext();

  if (!session) {
    return (
      <main className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900">No identity selected</h1>
        <p className="mt-2 text-sm text-slate-600">
          Pick a demo identity from the top-right selector to see tenant-scoped findings. LEADOS has
          no real login yet — see the Red Team report, finding SEC-1.
        </p>
      </main>
    );
  }

  const rows = await listFindings(session);

  return (
    <main className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-slate-950">Findings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every finding — intelligence, people, or finance — renders through the same
          <code className="mx-1 rounded bg-slate-200 px-1">Explain&lt;T&gt;</code>
          panel.
        </p>
      </section>

      {can(session.role, "finding:write") && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            New finding
          </h2>
          <NewFindingForm />
        </section>
      )}

      <section className="grid gap-4">
        {rows.length === 0 && (
          <p className="text-sm text-slate-500">No findings yet for this org.</p>
        )}
        {rows.map((finding) => (
          <article key={finding.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{finding.title}</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-500">
                {finding.domain}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{finding.summary}</p>
            <div className="mt-3">
              <ExplainPanel
                explanation={finding.explanation as Explain<Record<string, unknown>>}
                causalConfidence={finding.causalConfidence}
              />
            </div>
          </article>
        ))}
      </section>

      {can(session.role, "proposal:write") && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            LLM proposal drafting (causal-language rule demo)
          </h2>
          <ProposalDemo
            findings={rows.map((r) => ({ id: r.id, title: r.title, causalConfidence: r.causalConfidence }))}
          />
        </section>
      )}
    </main>
  );
}
