import { Suspense } from "react";
import { PageHeader } from "@/components/leados/ui/PageHeader";
import { SkeletonTable } from "@/components/leados/ui/Skeleton";
import { TabsRouter } from "@/components/leados/understand/TabsRouter";
import { PeoplePanel } from "@/components/leados/understand/PeoplePanel";
import { MetricsPanel } from "@/components/leados/understand/MetricsPanel";
import { SignalsPanel } from "@/components/leados/understand/SignalsPanel";
import { KnowledgePanel } from "@/components/leados/understand/KnowledgePanel";
import { HypothesesPanel } from "@/components/leados/understand/HypothesesPanel";
import { getHypotheses, getKnowledge, getMetrics, getPeople, getSignals } from "@/lib/leados/queries";
import { ROUTES } from "@/app/routes";

export const dynamic = "force-dynamic";

const TABS = ROUTES.find((r) => r.id === "understand")!.tabs!;

async function TabContent({ tab }: { tab: string }) {
  switch (tab) {
    case "metrics": {
      const rows = await getMetrics();
      return (
        <MetricsPanel
          metrics={rows.map((m) => ({
            ...m,
            value: String(m.value),
            target: String(m.target),
            p10: String(m.p10),
            p50: String(m.p50),
            p90: String(m.p90),
            series: m.series as { t: string; v: number }[],
            updatedAt: m.updatedAt.toISOString(),
          }))}
        />
      );
    }
    case "signals": {
      const rows = await getSignals();
      return <SignalsPanel signals={rows.map((s) => ({ ...s, value: String(s.value), changePct: String(s.changePct), detectedAt: s.detectedAt.toISOString() }))} />;
    }
    case "knowledge": {
      const rows = await getKnowledge();
      return <KnowledgePanel items={rows.map((k) => ({ ...k, updatedAt: k.updatedAt.toISOString() }))} />;
    }
    case "hypotheses": {
      const rows = await getHypotheses();
      return <HypothesesPanel items={rows.map((h) => ({ ...h, updatedAt: h.updatedAt.toISOString() }))} />;
    }
    case "people":
    default: {
      const rows = await getPeople();
      return <PeoplePanel people={rows} />;
    }
  }
}

export default async function UnderstandPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "people" } = await searchParams;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "LEADOS", href: "/leados/now" }, { label: "Understand" }]}
        title="Understand"
        description="People, metrics, signals, knowledge and hypotheses — the context behind every decision in Act."
        tabs={<TabsRouter items={TABS} />}
      />
      <Suspense fallback={<SkeletonTable rows={8} cols={5} />}>
        <TabContent tab={tab} />
      </Suspense>
    </>
  );
}
