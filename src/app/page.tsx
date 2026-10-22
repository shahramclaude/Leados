import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { getSession } from "@/lib/session";
import { PeoplePanel } from "@/components/PeoplePanel";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.orgId, session.orgId), isNull(people.deletedAt)))
    .orderBy(desc(people.createdAt))
    .limit(200);

  const canWrite = session.role === "admin" || session.role === "manager";

  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS · Part 19 security slice</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">People</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every row shown here is scoped to your organization only, enforced at the query layer — not by client-side
          filtering.
        </p>
      </header>
      <PeoplePanel initialPeople={rows.map((r) => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email }))} canWrite={canWrite} />
    </main>
  );
}
