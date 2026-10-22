import { listOrgs } from "@/lib/decision/orgs";
import { listDecisionRights, detectAmbiguousDecisionRights } from "@/lib/decision/decisionRights";
import { DecisionsNav, Card, Pill } from "../components";
import { upsertRightsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function RightsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const orgs = await listOrgs();
  const sp = await searchParams;
  const orgId = sp.org ?? orgs[0]?.id ?? "";
  const [configs, findings] = await Promise.all([
    orgId ? listDecisionRights(orgId) : Promise.resolve([]),
    orgId ? detectAmbiguousDecisionRights(orgId) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <DecisionsNav orgId={orgId} orgs={orgs} active="rights" />
      <h1 className="text-3xl font-semibold text-slate-950">Decision Rights (RACI)</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        One Decider role per decision class, plus Consulted and Informed roles. Classes in active use with no
        configured decider are surfaced below as ambiguity findings.
      </p>

      {findings.length > 0 && (
        <Card className="mt-6 border-2 border-amber-400 bg-amber-50">
          <h2 className="font-semibold text-amber-900">Ambiguity findings</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {findings.map((f) => (
              <li key={f.decisionClass}>⚠ {f.message}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Configured classes</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Decision class</th>
              <th className="py-2">Decider</th>
              <th className="py-2">Consulted</th>
              <th className="py-2">Informed</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="py-2">{c.decisionClass}</td>
                <td className="py-2">
                  {c.deciderRole ? <Pill tone="green">{c.deciderRole}</Pill> : <Pill tone="amber">unconfigured</Pill>}
                </td>
                <td className="py-2">{(c.consultedRoles as string[]).join(", ") || "—"}</td>
                <td className="py-2">{(c.informedRoles as string[]).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold">Configure / update a class</h2>
        <form action={upsertRightsAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="orgId" value={orgId} />
          <input name="decisionClass" required placeholder="decision class" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="deciderRole" placeholder="decider role (e.g. eng_director)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="consultedRoles" placeholder="consulted roles, comma separated" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="informedRoles" placeholder="informed roles, comma separated" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="sm:col-span-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Save
          </button>
        </form>
      </Card>
    </main>
  );
}
