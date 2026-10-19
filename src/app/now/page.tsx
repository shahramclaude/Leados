import Link from "next/link";
import { PageHeader, Panel, Badge, StatTile, EmptyState, LinkButton } from "@/components/leados/ui";
import type { Severity } from "@/components/leados/ui/tokens";
import { getNowAttention, generateDecisions, generateSignals, generateExecutionItems } from "@/lib/engine";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = { decision: "Decision", signal: "Signal", execution: "Execution" };

export default function NowPage() {
  const attention = getNowAttention();
  const decisions = generateDecisions();
  const signals = generateSignals();
  const execution = generateExecutionItems();

  const pendingDecisions = decisions.filter((d) => d.status === "pending").length;
  const criticalSignals = signals.filter((s) => s.severity === "critical" || s.severity === "warning").length;
  const blockedWork = execution.filter((e) => e.status === "blocked").length;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Today" }]}
        title="Today"
        description={`${today} — the highest-severity items across decisions, signals and execution.`}
        primaryAction={<LinkButton href="/act/decisions?new=1">New decision</LinkButton>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Pending decisions" value={pendingDecisions} caption="awaiting a call" deltaTone={pendingDecisions > 3 ? "critical" : "neutral"} icon="✅" />
        <StatTile label="Active risk signals" value={criticalSignals} caption="critical or warning" deltaTone={criticalSignals > 2 ? "critical" : "neutral"} icon="📡" />
        <StatTile label="Blocked work" value={blockedWork} caption="execution items blocked" deltaTone={blockedWork > 0 ? "critical" : "good"} icon="🚧" />
      </div>

      <Panel title="Needs your attention" description="Sorted by severity across the whole organization." padded={false}>
        {attention.length === 0 ? (
          <div className="p-4">
            <EmptyState icon="🎉" title="Nothing urgent" description="No critical decisions, signals or blockers right now." />
          </div>
        ) : (
          <ul className="leados-stagger divide-y divide-border-subtle">
            {attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors duration-[var(--motion-fast)] hover:bg-surface-sunken"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-text-primary">{item.title}</p>
                    <p className="mt-0.5 text-caption text-text-tertiary">
                      {kindLabel[item.kind]} · {item.meta}
                    </p>
                  </div>
                  <Badge severity={item.severity as Severity}>{kindLabel[item.kind]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
