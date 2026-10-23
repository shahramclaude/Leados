import { db } from "@/db";
import { actionPolicies, approvals, auditEvents } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { verifyAuditChain } from "@/lib/auditLog";
import { simulateActionAction, decideApprovalAction, toggleKillSwitchAction, expireApprovalsAction } from "./actions";

export const dynamic = "force-dynamic";

const TIER_DESCRIPTIONS: Record<string, string> = {
  T0: "Observe / analyze only",
  T1: "Draft-only, never sent",
  T2: "Act with instant undo",
  T3: "Act with human approval",
  T4: "Act autonomously within budget",
  T5: "Act autonomously with delegated authority",
};

export default async function GovernancePage() {
  const policies = await db.select().from(actionPolicies);
  const pendingApprovals = await db.select().from(approvals).where(eq(approvals.status, "pending")).orderBy(desc(approvals.requestedAt));
  const decidedApprovals = await db.select().from(approvals).orderBy(desc(approvals.requestedAt)).limit(10);
  const chain = await verifyAuditChain();
  const recentEvents = await db.select().from(auditEvents).orderBy(desc(auditEvents.seq)).limit(20);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Part 67 &amp; 73</p>
        <h1 className="text-2xl font-semibold text-white">Automation Ladder &amp; Tamper-Evident Audit</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every side-effecting action passes through one chokepoint (the Action Gate): tier policy → rolling 24h
          budget → approval routing. Every decision is appended to a sha256 hash chain that a seeded tamper would
          break — verified live below.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Audit chain integrity</h2>
          <span className={`badge ${chain.valid ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
            {chain.valid ? "VALID" : `BROKEN at seq ${chain.brokenAtSeq}`}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">{chain.totalEvents} events chained from genesis hash 000…0.</p>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Seq</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>At</th>
            </tr>
          </thead>
          <tbody>
            {recentEvents.map((e) => (
              <tr key={e.id}>
                <td>{e.seq}</td>
                <td>
                  {e.actorKind}:{e.actorId}
                </td>
                <td>{e.action}</td>
                <td className="max-w-xs truncate">{e.target}</td>
                <td>{new Date(e.at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Action policies (T0–T5 ladder)</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Action</th>
              <th>Tier</th>
              <th>Budget (count/day)</th>
              <th>Budget ($/day)</th>
              <th>Approval</th>
              <th>Kill switch</th>
              <th>Simulate</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.label}
                  <p className="text-xs text-slate-500">{TIER_DESCRIPTIONS[p.tier]}</p>
                </td>
                <td>
                  <span className="badge bg-indigo-500/20 text-indigo-300">{p.tier}</span>
                </td>
                <td>{p.budgetCountPerDay}</td>
                <td>${p.budgetUsdPerDay}</td>
                <td>{p.approvalMode}</td>
                <td>
                  <span className={`badge ${p.killSwitchOn ? "bg-rose-500/20 text-rose-300" : "bg-slate-800 text-slate-400"}`}>
                    {p.killSwitchOn ? "ENGAGED" : "off"}
                  </span>
                  <form action={toggleKillSwitchAction} className="mt-1 inline">
                    <input type="hidden" name="actionKey" value={p.actionKey} />
                    <input type="hidden" name="on" value={(!p.killSwitchOn).toString()} />
                    <button className="btn btn-secondary px-2 py-1 text-xs" type="submit">
                      {p.killSwitchOn ? "Disengage" : "Engage"}
                    </button>
                  </form>
                </td>
                <td>
                  <form action={simulateActionAction} className="flex items-center gap-1">
                    <input type="hidden" name="actionKey" value={p.actionKey} />
                    <input type="hidden" name="costUsd" value={Math.min(10, p.budgetUsdPerDay || 10)} />
                    <button className="btn btn-primary px-2 py-1 text-xs" type="submit">
                      Invoke
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Pending approvals ({pendingApprovals.length})</h2>
          <form action={expireApprovalsAction}>
            <button className="btn btn-secondary" type="submit">
              Expire stale approvals
            </button>
          </form>
        </div>
        <div className="mt-3 space-y-3">
          {pendingApprovals.length === 0 && <p className="text-sm text-slate-500">Nothing pending.</p>}
          {pendingApprovals.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-800 p-3">
              <p className="text-sm text-slate-100">
                {a.actionKey} <span className="badge bg-indigo-500/20 text-indigo-300">{a.tier}</span>
              </p>
              <p className="text-xs text-slate-500">
                VOI {a.voi} · requested {new Date(a.requestedAt).toLocaleString()} · expires {new Date(a.expiresAt).toLocaleString()}
              </p>
              <pre className="mt-2 overflow-x-auto rounded bg-slate-950 p-2 text-xs text-slate-400">{JSON.stringify(a.preview, null, 2)}</pre>
              <div className="mt-2 flex gap-2">
                <form action={decideApprovalAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button className="btn btn-primary" type="submit">
                    Approve
                  </button>
                </form>
                <form action={decideApprovalAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <button className="btn btn-danger" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Recent approval decisions</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Action</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Decided by</th>
            </tr>
          </thead>
          <tbody>
            {decidedApprovals.map((a) => (
              <tr key={a.id}>
                <td>{a.actionKey}</td>
                <td>{a.tier}</td>
                <td>{a.status}</td>
                <td>{a.decidedBy ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
