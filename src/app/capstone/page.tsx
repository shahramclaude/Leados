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
import { Badge, Card, EmptyRow, Td, Th } from "@/components/ui";
import { toggleCharterPromise } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function CapstonePage() {
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Capstone — Living Program (Part 139, scoped)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Charter v2 promises each trace to a real, testable mechanism. Maturity renders{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">not-assessed</code> wherever there is no evidence —
          inflation is treated as a defect.
        </p>
      </div>

      <Card title="Honest state">
        <p className="text-sm text-slate-600">
          This console implements 6 of the 139 specified domains as real, working software with unit-tested
          calculation logic (41 passing tests across close, procurement, ITSM, HSE, and treasury modules).
          It does not implement a tamper-evident audit hash chain, a workflow engine, a policy-rule compiler,
          or a red-team/handover-drill apparatus — those require the broader platform (Parts 73, 79, 82, and
          the rest of the program) that did not exist in this workspace at session start. The weakest
          dimension today is <strong>{weakest}</strong>; see its next-level gap below.
        </p>
      </Card>

      <Card title="Maturity by dimension">
        <table className="w-full border-collapse">
          <thead><tr><Th>Dimension</Th><Th>Level</Th><Th>Evidence</Th><Th>Next-level gap</Th></tr></thead>
          <tbody>
            {assessments.map((a) => (
              <tr key={a.dimension}>
                <Td>{a.dimension}</Td>
                <Td><Badge status={a.level ? "on-track" : "overdue"} label={levelName(a.level)} /></Td>
                <Td>
                  <ul className="list-disc space-y-1 pl-4 text-xs">
                    {a.evidence.length === 0 ? <li className="text-slate-400">none</li> : a.evidence.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </Td>
                <Td className="text-xs italic text-slate-500">{a.nextLevelGap}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Charter v2 promises" subtitle={`${verifiedPromiseCount} of ${promiseRows.length} promises verified against their cited mechanism.`}>
        <table className="w-full border-collapse">
          <thead><tr><Th>Statement</Th><Th>Class</Th><Th>Dimension</Th><Th>Enforcement</Th><Th>Verified</Th></tr></thead>
          <tbody>
            {promiseRows.length === 0 && <EmptyRow colSpan={5}>No charter promises recorded yet — seed demo data from the overview page.</EmptyRow>}
            {promiseRows.map((p) => (
              <tr key={p.id}>
                <Td>{p.statement}</Td>
                <Td><Badge status={p.promiseClass === "never-does" ? "exception" : "matched"} label={p.promiseClass} /></Td>
                <Td>{p.dimension}</Td>
                <Td><code className="text-xs">{p.enforcement}</code></Td>
                <Td>
                  <form action={toggleCharterPromise}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit">
                      <Badge status={p.verified ? "matched" : "overdue"} label={p.verified ? "Verified" : "Unverified"} />
                    </button>
                  </form>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
