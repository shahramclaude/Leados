import { PageHeader } from "@/components/leados/ui/PageHeader";
import { CockpitBoard } from "@/components/leados/cockpit/CockpitBoard";
import { getCockpitData } from "@/lib/leados/queries";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const { pendingDecisions, recentActivity, topSignals, keyMetrics } = await getCockpitData();
  const now = new Date();

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "LEADOS", href: "/leados/now" }, { label: "Cockpit" }]}
        title="Cockpit"
        description="Today's decisions, pending approvals, and what changed overnight — everything that needs you, nothing that doesn't."
      />
      <CockpitBoard
        initialDecisions={pendingDecisions.map((d) => ({
          ...d,
          financialImpact: String(d.financialImpact),
          dueDate: d.dueDate.toISOString(),
          createdAt: d.createdAt.toISOString(),
          decidedAt: d.decidedAt ? d.decidedAt.toISOString() : null,
        }))}
        recentActivity={recentActivity.map((a) => ({ ...a, occurredAt: a.occurredAt.toISOString() }))}
        topSignals={topSignals.map((s) => ({ ...s, value: String(s.value), changePct: String(s.changePct), detectedAt: s.detectedAt.toISOString() }))}
        keyMetrics={keyMetrics.map((m) => ({ ...m, value: String(m.value), target: String(m.target) }))}
        anchorIso={now.toISOString()}
      />
    </>
  );
}
