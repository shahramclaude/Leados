"use client";

import { useMemo, useState } from "react";
import { Badge, SeverityBadge, StatusBadge } from "@/components/leados/ui/Badge";
import { Button } from "@/components/leados/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/leados/ui/DataTable";
import { Drawer } from "@/components/leados/ui/Drawer";
import { Input, NumberInput, Textarea } from "@/components/leados/ui/Input";
import { Modal } from "@/components/leados/ui/Modal";
import { Panel } from "@/components/leados/ui/Panel";
import { Select } from "@/components/leados/ui/Select";
import { StatTile } from "@/components/leados/ui/Metrics";
import { EmptyState } from "@/components/leados/ui/States";
import { useToast } from "@/components/leados/ui/Toast";
import { useUndoRedo } from "@/components/leados/app/UndoRedoProvider";
import { ChartFrame } from "@/components/leados/charts/ChartFrame";
import { HeatmapSVG } from "@/components/leados/charts/HeatmapSVG";
import { formatCurrency, formatDate, formatRelativeToAnchor } from "@/lib/format";
import type { Severity, Status } from "@/components/leados/ui/tokens";

interface Decision {
  id: number;
  title: string;
  description: string;
  track: string;
  category: string;
  status: string;
  owner: string;
  severity: number;
  financialImpact: string;
  dueDate: string;
  createdAt: string;
  decidedAt: string | null;
}

interface ActivityRow {
  id: number;
  entity: string;
  entityId: number;
  change: string;
  actor: string;
  occurredAt: string;
}

interface SignalRow {
  id: number;
  label: string;
  category: string;
  severity: number;
  trend: string;
  value: string;
  changePct: string;
  detectedAt: string;
  source: string;
}

interface MetricRow {
  id: number;
  name: string;
  category: string;
  unit: string;
  value: string;
  target: string;
}

const STATUS_TO_TONE: Record<string, Status> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  scheduled: "info",
};

