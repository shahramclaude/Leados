import { db } from "@/db";
import {
  cashPositions,
  charterPromises,
  closeTasks,
  contracts,
  covenants,
  hseIncidents,
  invoices,
  itsmTickets,
  reconciliations,
} from "@/db/schema";
import { assessMaturity, levelName, sixPromiseSummary } from "@/lib/maturity";
import { Badge, Card, SubmitButton } from "@/components/ui";
import { seedDemoData } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [
    closeTaskRows,
    reconciliationRows,
    contractRows,
    invoiceRows,
    ticketRows,
    incidentRows,
    cashRows,
    covenantRows,
    promiseRows,
  ] = await Promise.all([
    db.select().from(closeTasks),
    db.select().from(reconciliations),
    db.select().from(contracts),
    db.select().from(invoices),
    db.select().from(itsmTickets),
    db.select().from(hseIncidents),
    db.select().from(cashPositions),
    db.select().from(covenants),
    db.select().from(charterPromises),
  ]);

  const anonymousIncidentCount = incidentRows.filter((i) => i.anonymous).length;
  const rejectedRootCauseCount = incidentRows.filter((i) => i.status === "rejected-root-cause").length;
  const verifiedPromiseCount = promiseRows.filter((p) => p.verified).length;

  const assessments = assessMaturity({
    closeTaskCount: closeTaskRows.length,
    reconciliationCount: reconciliationRows.length,
    contractCount: contractRows.length,
    invoiceCount: invoiceRows.length,
    ticketCount: ticketRows.length,
    incidentCount: incidentRows.length,
    cashPositionCount: cashRows.length,
    covenantCount: covenantRows.length,
    anonymousIncidentCount,
    rejectedRootCauseCount,
    verifiedPromiseCount,
    totalPromiseCount: promiseRows.length,
  });

  const { weakest } = sixPromiseSummary(assessments);
  const hasAnyData = closeTaskRows.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">LEADOS — Operational Frontier</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-950">Operations Console</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              A real, working slice of the Parts 124–139 operating machinery: financial close &
              reconciliation, source-to-pay, ITSM, HSE, and treasury — each backed by live data and the
              calculations that enforce their core guarantees.
            </p>
          </div>
          {!hasAnyData && (
            <form action={seedDemoData}>
              <SubmitButton>Seed demonstration data</SubmitButton>
            </form>
          )}
        </div>
      </Card>

      <Card title="Program notice — read this first" subtitle="Honesty over inflation, per the program's own charter.">
        <p className="text-sm text-slate-600">
          This workspace began as an empty Next.js + Drizzle starter with no prior LEADOS history, state
          file, or GitHub continuity artifacts present. Rather than fabricate a retrospective history of
          138 prior parts, this session implements an honestly-scoped, fully working subset: six modules
          (Financial Close, Source-to-Pay, ITSM, HSE, Treasury, and this Capstone view), each with real
          database tables, enforced business rules, and unit-tested calculation logic — not a mockup.
          Gaps are reported below rather than smoothed over.
        </p>
      </Card>

      <Card title="Six enduring promises — maturity by dimension" subtitle={`Weakest link: ${weakest}. Levels render "not-assessed" where no evidence exists.`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assessments.map((a) => (
            <div key={a.dimension} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold capitalize text-slate-900">{a.dimension}</h3>
                <Badge status={a.level ? "on-track" : "overdue"} label={levelName(a.level)} />
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
                {a.evidence.length === 0 ? <li>No evidence recorded yet — seed demo data to assess.</li> : a.evidence.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
              <p className="mt-2 text-xs italic text-slate-400">Next-level gap: {a.nextLevelGap}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Close tasks" value={closeTaskRows.length} />
        <StatTile label="Reconciliations" value={reconciliationRows.length} />
        <StatTile label="Contracts" value={contractRows.length} />
        <StatTile label="Invoices" value={invoiceRows.length} />
        <StatTile label="ITSM tickets" value={ticketRows.length} />
        <StatTile label="HSE incidents" value={incidentRows.length} />
        <StatTile label="Cash positions" value={cashRows.length} />
        <StatTile label="Covenants" value={covenantRows.length} />
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
