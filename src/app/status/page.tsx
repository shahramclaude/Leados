import { db } from "@/db";
import { crises, crisisClasses, statusPageUpdates } from "@/db/schema";
import { desc, ne, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const activeCrises = await db
    .select({ crisis: crises, klass: crisisClasses })
    .from(crises)
    .innerJoin(crisisClasses, eq(crises.classId, crisisClasses.id))
    .where(ne(crises.state, "closed"))
    .orderBy(desc(crises.updatedAt));

  const withUpdates = await Promise.all(
    activeCrises.map(async (row) => {
      const updates = await db
        .select()
        .from(statusPageUpdates)
        .where(eq(statusPageUpdates.crisisId, row.crisis.id))
        .orderBy(desc(statusPageUpdates.version));
      return { ...row, updates };
    }),
  );

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.1em] text-slate-400">LEADOS · Single Source of Truth</p>
        <h1 className="mt-2 text-3xl font-bold">System Status</h1>
        <p className="mt-2 text-sm text-slate-400">
          This is the page everyone shares. Cached for offline/degraded-network viewing. Last rendered:{" "}
          {new Date().toLocaleString()}.
        </p>

        {withUpdates.length === 0 && (
          <div className="mt-8 rounded-2xl border border-emerald-700 bg-emerald-950/40 p-6">
            <p className="text-lg font-semibold text-emerald-300">All systems normal.</p>
            <p className="mt-1 text-sm text-emerald-200">No active crises are being tracked.</p>
          </div>
        )}

        {withUpdates.map(({ crisis, klass, updates }) => (
          <section key={crisis.id} className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{crisis.title}</h2>
              <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase">{crisis.state}</span>
            </div>
            <p className="text-sm text-slate-400">{klass.name} · severity {crisis.severity}</p>

            <ul className="mt-4 space-y-4 border-l-2 border-slate-700 pl-4">
              {updates.map((u) => (
                <li key={u.id}>
                  <p className="text-xs font-mono text-slate-500">v{u.version} · {new Date(u.publishedAt).toLocaleString()}</p>
                  <p className="font-semibold">{u.headline}</p>
                  <p className="text-sm text-slate-300">{u.body}</p>
                </li>
              ))}
              {updates.length === 0 && <li className="text-sm text-slate-500">No public updates published yet.</li>}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