export function CockpitBoard({
  initialDecisions,
  recentActivity,
  topSignals,
  keyMetrics,
  anchorIso,
}: {
  initialDecisions: Decision[];
  recentActivity: ActivityRow[];
  topSignals: SignalRow[];
  keyMetrics: MetricRow[];
  anchorIso: string;
}) {
  const [decisionList, setDecisionList] = useState(initialDecisions);
  const [selected, setSelected] = useState<Decision | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", track: "execution", category: "", owner: "", severity: 3, financialImpact: 0 });
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useToast();
  const { push } = useUndoRedo();
  const anchor = useMemo(() => new Date(anchorIso), [anchorIso]);

  async function setStatus(decision: Decision, status: string) {
    const previous = decisionList;
    setDecisionList((rows) => rows.filter((row) => row.id !== decision.id || status === "pending"));
    setSelected(null);

    async function apply(nextStatus: string) {
      const res = await fetch(`/api/decisions/${decision.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error("request-failed");
    }

    try {
      await apply(status);
      notify({ title: `Decision ${status}`, description: decision.title, tone: status === "rejected" ? "warning" : "success" });
      push({
        label: `${status === "approved" ? "Approve" : "Reject"} "${decision.title}"`,
        undo: async () => {
          await apply("pending");
          setDecisionList((rows) => [...rows, { ...decision, status: "pending", decidedAt: null }]);
        },
        redo: async () => {
          await apply(status);
          setDecisionList((rows) => rows.filter((row) => row.id !== decision.id));
        },
      });
    } catch {
      setDecisionList(previous);
      notify({ title: "Couldn't update decision", description: "Please retry.", tone: "danger", politeness: "assertive" });
    }
  }

  async function submitNewDecision() {
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setDecisionList((rows) => [data.decision, ...rows]);
      setCreateOpen(false);
      setForm({ title: "", description: "", track: "execution", category: "", owner: "", severity: 3, financialImpact: 0 });
      notify({ title: "Decision queued", description: data.decision.title, tone: "success" });
    } catch {
      notify({ title: "Couldn't create decision", tone: "danger", politeness: "assertive" });
    } finally {
      setSubmitting(false);
    }
  }

  const columns: DataTableColumn<Decision>[] = [
    { key: "title", header: "Decision", render: (d) => <span className="font-medium">{d.title}</span>, sortValue: (d) => d.title, filterValue: (d) => `${d.title} ${d.owner} ${d.category}` },
    { key: "track", header: "Track", render: (d) => <Badge>{d.track}</Badge>, sortValue: (d) => d.track },
    { key: "severity", header: "Severity", render: (d) => <SeverityBadge level={d.severity as Severity} />, sortValue: (d) => d.severity },
    { key: "owner", header: "Owner", render: (d) => d.owner, sortValue: (d) => d.owner },
    { key: "impact", header: "Impact", numeric: true, render: (d) => formatCurrency(d.financialImpact), sortValue: (d) => Number(d.financialImpact) },
    { key: "due", header: "Due", render: (d) => formatRelativeToAnchor(d.dueDate, anchor), sortValue: (d) => d.dueDate },
  ];

  const heatmapCells = topSignals.map((s) => ({ row: s.category, col: s.label.length > 14 ? `${s.label.slice(0, 14)}…` : s.label, value: s.severity / 5, label: `S${s.severity}` }));
  const heatmapRows = Array.from(new Set(topSignals.map((s) => s.category)));
  const heatmapCols = topSignals.map((s) => (s.label.length > 14 ? `${s.label.slice(0, 14)}…` : s.label));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {keyMetrics.map((m) => (
          <StatTile key={m.id} label={m.name} value={Number(m.value)} unit={m.unit === "%" ? "%" : m.unit === "USD" ? undefined : m.unit} format={m.unit === "USD" ? (v) => formatCurrency(v) : undefined} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-3 rounded-[var(--comp-card-radius)] border border-border-subtle bg-surface-raised p-[var(--comp-card-padding)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Pending decisions ({decisionList.filter((d) => d.status === "pending").length})</h2>
          </div>
          {decisionList.length === 0 ? (
            <EmptyState title="Nothing waiting on you" description="All decisions are resolved. New items will appear here as they're detected." />
          ) : (
            <DataTable
              caption="Pending decisions"
              rows={decisionList}
              rowId={(d) => String(d.id)}
              columns={columns}
              onRowActivate={(d) => setSelected(d)}
              virtualizeThreshold={20}
            />
          )}
        </div>

        <ChartFrame
          title="Signal severity by category"
          description="Highest-severity live signals, grouped by category."
          sourceNote="Source: signals table, top 6 by severity."
          tableColumns={[
            { key: "category", label: "Category" },
            { key: "label", label: "Signal" },
            { key: "severity", label: "Severity", numeric: true },
          ]}
          tableRows={topSignals.map((s) => ({ category: s.category, label: s.label, severity: s.severity }))}
        >
          <HeatmapSVG rows={heatmapRows} cols={Array.from(new Set(heatmapCols))} cells={heatmapCells} cellSize={40} />
        </ChartFrame>
      </div>

      <Panel title="What changed" persistKey="cockpit-activity" defaultOpen>
        <ul className="flex flex-col gap-3">
          {recentActivity.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-4 text-sm">
              <div>
                <p className="text-text-primary">{row.change}</p>
                <p className="text-xs text-text-muted">
                  {row.entity} #{row.entityId} · {row.actor}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">{formatRelativeToAnchor(row.occurredAt, anchor)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>New decision</Button>
      </div>

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? ""}>
        {selected ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={STATUS_TO_TONE[selected.status] ?? "neutral"} />
              <SeverityBadge level={selected.severity as Severity} />
              <Badge>{selected.track}</Badge>
              <Badge>{selected.category}</Badge>
            </div>
            <p className="max-w-[60ch] text-sm text-text-secondary">{selected.description}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-text-muted">Owner</dt>
                <dd className="text-text-primary">{selected.owner}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Due</dt>
                <dd className="text-text-primary">{formatDate(selected.dueDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Financial impact</dt>
                <dd className="font-mono tabular-nums text-text-primary">{formatCurrency(selected.financialImpact)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Created</dt>
                <dd className="text-text-primary">{formatDate(selected.createdAt)}</dd>
              </div>
            </dl>
            {selected.status === "pending" ? (
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setStatus(selected, "approved")}>Approve</Button>
                <Button variant="danger" onClick={() => setStatus(selected, "rejected")}>
                  Reject
                </Button>
              </div>
            ) : (
              <p className="text-xs text-text-muted">This decision is already {selected.status}.</p>
            )}
          </div>
        ) : null}
      </Drawer>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New decision" description="Queue a decision for review in the cockpit." size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitNewDecision} loading={submitting} disabled={!form.title.trim()}>
              Create decision
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Track"
              value={form.track}
              onChange={(v) => setForm((f) => ({ ...f, track: v }))}
              options={[
                { value: "execution", label: "Execution" },
                { value: "strategic", label: "Strategic" },
              ]}
            />
            <Input label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Owner" value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} />
            <NumberInput label="Severity (1-5)" value={form.severity} onChange={(v) => setForm((f) => ({ ...f, severity: Number(v) || 3 }))} min={1} max={5} />
          </div>
          <NumberInput label="Financial impact" unit="USD" value={form.financialImpact} onChange={(v) => setForm((f) => ({ ...f, financialImpact: Number(v) || 0 }))} />
        </div>
      </Modal>
    </div>
  );
}
