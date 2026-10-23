import Link from "next/link";
import { AccessDeniedError, listDecisions } from "@/lib/leaderState/repository";
import { ATTACK_DEMO_ACTORS, DEMO_USER_ID } from "@/lib/leaderState/demo";

export const dynamic = "force-dynamic";

interface AttemptResult {
  actorUserId: string;
  actorRole: string;
  outcome: "ALLOWED" | "DENIED";
  detail: string;
}

async function runAttemptMatrix(): Promise<AttemptResult[]> {
  const results: AttemptResult[] = [];
  for (const actor of ATTACK_DEMO_ACTORS) {
    try {
      const rows = await listDecisions(actor, DEMO_USER_ID);
      results.push({
        actorUserId: actor.userId,
        actorRole: actor.role,
        outcome: "ALLOWED",
        detail: `Returned ${rows.length} row(s) — only possible because actor.userId === owner.userId.`,
      });
    } catch (err) {
      results.push({
        actorUserId: actor.userId,
        actorRole: actor.role,
        outcome: "DENIED",
        detail: err instanceof AccessDeniedError ? err.message : "Unexpected error",
      });
    }
  }
  return results;
}

export default async function AccessModelPage() {
  const results = await runAttemptMatrix();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <h1 className="m-0 text-3xl font-semibold text-slate-950">Access model &amp; proof</h1>
        <Link href="/my-state" className="text-sm text-indigo-700 underline">
          ← Back to My State
        </Link>
      </header>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <h2 className="m-0 text-sm font-semibold text-slate-900">The guarantee</h2>
        <p className="m-0">
          Decisions, recovery signals, and grants live in a dedicated <code>leader_state</code> Postgres
          schema. The only code in the entire app allowed to read or write those tables is{" "}
          <code>src/lib/leaderState/repository.ts</code>, and every one of its functions checks{" "}
          <code>actor.userId === ownerUserId</code> before doing anything — there is no role (admin,
          manager, or an internal system process) that is ever allowed to substitute for that check. The
          only other way data ever leaves this scope is a signal you explicitly grant, with an expiry you
          control (see Capacity-aware scheduling on the My State page) — and that signal is a coarse derived
          number, never your raw decisions or notes.
        </p>
        <p className="m-0 text-xs text-slate-500">
          Defense-in-depth note: the tables also have Postgres row-level security policies defined. In this
          sandbox the database connects as a superuser, and PostgreSQL superusers always bypass row-level
          security — so here, the tested and load-bearing guarantee is the repository-layer check above, not
          the database policy. In a production deployment with a non-superuser application role, the
          database policy becomes a second, independent layer.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="m-0 text-sm font-semibold text-slate-900">Live attempt matrix</h2>
        <p className="m-0 mt-1 text-xs text-slate-500">
          This table is generated fresh on every page load by actually calling the repository function with
          each actor below, against your own records.
        </p>
        <table className="mt-3 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-1 pr-2">Actor</th>
              <th className="py-1 pr-2">Role</th>
              <th className="py-1 pr-2">Outcome</th>
              <th className="py-1">Detail</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">
                <td className="py-1 pr-2 font-mono">{r.actorUserId}</td>
                <td className="py-1 pr-2">{r.actorRole}</td>
                <td className={"py-1 pr-2 font-semibold " + (r.outcome === "DENIED" ? "text-emerald-700" : "text-amber-700")}>
                  {r.outcome}
                </td>
                <td className="py-1 text-slate-600">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 mt-3 text-xs text-slate-500">
          The only &quot;ALLOWED&quot; row above is the one whose actor id matches the data owner&apos;s id —
          note that this holds even when that actor&apos;s role header is spoofed to &quot;admin&quot;, because
          role is never part of the check. Any actor with a different id is denied regardless of role,
          including &quot;system&quot;.
        </p>
      </section>
    </main>
  );
}
