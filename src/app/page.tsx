import Link from "next/link";
import { seedDefaultPolicyIfEmpty } from "@/lib/scoping";
import { seedDefaultCapabilitiesIfEmpty } from "@/lib/capabilities";
import { resolveServerUser } from "@/lib/currentUser";
import { loadNowSurface } from "@/lib/nowSurface";
import ViewAsSwitcher from "@/components/ViewAsSwitcher";
import LazyNotificationTray from "@/components/LazyNotificationTray";

export const dynamic = "force-dynamic";

const SEVERITY_LABEL: Record<number, string> = {
  5: "Critical",
  4: "High",
  3: "Elevated",
  2: "Moderate",
  1: "Low",
};

function scoreBadge(kind: string) {
  return kind === "approval" ? "bg-violet-100 text-violet-700" : "bg-rose-100 text-rose-700";
}

export default async function HomePage() {
  await seedDefaultPolicyIfEmpty();
  await seedDefaultCapabilitiesIfEmpty();

  const user = await resolveServerUser();

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center px-6 py-12">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow">
          <h1 className="text-xl font-semibold text-slate-900">No users yet</h1>
          <p className="mt-2 text-sm text-slate-500">
            Run <code className="rounded bg-slate-100 px-1">npx tsx scripts/seed.ts</code> to create demo users, roles, and
            sample findings.
          </p>
        </div>
      </main>
    );
  }

  const data = await loadNowSurface(user.id, user.role);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.1em] text-slate-400">LEADOS — Now</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">
              {user.name} <span className="text-sm font-normal text-slate-400">· {user.role}</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <ViewAsSwitcher />
            <LazyNotificationTray />
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-500">What changed since your last visit</h2>
          {data.delta.isFirstVisit ? (
            <p className="mt-2 text-sm text-slate-600">First visit — everything below is new to you.</p>
          ) : data.delta.totalChanges === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Nothing new since you were last here. You're fully caught up.</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="font-medium">{data.delta.totalChanges} update{data.delta.totalChanges === 1 ? "" : "s"}</span>
              {Object.entries(data.delta.byDomain).map(([domain, count]) => (
                <span key={domain} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {domain}: {count}
                </span>
              ))}
            </div>
          )}
        </section>

        {data.isEmptyOrg ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="text-lg font-semibold text-slate-800">Nothing needs you right now</h2>
            <p className="mt-2 text-sm text-slate-500">
              No open findings or pending approvals are visible to your role. As findings, approvals, and work-queue items
              are created, your top decisions will show up here automatically — ranked by severity × urgency.
            </p>
          </section>
        ) : (
          <>
            {data.recommendedAction && (
              <section className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Recommended next action</h2>
                <p className="mt-1 text-lg font-semibold text-indigo-950">{data.recommendedAction.title}</p>
                <p className="mt-1 text-sm text-indigo-800">{data.recommendedAction.evidence}</p>
                {data.recommendedAction.entityRef && (
                  <Link
                    href={data.recommendedAction.entityRef}
                    className="mt-3 inline-block rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Open →
                  </Link>
                )}
              </section>
            )}

            <section className="mb-6">
              <h2 className="mb-3 text-sm font-semibold text-slate-500">Top decisions needing attention</h2>
              <div className="space-y-3">
                {data.topDecisions.map((d) => (
                  <Link
                    key={`${d.kind}-${d.id}`}
                    href={d.entityRef ?? "#"}
                    className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${scoreBadge(d.kind)}`}>
                        {d.kind} · {SEVERITY_LABEL[d.severity] ?? d.severity}
                      </span>
                      <span className="text-[11px] text-slate-400">{d.domain}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-900">{d.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{d.evidence}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-500">Pending approvals</h2>
              <div className="space-y-2">
                {data.pendingApprovals.length === 0 && <p className="text-sm text-slate-400">No pending approvals.</p>}
                {data.pendingApprovals.map((a) => (
                  <Link
                    key={a.id}
                    href={a.entityRef ?? "#"}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300"
                  >
                    <span className="text-sm text-slate-800">{a.title}</span>
                    <span className="text-xs text-slate-400">for {a.requestedForRole}</span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
