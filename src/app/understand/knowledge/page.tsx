import { PageHeader, Panel, ChartFrame, NetworkSVG } from "@/components/leados/ui";
import { generateNetwork } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default function KnowledgePage() {
  const graph = generateNetwork();
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const topConnectors = [...graph.nodes]
    .map((n) => ({ ...n, connections: degree.get(n.id) ?? 0 }))
    .sort((a, b) => b.connections - a.connections)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: "LEADOS", href: "/now" }, { label: "Understand" }, { label: "Knowledge" }]}
        title="Knowledge"
        description="How work actually flows — the collaboration network inferred from shared projects, decisions and reviews."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Collaboration network">
          <ChartFrame
            title="Collaboration network"
            description="Node color groups people by inferred cluster; edge thickness reflects interaction weight."
            table={{
              columns: [
                { key: "source", header: "From", render: (r: { source: string; target: string; weight: number }) => graph.nodes.find((n) => n.id === r.source)?.label ?? r.source },
                { key: "target", header: "To", render: (r) => graph.nodes.find((n) => n.id === r.target)?.label ?? r.target },
                { key: "weight", header: "Weight", render: (r) => r.weight, align: "right" },
              ],
              rows: graph.edges.map((edge, i) => ({ ...edge, key: `${edge.source}-${edge.target}-${i}` })),
              rowKey: (r) => r.key,
            }}
          >
            <NetworkSVG nodes={graph.nodes} edges={graph.edges} />
          </ChartFrame>
        </Panel>

        <Panel title="Top connectors" description="People most central to cross-team collaboration.">
          <ul className="leados-stagger flex flex-col divide-y divide-border-subtle">
            {topConnectors.map((person, i) => (
              <li key={person.id} className="flex items-center justify-between py-2.5 text-body-sm">
                <span className="flex items-center gap-2 text-text-primary">
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent-subtle-text">
                    {i + 1}
                  </span>
                  {person.label}
                </span>
                <span className="text-caption text-text-tertiary">{person.connections} links</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
