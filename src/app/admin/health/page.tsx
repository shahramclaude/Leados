import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getProjectionLagMs } from "@/lib/platform/events/projector";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const orgs = await db.select().from(schema.orgs).orderBy(desc(schema.orgs.createdAt)).limit(200);

  const rows = await Promise.all(
    orgs.map(async (org) => {
      const lagMs = await getProjectionLagMs(db, org.id);
      const pending = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.outbox)
        .where(sql`${schema.outbox.orgId} = ${org.id} and ${schema.outbox.status} = 'pending'`);
      const events = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.events)
        .where(eq(schema.events.orgId, org.id));
      return { org, lagMs, pending: pending[0]?.count ?? 0, events: events[0]?.count ?? 0 };
    }),
  );

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS Admin</p>
            <h1 className="text-3xl font-semibold text-slate-950">Platform Health</h1>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link className="text-indigo-600 hover:underline" href="/admin/events">
              Event log →
            </Link>
          </nav>
        </header>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Org</th>
                <th className="px-4 py-3">Total events</th>
                <th className="px-4 py-3">Outbox pending</th>
                <th className="px-4 py-3">Projection lag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ org, lagMs, pending, events }) => (
                <tr key={org.id}>
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {org.name} <span className="text-xs text-slate-500">({org.slug})</span>
                  </td>
                  <td className="px-4 py-2">{events}</td>
                  <td className="px-4 py-2">{pending}</td>
                  <td className="px-4 py-2">
                    <span className={pending === 0 ? "text-emerald-700" : lagMs > 5000 ? "text-red-700" : "text-amber-700"}>{lagMs} ms</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No orgs yet — run <code>npm run seed</code>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          projectionLagMs = now − max(recordedAt) across events whose outbox row is still pending. 0 means the projector is caught up.
        </p>
      </div>
    </main>
  );
}
