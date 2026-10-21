import { getSessionContext } from "@/lib/demo-auth";
import { listEvents } from "@/services/audit";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await getSessionContext();
  if (!session) {
    return <p className="text-sm text-slate-600">Pick a demo identity first.</p>;
  }

  const { events: rows, chain } = await listEvents(session);

  return (
    <main className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-950">Audit log</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every write — human, agent, or LLM — appears here via the hash-chained event envelope
          (Part 01). Nothing writes to the database without also writing here.
        </p>
      </section>

      <div
        className={`rounded-lg p-3 text-sm font-medium ${
          chain.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
        }`}
      >
        {chain.ok
          ? `Hash chain intact across ${chain.checked} event(s).`
          : `Hash chain broken at event ${chain.brokenAt}.`}
      </div>

      <table className="w-full table-auto border-collapse overflow-hidden rounded-xl bg-white text-sm shadow-sm">
        <thead className="bg-slate-900 text-left text-white">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Entity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="px-3 py-2 text-xs text-slate-500">
                {new Date(row.createdAt).toLocaleString()}
              </td>
              <td className="px-3 py-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs uppercase">
                  {row.actorType}
                </span>{" "}
                {row.actorId}
              </td>
              <td className="px-3 py-2">{row.action}</td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {row.entityType}/{row.entityId.slice(0, 8)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                No events yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
