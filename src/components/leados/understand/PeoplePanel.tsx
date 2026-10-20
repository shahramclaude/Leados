"use client";

import { useState } from "react";
import { Badge, StatusBadge } from "@/components/leados/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/leados/ui/DataTable";
import { Drawer } from "@/components/leados/ui/Drawer";
import type { Status } from "@/components/leados/ui/tokens";

export interface PersonRow {
  id: number;
  name: string;
  role: string;
  team: string;
  email: string;
  riskLevel: string;
  status: string;
  focusArea: string;
  tenureMonths: number;
}

const RISK_TONE: Record<string, Status> = { low: "success", medium: "warning", high: "danger" };
const STATUS_TONE: Record<string, Status> = { active: "success", leave: "info", offboarding: "neutral" };

export function PeoplePanel({ people }: { people: PersonRow[] }) {
  const [selected, setSelected] = useState<PersonRow | null>(null);

  const columns: DataTableColumn<PersonRow>[] = [
    { key: "name", header: "Name", render: (p) => <span className="font-medium">{p.name}</span>, sortValue: (p) => p.name, filterValue: (p) => `${p.name} ${p.role} ${p.team} ${p.focusArea}` },
    { key: "role", header: "Role", render: (p) => p.role, sortValue: (p) => p.role },
    { key: "team", header: "Team", render: (p) => <Badge>{p.team}</Badge>, sortValue: (p) => p.team },
    { key: "risk", header: "Risk", render: (p) => <StatusBadge status={RISK_TONE[p.riskLevel] ?? "neutral"} />, sortValue: (p) => p.riskLevel },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={STATUS_TONE[p.status] ?? "neutral"} />, sortValue: (p) => p.status },
    { key: "tenure", header: "Tenure", numeric: true, render: (p) => `${p.tenureMonths} mo`, sortValue: (p) => p.tenureMonths },
  ];

  return (
    <>
      <DataTable caption="People" rows={people} rowId={(p) => String(p.id)} columns={columns} onRowActivate={setSelected} searchPlaceholder="Filter people…" />
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name ?? ""}>
        {selected ? (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={RISK_TONE[selected.riskLevel] ?? "neutral"} />
              <StatusBadge status={STATUS_TONE[selected.status] ?? "neutral"} />
              <Badge>{selected.team}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-text-muted">Role</dt>
                <dd className="text-text-primary">{selected.role}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Focus area</dt>
                <dd className="text-text-primary">{selected.focusArea}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Tenure</dt>
                <dd className="text-text-primary">{selected.tenureMonths} months</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Email</dt>
                <dd className="font-mono text-text-primary">{selected.email}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
