import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { verifyAuditChain } from "@/lib/audit";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const [rows, verification] = await Promise.all([
    db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.orgId, DEFAULT_ORG_ID))
      .orderBy(desc(auditEvents.createdAt))
      .limit(200),
    verifyAuditChain(DEFAULT_ORG_ID),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Audit Trail"
        description="Every write in LEADOS appends a hash-chained event. The chain is re-verified on every page load."
        actions={
          <Badge tone={verification.valid ? "success" : "danger"}>
            {verification.valid ? `Chain intact · ${verification.count} events` : `Chain broken at ${verification.breaks.length} event(s)`}
          </Badge>
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="No audit events yet" description="Actions across the product will appear here." />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((e) => (
            <Card key={e.id} padded={false} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="m-0 text-[13px] font-medium text-[var(--text-primary)]">{e.action}</p>
                  <p className="mt-0.5 m-0 text-[12px] text-[var(--text-muted)]">
                    {e.entityType}
                    {e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ""} · {new Date(e.createdAt).toLocaleString()}
                  </p>
                </div>
                <code className="text-[11px] text-[var(--text-muted)]">{e.hash.slice(0, 12)}…</code>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
