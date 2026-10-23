import { db } from "@/db";
import { decisions } from "@/db/schema";
import { getOrCreateDefaultTenant } from "@/lib/tenant";
import { desc, eq } from "drizzle-orm";
import { LedgerView } from "./LedgerView";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const tenant = await getOrCreateDefaultTenant();
  const initialDecisions = tenant
    ? await db
        .select()
        .from(decisions)
        .where(eq(decisions.tenantId, tenant.id))
        .orderBy(desc(decisions.createdAt))
        .limit(200)
    : [];

  return (
    <main className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-950">Evidence Ledger</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Append-only record of every decision made by the system or an
          operator. Each entry is hash-chained to the previous one — editing
          or deleting history breaks the chain and is detectable.
        </p>
      </header>
      <LedgerView initialDecisions={JSON.parse(JSON.stringify(initialDecisions))} />
    </main>
  );
}
