import { listOrgs, listUsersForOrg } from "@/lib/decision/orgs";
import { DecisionsNav, Card } from "../components";
import { createDecisionAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewDecisionPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const orgs = await listOrgs();
  const sp = await searchParams;
  const orgId = sp.org ?? orgs[0]?.id ?? "";
  const users = orgId ? await listUsersForOrg(orgId) : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <DecisionsNav orgId={orgId} orgs={orgs} active="new" />
      <h1 className="text-3xl font-semibold text-slate-950">Raise a decision</h1>
      <p className="mt-2 text-slate-600">
        Step 1 of the funnel: <code>raised</code>. One answerable sentence — not a theme, not a vibe.
      </p>

      <Card className="mt-8">
        <form action={createDecisionAction} className="space-y-5">
          <input type="hidden" name="orgId" value={orgId} />

          <div>
            <label className="block text-sm font-medium text-slate-700">Question (one answerable sentence)</label>
            <input
              name="question"
              required
              placeholder="Should we sunset the legacy billing API by Q3?"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Decision type</label>
              <select name="decisionType" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="type2">Type 2 — reversible</option>
                <option value="type1">Type 1 — irreversible</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Impact (1-5)</label>
              <input
                type="number"
                name="impact"
                min={1}
                max={5}
                defaultValue={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Decision class</label>
            <input
              name="decisionClass"
              required
              placeholder="pricing_change | hiring | architecture | vendor_contract ..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-slate-500">
              Used to look up who Decides / is Consulted / is Informed (see Decision Rights).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Raised by</label>
            <select name="raisedBy" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">(unspecified)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.role}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-800">
            Raise decision
          </button>
        </form>
      </Card>
    </main>
  );
}
