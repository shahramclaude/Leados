import { db } from "@/db";
import {
  metrics,
  claims,
  incidents,
  initiatives,
  objectives,
  approvals,
  recommendations,
  evalRuns,
  auditEvents,
  cadenceRuns,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { verifyAuditChain } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

async function stat(label: string, value: string | number, href: string, tone: "ok" | "warn" | "neutral" = "neutral") {
  const toneClass =
    tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-slate-100";
  return (
    <Link href={href} className="card block transition hover:border-indigo-600">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${toneClass}`}>{value}</p>
    </Link>
  );
}

export default async function HomePage() {
  const [allMetrics, allClaims, openIncidents, allInitiatives, allObjectives, pendingApprovals, openRecs, allEvalRuns, chain] =
    await Promise.all([
      db.select().from(metrics),
      db.select().from(claims),
      db.select().from(incidents).where(eq(incidents.status, "open")),
      db.select().from(initiatives),
      db.select().from(objectives),
      db.select().from(approvals).where(eq(approvals.status, "pending")),
      db.select().from(recommendations).where(eq(recommendations.status, "open")),
      db.select().from(evalRuns),
      verifyAuditChain(),
    ]);

  const conflictedClaims = allClaims.filter((c) => c.status === "conflict").length;
  const selectedInitiatives = allInitiatives.filter((i) => i.status === "selected").length;
  const latestEvalRate = allEvalRuns.length
    ? allEvalRuns.sort((a, b) => (a.runAt! < b.runAt! ? 1 : -1))[0].passRate
    : null;
  const totalAuditEvents = await db.select().from(auditEvents);
  const cadence = await db.select().from(cadenceRuns);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">LEADOS</p>
        <h1 className="mt-1 text-3xl font-semibold text-white">Intelligence &amp; Automation Core</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          World model &amp; simulation · reasoning workbench · causal root-cause · strategy &amp; portfolio optimization ·
          next-best-action · governed automation ladder (T0–T5) with a tamper-evident audit chain · self-improving
          eval fabric.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {await stat("Metrics tracked", allMetrics.length, "/simulate")}
        {await stat("Open incidents", openIncidents.length, "/causal", openIncidents.length > 0 ? "warn" : "ok")}
        {await stat(
          "Claims in conflict",
          conflictedClaims,
          "/reasoning",
          conflictedClaims > 0 ? "warn" : "ok",
        )}
        {await stat("Initiatives selected", `${selectedInitiatives}/${allInitiatives.length}`, "/strategy")}
        {await stat("Pending approvals", pendingApprovals.length, "/governance", pendingApprovals.length > 0 ? "warn" : "ok")}
        {await stat("Open recommendations", openRecs.length, "/actions")}
        {await stat(
          "Audit chain",
          chain.valid ? "Intact" : "BROKEN",
          "/governance",
          chain.valid ? "ok" : "warn",
        )}
        {await stat(
          "Latest eval pass rate",
          latestEvalRate != null ? `${(latestEvalRate * 100).toFixed(0)}%` : "never run",
          "/quality",
          latestEvalRate != null && latestEvalRate >= 0.8 ? "ok" : "neutral",
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-200">Objectives in flight</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {allObjectives.length === 0 && <li>No objectives yet — visit Strategy.</li>}
            {allObjectives.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{o.statement}</span>
                <span className="badge bg-slate-800 text-slate-300">{o.owner}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-200">Audit trail &amp; cadence</h2>
          <p className="mt-3 text-sm text-slate-400">
            {totalAuditEvents.length} hash-chained audit events recorded. {cadence.length} cadence loop runs executed.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Every governed action, approval decision, and kill-switch toggle is appended to the hash chain in{" "}
            <code>audit_events</code> and independently re-verifiable from <code>/governance</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
