import { db } from "@/db";
import { leads } from "@/db/schema";
import { getOrCreateDefaultTenant } from "@/lib/tenant";
import { desc, eq } from "drizzle-orm";
import { LeadsBoard } from "./LeadsBoard";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const tenant = await getOrCreateDefaultTenant();
  const initialLeads = tenant
    ? await db
        .select()
        .from(leads)
        .where(eq(leads.tenantId, tenant.id))
        .orderBy(desc(leads.score), desc(leads.createdAt))
    : [];

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-950">Leads</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Every lead is scored by a deterministic, explainable engine — no
          black box. Expand a lead to see exactly which criteria produced its
          score, and every score or stage change is written to the evidence
          ledger.
        </p>
      </header>
      <LeadsBoard initialLeads={JSON.parse(JSON.stringify(initialLeads))} />
    </main>
  );
}
