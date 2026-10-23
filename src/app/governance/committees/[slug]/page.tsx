import { db } from "@/db";
import { committees, committeeMembers, users, conflictsRegister, resolutions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const COMMITTEE_SLUGS = ["audit", "risk", "compensation"];

export default async function CommitteePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!COMMITTEE_SLUGS.includes(slug)) notFound();

  const [committee] = await db.select().from(committees).where(eq(committees.slug, slug));
  if (!committee) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-950">{slug} committee</h1>
        <p className="mt-4 text-sm text-slate-500">
          Not seeded yet. Run <code>npm run verify</code> to create the demo board.
        </p>
      </main>
    );
  }

  const members = await db
    .select({ membership: committeeMembers, user: users })
    .from(committeeMembers)
    .innerJoin(users, eq(committeeMembers.userId, users.id))
    .where(eq(committeeMembers.committeeId, committee.id));

  const allResolutions = await db.select().from(resolutions);
  const allConflicts = await db.select().from(conflictsRegister);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex gap-3 text-sm">
        {COMMITTEE_SLUGS.map((s) => (
          <Link
            key={s}
            href={`/governance/committees/${s}`}
            className={`rounded-full px-3 py-1 ${
              s === slug ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      <h1 className="mt-4 text-2xl font-semibold text-slate-950">{committee.name}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">{committee.scopeDescription}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Members</h2>
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {members.map((m) => (
            <li key={m.membership.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium text-slate-900">{m.user.name}</span>
              <span className="text-slate-500">{m.membership.roleInCommittee}</span>
            </li>
          ))}
          {members.length === 0 && (
            <li className="px-4 py-6 text-center text-slate-400">No members recorded.</li>
          )}
        </ul>
      </section>

      {slug === "audit" && (
        <section className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <h2 className="text-sm font-semibold text-indigo-900">Audit-committee-only channels</h2>
          <p className="mt-1 text-sm text-indigo-900">
            The{" "}
            <Link href="/governance/whistleblower" className="underline">
              whistleblower / safe channel
            </Link>{" "}
            is visible only to the chair and audit committee tiers — not to management or ordinary
            directors. See the access matrix for the enforced rule.
          </p>
        </section>
      )}

      {slug === "risk" && (
        <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Risk oversight scope</h2>
          <p className="mt-1 text-sm text-amber-900">
            Every board pack&apos;s mandatory <code>risk_and_controls</code> section is checked by
            the completeness red-flag detector before the board sees the pack as &ldquo;complete&rdquo;.
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Conflicts register (board-level)</h2>
        <ul className="mt-3 space-y-2">
          {allConflicts.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <p className="font-medium text-slate-900">{c.matter}</p>
              <p className="text-slate-600">{c.natureOfInterest}</p>
              <p className="mt-1 text-xs text-slate-500">
                director #{c.directorId} · status: {c.status}
                {c.recusalRequired ? " · recusal required" : ""}
              </p>
            </li>
          ))}
          {allConflicts.length === 0 && (
            <p className="text-sm text-slate-400">No conflicts declared yet.</p>
          )}
        </ul>
      </section>

      <section className="mt-8 mb-10">
        <h2 className="text-lg font-semibold text-slate-900">Resolutions register (all committees)</h2>
        <ul className="mt-3 space-y-2">
          {allResolutions.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <p className="font-medium text-slate-900">
                #{r.id} · {r.type} · {r.status}
              </p>
              <p className="text-slate-600">{r.text}</p>
            </li>
          ))}
          {allResolutions.length === 0 && (
            <p className="text-sm text-slate-400">No resolutions yet.</p>
          )}
        </ul>
      </section>
    </main>
  );
}
