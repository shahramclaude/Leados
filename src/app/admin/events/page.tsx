import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const dynamic = "force-dynamic";

const LIMIT = 50;

type SearchParams = {
  orgId?: string;
  eventType?: string;
  entityType?: string;
  actorId?: string;
  from?: string;
  to?: string;
};

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const orgs = await db.select().from(schema.orgs).orderBy(desc(schema.orgs.createdAt)).limit(200);
  const orgId = sp.orgId ?? orgs[0]?.id ?? "";

  const conditions = orgId ? [eq(schema.events.orgId, orgId)] : [];
  if (sp.eventType) conditions.push(eq(schema.events.eventType, sp.eventType));
  if (sp.entityType) conditions.push(eq(schema.events.entityType, sp.entityType));
  if (sp.actorId) conditions.push(eq(schema.events.actorId, sp.actorId));
  if (sp.from) conditions.push(sql`${schema.events.occurredAt} >= ${new Date(sp.from)}`);
  if (sp.to) conditions.push(sql`${schema.events.occurredAt} <= ${new Date(sp.to)}`);

  const events = orgId
    ? await db
        .select()
        .from(schema.events)
        .where(and(...conditions))
        .orderBy(desc(schema.events.seq))
        .limit(LIMIT)
    : [];

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS Admin</p>
            <h1 className="text-3xl font-semibold text-slate-950">Event Log Browser</h1>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link className="text-indigo-600 hover:underline" href="/admin/health">
              Platform health →
            </Link>
            <Link className="text-indigo-600 hover:underline" href="/">
              Home →
            </Link>
          </nav>
        </header>

        <form className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-6 shadow-sm md:grid-cols-6" method="get">
          <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-600">
            Org
            <select name="orgId" defaultValue={orgId} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Event type
            <input name="eventType" defaultValue={sp.eventType ?? ""} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="entity.created" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Entity type
            <input name="entityType" defaultValue={sp.entityType ?? ""} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="objective" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Actor id
            <input name="actorId" defaultValue={sp.actorId ?? ""} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-lg bg-slate-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
              Filter
            </button>
          </div>
        </form>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Seq</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Occurred</th>
                <th className="px-4 py-3">Recorded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{event.seq}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">{event.eventType}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {event.entityType}/{event.entityId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {event.actorKind}:{event.actorDisplayName}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{new Date(event.occurredAt).toISOString()}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{new Date(event.recordedAt).toISOString()}</td>
                  <td className="px-4 py-2">
                    <Link className="text-indigo-600 hover:underline" href={`/admin/events/${event.id}`}>
                      Inspect →
                    </Link>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    No events match this filter (or no org has been seeded yet — run <code>npm run seed</code>).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Showing up to {LIMIT} most recent events (bounded query — never unbounded).</p>
      </div>
    </main>
  );
}
