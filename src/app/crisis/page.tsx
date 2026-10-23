import { db } from "@/db";
import { crises, crisisClasses } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CrisisListPage() {
  const rows = await db
    .select({ crisis: crises, klass: crisisClasses })
    .from(crises)
    .innerJoin(crisisClasses, eq(crises.classId, crisisClasses.id))
    .orderBy(desc(crises.createdAt));

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-950">All crises</h1>
          <Link href="/crisis/declare" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
            Declare a Crisis
          </Link>
        </div>

        <ul className="mt-6 space-y-3">
          {rows.map(({ crisis, klass }) => (
            <li key={crisis.id} className="rounded-xl bg-white p-4 shadow">
              <Link href={`/crisis/${crisis.id}`} className="font-medium text-slate-900 hover:underline">
                {crisis.title}
              </Link>
              <p className="text-xs text-slate-500">
                {klass.name} · state: {crisis.state} · severity {crisis.severity} {crisis.isDrill ? "· DRILL" : ""}
              </p>
            </li>
          ))}
          {rows.length === 0 && <p className="text-sm text-slate-600">No crises yet.</p>}
        </ul>
      </div>
    </main>
  );
}
