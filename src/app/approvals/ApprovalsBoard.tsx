"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, RiskBadge } from "@/components/ui";

type Approval = {
  id: string;
  title: string;
  description: string | null;
  riskTier: string;
  amountUsd: number | null;
  status: "pending" | "approved" | "rejected";
  decisionNote: string | null;
};

const RISK_TIERS = ["T0", "T1", "T2", "T3", "T4", "T5"];

export function ApprovalsBoard() {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [riskTier, setRiskTier] = useState("T2");
  const [amountUsd, setAmountUsd] = useState(500);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/approvals");
    const data = await res.json();
    setItems(data.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createApproval(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, riskTier, amountUsd }),
    });
    setTitle("");
    await load();
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    await fetch(`/api/approvals/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    await load();
    setBusyId(null);
  }

  const pending = items.filter((a) => a.status === "pending");
  const resolved = items.filter((a) => a.status !== "pending");

  return (
    <div>
      <Card className="mb-6">
        <form onSubmit={createApproval} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="block text-[13px] font-medium text-[var(--text-secondary)]">Request title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Approve vendor renewal — Acme Analytics"
              className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-[14px] outline-none"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)]">Risk tier</label>
            <select
              value={riskTier}
              onChange={(e) => setRiskTier(e.target.value)}
              className="mt-1 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-[14px]"
            >
              {RISK_TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)]">Amount ($)</label>
            <input
              type="number"
              value={amountUsd}
              onChange={(e) => setAmountUsd(Number(e.target.value))}
              className="mt-1 w-32 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-[14px] outline-none"
            />
          </div>
          <Button type="submit">Submit request</Button>
        </form>
        <p className="mt-2 m-0 text-[12px] text-[var(--text-muted)]">
          Routing rule: T0–T1 under $1,000 auto-approve; T2 needs a team lead; T3–T4 need an executive sponsor; T5
          needs the board.
        </p>
      </Card>

      {loading ? (
        <p className="text-[14px] text-[var(--text-muted)]">Loading…</p>
      ) : (
        <>
          <h2 className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">Pending ({pending.length})</h2>
          {pending.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Queue is clear" />
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {pending.map((a) => (
                <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="m-0 text-[14px] font-medium text-[var(--text-primary)]">{a.title}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <RiskBadge tier={a.riskTier} />
                      {a.amountUsd ? <Badge tone="neutral">${a.amountUsd.toLocaleString()}</Badge> : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={busyId === a.id} onClick={() => decide(a.id, "rejected")}>
                      Reject
                    </Button>
                    <Button disabled={busyId === a.id} onClick={() => decide(a.id, "approved")}>
                      Approve
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <h2 className="mt-8 m-0 text-[16px] font-semibold text-[var(--text-primary)]">Resolved</h2>
          <div className="mt-3 flex flex-col gap-3">
            {resolved.map((a) => (
              <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-[14px] font-medium text-[var(--text-primary)]">{a.title}</p>
                  {a.decisionNote ? (
                    <p className="mt-1 m-0 text-[12px] text-[var(--text-muted)]">{a.decisionNote}</p>
                  ) : null}
                </div>
                <Badge tone={a.status === "approved" ? "success" : "danger"}>{a.status}</Badge>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
