import { PageHeader, Panel, Badge, ProgressBar } from "@/components/leados/ui";
import { generatePlaybooks } from "@/lib/engine";
import { formatDate, formatPercent } from "@/components/leados/ui/utils";

export const dynamic = "force-dynamic";

export default function PlaybooksPage() {
  const playbooks = generatePlaybooks();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Act" }, { label: "Playbooks" }]}
        title="Playbooks"
        description="Automated responses to recurring situations — what fires, when, and how well it has worked."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {playbooks.map((playbook) => (
          <Panel
            key={playbook.id}
            title={playbook.name}
            description={`Trigger: ${playbook.trigger}`}
            actions={<Badge severity={playbook.successRate > 0.8 ? "good" : playbook.successRate > 0.6 ? "caution" : "warning"}>{formatPercent(playbook.successRate)} success</Badge>}
          >
            <ol className="flex flex-col gap-2">
              {playbook.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-2.5 text-body-sm text-text-primary">
                  <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-caption font-semibold text-text-tertiary">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="mt-4">
              <ProgressBar value={playbook.successRate * 100} label="Historical success rate" severity={playbook.successRate > 0.8 ? "good" : "caution"} />
            </div>
            <p className="mt-3 text-caption text-text-tertiary">Last triggered {formatDate(playbook.lastRun, { month: "short", day: "numeric", year: "numeric" })}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
