import { getNowSurface, markVisited } from "@/lib/now";
import { getCurrentUserIdServer } from "@/lib/auth";
import { CommentThread } from "@/components/CommentThread";
import { PresenceBadges } from "@/components/PresenceBadges";
import { AttentionBudgetPanel } from "@/components/AttentionBudgetPanel";
import { SeedControls } from "@/components/SeedControls";

export const dynamic = "force-dynamic";

const SEVERITY_BADGE: Record<number, string> = {
  1: "bg-slate-100 text-slate-600",
  2: "bg-sky-100 text-sky-700",
  3: "bg-amber-100 text-amber-700",
  4: "bg-orange-100 text-orange-700",
  5: "bg-rose-100 text-rose-700",
};

export default async function HomePage() {
  const userId = await getCurrentUserIdServer();
  const surface = await getNowSurface(userId);
  await markVisited(userId);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.08em] text-indigo-600">LEADOS · Now</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">What needs you right now</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Decision-first cockpit: the top things that need a human call, what changed since your last visit, and
            one recommended next action — each with the evidence behind it.
          </p>
        </div>
        <SeedControls />
      </header>

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Top decisions needing you now</h2>
          {surface.topDecisions.length === 0 ? (
            <EmptyCard text="Nothing urgent — you're caught up." />
          ) : (
            surface.topDecisions.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_BADGE[item.severity] ?? ""}`}>
                    Severity {item.severity} · {item.domain}
                  </span>
                  <PresenceBadges entityType="decision" entityId={item.id} />
                </div>
                <h3 className="mt-2 text-base font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{item.evidence}</p>
                <CommentThread entityType="decision" entityId={item.id} />
              </article>
            ))
          )}
        </div>

        <div className="space-y-4">
          <AttentionBudgetPanel />

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Recommended next action</h3>
            {surface.recommendedAction ? (
              <>
                <p className="mt-2 text-sm font-medium text-slate-800">{surface.recommendedAction.title}</p>
                <p className="mt-1 text-xs text-slate-500">{surface.recommendedAction.why}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No recommendation — queues are empty.</p>
            )}
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Since your last visit</h2>
          <span className="text-xs text-slate-400">as of {new Date(surface.delta.sinceISO).toLocaleString()}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <DeltaStat label="New findings" value={surface.delta.newFindings} />
          <DeltaStat label="New approvals" value={surface.delta.newApprovals} />
          <DeltaStat label="New anomalies" value={surface.delta.newAnomalies} />
          <DeltaStat label="Tasks updated" value={surface.delta.updatedTasks} />
        </div>
        {surface.delta.highlights.length > 0 && (
          <ul className="mt-4 space-y-2">
            {surface.delta.highlights.map((h) => (
              <li key={h.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-medium text-slate-800">{h.title}</span> — {h.evidence}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Pending approvals</h2>
        {surface.pendingApprovals.length === 0 ? (
          <EmptyCard text="Nothing pending approval." />
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {surface.pendingApprovals.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{a.title}</p>
                  <p className="text-xs text-slate-500">{a.evidence}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_BADGE[a.severity] ?? ""}`}>
                  Sev {a.severity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function DeltaStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">{text}</div>;
}
