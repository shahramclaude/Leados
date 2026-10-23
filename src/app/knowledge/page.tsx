import { db } from "@/db";
import { knowledgeEntries } from "@/db/schema";
import { getOrCreateDefaultTenant } from "@/lib/tenant";
import { desc, eq } from "drizzle-orm";
import { KnowledgeBoard } from "./KnowledgeBoard";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const tenant = await getOrCreateDefaultTenant();
  const initialEntries = tenant
    ? await db
        .select()
        .from(knowledgeEntries)
        .where(eq(knowledgeEntries.tenantId, tenant.id))
        .orderBy(desc(knowledgeEntries.updatedAt))
    : [];

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-950">Knowledge Substrate</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Institutional memory: durable notes, playbooks, and findings, each
          tagged with an honest confidence label — measured, estimated,
          association, or effect — so nothing is overstated.
        </p>
      </header>
      <KnowledgeBoard initialEntries={JSON.parse(JSON.stringify(initialEntries))} />
    </main>
  );
}
