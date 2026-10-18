import PageHeader from "../ui/PageHeader";
import Panel from "../ui/Panel";
import Badge from "../ui/Badge";

const ledger = [
  { label: "Design system", detail: "Tokens, primitives, and layout rebuilt per the Part 7 specification — dark ops-center aesthetic, JetBrains Mono for data, Inter for prose." },
  { label: "Data layer", detail: "Findings, people, metrics, decisions, playbooks, and the 8-category risk register are original, deterministic mock datasets for demonstration." },
  { label: "Routing", detail: "Seven routes — Now, Signal Board, Thermodynamics, CAS Engine, Risk Register, Audit Log, About — mounted under /leados via the Shell layout." },
];

export default function AboutView() {
  return (
    <div>
      <PageHeader title="About" subtitle="Provenance ledger for this workspace build." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Workspace" dense>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--fs-sm)" }}>
            Leados Intelligence Workspace — a leadership operations surface combining a signal board, systems
            thermodynamics, a CAS engine, and a cross-domain risk register behind one command palette.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="domain-people" size="sm" />
            <Badge variant="domain-finance" size="sm" />
            <Badge variant="domain-sales" size="sm" />
            <Badge variant="domain-ops" size="sm" />
            <Badge variant="domain-strategy" size="sm" />
          </div>
        </Panel>

        <Panel title="Severity Scale" dense>
          <div className="flex flex-col gap-2">
            <Badge variant="sev5" />
            <Badge variant="sev4" />
            <Badge variant="sev3" />
            <Badge variant="sev2" />
            <Badge variant="sev1" />
          </div>
        </Panel>

        <Panel title="Ledger" dense>
          <ul className="flex flex-col gap-3">
            {ledger.map((item) => (
              <li key={item.label}>
                <p className="font-medium" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>{item.label}</p>
                <p className="mt-0.5" style={{ color: "var(--text-secondary)", fontSize: "var(--fs-xs)" }}>{item.detail}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
