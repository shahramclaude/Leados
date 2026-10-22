import { listOrgs, listUsersForOrg } from "@/lib/decision/orgs";
import { listJournalEntries } from "@/lib/decision/journal";
import { DecisionsNav, Card } from "../components";
import { createJournalAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const orgs = await listOrgs();
  const sp = await searchParams;
  const orgId = sp.org ?? orgs[0]?.id ?? "";
  const [entries, users] = await Promise.all([
    orgId ? listJournalEntries(orgId) : Promise.resolve([]),
    orgId ? listUsersForOrg(orgId) : Promise.resolve([]),
  ]);
  const userNameById = new Map(users.map((u) => [u.id, u.name]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <DecisionsNav orgId={orgId} orgs={orgs} active="journal" />
      <h1 className="text-3xl font-semibold text-slate-950">Decision Journal</h1>
      <p className="mt-2 text-slate-600">
        What I decided, what I expected, what happened, what I learned. Entries are append-only — outcomes are
        added as new rows, never by editing the original expectation (no retrofitted rationale). Feeds the
        retrospectives module (Part 12 — stub seam: not present in this build; entries are event-logged for it
        to subscribe to later).
      </p>

      <Card className="mt-8">
        <form action={createJournalAction} className="space-y-3">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="block text-sm font-medium text-slate-700">Who</label>
            <select name="userId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">(unspecified)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.role}
                </option>
              ))}
            </select>
          </div>
          <textarea name="whatIDecided" required rows={2} placeholder="What I decided" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <textarea name="whatIExpected" required rows={2} placeholder="What I expected" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <textarea name="whatHappened" rows={2} placeholder="What happened (fill in later)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <textarea name="whatILearned" rows={2} placeholder="What I learned (fill in later)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Add entry
          </button>
        </form>
      </Card>

      <div className="mt-8 space-y-4">
        {entries.map((e) => (
          <Card key={e.id}>
            <p className="text-xs text-slate-400">
              {userNameById.get(e.userId ?? "") ?? "unspecified"} · {new Date(e.createdAt).toLocaleString()}
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div>
                <dt className="font-medium text-slate-700">Decided</dt>
                <dd>{e.whatIDecided}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Expected</dt>
                <dd>{e.whatIExpected}</dd>
              </div>
              {e.whatHappened && (
                <div>
                  <dt className="font-medium text-slate-700">Happened</dt>
                  <dd>{e.whatHappened}</dd>
                </div>
              )}
              {e.whatILearned && (
                <div>
                  <dt className="font-medium text-slate-700">Learned</dt>
                  <dd>{e.whatILearned}</dd>
                </div>
              )}
            </dl>
          </Card>
        ))}
      </div>
    </main>
  );
}
